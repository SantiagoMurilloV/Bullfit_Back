
const { validationResult } = require('express-validator');
const axios = require('axios');
const Reservation = require('../models/reservations');
const User = require('../models/users');
const Slot = require('../models/quotaLimits');
const Counter = require('../models/counter')
const UserFinance = require('../models/finances');
const { getPriceValue } = require('../services/priceService');
const { recomputeDailyFinanceFields, applyDailyFinanceFields } = require('../services/financeService');
const { getCacheJSON, setCacheJSON, deleteCacheKeys } = require('../lib/cacheUtils');
const Invitado = require('../models/invitados');
const mongoose = require('mongoose');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_TOKEN = '7409507098:AAEJ_Nb1tFXcKmRExxrTaYUD6j_ntLjjAaI'; // Bullbot
//const TELEGRAM_TOKEN = '8185862604:AAGAVTMgKoYYretU1lGCyYf4iX2k625D6kU'; // Test Bot
const ADMIN_CHAT_ID = '6558646628';
//const ADMIN_CHAT_ID = '2067829989';  //test bot admin
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const startProfiler = (label) => {
  const profilerLabel = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  //console.time(profilerLabel);
  return profilerLabel;
};

const endProfiler = (label) => {
  if (label) {
    //console.timeEnd(label);
  }
};

const RESERVATION_CACHE_KEYS = {
  LIST: 'reservations:list',
  LIST_WITH_USER: 'reservations:list:with-user',
  MONTHLY: 'reservations:monthlyCounts',
};
const RESERVATIONS_CACHE_TTL_SECONDS = Number(
  typeof process.env.RESERVATIONS_CACHE_TTL !== 'undefined'
    ? process.env.RESERVATIONS_CACHE_TTL
    : 0
);
const getMinimumReservationDate = () =>
  moment().tz('America/Bogota').startOf('isoWeek').subtract(1, 'week').format('YYYY-MM-DD');
const isFutureReservation = (reservation) => {
  if (!reservation || !reservation.day) {
    return false;
  }
  return reservation.day >= getMinimumReservationDate();
};

const reservationsCacheState = {
  data: null,
  loadingPromise: null,
  mutationPromise: Promise.resolve(),
};

const normalizeReservationsData = (data = []) =>
  data.filter(isFutureReservation);

const setReservationsCacheData = async (data) => {
  const normalizedData = normalizeReservationsData(data);
  reservationsCacheState.data = normalizedData;
  await Promise.all([
    setCacheJSON(RESERVATION_CACHE_KEYS.LIST, normalizedData, RESERVATIONS_CACHE_TTL_SECONDS),
    setCacheJSON(RESERVATION_CACHE_KEYS.LIST_WITH_USER, normalizedData, RESERVATIONS_CACHE_TTL_SECONDS),
  ]);
};

const loadReservationsCache = async () => {
  const cached = await getCacheJSON(RESERVATION_CACHE_KEYS.LIST);
  if (cached !== null) {
    const normalized = normalizeReservationsData(cached);
    reservationsCacheState.data = normalized;
    if (normalized.length !== cached.length) {
      await setReservationsCacheData(normalized);
    }
    return normalized;
  }
  const freshData = await fetchReservationsWithUsers();
  await setReservationsCacheData(freshData);
  return freshData;
};

const getReservationsCacheData = async () => {
  if (reservationsCacheState.data) {
    return reservationsCacheState.data;
  }

  if (!reservationsCacheState.loadingPromise) {
    reservationsCacheState.loadingPromise = loadReservationsCache().finally(() => {
      reservationsCacheState.loadingPromise = null;
    });
  }

  return reservationsCacheState.loadingPromise;
};

const mutateReservationsCache = (mutator) => {
  reservationsCacheState.mutationPromise = reservationsCacheState.mutationPromise
    .then(async () => {
      const current = await getReservationsCacheData();
      const snapshot = Array.isArray(current) ? current : [];
      const next = normalizeReservationsData(mutator([...snapshot]) || snapshot);
      await setReservationsCacheData(next);
      return next;
    })
    .catch((error) => {
      console.error('Error actualizando la caché de reservas:', error.message);
    });

  return reservationsCacheState.mutationPromise;
};

