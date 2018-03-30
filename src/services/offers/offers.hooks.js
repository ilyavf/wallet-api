const { authenticate } = require('feathers-authentication').hooks
const { discard, iff, isProvider, stashBefore } = require('feathers-hooks-common')
const idRequired = require('../../hooks/hook.id-required')
const getEventAddress = require('../../hooks/get-event-address')
const createNotification = require('../../hooks/create-notification')
const statusOnCreateIsOPEN = require('./hooks/hook.status-on-create-is-open')
const statusEnforcementOnChange = require('./hooks/hook.status-enforcement-on-change')
const patchSharesIssuedAfterClosed = require('./hooks/hook.patch-shares-issued-after-closed')

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
          if (hook.result.status === 'CANCELLED') {
            // assume htlcStep === either 3 or 4
            return app.service('/transactions').find({
              query: {
                txId: hook.result.htlcStep === 3 ? hook.result.htlcTxId3 : hook.result.htlcTxId4,
                address: { $in: [hook.result.eqbAddress, hook.result.btcAddress] }
              }
            }).then(txes => {
              const tx = txes.data[0]
              if (tx) {
                if (tx.toAddress === hook.result.eqbAddress || tx.toAddress === hook.result.btcAddress) {
                  hook.notificationAddress = hook.params.order.eqbAddress
                } else {
                  hook.notificationAddress = hook.result.eqbAddress
                }
              }
              return hook
            })
          } else {
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
          }
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
          statusOnCreateIsOPEN()
        )
      ],
      update: [
        stashBefore(),
        iff(
          isProvider('external'),
          idRequired(),
          statusEnforcementOnChange(app)
        )
      ],
      patch: [
        stashBefore(),
        iff(
          isProvider('external'),
          idRequired(),
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
