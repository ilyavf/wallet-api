const path = require('path')

module.exports = function (app) {
  const config = app.get('seeder')

  if (config.enabled) {
    config.services.forEach(serviceObj => {
      // Prevent the seeder from deleting previous portfolio-addresses to stabilize amount of BTC/EQB in accounts
      if (serviceObj.path === 'portfolio-addresses') {
        config.delete = false
      } else {
        config.delete = true
      }

      const service = app.service(serviceObj.path)
      let { data } = serviceObj

      // If the data is a string, assume it's a file location.
      if (typeof data === 'string') {
        data = require(path.join(__dirname, '..', data))
      }

      if (config.delete) {
        // Remove all records.
        service.remove(null).then(() => service.create(data, config.params))
      } else {
        service.create(data, config.params)
      }
    })
  }
}
