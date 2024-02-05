const mongoose = require('mongoose');

const userFinanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  Active:String,
  FirstName:String,
  LastName:String,
  IdentificationNumber:String,
  Plan: String,
  Phone:String,
  startDate: String,
  endDate: String,
  reservationCount: Number,
  totalAmount: Number,
  pendingBalance: Number,
  pendingPayment:Number,
  totalConsumption: Number,
  numberPaidReservations:Number,
  paymentDate: String,
  paymentTime:String,
  reservationPaymentStatus: String,
  news:String
});

module.exports = mongoose.model('UserFinance', userFinanceSchema);