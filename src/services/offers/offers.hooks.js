const { authenticate } = require('feathers-authentication').hooks
const { discard, iff, isProvider, stashBefore } = require('feathers-hooks-common')
const idRequired = require('../../hooks/hook.id-required')
const getEventAddress = require('../../hooks/get-event-address')
const createNotification = require('../../hooks/create-notification')
const statusOnCreateIsOPEN = require('./hooks/hook.status-on-create-is-open')
const statusEnforcementOnChange = require('./hooks/hook.status-enforcement-on-change')
const patchSharesIssuedAfterClosed = require('./hooks/hook.patch-shares-issued-after-closed')
const addSellIssuanceDataToParams = require('../../hooks/hook.add-sell-issuance-data-to-params')
const blockOfferAcceptance = require('./hooks/hook.block-offer-acceptance')
const errors = require('feathers-errors')

/* Rules for Offer.status enforced by hooks:
  OPEN, htlcStep=1 (default)
  TRADING, isAccepted=true, htlcStep=2 to 3
  CLOSED, htlcStep=4
  and allow front to set status to CANCELLED if htlcStep !== 4

  No changes allowed if is already CLOSED or CANCELLED
*/

module.exports = function (app) {
  const postUpdateHooks = [
    patchSharesIssuedAfterClosed(app),
    getEventAddress({
      from: 'data.btcAddress'
    }),
    getEventAddress({
      from: 'data.eqbAddress'
    }),
    iff(
      // if the htlcStep or status of the offer was updated
      hook => hook.result.htlcStep !== hook.params.before.htlcStep ||
                hook.result.status !== hook.params.before.status,
      hook => {
        // update made by the offer holder.
        // Notify the order creator.
        return app.service('/orders').get({
          _id: hook.result.orderId
        }).then(result => {
          hook.params.order = result
          if (hook.result.htlcStep === 3) {
            if (hook.result.type === 'BUY') {
              hook.notificationAddress = result.btcAddress
            } else {
              hook.notificationAddress = result.eqbAddress
            }
          } else {
            // these updates (steps 2 or 4) were made by the order holder.
            // Notify the offer creator
            hook.notificationAddress = hook.result.eqbAddress
          }
          return hook
        })
      },
      createNotification({
        type: 'offer',
        addressPath: 'notificationAddress',
        fields: {
          offerId: 'result._id',
          orderId: 'result.orderId',
          type: 'result.type',
          status: 'result.status',
          action: hook => {
            const offerStatus = hook.result.status === 'OPEN' || hook.result.status === 'TRADING'
              ? (hook.result.htlcStep < 3 ? 'PROGRESS' : 'DONE')
              : hook.result.status
            return {
              'PROGRESS': 'dealFlowMessageTitleOfferAccepted', // after htlc step 2
              'DONE': hook.result.type === 'BUY' ? 'dealFlowMessageTitleCollectPayment' : 'dealFlowMessageTitleCollectSecurities',  // after htlc step 3
              'CLOSED': 'dealFlowMessageTitleDealClosed', // after htlc step 4
              'CANCELLED': 'dealFlowMessageTitleOfferCancelled',
              'REJECTED': 'dealFlowMessageTitleOfferRejected' // not currently used but previously supported
            }[offerStatus]
          },
          htlcStep: 'result.htlcStep',
          quantity: 'result.quantity',
          unit: 'Shares',
          companyName: 'result.companyName',
          issuanceName: 'result.issuanceName'
        }
      })
    )
  ]

  return {
    before: {
      all: [
        authenticate('jwt')
      ],
      find: [],
      get: [],
      create: [
        iff(
          isProvider('external'),
          statusOnCreateIsOPEN(),
          iff(
            // if create data type is SELL
            context => {
              const { data } = context
              const type = data && data.type

              return (type || '').toUpperCase() === 'SELL'
            },
            addSellIssuanceDataToParams(app),
            context => {
              const { params, data } = context
              const sellIssuanceData = params.sellIssuanceData || {}
              const maxSellQuantity = sellIssuanceData.maxSellQuantity || 0
              const sellQuantity = data.quantity || 0

              if (sellQuantity > maxSellQuantity) {
                return Promise.reject(new errors.BadRequest('Sell Quantity exceeds maximum available'))
              }
              return Promise.resolve(context)
            }
          ),
          iff(
            // if create data type is BUY
            context => {
              const { data } = context
              const type = data && data.type

              return (type || '').toUpperCase() === 'BUY'
            },
            context => {
              const { data } = context
              const ordersService = app.service('orders')
              return ordersService.find({ query: { _id: data.orderId } })
                .then(response => {
                  const order = response.data[0] || {}
                  const quantity = order.quantity || 0

                  if (data.quantity > quantity) {
                    return Promise.reject(new errors.BadRequest('Buy Quantity exceeds maximum'))
                  }
                  return Promise.resolve(context)
                })
            }
          )
        )
      ],
      update: [
        stashBefore(),
        iff(
          isProvider('external'),
          idRequired(),
          blockOfferAcceptance(app),
          statusEnforcementOnChange(app)
        )
      ],
      patch: [
        stashBefore(),
        iff(
          isProvider('external'),
          idRequired(),
          blockOfferAcceptance(app),
          statusEnforcementOnChange(app)
        )
      ],
      remove: [
        iff(
          isProvider('external'),
          idRequired()
        )
      ]
    },

    after: {
      all: [
        discard('__v')
      ],
      find: [],
      get: [],
      create: [
        getEventAddress({
          from: 'data.btcAddress'
        }),
        getEventAddress({
          from: 'data.eqbAddress'
        }),
        hook => {
          return app.service('/orders').get({
            _id: hook.result.orderId
          }).then(result => {
            hook.params.order = result
            return hook
          })
        },
        createNotification({
          type: 'offer',
          addressPath: hook => {
            if (hook.result.type === 'BUY') {
              return hook.params.order.btcAddress
            } else {
              return hook.params.order.eqbAddress
            }
          },
          fields: {
            offerId: 'result._id',
            orderId: 'result.orderId',
            type: 'result.type',
            action: () => 'dealFlowMessageTitleOfferReceived',
            status: 'result.status',
            htlcStep: 'result.htlcStep',
            quantity: 'result.quantity',
            unit: 'Shares',
            price: 'result.price',
            companyName: 'result.companyName',
            issuanceName: 'result.issuanceName'
          }
        })
      ],
      update: postUpdateHooks,
      patch: postUpdateHooks,
      remove: []
    },

    error: {
      all: [],
      find: [],
      get: [],
      create: [],
      update: [],
      patch: [],
      remove: []
    }
  }
}
