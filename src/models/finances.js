// models/UserFinance.js
const mongoose = require('mongoose');

const userFinanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
  userName: String, 
  plan: String, 
  startDate: Date, 
  endDate: Date, 
  otherConsumptions: [{ type: String }], 
  otherConsumptionsAmounts: [{ type: Number }]
});

module.exports = mongoose.model('UserFinance', userFinanceSchema);