const addReservationToCache = async (entry) => {
  if (!entry) {
    return;
  }
  if (!isFutureReservation(entry)) {
    return;
  }
  await mutateReservationsCache((data) => [entry, ...data]);
};

const updateReservationCacheEntry = async (reservationId, updater) => {
  if (!reservationId || typeof updater !== 'function') {
    return;
  }

  await mutateReservationsCache((data) => {
    const index = data.findIndex((item) => item._id?.toString() === reservationId.toString());
    if (index !== -1) {
      const updatedItem = updater({ ...data[index] });
      if (updatedItem) {
        data[index] = updatedItem;
      }
    }
    return data;
  });
};

const removeReservationCacheEntry = async (reservationId) => {
  if (!reservationId) {
    return;
  }
  await mutateReservationsCache((data) => data.filter((item) => item._id?.toString() !== reservationId.toString()));
};

const queueReservationCacheInvalidation = (userId) => {
  const keys = [
    RESERVATION_CACHE_KEYS.MONTHLY,
  ];

  if (userId) {
    keys.push(`reservations:user:${userId}`);
  }

  deleteCacheKeys(...keys);
};

const buildReservationResponse = (reservation) => {
  const userInfo = reservation.userId && typeof reservation.userId === 'object'
    ? reservation.userId
    : null;

  const wrap = (value) => (typeof value === 'undefined' || value === null ? [] : [value]);

  return {
    _id: reservation._id,
    day: reservation.day,
    dayOfWeek: reservation.dayOfWeek,
    hour: reservation.hour,
    TrainingType: reservation.TrainingType,
    Status: reservation.Status,
    Attendance: reservation.Attendance,
    userId: reservation.userId?._id || reservation.userId || null,
    userName: wrap(userInfo?.FirstName),
    Active: wrap(userInfo?.Active),
    Plan: wrap(userInfo?.Plan),
    userLastName: wrap(userInfo?.LastName),
  };
};

const fetchReservationsWithUsers = async () => {
  const minimumDate = getMinimumReservationDate();
  const reservations = await Reservation.find({
    day: { $gte: minimumDate },
  })
    .select('day dayOfWeek hour TrainingType Status Attendance userId')
    .lean();

  const userIds = [...new Set(reservations.map((r) => r.userId).filter(Boolean).map((id) => id.toString()))];

  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
      .select('FirstName LastName Active Plan')
      .lean()
    : [];

  const userMap = users.reduce((acc, user) => {
    acc[user._id.toString()] = user;
    return acc;
  }, {});

  return reservations.map((reservation) => {
    const userInfo = reservation.userId ? userMap[reservation.userId.toString()] : null;
    const userReservation = userInfo
      ? { ...reservation, userId: userInfo }
      : reservation;
    return buildReservationResponse(userReservation);
  });
};

