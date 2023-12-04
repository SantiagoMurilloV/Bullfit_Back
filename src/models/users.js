// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  Active: String,
  FirstName: String,
  LastName:String,
  Plan: String,
  IdentificationNumber: String,
  Phone: String,
});

module.exports = mongoose.model('users', userSchema);
