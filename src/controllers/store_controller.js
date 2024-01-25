const UserStore = require('../models/store');


exports.createStoreConsumption = async (req, res) => {

  const { name, item, quantity, value, paymentStatus } = req.body;
  const userId = name.value;
  const userName = name.label; 

  const currentDate = new Date();
  const formattedDate = currentDate.getFullYear() + '-' +
    String(currentDate.getMonth() + 1).padStart(2, '0') + '-' +
    String(currentDate.getDate()).padStart(2, '0');

    const options = {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    const purchaseTime = currentDate.toLocaleTimeString('en-US', options);
  


  const newConsumption = new UserStore({
    userId, 
    name: userName, 
    item,
    quantity,
    value,
    paymentStatus:'No',
    dateOfPurchase: formattedDate, 
    purchaseTime
  });

  try {
    const savedConsumption = await newConsumption.save();
    res.status(201).json(savedConsumption);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el consumo de tienda', details: error.message });
  }
};


exports.updateStoreConsumption = async (req, res) => {
  const consumptionId = req.params.id;
  const { userId, item, quantity, value, paymentStatus } = req.body;

  try {
    const updatedConsumption = await UserStore.findByIdAndUpdate(
      consumptionId,
      { userId, item, quantity, value, paymentStatus },
      { new: true }
      );

    if (!updatedConsumption) {
      return res.status(404).json({ message: 'Consumo de tienda no encontrado' });
    }

    res.json(updatedConsumption);
    } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el consumo de tienda', error });
    }
};

exports.getAllStoreConsumptions = async (req, res) => {
  try {
    const consumptions = await UserStore.find();
    res.json(consumptions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los consumos de tienda' });
  }
};


exports.getStoreConsumption = async (req, res) => {
  const consumptionId = req.params.id;

  try {
    const consumption = await UserStore.findById(consumptionId);
    if (!consumption) {
      return res.status(404).json({ message: 'Consumo de tienda no encontrado' });
    }
    res.json(consumption);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el consumo de tienda' });
  }
};

exports.getStoreConsumption = (req, res) => {
  const userId = req.params.userId;

  UserStore.find({ userId: userId })
    .then((consumptions) => {
      if (consumptions.length === 0) {
        return res.status(404).json({ message: 'No consumption data found for the specified user' });
      }
      res.json(consumptions);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error fetching user consumption data' });
    });
};


exports.deleteStoreConsumption = async (req, res) => {
  const consumptionId = req.params.id;

  try {
    const deletedConsumption = await UserStore.findByIdAndDelete(consumptionId);
    if (!deletedConsumption) {
      return res.status(404).json({ message: 'Consumode tienda no encontrado' });
    }


    res.status(200).json({ message: 'Consumo de tienda eliminado con éxito', deletedConsumption });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el consumo de tienda' });
  }
};