exports.getAllReservations = async (req, res) => {
  const profiler = startProfiler('getAllReservations');
  try {
    const reservations = await getReservationsCacheData();
    res.status(200).json(reservations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las reservas' });
  } finally {
    endProfiler(profiler);
  }
};

exports.getAllReservationsId = async (req, res) => {
  const profiler = startProfiler('getAllReservationsId');
  try {
    const reservations = await getReservationsCacheData();
    res.status(200).json(reservations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las reservas' });
  } finally {
    endProfiler(profiler);
  }
};

exports.updateUserTrainingType = async (req, res) => {
  const profiler = startProfiler('updateUserTrainingType');
  const reservationId = req.params.reservationId;
  const { TrainingType, Status, Attendance, hour, isAdmin = false } = req.body;
  const effectiveIsAdmin = Boolean(isAdmin);


  try {
    const reservation = await Reservation.findById(reservationId);

    if (!reservation) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

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

    // Validar cambio de hora
    if (hour && hour !== reservation.hour) {
      if (!effectiveIsAdmin) {
        // Validar cupos y disponibilidad como en createReservation
        const [count, slot] = await Promise.all([
          Reservation.countDocuments({ day: reservation.day, hour }),
          Slot.findOne({ day: reservation.dayOfWeek, hour }).select('slots')
        ]);

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

        if (count >= slot.slots) {
          return res.status(400).json({
            code: 'SLOT_FULL',
            message: 'No hay cupos disponibles para esta hora.'
          });
        }

        const reservationDateTime = moment.tz(`${reservation.day} ${hour}`, 'America/Bogota');
        const now = moment.tz('America/Bogota');
        const timeDifference = reservationDateTime.diff(now, 'minutes');

        if (count === 0 && timeDifference < 60) {
          return res.status(400).json({
            code: 'TIME_RESTRICTION',
            message: 'Solo puedes reservar con al menos una hora de antelación si no hay reservas previas.'
          });
        }
      }

      updateFields.hour = hour;
      messageChanges.push(`Hora actualizada a: ${hour}`);
    }

    if (TrainingType) {
      updateFields.TrainingType = TrainingType;
      messageChanges.push(`Tipo de entrenamiento actualizado a: ${TrainingType}`);
    }

    const updatedReservation = await Reservation.findByIdAndUpdate(reservationId, updateFields, { new: true });

    // Recuperar detalles del usuario
    const user = await User.findById(updatedReservation.userId);
    if (!user) {
      return res.status(404).json({ error: 'Detalles del usuario no encontrados' });
    }

    if (messageChanges.length > 0 && bot && ADMIN_CHAT_ID) {
      const message = `*Actualización de reserva*\n` +
        `- *Usuario:* ${user.FirstName} ${user.LastName}\n` +
        `- *Cambios:* ${messageChanges.join(', ')}`;
      try {
        await bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('Error al enviar notificación de Telegram:', err.message);
      }
    }


    await updateReservationCacheEntry(updatedReservation._id, (entry) => ({
      ...entry,
      TrainingType: updatedReservation.TrainingType,
      Status: updatedReservation.Status,
      Attendance: updatedReservation.Attendance,
      hour: updatedReservation.hour,
    }));
    queueReservationCacheInvalidation(updatedReservation.userId);

    res.status(200).json(updatedReservation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la reserva' });
  } finally {
    endProfiler(profiler);
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
  const profiler = startProfiler('createReservation');
  const { userId, day, dayOfWeek, hour, isAdmin = false } = req.body;
  const effectiveIsAdmin = Boolean(isAdmin);

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

    const dailyFinance = !effectiveIsAdmin && !isGuestReservation
      ? await UserFinance.findOne({
        userId: userObjectId,
        Plan: { $regex: /^diario$/i },
        startDate: { $gte: monthStart, $lte: monthEnd }
      })
      : null;

    if (dailyFinance) {
      const recalculatedDailyFinance = await recomputeDailyFinanceFields(dailyFinance);
      const isOutdatedDailyFinance =
        dailyFinance.reservationCount !== recalculatedDailyFinance.reservationCount ||
        dailyFinance.numberPaidReservations !== recalculatedDailyFinance.numberPaidReservations ||
        dailyFinance.pendingBalance !== recalculatedDailyFinance.pendingBalance ||
        dailyFinance.pendingPayment !== recalculatedDailyFinance.pendingPayment ||
        dailyFinance.reservationPaymentStatus !== recalculatedDailyFinance.reservationPaymentStatus ||
        (dailyFinance.paymentDate || '') !== recalculatedDailyFinance.paymentDate ||
        (dailyFinance.paymentTime || '') !== recalculatedDailyFinance.paymentTime;

      if (isOutdatedDailyFinance) {
        Object.assign(dailyFinance, recalculatedDailyFinance);
        await dailyFinance.save();
      }

      if (recalculatedDailyFinance.pendingPayment > 0) {
        return res.status(400).json({
          code: 'PENDING_BALANCE',
          message: 'No puedes crear una nueva reserva hasta que pagues tus reservas pendientes.'
        });
      }
    }

    // Verificar disponibilidad de slots (omitido para admin)
    let existingReservationsCount = 0;
    if (!effectiveIsAdmin) {
      const [count, slot] = await Promise.all([
        Reservation.countDocuments({ day, hour }),
        Slot.findOne({ day: dayOfWeek, hour }).select('slots')
      ]);
      existingReservationsCount = count;
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
    }

    const reservationDateTime = moment.tz(`${day} ${hour}`, 'America/Bogota');
    const now = moment.tz('America/Bogota');
    const timeDifference = reservationDateTime.diff(now, 'minutes');

    if (!effectiveIsAdmin && existingReservationsCount === 0 && timeDifference < 60) {
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
      isAdmin: effectiveIsAdmin
    });

    const savedReservation = await newReservation.save();

    if (bot && ADMIN_CHAT_ID) {
      const firstName = user.FirstName || 'Invitado';
      const lastName = user.LastName || '';
      const message = `*Nueva reserva*\n` +
        `- *Usuario:* ${firstName} ${lastName}\n` +
        `- *Fecha:* ${dayOfWeek}, ${day}\n` +
        `- *Hora:* ${hour}`;
      try {
        await bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('Error al enviar notificación de Telegram:', err.message);
      }
    }

    // Enviar webhook a n8n
    try {
      const n8nWebhookUrl = 'https://developer24.app.n8n.cloud/webhook-test/9ad31f56-1aec-4559-9c6e-adbacdd53576';
      await axios.post(n8nWebhookUrl, {
        reservation: savedReservation,
        user: {
          _id: user._id,
          FirstName: user.FirstName,
          LastName: user.LastName,
          Active: user.Active,
          Plan: user.Plan,
          Phone: user.Phone
        }
      });
    } catch (error) {
      console.error('Error al enviar webhook a n8n:', error.message);
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
        } else if (finance.Plan === 'Diario') {
          await applyDailyFinanceFields(finance);
        }

        await finance.save();
        break; // Solo se actualiza el primer plan válido
      }
    }

    const cacheEntry = buildReservationResponse({
      ...savedReservation.toObject(),
      day: savedReservation.day,
      userId: {
        _id: user._id,
        FirstName: user.FirstName,
        LastName: user.LastName,
        Active: user.Active,
        Plan: user.Plan,
      },
    });
    await addReservationToCache(cacheEntry);
    queueReservationCacheInvalidation(userId);

    // Éxito
    return res.status(201).json(savedReservation);

  } catch (error) {
    console.error('Error al guardar la reserva:', error.message);
    const status = error.code === 'PRICE_NOT_FOUND' ? 400 : 500;
    const message = error.code === 'PRICE_NOT_FOUND'
      ? error.message
      : 'Error interno del servidor al guardar la reserva.';
    return res.status(status).json({ message });
  } finally {
    endProfiler(profiler);
  }
};



