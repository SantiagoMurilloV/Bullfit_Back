const UserFinance = require('../models/finances');


exports.financesUser = async (req, res) => {

  const { userId, Active, Plan, FirstName, LastName, Phone, IdentificationNumber, startDate } = req.body;
  let { endDate } = req.body;

  if (!endDate) {
    endDate = '';
  }

  let pendingBalance = 0;
  if (Plan === 'Mensual') {
    pendingBalance = 125000;
  } else if (Plan === 'Diario') {
    pendingBalance = 0;
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
    paymentDate: '',
    paymentTime: '',
    reservationPaymentStatus: 'No',
    news: ''
  });

  newUserFinance.save()
    .then((UserFinance) => {
      res.status(201).json(UserFinance);
    })
    .catch((error) => {

      res.status(500).json({ error: 'Error al crear el usuario', details: error.message });
    });
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
    const promises = financesToUpdate.map(finance => {
      const newFinanceEntry = new UserFinance({
        ...finance.toObject(),
        _id: undefined, // Asegúrate de quitar el ID para crear un nuevo documento.
        startDate: moment().add(1, 'months').startOf('month').format('YYYY-MM-DD'),
        endDate: '',
        reservationCount: 0,
        totalAmount: 0,
        pendingBalance: 0,
        pendingPayment: 0,
        totalConsumption: 0,
        numberPaidReservations: 0,
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
  const updateData = req.body;

  if (updateData.reservationPaymentStatus === 'Si') {
    const now = new Date();
    updateData.paymentDate = now.toLocaleDateString('es-CO');
    updateData.paymentTime = now.toLocaleTimeString('es-CO');
  }

  try {
    const updatedFinance = await UserFinance.findByIdAndUpdate(
      financeId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedFinance) {
      return res.status(404).json({ message: 'Finanzas del usuario no encontradas' });
    }

    res.json(updatedFinance);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar las finanzas del usuario', error });
  }
};

exports.getAllUsersFinances = (req, res) => {
  UserFinance.find()
    .then((users) => {
      res.json(users);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al obtener la información de los usuarios' });
    });
};


exports.getUserFinance = (req, res) => {
  const userId = req.params.userId;

  UserFinance.find({ userId: userId })
    .then((userFinance) => {
      if (!userFinance) {
        return res.status(404).json({ message: 'Datos financieros no encontrados para el usuario especificado' });
      }
      res.json(userFinance);
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



