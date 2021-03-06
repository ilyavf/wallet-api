const assert = require('assert')
const app = require('../../app')
require('../../../test-utils/setup')
const txnUtils = require('../../../test-utils/transactions')
const { clients, users: userUtils } = require('../../../test-utils/index')
const { authenticate } = require('../../../test-utils/users')
const assertRequiresAuth = require('../../../test-utils/assert/requires-auth')
const { BadRequest } = require('feathers-errors')

const service = '/transactions'
const dummyTransaction = {
  fromAddress: 'mwmTx2oTzkbQg9spp6F5ExFVeibXwwHF32',
  addressTxid: '2ac0daff49a4ff82a35a4864797f99f23c396b0529c5ba1e04b3d7b97521feba',
  addressVout: 0,
  type: 'TRANSFER',
  currencyType: 'BTC',
  toAddress: '1A6Ei5cRfDJ8jjhwxfzLJph8B9ZEthR9Z',
  amount: 777123,
  fee: 0.0001,
  txId: 'c824797bdb100b2dde4855c1ff46333206823cf7060d175daef8be2b342f2421',
  hex: `01000000012c6e7e8499a362e611b7cf3c50f55ea67528275cce4540e224cdd9265cf207a4010000006a4730440220299bb9f6493d2ab0dd9aad9123252d5f718618403bb19d77699f21cf732bb9c602201b5adcbcaf619c2c5ca43274b3362778bc70d09091d2447333990ebd4aff8f8a0121033701fc7f242ae2dd63a18753518b6d1425e53496878924b6c0dc08d800af46adffffffff0200a3e111000000001976a914ea3f916f7ad64b1ed044147d4b1df2af10ea9cb688ac98ecfa02000000001976a914b0abfca92c8a1ae023220d4134fe72ff3273a30988ac00000000`
}
const testEmails = userUtils.testEmails

describe(`${service} Service`, function () {
  clients.forEach(client => {
    runTests(client)
  })
})

