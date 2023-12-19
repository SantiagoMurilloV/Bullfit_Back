const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true, trim: true },
  hour: { type: String, required: true, trim: true },
  TrainingType: { type: String, trim: true },
  Status: { type: String, trim: true },
  Attendance: { type: String, trim: true }
});

module.exports = mongoose.model('Reservation', reservationSchema);
