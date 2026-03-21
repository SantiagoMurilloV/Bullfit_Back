const moment = require('moment');
const UserFinance = require('../models/finances');
const { getPriceValue } = require('../services/priceService');
const { recomputeDailyFinanceFields } = require('../services/financeService');

const syncDailyFinanceRecord = async (finance) => {
  if ((finance.Plan || '').toLowerCase() !== 'diario') {
    return finance;
  }

  const recalculatedDailyFinance = await recomputeDailyFinanceFields(finance);
  const isOutdatedDailyFinance =
    finance.reservationCount !== recalculatedDailyFinance.reservationCount ||
    finance.numberPaidReservations !== recalculatedDailyFinance.numberPaidReservations ||
    finance.pendingBalance !== recalculatedDailyFinance.pendingBalance ||
    finance.pendingPayment !== recalculatedDailyFinance.pendingPayment ||
    finance.reservationPaymentStatus !== recalculatedDailyFinance.reservationPaymentStatus ||
    (finance.paymentDate || '') !== recalculatedDailyFinance.paymentDate ||
    (finance.paymentTime || '') !== recalculatedDailyFinance.paymentTime;

  if (!isOutdatedDailyFinance) {
    return finance;
  }

  Object.assign(finance, recalculatedDailyFinance);
  await finance.save();
  return finance;
};


exports.financesUser = async (req, res) => {

  const { userId, Active, Plan, FirstName, LastName, Phone, IdentificationNumber, startDate } = req.body;
  let { endDate } = req.body;

  if (!endDate) {
    endDate = '';
  }

  let pendingBalance = 0;
  let pricePerReservation = 0;

  try {
    if (Plan === 'Mensual') {
      pendingBalance = await getPriceValue({ item: 'Mensual' });
    } else if (Plan === 'Diario') {
      pendingBalance = 0;
      pricePerReservation = await getPriceValue({ item: 'Diario' });
    }
  } catch (error) {
    if (error.code === 'PRICE_NOT_FOUND') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ error: 'Error al obtener el precio del plan', details: error.message });
  }

  const newUserFinance = new UserFinance({
    userId,
    Active,
    FirstName,
    LastName,
    IdentificationNumber,
    Phone,
    Plan,
    startDate,
    endDate,
    reservationCount: 0,
    totalAmount: 0,
    pendingBalance,
    pendingPayment: 0,
    totalConsumption: 0,
    numberPaidReservations: 0,
    pricePerReservation,
    paymentDate: '',
    paymentTime: '',
    reservationPaymentStatus: 'No',
    news: ''
  });

  try {
    const savedFinance = await newUserFinance.save();
    res.status(201).json(savedFinance);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el usuario', details: error.message });
  }
};

exports.updateDailyPlanStartDate = async () => {
  const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
  const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');

  try {
    const financesToUpdate = await UserFinance.find({
      Plan: 'Diario',
      startDate: {
        $gte: startOfMonth,
        $lte: endOfMonth
      }
    });
    const newDailyPrice = await getPriceValue({ item: 'Diario' });

    const promises = financesToUpdate.map(finance => {
      const newFinanceEntry = new UserFinance({
        ...finance.toObject(),
        _id: undefined,
        startDate: moment().add(1, 'months').startOf('month').format('YYYY-MM-DD'),
        endDate: '',
        reservationCount: 0,
        totalAmount: 0,
        pendingBalance: 0,
        pendingPayment: 0,
        totalConsumption: 0,
        numberPaidReservations: 0,
        pricePerReservation: newDailyPrice,
        paymentDate: '',
        paymentTime: '',
        reservationPaymentStatus: 'No',
        news: ''
      });

      return newFinanceEntry.save();
    });

    await Promise.all(promises);

    console.log('Finanzas de Plan Diario actualizadas para el nuevo mes.');
  } catch (error) {
    console.error('Error al actualizar las finanzas de Plan Diario:', error);
  }
};



exports.updateFinanceByUserId = async (req, res) => {
  const userId = req.params.userId;
  const updateData = req.body;

  try {
    const updatedFinance = await UserFinance.findOneAndUpdate(
      { userId: userId },
      { $set: updateData },
      { new: true }
    );

    if (!updatedFinance) {
      return res.status(404).json({ message: 'Finanzas ---del usuario no encontradas' });
    }

    res.json(updatedFinance);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar las finanzas del usuario', error });
  }
};