function runTests (feathersClient) {
  const transport = feathersClient.io ? 'feathers-socketio' : 'feathers-rest'
  const serviceOnClient = feathersClient.service('transactions')

  describe(`${service} - ${transport} Transport`, function () {
    before(function () {
      return userUtils.removeAll(app)
    })
    after(function () {
      return Promise.all([
        userUtils.removeAll(app),
        app.service('/login-attempts').remove(null, {}),
        app.service('/transactions').remove(null, { query: { toAddress: dummyTransaction.toAddress } }),
        app.service('/notifications').remove(null, { query: { address: dummyTransaction.fromAddress } })
      ])
    })

    beforeEach(function (done) {
      txnUtils.setupMock()
      feathersClient.logout()
        .then(() => app.service('/users').create({ email: testEmails[0] }))
        .then(() => app.service('/users').create({ email: testEmails[1] }))
        .then(user => app.service('/users').find({ query: { email: { $in: testEmails } } }))
        .then(users => {
          users = users.data || users
          this.user = users[0]
          this.user2 = users[1]
          done()
        })
        .catch(error => {
          console.log(error)
          done(error)
        })
    })

    afterEach(function (done) {
      txnUtils.resetMock()
      // Remove all users after tests run.
      feathersClient.logout()
        .then(() => userUtils.removeAll(app))
        .then(() => txnUtils.removeAll(app))
        .then(() => app.service('transaction-notes').remove(null, { query: { txId: { $in: [
          'c824797bdb100b2dde4855c1ff46333206823cf7060d175daef8be2b342f2421',
          '000000000000000000000000'
        ] } } }))
        .then(() => {
          done()
        })
        .catch(error => {
          console.log(error)
          done(error)
        })
    })

    describe('Client Unauthenticated', function () {
      const methods = ['find', 'get', 'create', 'update', 'patch', 'remove']

      methods.forEach(method => {
        it(`requires auth on ${method}`, function () {
          return assertRequiresAuth(serviceOnClient, method)
        })
      })
    })

    describe('Client With Auth', function () {
      it.skip('allows find', function () {
        return app.service('users').create({ email: testEmails[0] })
          .then(user => {
            assert(user.email === 'test@equibitgroup.com', 'the signup email was lowerCased')
          })
      })

      it.skip(`maps update to patch`, function (done) {})

      it(`records the transaction in the core as a before hook`, function (done) {
        const user = this.user

        authenticate(app, feathersClient, user)
          .then(response => {
            return serviceOnClient.create(dummyTransaction)
          })
          .then(response => {
            assert(response, 'the core responded with success')
            done()
          })
          .catch(error => {
            assert(!error, error.message)
            done()
          })
      })

      it.skip(`does not record the transaction in the database if the core rejects it`, function (done) {
        const user = this.user

        authenticate(app, feathersClient, user)
          .then(response => {
            return serviceOnClient.create({
              address: 'mwmTx2oTzkbQg9spp6F5ExFVeibXwwHF32',
              type: 'BTC',
              hex: `01000000012c6e7e8499a362e611b7cf3c50f55ea67528275cce4540e224cdd9265cf207a4010000006a4730440220299bb9f6493d2ab0dd9aad9123252d5f718618403bb19d77699f21cf732bb9c602201b5adcbcaf619c2c5ca43274b3362778bc70d09091d2447333990ebd4aff8f8a0121033701fc7f242ae2dd63a18753518b6d1425e53496878924b6c0dc08d800af46adffffffff0200a3e111000000001976a914ea3f916f7ad64b1ed044147d4b1df2af10ea9cb688ac98ecfa02000000001976a914b0abfca92c8a1ae023220d4134fe72ff3273a30988ac00000000`
            })
          })
          .then(response => {
            assert(response, 'the core responded with success')
            done()
          })
          .catch(error => {
            assert(!error, `should have been able to authenticate`)
            done()
          })
      })

      describe('Events', function () {
        it('sends notifications to sockets with matching addresses', function (done) {
          if (transport === 'feathers-rest') {
            return done()
          }
          const user = this.user

          const handler = function (transaction) {
            assert(transaction, 'received a transation created notification')
            // console.log(app.io.sockets.sockets)
            feathersClient.service('transactions').off('created', handler)
            done()
          }
          feathersClient.service('transactions').on('created', handler)

          authenticate(app, feathersClient, user)
            .then(response => {
              return feathersClient.service('subscribe')
                .create({addresses: [dummyTransaction.fromAddress]})
            })
            .then(response => {
              return serviceOnClient.create(dummyTransaction)
            })
            .catch(error => {
              assert(!error, error.message)
              done()
            })
        })
      })

      it('throws an error for find without address', function (done) {
        const user = this.user

        authenticate(app, feathersClient, user)
          .then(response => {
            return serviceOnClient.find({ query: {} })
          })
          .then(response => {
            assert(!response, 'cannot query txns without passing address')
            done()
          })
          .catch(error => {
            assert(error.className === 'bad-request', 'got back an error')
            done()
          })
      })

      it('throws an error for find without `fromAddress.$in` length', function (done) {
        const user = this.user

        authenticate(app, feathersClient, user)
          .then(response => {
            return serviceOnClient.find({ query: { fromAddress: {$in: []} } })
          })
          .then(response => {
            assert(!response, 'cannot query txns without passing address')
            done()
          })
          .catch(error => {
            assert(error.className === 'bad-request', 'got back an error')
            done()
          })
      })

      it.skip('retrieves records by address', function (done) {})

      it.skip('retrieves records by txnId', function (done) {})

      it.skip('requires companyName and issuanceName if type === EQB', function (done) {})

      it.skip('only allows the creator to update the description', function (done) {})

      it('updates related issuance.sharesAuthorized for cancel type transactions', function (done) {
        const issuanceServiceOnServer = app.service('issuances')
        const initialSharesAuthorized = 222
        const transactionAmount = 22

        const issuanceCreateData = {
          userId: this.user._id.toString(),
          index: 0,
          companyIndex: 0,
          issuanceTxId: '000000000000000000000000',
          issuanceAddress: '000000000000000000000000',
          companyId: '000000000000000000000000',
          companyName: '000000000000000000000000',
          companySlug: '000000000000000000000000',
          domicile: '000000000000000000000000',
          issuanceName: '000000000000000000000000',
          issuanceType: '000000000000000000000000',
          sharesAuthorized: initialSharesAuthorized
        }
        authenticate(app, feathersClient, this.user)
          .then(loggedInResponse => {
            issuanceServiceOnServer.create(issuanceCreateData).then(issuance => {
              const issuanceId = issuance._id.toString()
              assert(issuanceId, 'issuance created')
              assert.equal(issuance.sharesAuthorized, initialSharesAuthorized, 'issuance created correctly')

              const createData = Object.assign({}, dummyTransaction)
              createData.issuanceId = issuanceId
              createData.type = 'CANCEL'
              createData.amount = transactionAmount

              serviceOnClient.create(createData)
                .then(transaction => {
                  assert.equal(transaction.type, 'CANCEL')
                  return issuanceServiceOnServer.find({ query: { _id: issuanceId } })
                })
                .then(findResponse => {
                  const issuanceUpdated = findResponse.data[0]
                  assert.equal(issuanceUpdated.sharesAuthorized, initialSharesAuthorized - transactionAmount, 'sharesAuthorized was updated correctly')
                  done()
                })
                .catch(done)
            })
          })
          .catch(done)
      })
      it('updates related issuance.sharesIssued for transfer/trade type transactions', function (done) {
        const issuanceServiceOnServer = app.service('issuances')
        const initialSharesAuthorized = 222
        const transactionAmount = 22

        const issuanceCreateData = {
          userId: this.user._id.toString(),
          index: 0,
          companyIndex: 0,
          issuanceTxId: '000000000000000000000000',
          issuanceAddress: '1A6Ei5cRfDJ8jjhwxfzLJph8B9ZEthR9Z',
          companyId: '000000000000000000000000',
          companyName: '000000000000000000000000',
          companySlug: '000000000000000000000000',
          domicile: '000000000000000000000000',
          issuanceName: '000000000000000000000000',
          issuanceType: '000000000000000000000000',
          sharesAuthorized: initialSharesAuthorized
        }
        authenticate(app, feathersClient, this.user)
          .then(loggedInResponse => {
            issuanceServiceOnServer.create(issuanceCreateData).then(issuance => {
              const issuanceId = issuance._id.toString()
              assert(issuanceId, 'issuance created')
              assert.equal(issuance.sharesAuthorized, initialSharesAuthorized, 'issuance created correctly')
              assert.equal(issuance.sharesIssued, 0, 'issuance created correctly')

              let createData = Object.assign({}, dummyTransaction)
              createData.issuanceId = issuanceId
              createData.type = 'TRANSFER'
              createData.amount = transactionAmount
              // swap to and from.
              const fa = createData.toAddress
              createData.toAddress = createData.fromAddress
              createData.fromAddress = fa
              // change to a different TXID due to uniqueness constraints
              createData.txId = '7ca26e1d69a6420d2807a36d8ad3d7d8d5ce3ef6dfbff4e58ffbd1f6e6980a55'

              serviceOnClient.create(createData)
                .then(transaction => {
                  assert.equal(transaction.type, 'TRANSFER')
                  return issuanceServiceOnServer.find({ query: { _id: issuanceId } })
                })
                .then(findResponse => {
                  const issuanceUpdated = findResponse.data[0]
                  assert.equal(issuanceUpdated.sharesIssued, transactionAmount, 'sharesIssued was updated correctly (increment)')
                  // now go the other direction, TO the issuance address
                  createData = Object.assign({}, dummyTransaction)
                  createData.issuanceId = issuanceId
                  createData.type = 'TRANSFER'
                  createData.amount = transactionAmount

                  return serviceOnClient.create(createData)
                })
                .then(transaction => {
                  assert.equal(transaction.type, 'TRANSFER')
                  return issuanceServiceOnServer.find({ query: { _id: issuanceId } })
                })
                .then(findResponse => {
                  const issuanceUpdated = findResponse.data[0]
                  assert.equal(issuanceUpdated.sharesIssued, 0, 'sharesIssued was updated correctly (decrement)')
                  done()
                })
                .catch(done)
            })
          })
          .catch(done)
      })
      it('creates a transaction note when description is defined', function (done) {
        const user = this.user
        authenticate(app, feathersClient, user)
          .then(response => {
            return serviceOnClient.create(Object.assign({}, dummyTransaction, {
              description: 'foo'
            }))
          })
          .then(response => {
            return app.service('transaction-notes').find({ query: {
              txId: dummyTransaction.txId,
              address: dummyTransaction.fromAddress
            } })
          })
          .then(result => {
            assert.equal(result.data[0].description, 'foo')
            done()
          }).catch(done)
      })
      it('does not allow client to update/patch transactions', function (done) {
        const user = this.user
        authenticate(app, feathersClient, user)
          .then(response => {
            return serviceOnClient.create(dummyTransaction)
          })
          .then(response => {
            return serviceOnClient.patch(response._id, {
              toAddress: dummyTransaction.fromAddress
            })
          })
          .then(response => {
            assert(false, 'Non-error condition reached when updating tx (error expected)')
            done()
          })
          .catch(error => {
            assert(error instanceof BadRequest, 'a BadRequest was thrown for attempting to patch the tx')
            done()
          })
      })
      it('does not allow client to delete transactions', function (done) {
        const user = this.user
        authenticate(app, feathersClient, user)
          .then(response => {
            return serviceOnClient.create(dummyTransaction)
          })
          .then(response => {
            return serviceOnClient.remove(response._id, {
              toAddress: dummyTransaction.fromAddress
            })
          })
          .then(response => {
            assert(false, 'Non-error condition reached when deleting tx (error expected)')
            done()
          })
          .catch(error => {
            assert(error instanceof BadRequest, 'a BadRequest was thrown for attempting to delete the tx')
            done()
          })
      })
    })
  })
}
