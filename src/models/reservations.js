const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  day: { type: String, required: true },
  dayOfWeek: { type: String, required: true },
  hour: { type: String, required: true },
  TrainingType: String,
  Status: String,
  Attendance: String,
  isAdmin: Boolean
});

reservationSchema.index({ day: 1, hour: 1 });
reservationSchema.index({ userId: 1, day: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);


