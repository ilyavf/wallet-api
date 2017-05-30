const axios = require('axios')

class Service {
  constructor (options) {
    this.options = options || {}
  }

  find (params) {
    return axios({
      method: 'POST',
      url: 'http://99.227.230.43:8331',
      data: {
        jsonrpc: '1.0',
        method: 'getbalance'
      },
      auth: {
        username: 'equibit',
        password: 'equibit'
      }
    })
      .then(res => {
        debugger
      })
      .catch(error => {
        debugger
      })
    // return Promise.resolve([{
    //   type: 'equibit',
    //   amount: 123
    // }, {
    //   type: 'bitcoin',
    //   amount: 5
    // }])
  }

  get (id, params) {
    return Promise.resolve({
      id, text: `A new message with ID: ${id}!`
    })
  }

  create (data, params) {
    if (Array.isArray(data)) {
      return Promise.all(data.map(current => this.create(current)))
    }

    return Promise.resolve(data)
  }

  update (id, data, params) {
    return Promise.resolve(data)
  }

  patch (id, data, params) {
    return Promise.resolve(data)
  }

  remove (id, params) {
    return Promise.resolve({ id })
  }
}

module.exports = function (options) {
  return new Service(options)
}

module.exports.Service = Service