exports.getMonthlyCounts = async (req, res) => {
  const profiler = startProfiler('getMonthlyCounts');
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

    const cacheKey = RESERVATION_CACHE_KEYS.MONTHLY;
    const cachedResults = await getCacheJSON(cacheKey);
    if (cachedResults !== null) {
      return res.status(200).json(cachedResults);
    }

    const results = await Counter.aggregate(pipeline);
    await setCacheJSON(cacheKey, results, 120);
    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los conteos mensuales' });
  } finally {
    endProfiler(profiler);
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

exports.getUserReservations = async (req, res) => {
  const profiler = startProfiler('getUserReservations');
  const userId = req.params.userId;

  try {
    const cacheKey = `reservations:user:${userId}`;
    const cachedReservations = await getCacheJSON(cacheKey);
    if (cachedReservations !== null) {
      return res.status(200).json(cachedReservations);
    }

    const reservations = await Reservation.find({
      userId,
      day: { $gte: getMinimumReservationDate() },
    })
      .select('day dayOfWeek hour TrainingType Status Attendance isAdmin userId')
      .lean();

    if (!reservations) {
      return res.status(404).json({ error: 'Reservas no encontradas' });
    }

    await setCacheJSON(cacheKey, reservations, 15);

    res.status(200).json(reservations);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener las reservas del usuario' });
  } finally {
    endProfiler(profiler);
  }
};

exports.deleteReservation = async (req, res) => {
  const profiler = startProfiler('deleteReservation');
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

    if (bot && ADMIN_CHAT_ID) {
      const profile = user || guestProfile || {};
      const firstName = profile.FirstName || profile.name || 'Invitado';
      const lastName = profile.LastName || '';
      const message = `*Reserva eliminada*\n` +
        `- *Usuario:* ${firstName} ${lastName}\n` +
        `- *Fecha:* ${deletedReservation.dayOfWeek}, ${deletedReservation.day}\n` +
        `- *Hora:* ${deletedReservation.hour}`;
      try {
        await bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('Error al enviar notificación de Telegram:', err.message);
      }
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
          await applyDailyFinanceFields(finance);
        }

        await finance.save();
        break;
      }
    }
    let response = {
      message: 'Proceso de eliminación completado',
      deletedReservation: deletedReservation
    };

    await removeReservationCacheEntry(reservationId);
    queueReservationCacheInvalidation(deletedReservation.userId);

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    if (error.code === 'PRICE_NOT_FOUND') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ error: 'Error al eliminar la reserva' });
  } finally {
    endProfiler(profiler);
  }
};