exports.updateFinanceById = async (req, res) => {
  const financeId = req.params.financeId;
  const updateData = { ...req.body };

  try {
    const currentFinance = await UserFinance.findById(financeId);

    if (!currentFinance) {
      return res.status(404).json({ message: 'Finanzas del usuario no encontradas' });
    }

    const mergedFinance = { ...currentFinance.toObject(), ...updateData };
    let normalizedUpdateData = { ...updateData };

    if ((mergedFinance.Plan || '').toLowerCase() === 'diario') {
      normalizedUpdateData = {
        ...normalizedUpdateData,
        ...(await recomputeDailyFinanceFields(mergedFinance)),
      };
    }

    if (normalizedUpdateData.reservationPaymentStatus === 'Si' && (normalizedUpdateData.pendingPayment ?? 0) <= 0) {
      const now = new Date();
      normalizedUpdateData.paymentDate = now.toLocaleDateString('es-CO');
      normalizedUpdateData.paymentTime = now.toLocaleTimeString('es-CO');
    } else if (normalizedUpdateData.reservationPaymentStatus === 'No') {
      normalizedUpdateData.paymentDate = '';
      normalizedUpdateData.paymentTime = '';
    }

    const updatedFinance = await UserFinance.findByIdAndUpdate(
      financeId,
      { $set: normalizedUpdateData },
      { new: true }
    );

    res.json(updatedFinance);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar las finanzas del usuario', error });
  }
};

exports.getAllUsersFinances = async (req, res) => {
  try {
    const { date } = req.query;
    const referenceDate = date
      ? moment(date, ['YYYY-MM', 'YYYY-MM-DD'], true)
      : moment();

    if (!referenceDate.isValid()) {
      return res.status(400).json({ error: 'Formato de fecha inválido. Usa YYYY-MM o YYYY-MM-DD.' });
    }

    const startRange = referenceDate.clone().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
    const endRange = referenceDate.clone().add(1, 'month').endOf('month').format('YYYY-MM-DD');

    const users = await UserFinance.find({
      startDate: { $gte: startRange, $lte: endRange }
    }).sort({ startDate: -1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener la información de los usuarios' });
  }
};

exports.getEveryFinance = async (req, res) => {
  try {
    const finances = await UserFinance.find().sort({ startDate: -1 });
    res.json(finances);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener todas las finanzas' });
  }
};

exports.getFinancesByMonth = async (req, res) => {
  try {
    const rawMonth = req.params.month || req.query.month || '';
    const sanitizedInput = rawMonth.trim().split('T')[0];

    const match = sanitizedInput.match(/^(\d{4})-(\d{1,2})/);

    if (!match) {
      return res.status(400).json({ error: 'Formato de mes inválido. Usa YYYY-MM o YYYY-MM-DD.' });
    }

    const [, year, monthPart] = match;
    const prefix = `${year}-${monthPart.padStart(2, '0')}`;

    const finances = await UserFinance.find({
      startDate: { $regex: `^${prefix}` }
    }).sort({ startDate: -1 });

    const syncedFinances = await Promise.all(finances.map(syncDailyFinanceRecord));

    res.json(syncedFinances);
  } catch (error) {
    console.error('Error en getFinancesByMonth:', error);
    res.status(500).json({ error: 'Error al obtener las finanzas del mes solicitado', details: error.message });
  }
};
exports.getAllDiaryUsersFinances = (req, res) => {

  UserFinance.find({ Plan: 'Diario' })  
    .then((diaryUsersFinances) => {
      res.json(diaryUsersFinances);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al obtener la información de finanzas de los usuarios diarios' });
    });
};



exports.getUserFinance = (req, res) => {
  const userId = req.params.userId;

  UserFinance.find({ userId: userId })
    .then(async (userFinance) => {
      if (!userFinance) {
        return res.status(404).json({ message: 'Datos financieros no encontrados para el usuario especificado' });
      }
      const syncedFinances = await Promise.all(userFinance.map(syncDailyFinanceRecord));
      res.json(syncedFinances);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al obtener la información financiera del usuario' });
    });
};

exports.deleteUsers = (req, res) => {
  const userId = req.params.userId;
  UserFinance.findOneAndDelete({ userId: userId })
    .then((deletedUser) => {
      if (!deletedUser) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      res.status(200).json({ message: 'Usuario eliminado con éxito', deletedUser });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ error: 'Error al eliminar usuario' });
    });
};

exports.deleteFiance = (req, res) => {
  const financeId = req.params.financeId;
  UserFinance.findOneAndDelete({ _id: financeId })
    .then((deletedUser) => {
      if (!deletedUser) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      res.status(200).json({ message: 'Usuario eliminado con éxito', deletedUser });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ error: 'Error al eliminar usuario' });
    });
};
