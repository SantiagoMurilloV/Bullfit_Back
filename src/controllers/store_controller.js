const UserStore = require('../models/store');
const moment = require('moment-timezone');
const { getPriceValue } = require('../services/priceService');


exports.createStoreConsumption = async (req, res) => {
  const { userId, name, item, quantity, value, paymentStatus , news} = req.body;

  const bogotaTime = moment.tz(new Date(), 'America/Bogota');
  const formattedDate = bogotaTime.format('YYYY-MM-DD');
  const purchaseTime = bogotaTime.format('hh:mm:ss A');

  let finalValue = value;

  if (typeof item === 'string' && item.toLowerCase() === 'guestpass') {
    try {
      const guestPrice = await getPriceValue({ item: 'guestPass' });
      finalValue = guestPrice * (Number(quantity) || 0);
    } catch (error) {
      const status = error.code === 'PRICE_NOT_FOUND' ? 400 : 500;
      const message = error.code === 'PRICE_NOT_FOUND'
        ? error.message
        : 'Error al obtener el precio del guest pass';
      return res.status(status).json({ message });
    }
  }

  const newConsumption = new UserStore({
    userId,
    news:'',
    name,
    item,
    quantity,
    value: finalValue,
    paymentStatus: 'No',
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
  const { userId, item, quantity, value, paymentStatus, news } = req.body;

  try {
    let finalValue = value;

    if (typeof item === 'string' && item.toLowerCase() === 'guestpass') {
      const guestPrice = await getPriceValue({ item: 'guestPass' });
      finalValue = guestPrice * (Number(quantity) || 0);
    }

    const updatedConsumption = await UserStore.findByIdAndUpdate(
      consumptionId,
      { userId, item, quantity, value: finalValue, paymentStatus , news},
      { new: true }
    );

    if (!updatedConsumption) {
      return res.status(404).json({ message: 'Consumo de tienda no encontrado' });
    }

    res.json(updatedConsumption);
  } catch (error) {
    if (error.code === 'PRICE_NOT_FOUND') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar el consumo de tienda', error });
  }
};

exports.getAllStoreConsumptions = async (req, res) => {
  try {
    const { date } = req.query;
    const referenceDate = date
      ? moment.tz(date, ['YYYY-MM', 'YYYY-MM-DD'], 'America/Bogota', true)
      : moment().tz('America/Bogota');

    if (!referenceDate.isValid()) {
      return res.status(400).json({ error: 'Formato de fecha inválido. Usa YYYY-MM o YYYY-MM-DD.' });
    }

    const startRange = referenceDate.clone().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
    const endRange = referenceDate.clone().add(1, 'month').endOf('month').format('YYYY-MM-DD');

    const consumptions = await UserStore.find({
      dateOfPurchase: { $gte: startRange, $lte: endRange }
    }).sort({ dateOfPurchase: -1, purchaseTime: -1 });

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
        return res.status(200).json([]);
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
