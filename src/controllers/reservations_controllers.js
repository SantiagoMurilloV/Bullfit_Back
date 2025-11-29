
const { validationResult } = require('express-validator');
const Reservation = require('../models/reservations');
const User = require('../models/users');
const Slot = require('../models/quotaLimits');
const Counter = require('../models/counter')
const UserFinance = require('../models/finances');
const { getPriceValue } = require('../services/priceService');
const Invitado = require('../models/invitados');
const mongoose = require('mongoose');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
//const TELEGRAM_TOKEN = '7409507098:AAEJ_Nb1tFXcKmRExxrTaYUD6j_ntLjjAaI'; // Bullbot
//const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
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

exports.updateUserTrainingType = async (req, res) => {
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
  const { userId, day, dayOfWeek, hour, isAdmin = false  } = req.body;

  try {
    // Validación básica de campos
    if (!userId || !day || !dayOfWeek || !hour) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId inválido' });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    let user = await User.findById(userObjectId);
    let isGuestReservation = false;
    let guestProfile = null;

    if (!user) {
      guestProfile = await Invitado.findById(userObjectId);
      if (!guestProfile) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }
      isGuestReservation = true;
      user = {
        _id: guestProfile._id,
        FirstName: guestProfile.name || 'Invitado',
        LastName: '',
        Plan: 'Invitado',
        Active: 'Sí'
      };
    }

    const bogotaNow = moment().tz('America/Bogota');
    const monthStart = bogotaNow.clone().startOf('month').format('YYYY-MM-DD');
    const monthEnd = bogotaNow.clone().endOf('month').format('YYYY-MM-DD');

    const dailyFinance = isGuestReservation ? null : await UserFinance.findOne({
      userId: userObjectId,
      Plan: { $regex: /^diario$/i },
      startDate: { $gte: monthStart, $lte: monthEnd }
    });

    if (dailyFinance) {
      const dailyPrice = await getPriceValue({ item: 'Diario' });
      const paidValue = (dailyFinance.numberPaidReservations || 0) * dailyPrice;
      const currentBalance = dailyFinance.pendingBalance || 0;
      const pendingPaymentField = typeof dailyFinance.pendingPayment === 'number'
        ? dailyFinance.pendingPayment
        : currentBalance - paidValue;

      if (pendingPaymentField > 0) {
        return res.status(400).json({
          code: 'PENDING_BALANCE',
          message: 'No puedes crear una nueva reserva hasta que pagues tus reservas pendientes.'
        });
      }
    }

    // Verificar disponibilidad de slots
    const existingReservationsCount = await Reservation.countDocuments({ day, hour });
    const slot = await Slot.findOne({ day: dayOfWeek, hour });
    if (!slot) {
      return res.status(404).json({
        code: 'SLOT_NOT_FOUND',
        message: 'No hay información de cupos para este día y hora.'
      });
    }
    
    if (Number(slot.slots) === 0) {
      return res.status(400).json({
        code: 'SLOT_UNAVAILABLE',
        message: 'Hora no disponible para reservas.'
      });
    }
    
    if (existingReservationsCount >= slot.slots) {
      return res.status(400).json({
        code: 'SLOT_FULL',
        message: 'No hay cupos disponibles para esta hora.'
      });
    }
    
    const reservationDateTime = moment.tz(`${day} ${hour}`, 'America/Bogota');
    const now = moment.tz('America/Bogota');
    const timeDifference = reservationDateTime.diff(now, 'minutes');

    if (!isAdmin && existingReservationsCount === 0 && timeDifference < 60) {
      return res.status(400).json({
        code: 'TIME_RESTRICTION',
        message: 'Solo puedes reservar con al menos una hora de antelación si no hay reservas previas.'
      });
    }

    

    // Crear nueva reserva
    const newReservation = new Reservation({
      userId,
      day,
      dayOfWeek,
      hour,
      Attendance: 'Si',
      isAdmin
    });

    const savedReservation = await newReservation.save();

    // Obtener nombre del usuario con agregación
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

    // Notificación por Telegram
    let notificationInfo = null;
    if (userDetails.length > 0) {
      notificationInfo = userDetails[0];
    } else if (isGuestReservation) {
      notificationInfo = { firstName: user.FirstName, lastName: user.LastName };
    }

    if (notificationInfo) {
      const message = `*Nueva reserva:*\n
      - *Usuario:* ${notificationInfo.firstName} ${notificationInfo.lastName || ''}
      - *Fecha:* ${dayOfWeek}, ${day}
      - *Hora:* ${hour}`;
      try {
        await bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('Error al enviar notificación de Telegram:', err.message);
      }
    }

    // Actualizar o crear contador de reservas
    let counter = await Counter.findOne({ userId, date: day });

    if (counter) {
      counter.count += 1;
      await counter.save();
    } else {
      counter = new Counter({
        userId,
        reservationId: savedReservation._id,
        date: savedReservation.day,
        count: 1
      });
      await counter.save();
    }

    // Actualizar información financiera del usuario
    const userFinances = isGuestReservation ? [] : await UserFinance.find({ userId: userObjectId });
    const reservationDate = moment(day, 'YYYY-MM-DD');
    const priceCache = {};

    const resolvePrice = async (item) => {
      if (!priceCache[item]) {
        priceCache[item] = await getPriceValue({ item });
      }
      return priceCache[item];
    };

    for (const finance of userFinances) {
      const startDate = moment(finance.startDate, 'YYYY-MM-DD');
      const endDate = startDate.clone().endOf('month');

      // Incluir el día final del período (rango inclusivo)
      if (reservationDate.isSameOrAfter(startDate) && reservationDate.isSameOrBefore(endDate)) {
        finance.reservationCount = (finance.reservationCount || 0) + 1;

        if (finance.Plan === 'Mensual') {
          const monthlyPrice = await resolvePrice('Mensual');
          finance.pendingBalance = monthlyPrice;
        } else if (
          finance.Plan === 'Diario' &&
          finance.reservationPaymentStatus !== 'Si' &&
          finance.paymentDate === ''
        ) {
          const dailyReservationPrice = await resolvePrice('Diario');
          const paidReservations = finance.numberPaidReservations || 0;
          finance.pendingBalance = finance.reservationCount * dailyReservationPrice;
          finance.pendingPayment = finance.pendingBalance - (paidReservations * dailyReservationPrice);
        }

        await finance.save();
        break; // Solo se actualiza el primer plan válido
      }
    }

    // Éxito
    return res.status(201).json(savedReservation);

  } catch (error) {
    console.error('Error al guardar la reserva:', error.message);
    const status = error.code === 'PRICE_NOT_FOUND' ? 400 : 500;
    const message = error.code === 'PRICE_NOT_FOUND'
      ? error.message
      : 'Error interno del servidor al guardar la reserva.';
    return res.status(status).json({ message });
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

    // verificar si el id pertenece a un usuario registrado o a un invitado
    let user = await User.findById(deletedReservation.userId);
    let guestProfile = null;

    if (!user) {
      guestProfile = await Invitado.findById(deletedReservation.userId);
      if (!guestProfile) {
        throw new Error('Detalles del usuario no encontrados.');
      }
    }

    const firstName = user ? user.FirstName : guestProfile.name || 'Invitado';
    const lastName = user ? user.LastName : '';

    // Mensaje de notificación
    const message = `*Reserva eliminada por:*
      - *Usuario:* ${firstName} ${lastName}
      - *Fecha:* ${deletedReservation.dayOfWeek}, ${deletedReservation.day}
      - *Hora:* ${deletedReservation.hour}`;
    if (typeof bot !== 'undefined') {
      await bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'Markdown' });
    }

    //--------------------------------------------------

    const userFinances = await UserFinance.find({
      userId: new mongoose.Types.ObjectId(deletedReservation.userId),
    });

    const reservationDate = moment(deletedReservation.day, 'YYYY-MM-DD');
    const priceCache = {};

    const resolvePrice = async (item) => {
      if (!priceCache[item]) {
        priceCache[item] = await getPriceValue({ item });
      }
      return priceCache[item];
    };

    for (let finance of userFinances) {
      const startDate = moment(finance.startDate, 'YYYY-MM-DD');
      const endDate = startDate.clone().endOf('month');
      // Incluir el día final del período (rango inclusivo)
      if (reservationDate.isSameOrAfter(startDate) && reservationDate.isSameOrBefore(endDate)) {
        finance.reservationCount = Math.max((finance.reservationCount || 0) - 1, 0);

        if (finance.Plan === 'Mensual') {
          const monthlyPrice = await resolvePrice('Mensual');
          finance.pendingBalance = monthlyPrice;
        } else if (finance.Plan === 'Diario') {
          const dailyReservationPrice = await resolvePrice('Diario');
          const paidReservations = finance.numberPaidReservations || 0;
          finance.pendingBalance = finance.reservationCount * dailyReservationPrice;
          finance.pendingPayment = finance.pendingBalance - (paidReservations * dailyReservationPrice);
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
    if (error.code === 'PRICE_NOT_FOUND') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ error: 'Error al eliminar la reserva' });
  }
};
