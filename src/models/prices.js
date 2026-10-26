const mongoose = require('mongoose');

// `item` is the immutable key other collections and services reference
// (UserStore.item, getPriceValue({ item })). `name` is the human label the
// admin edits from the price catalog modal; when it is empty the frontend
// falls back to a legacy label map keyed by `item`.
const priceSchema = new mongoose.Schema({
  item: { type: String, required: true, index: true },
  name: { type: String, trim: true, default: '' },
  price: { type: Number, required: true },
  type: { type: String, required: true, index: true },
});

priceSchema.index({ item: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Price', priceSchema);
