const mongoose = require('mongoose');

const userFinanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  Active:String,
  FirstName:String,
  LastName:String,
  IdentificationNumber:String,
  Plan: { type: String, index: true },
  Phone:String,
  startDate: { type: String, index: true },
  endDate: String,
  reservationCount: Number,
  totalAmount: Number,
  pendingBalance: Number,
  pendingPayment:Number,
  totalConsumption: Number,
  numberPaidReservations:Number,
  pricePerReservation: Number,
  paymentDate: String,
  paymentTime:String,
  reservationPaymentStatus: String,
  news:String
});

userFinanceSchema.index({ userId: 1, Plan: 1, startDate: 1 });

module.exports = mongoose.model('UserFinance', userFinanceSchema);
