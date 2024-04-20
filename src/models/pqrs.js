const mongoose = require('mongoose');

const PQRSSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  Date:String,
  Hour:String,
  Type:String,
  Pqr:String,
});

module.exports = mongoose.model('PQRS', PQRSSchema);