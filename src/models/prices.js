const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
  item: { type: String, required: true, index: true },
  price: { type: Number, required: true },
  type: { type: String, required: true, index: true },
});

priceSchema.index({ item: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Price', priceSchema);
