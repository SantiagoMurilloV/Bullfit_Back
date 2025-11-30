// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  Active: { type: String, index: true },
  FirstName: String,
  LastName:String,
  Plan: { type: String, index: true },
  IdentificationNumber: { type: String, index: true },
  Phone: String,
  registrationDate:String, 
  nameEmergency:String,
  LastNameEmergency:String,
  PhoneEmergency:String
});

userSchema.index({ IdentificationNumber: 1 }, { unique: false, sparse: true });

module.exports = mongoose.model('users', userSchema);
