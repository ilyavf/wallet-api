// orders-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
module.exports = function (app) {
  const mongooseClient = app.get('mongooseClient')
  const { ObjectId } = mongooseClient.Schema.Types
  const sellOrders = new mongooseClient.Schema({
    userId: { type: ObjectId, required: true },
    type: { type: String, required: true },
    issuanceAddress: { type: String, required: true },
    portfolioId: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    isFillOrKill: { type: Boolean, required: true },
    goodFor: { type: Number, required: true },
    status: { type: String, enum: [ 'OPEN', 'TRADING', 'CANCELLED', 'CLOSED' ] },

    // Issuance info:
    companyName: { type: String },
    issuanceName: { type: String },
    issuanceType: { type: String },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  })

  return mongooseClient.model('sellOrders', sellOrders)
}
