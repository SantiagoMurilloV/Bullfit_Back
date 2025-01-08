
const { validationResult } = require('express-validator');
const Reservation = require('../models/reservations');
const User = require('../models/users');
const Slot = require('../models/quotaLimits');
const Counter = require('../models/counter')
const UserFinance = require('../models/finances');
const mongoose = require('mongoose');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
const TELEGRAM_TOKEN = '8104626358:AAHjNVWdZuY412ngB5EX47ZaxFBH8xip9NY';
// const TELEGRAM_TOKEN = '7409507098:AAEJ_Nb1tFXcKmRExxrTaYUD6j_ntLjjAaI'; // Bullbot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const ADMIN_CHAT_ID = '6558646628'; 




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

exports.updateUserTrainingType = async(req, res) => {
  const reservationId = req.params.reservationId;
  const { TrainingType, Status, Attendance, hour } = req.body;

  
  let messageChanges = [];
  const updateFields = {};

  if (Status) {
    updateFields.Status = Status;
    messageChanges.push(`Estado actualizado a: ${Status}`);
  }
  if (Attendance) {
    updateFields.Attendance = Attendance;
    messageChanges.push(`Asistencia actualizada a: ${Attendance}`);
  }
  if (hour) {
    updateFields.hour = hour;
    messageChanges.push(`Hora actualizada a: ${hour}`);
  }

  if (TrainingType) {
    updateFields.TrainingType = TrainingType;
  }


  try {
    const updatedReservation = await Reservation.findByIdAndUpdate(reservationId, updateFields, { new: true });
    if (!updatedReservation) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // Recuperar detalles del usuario
    const user = await User.findById(updatedReservation.userId);
    if (!user) {
      return res.status(404).json({ error: 'Detalles del usuario no encontrados' });
    }

    // Compilar mensaje para Telegram
    if (messageChanges.length > 0) {
      const message = `Actualización de reserva por:
        - Usuario : ${user.FirstName} ${user.LastName}
        - Cambios: ${messageChanges.join(', ')}`;
      await bot.sendMessage(ADMIN_CHAT_ID, message);
    }


    res.status(200).json(updatedReservation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la reserva' });
  }
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

    //Envio de notificacion Telegram
    const userDetails = await Reservation.aggregate([
      { $match: { _id: savedReservation._id } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      { $unwind: '$userDetails' },
      { $project: { firstName: '$userDetails.FirstName', lastName: '$userDetails.LastName' } }
    ]);

    if (userDetails.length > 0) {
      const { firstName, lastName } = userDetails[0];
      const message = `Nueva reserva creada:
        - Usuario: ${firstName} ${lastName}
        - Fecha: ${dayOfWeek}, ${day}
        - Hora: ${hour}`;
      await bot.sendMessage(ADMIN_CHAT_ID, message);
    } else {
      throw new Error('Detalles del usuario no encontrados.');
    }


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
        } else if (finance.Plan === 'Diario' && finance.reservationPaymentStatus !== 'Si' && finance.paymentDate === '') {
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

    // verificación del usuario directamente sin agregar.
    const user = await User.findById(deletedReservation.userId);
    if (!user) {
      throw new Error('Detalles del usuario no encontrados.');
    }

    // Mensaje de notificación
    const message = `Reserva eliminada por:
      - Usuario: ${user.FirstName} ${user.LastName}
      - Fecha: ${deletedReservation.dayOfWeek}, ${deletedReservation.day}
      - Hora: ${deletedReservation.hour}`;
    await bot.sendMessage(ADMIN_CHAT_ID, message);

    //--------------------------------------------------

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



