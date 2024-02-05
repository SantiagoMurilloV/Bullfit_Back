
const { validationResult } = require('express-validator');
const Reservation = require('../models/reservations');
const User = require('../models/users');
const Slot = require('../models/quotaLimits');
const Counter = require('../models/counter')
const UserFinance = require('../models/finances');
const mongoose = require('mongoose');
const moment = require('moment');

exports.getAllReservations = async (req, res) => {
  try {
    const reservations = await Reservation.aggregate([

      {
        $project: {
          _id: 0,
          reservation: '$reservations',
          userId: 1,
          day: 1,
          dayOfWeek: 1,
          hour: 1,
          TrainingType: 1,
          Status: 1,
          Attendance: 1,
          _id: 1,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $project: {
          _id: 1,
          day: 1,
          dayOfWeek: 1,
          hour: 1,
          TrainingType: 1,
          Status: 1,
          Attendance: 1,
          userId: 1,
          userName: '$user.FirstName',
          Active: '$user.Active',
          Plan: '$user.Plan',
          userLastName: '$user.LastName',
        },
      },
    ]);

    res.status(200).json(reservations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las reservas' });
  }
};

exports.getAllReservationsId = async (req, res) => {
  try {
    const reservations = await Reservation.aggregate([

      {
        $project: {
          _id: 0,
          reservation: '$reservations',
          userId: 1,
          day: 1,
          dayOfWeek: 1,
          hour: 1,
          TrainingType: 1,
          Status: 1,
          Attendance: 1,
          _id: 1,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $project: {
          _id: 1,
          day: 1,
          dayOfWeek: 1,
          hour: 1,
          TrainingType: 1,
          Status: 1,
          Attendance: 1,
          userId: 1,
          userName: '$user.FirstName',
          Active: '$user.Active',
          Plan: '$user.Plan',
          userLastName: '$user.LastName',
        },
      },
    ]);

    res.status(200).json(reservations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las reservas' });
  }
};
exports.updateUserTrainingType = (req, res) => {
  const reservationId = req.params.reservationId;
  const { TrainingType, Status, Attendance, hour } = req.body;

  const updateFields = {};
  if (TrainingType) {
    updateFields.TrainingType = TrainingType;
  }
  if (Status) {
    updateFields.Status = Status;
  }
  if (Attendance) {
    updateFields.Attendance = Attendance;
  }
  if (hour) {
    updateFields.hour = hour;
  }
  Reservation.findByIdAndUpdate(reservationId, updateFields, { new: true })
    .then((updatedReservation) => {
      if (!updatedReservation) {
        return res.status(404).json({ error: 'Reserva no encontrada' });
      }
      res.status(200).json(updatedReservation);
    })
    .catch((err) => {
      res.status(500).json({ error: 'Error al actualizar la reserva' });
    });
};


exports.getUserReservations_ = (req, res) => {
  const userId = req.params.userId;

  Reservation.findById(userId)
    .then((reservations) => {
      if (!reservations) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      res.status(200).json(reservations);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al obtener la información del usuario' });
    });
};




exports.createReservation = async (req, res) => {
  try {
    const { userId, day, dayOfWeek, hour } = req.body;

    const newReservation = new Reservation({
      userId,
      day,
      dayOfWeek,
      hour,
      Attendance: 'Si'
    });
    const savedReservation = await newReservation.save();

    const counter = await Counter.findOne({ userId, date: day });
    if (counter) {
      counter.count += 1;
      await counter.save();
    } else {
      const newCounter = new Counter({
        userId,
        reservationId: savedReservation._id,
        date: savedReservation.day,
        count: 1
      });
      await newCounter.save();
    }

    const userFinances = await UserFinance.find({
      userId: new mongoose.Types.ObjectId(userId),
    });

    const reservationDate = moment(day, 'YYYY-MM-DD');
    for (let finance of userFinances) {
      const startDate = moment(finance.startDate, 'YYYY-MM-DD');
      const endDate = startDate.clone().add(30, 'days');
      if (reservationDate.isSameOrAfter(startDate) && reservationDate.isBefore(endDate)) {
        finance.reservationCount = (finance.reservationCount || 0) + 1;

        if (finance.Plan === 'Mensual') {
          finance.pendingBalance = 125000;
        } else if (finance.Plan === 'Diario') {
          finance.pendingBalance = finance.reservationCount * 10000;
          finance.pendingPayment = finance.pendingBalance - (finance.numberPaidReservations * 10000)
        }

        await finance.save();
        break;
      }
    }

    res.status(201).json(savedReservation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al guardar la reserva' });
  }
};




exports.getMonthlyCounts = async (req, res) => {
  const currentYear = new Date().getFullYear().toString();

  try {
    const pipeline = [
      {
        $match: {
          date: { $regex: `^${currentYear}-` }
        }
      },
      {
        $addFields: {
          month: { $substr: ['$date', 5, 2] }
        }
      },
      {
        $group: {
          _id: { userId: "$userId", month: "$month" },
          count: { $sum: "$count" }
        }
      },
      {
        $group: {
          _id: "$_id.userId",
          monthlyCounts: { $push: { k: "$_id.month", v: "$count" } }
        }
      },
      {
        $project: {
          userId: "$_id",
          monthlyCounts: { $arrayToObject: "$monthlyCounts" }
        }
      },
      {
        $addFields: {
          counts: {
            $mergeObjects: [
              { "01": 0, "02": 0, "03": 0, "04": 0, "05": 0, "06": 0, "07": 0, "08": 0, "09": 0, "10": 0, "11": 0, "12": 0 },
              "$monthlyCounts"
            ]
          }
        }
      },
      {
        $project: {
          _id: 0,
          userId: 1,
          counts: 1
        }
      }
    ];

    const results = await Counter.aggregate(pipeline);
    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los conteos mensuales' });
  }
};



exports.testCounterData = async (req, res) => {
  try {
    const results = await Counter.aggregate([
      { $limit: 10 }
    ]);

    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los datos de prueba' });
  }
};

exports.testCounterDataByYear = async (req, res) => {
  const currentYear = new Date().getFullYear().toString();

  try {
    const results = await Counter.aggregate([
      {
        $match: {
          date: { $regex: `^${currentYear}-` }
        }
      }
    ]);

    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al filtrar los datos por año' });
  }
};


























exports.getUserReservations = (req, res) => {
  const userId = req.params.userId;

  Reservation.find({ userId })
    .then((reservations) => {
      if (!reservations) {
        return res.status(404).json({ error: 'Reservas no encontradas' });
      }
      res.status(200).json(reservations);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al obtener las reservas del usuario' });
    });
};




exports.deleteReservation = async (req, res) => {
  const reservationId = req.params.reservationId;

  try {
    const deletedReservation = await Reservation.findOneAndDelete({ _id: reservationId });
    await Counter.findOneAndDelete({ reservationId: reservationId });

    if (!deletedReservation) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const userFinances = await UserFinance.find({
      userId: new mongoose.Types.ObjectId(deletedReservation.userId),
    });

    const reservationDate = moment(deletedReservation.day, 'YYYY-MM-DD');
    for (let finance of userFinances) {
      const startDate = moment(finance.startDate, 'YYYY-MM-DD');
      const endDate = startDate.clone().add(30, 'days');
      if (reservationDate.isSameOrAfter(startDate) && reservationDate.isBefore(endDate)) {
        finance.reservationCount = Math.max((finance.reservationCount || 0) - 1, 0);

        if (finance.Plan === 'Mensual') {
          finance.pendingBalance = 125000;
        } else if (finance.Plan === 'Diario') {
          finance.pendingBalance = finance.reservationCount * 10000;
          finance.pendingPayment = finance.pendingBalance - (finance.numberPaidReservations * 10000)
        }

        await finance.save();
        break;
      }
    }
    let response = {
      message: 'Proceso de eliminación completado',
      deletedReservation: deletedReservation
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar la reserva' });
  }
};



