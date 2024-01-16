const mongoose = require('mongoose');

const userStoreSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name:String,
  item:String,
  quantity:Number,
  value:Number,
  paymentStatus:String

});

module.exports = mongoose.model('UserStore', userStoreSchema);