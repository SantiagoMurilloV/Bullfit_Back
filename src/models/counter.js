// models/counter.js

const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    required: true
  },
  date: {
    type: 'String',
    required: true
  },
  count: {
    type: Number,
    default: 1
  }
});

module.exports = mongoose.model('Counter', CounterSchema);
