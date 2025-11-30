// models/counter.js

const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    required: true,
    index: true
  },
  date: {
    type: 'String',
    required: true,
    index: true
  },
  count: {
    type: Number,
    default: 1
  }
});

CounterSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('Counter', CounterSchema);
