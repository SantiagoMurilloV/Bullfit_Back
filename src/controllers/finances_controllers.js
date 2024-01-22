const UserFinance = require('../models/finances'); 


exports.financesUser = async (req, res) => {
  
  const { userId, Active, Plan, FirstName, LastName, Phone, IdentificationNumber, startDate } = req.body;
  let { endDate } = req.body;

  if (!endDate) {
    endDate = '';
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
    pendingBalance: 0,
    totalConsumption: 0,
    reservationPaymentStatus: 'No',
    news:''
  });

  newUserFinance.save()
    .then((UserFinance) => {
      res.status(201).json(UserFinance);
    })
    .catch((error) => {

      res.status(500).json({ error: 'Error al crear el usuario', details: error.message });
    });
};


exports.updateUserFinance = async (req, res) => {
  const id = req.params.userId;
  const updateData = req.body;

  try {
    let updatedFinance;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      updatedFinance = await UserFinance.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      );
    } else {

      updatedFinance = await UserFinance.findOneAndUpdate(
        { userId: id },
        { $set: updateData },
        { new: true }
      );
    }

    if (!updatedFinance) {
      return res.status(404).json({ message: 'Finanzas del usuario no encontradas' });
    }

    res.json(updatedFinance);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar las finanzas del usuario', error });
  }
};


exports.getAllUsersFinances = (req, res) => {
  UserFinance .find()
    .then((users) => {
      res.json(users);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al obtener la información de los usuarios' });
    });
};


exports.getUserFinance = (req, res) => {
  const userId = req.params.userId;

  UserFinance.findOne({ userId: userId })
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



