const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
  item: { type: String, required: true },
  price: { type: Number, required: true },
  type: { type: String, required: true },
});

module.exports = mongoose.model('Price', priceSchema);
