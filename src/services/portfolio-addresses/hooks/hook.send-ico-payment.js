const { builder } = require('tx-builder-equibit')
const bitcoin = require('bitcoinjs-lib')
const axios = require('axios')

const fee = 3000

function payout (hook, userAddress, rewardAmount, config) {
  const app = hook.app
  const sourceKP = {
    address: app.get('icoPayoutAddress'),
    key: app.get('icoPayoutKey')
  }
  const listUnspentService = app.service('listunspent')
  const txToUse = []
  let hexVal
  return listUnspentService.find({
    query: {
      eqb: [sourceKP.address],
      doImport: false,
      byAddress: false
    }
  }).then(
    unspent => {
      const utxo = unspent.EQB.txouts
      const total = unspent.EQB.summary.total
      if (total < rewardAmount) {
        console.error('Funds were not available to dispense an ico entitlement, refill ', sourceKP.address)
        throw new Error('insufficient funds')
      }
      let vinAmount = 0
      for (let tx of utxo) {
        txToUse.push({
          txid: tx.txid,
          vout: 0,
          keyPair: bitcoin.ECPair.fromWIF(sourceKP.key, bitcoin.networks.testnet)
        })
        vinAmount += tx.amount
        if (vinAmount > rewardAmount) {
          break
        }
      }
      const tx = builder.buildTx(
        {
          version: 2,
          locktime: 0,
          vin: txToUse,
          vout: [
            {
              address: userAddress,
              value: rewardAmount,
              equibit: {
                payment_currency: 0,
                payment_tx_id: '',
                issuance_tx_id: '0000000000000000000000000000000000000000000000000000000000000000',
                issuance_json: ''
              }
            },
            {
              address: sourceKP.address,
              value: vinAmount - (rewardAmount + fee),
              equibit: {
                payment_currency: 0,
                payment_tx_id: '',
                issuance_tx_id: '0000000000000000000000000000000000000000000000000000000000000000',
                issuance_json: ''
              }
            }
          ]
        },
        {
          network: bitcoin.networks.testnet,
          sha: 'SHA3_256'
        }
      )
      return tx
    }
  ).then(
    built => {
      hexVal = built.toString('hex')
    }
  ).then(
    () => axios({
      method: 'POST',
      url: config.url,
      data: {
        jsonrpc: '1.0',
        method: 'sendrawtransaction',
        params: [hexVal]
      },
      auth: {
        username: config.username,
        password: config.password
      }
    }).then(
      response => {
        app.service('/transactions').create({
          fromAddress: sourceKP.address,
          toAddress: userAddress,
          addressTxId: txToUse[0].txId,
          addressVout: '0',
          type: 'TRANSFER',
          currencyType: 'EQB',
          amount: rewardAmount,
          fee: fee,
          txid: response.data.result,
          hex: hexVal
        })
      }
    )
  )
}

module.exports = function () {
  return hook => {
    const investorsService = hook.app.service('icoinvestors')
    const balanceThreshold = 100 * 100000000
    let addressEQB
    const email = (hook.params.user && hook.params.user.email) || hook.data.email
    if (hook.data.type === 'EQB') {
      addressEQB = hook.data.importAddress
    }
    if (email && addressEQB) {
      const random = Math.random()
      // use patch rather than find to atomically check and set the locked field
      return investorsService.patch(null, {locked: random}, {query: { locked: 0, email }})
        .then((data) => {
          if (data[0]) {
            if (data[0].locked !== random) {
              // another instance of this service has the lock
              return
            }
            // If balance is less than threshold, that means we can automatically dispense and delete. If it is not, then it is manual
            if (data[0].balanceOwed < balanceThreshold) {
              // Here we add the payment methods, payable to EQB address of user
              // Then remove the entry
              return payout(hook, addressEQB, data[0].balanceOwed, hook.app.get('equibitCore')).then(
                () => investorsService.remove(null, { query: { email } }),
                // in the case of a failed payment, flag the record as needing to be manually handled
                err => {
                  console.log('error sending an ico payment:', err.message)
                  return investorsService.patch(
                    data[0]._id,
                    { address: addressEQB,
                      manualPaymentRequired: true,
                      locked: 0
                    })
                })
            } else {
              return investorsService.patch(
                data[0]._id,
                { address: addressEQB,
                  manualPaymentRequired: true,
                  locked: 0
                })
            }
          }
        }).then(() => hook, () => hook)
    } else {
      return hook
    }
  }
}