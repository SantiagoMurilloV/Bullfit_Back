const UserStore = require('../models/store');
const User = require('../models/users');
const moment = require('moment-timezone');
const { getPriceValue } = require('../services/priceService');
const { notifyUser } = require('../lib/notifyUser');

// Store items are stored as English keys; show their Spanish name in the
// notification. Same mapping the frontend uses (Statistics.jsx ITEM_LABELS).
const ITEM_LABELS_ES = {
  waters: 'Aguas',
  PreWorkouts: 'Preentrenos',
  proteins: 'Proteínas',
  guestPass: 'Invitado',
};
const itemLabelEs = (item) => ITEM_LABELS_ES[item] || item || 'tu compra';


exports.createStoreConsumption = async (req, res) => {
  const { userId, name, item, quantity, value, paymentStatus, news } = req.body;

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
    news: '',
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
    const isGuestPass = typeof item === 'string' && item.toLowerCase() === 'guestpass';

    if (isGuestPass) {
      const guestPrice = await getPriceValue({ item: 'guestPass' });
      finalValue = guestPrice * (Number(quantity) || 0);
    }

    // Read the previous status so we only notify on the No -> Si transition.
    const previous = await UserStore.findById(consumptionId).select('paymentStatus userId').lean();

    const updatedConsumption = await UserStore.findByIdAndUpdate(
      consumptionId,
      { userId, item, quantity, value: finalValue, paymentStatus, news },
      { new: true }
    );

    if (!updatedConsumption) {
      return res.status(404).json({ message: 'Consumo de tienda no encontrado' });
    }

    // Notify the user when the admin confirms the store consumption payment.
    // Skip guest passes: those belong to a guest profile, not an app user.
    const wasConfirmed = previous && previous.paymentStatus === 'Si';
    if (paymentStatus === 'Si' && !wasConfirmed && !isGuestPass && updatedConsumption.userId) {
      // Look up the user's name, then notify (fire-and-forget).
      (async () => {
        const user = await User.findById(updatedConsumption.userId).select('FirstName').lean();
        const name = (user && user.FirstName) ? user.FirstName : '';
        const greeting = name ? ` ${name}` : '';
        await notifyUser(updatedConsumption.userId, {
          title: 'Pago confirmado ✅',
          body: `¡Gracias${greeting}! 🙌 Confirmamos el pago de ${itemLabelEs(item)} en la tienda. ¡Te esperamos en Bullfit!`,
          url: '/',
          type: 'system',
        });
      })().catch((err) => console.error('[store] notifyUser failed:', err.message));
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

// Deudas de tienda agregadas sobre TODA la colección (una deuda vieja sigue
// siendo deuda, así que aquí no se filtra por mes). Agrupa por usuario y por
// producto. Consumida por Bull Admin (GET /api/storeDebts).
exports.getStoreDebts = async (req, res) => {
  try {
    const debts = await UserStore.find({ paymentStatus: { $ne: 'Si' } })
      .lean()
      .sort({ dateOfPurchase: -1, purchaseTime: -1 });

    const userIds = [...new Set(debts.map((c) => (c.userId ? c.userId.toString() : null)).filter(Boolean))];
    let userMap = {};
    if (userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } })
        .select('FirstName LastName Active')
        .lean();
      userMap = users.reduce((acc, u) => {
        acc[u._id.toString()] = u;
        return acc;
      }, {});
    }

    const porUsuarioMap = {};
    const porProductoMap = {};
    let totalPendiente = 0;

    for (const c of debts) {
      const valor = Number(c.value) || 0;
      const cantidad = Number(c.quantity) || 1;
      totalPendiente += valor;

      const uid = c.userId ? c.userId.toString() : `sin-usuario:${c.name || 'desconocido'}`;
      const user = userMap[uid];
      const nombre = user
        ? `${user.FirstName || ''} ${user.LastName || ''}`.trim()
        : (c.name || 'Usuario desconocido');

      if (!porUsuarioMap[uid]) porUsuarioMap[uid] = { _id: c.userId || null, nombre, monto: 0, items: [] };
      porUsuarioMap[uid].monto += valor;
      porUsuarioMap[uid].items.push({
        item: c.item || null,
        producto: itemLabelEs(c.item),
        cantidad,
        valor,
        fecha: c.dateOfPurchase || null,
      });

      const key = c.item || 'otro';
      if (!porProductoMap[key]) porProductoMap[key] = { item: key, producto: itemLabelEs(key), cantidad: 0, monto: 0 };
      porProductoMap[key].cantidad += cantidad;
      porProductoMap[key].monto += valor;
    }

    res.json({
      totalPendiente,
      totalItems: debts.length,
      porUsuario: Object.values(porUsuarioMap).sort((a, b) => b.monto - a.monto),
      porProducto: Object.values(porProductoMap).sort((a, b) => b.monto - a.monto),
    });
  } catch (error) {
    console.error('Error en getStoreDebts:', error);
    res.status(500).json({ error: 'Error al obtener las deudas de tienda' });
  }
};

exports.getStoreConsumptionsByMonth = async (req, res) => {
  try {
    const monthParam = req.params.month || req.query.month || '';
    const sanitizedInput = monthParam.trim().split('T')[0];

    const match = sanitizedInput.match(/^(\d{4})-(\d{1,2})/);

    if (!match) {
      return res.status(400).json({ error: 'Formato de mes inválido. Usa YYYY-MM o YYYY-MM-DD.' });
    }

    const [, year, monthPart] = match;
    const prefix = `${year}-${monthPart.padStart(2, '0')}`;

    const consumptions = await UserStore.find({
      dateOfPurchase: { $regex: `^${prefix}` }
    }).lean().sort({ dateOfPurchase: -1, purchaseTime: -1 });

    // Populate user details manually
    const userIds = [...new Set(consumptions.map(c => c.userId).filter(Boolean).map(id => id.toString()))];

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

    const enrichedConsumptions = consumptions.map(consumption => {
      const userInfo = consumption.userId ? userMap[consumption.userId.toString()] : null;
      return {
        ...consumption,
        userId: userInfo || consumption.userId // Replace ID with object if found, else keep ID
      };
    });

    res.json(enrichedConsumptions);
  } catch (error) {
    console.error('Error en getStoreConsumptionsByMonth:', error);
    res.status(500).json({ error: 'Error al obtener los consumos del mes solicitado', details: error.message });
  }
};


// Returns every store consumption for a given user.
// Mounted at GET /api/storeUser/:userId in store_routes.js. A previous
// version of this file declared `exports.getStoreConsumption` twice - one
// taking `:id` and looking up by consumptionId, the other taking `:userId`
// and listing all of a user's purchases. The second declaration silently
// overwrote the first, so the by-id variant was unreachable dead code.
// Only the active by-userId behavior is preserved here, rewritten with
// async/await + .lean() for consistency with the rest of the controller.
exports.getStoreConsumption = async (req, res) => {
  const userId = req.params.userId;

  try {
    const consumptions = await UserStore.find({ userId }).lean();
    res.status(200).json(consumptions);
  } catch (error) {
    console.error('Error fetching user consumption data:', error);
    res.status(500).json({ error: 'Error fetching user consumption data' });
  }
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