exports.getReservationsByWeek = async (req, res) => {
  const profiler = startProfiler('getReservationsByWeek');
  try {
    const { date } = req.query;
    // Usar la fecha dada o la actual.
    // Importante: especificar la zona horaria para coincidir con el resto del sistema
    const referenceDate = date
      ? moment.tz(date, 'YYYY-MM-DD', 'America/Bogota')
      : moment().tz('America/Bogota');

    if (!referenceDate.isValid()) {
      return res.status(400).json({ error: 'Fecha inválida. Use formato YYYY-MM-DD.' });
    }

    // Calcular inicio (Lunes) y fin (Domingo) de la semana iso
    const startOfWeek = referenceDate.clone().startOf('isoWeek').format('YYYY-MM-DD');
    const endOfWeek = referenceDate.clone().endOf('isoWeek').format('YYYY-MM-DD');

    // Buscar reservas en ese rango
    // Nota: 'day' en Reservation es un String YYYY-MM-DD
    const reservations = await Reservation.find({
      day: { $gte: startOfWeek, $lte: endOfWeek }
    })
      .select('day dayOfWeek hour TrainingType Status Attendance userId isAdmin')
      .lean();

    // Obtener detalles de usuarios (similar a fetchReservationsWithUsers pero local, sin caché global excesivo)
    // Extraemos IDs únicos
    const userIds = [...new Set(reservations.map((r) => r.userId).filter(Boolean).map((id) => id.toString()))];

    let userMap = {};
    if (userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } })
        .select('FirstName LastName Active Plan')
        .lean();

      userMap = users.reduce((acc, user) => {
        acc[user._id.toString()] = user;
        return acc;
      }, {});
    }

    // Construir respuesta con datos de usuario poblados
    const enrichedReservations = reservations.map((reservation) => {
      const userInfo = reservation.userId ? userMap[reservation.userId.toString()] : null;
      const userReservation = userInfo
        ? { ...reservation, userId: userInfo }
        : reservation;
      return buildReservationResponse(userReservation);
    });

    res.status(200).json({
      startDate: startOfWeek,
      endDate: endOfWeek,
      reservations: enrichedReservations
    });

  } catch (error) {
    console.error('Error en getReservationsByWeek:', error);
    res.status(500).json({ error: 'Error al obtener las reservas de la semana.' });
  } finally {
    endProfiler(profiler);
  }
};
