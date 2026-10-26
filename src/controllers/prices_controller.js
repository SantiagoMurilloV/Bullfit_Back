const Price = require('../models/prices');
const redis = require('../lib/redisClient');

// Keys the backend looks up by name (finances, reservations, guest passes).
// They can be renamed (display `name`) and repriced, but never deleted.
const PROTECTED_ITEMS = ['Mensual', 'Diario', 'guestPass'];
const isProtectedItem = (item) =>
  PROTECTED_ITEMS.some((key) => key.toLowerCase() === String(item || '').toLowerCase());

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "Proteína Whey" -> "proteina-whey". Used as the stable `item` key for
// products created from the admin catalog modal.
const slugify = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const parsePrice = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

// priceService caches `price:<item>` in Redis for an hour; drop it so a new
// value applies immediately to guest passes and plan balances.
const invalidatePriceCache = async (item) => {
  if (!item) return;
  try {
    await redis.del(`price:${item}`);
  } catch (error) {
    console.error(`No se pudo invalidar la caché de precio (${item}):`, error.message);
  }
};

exports.createPrice = async (req, res) => {
  const { item, name, price, type } = req.body;

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const parsedPrice = parsePrice(price);
  const key = (typeof item === 'string' && item.trim()) || slugify(trimmedName);

  if (!trimmedName && !key) {
    return res.status(400).json({ message: 'El nombre del producto es obligatorio' });
  }
  if (!key) {
    return res.status(400).json({ message: 'El nombre debe contener letras o números' });
  }
  if (parsedPrice === null) {
    return res.status(400).json({ message: 'El precio debe ser un número mayor o igual a 0' });
  }

  try {
    // One key per product regardless of `type`: getPriceValue() looks items
    // up by `item` alone, so two docs sharing a key would be ambiguous.
    const existing = await Price.findOne({
      item: { $regex: new RegExp(`^${escapeRegex(key)}$`, 'i') },
    }).lean();
    if (existing) {
      return res.status(409).json({
        message: `Ya existe un producto con la clave "${existing.item}"`,
      });
    }

    const newPrice = new Price({
      item: key,
      name: trimmedName,
      price: parsedPrice,
      type: (typeof type === 'string' && type.trim()) || 'store',
    });
    const savedPrice = await newPrice.save();
    res.status(201).json(savedPrice);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Ya existe un producto con esa clave' });
    }
    res.status(500).json({ message: 'Error al crear el precio', error: error.message });
  }
};

exports.getAllPrices = async (req, res) => {
  try {
    const prices = await Price.find();
    res.json(prices);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los precios', error: error.message });
  }
};

exports.getPriceById = async (req, res) => {
  try {
    const price = await Price.findById(req.params.id);
    if (!price) {
      return res.status(404).json({ message: 'Precio no encontrado' });
    }
    res.json(price);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el precio', error: error.message });
  }
};

// Only `name` and `price` are editable. `item` is the key referenced by
// store consumptions and by getPriceValue(), so renaming it would orphan
// history and break plan/guest-pass lookups; `type` is part of the unique
// index. Both are ignored if sent.
exports.updatePrice = async (req, res) => {
  const { name, price } = req.body;
  const update = {};

  if (typeof name === 'string') {
    update.name = name.trim();
  }
  if (price !== undefined) {
    const parsedPrice = parsePrice(price);
    if (parsedPrice === null) {
      return res.status(400).json({ message: 'El precio debe ser un número mayor o igual a 0' });
    }
    update.price = parsedPrice;
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ message: 'Nada que actualizar: envía name y/o price' });
  }

  try {
    const updatedPrice = await Price.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!updatedPrice) {
      return res.status(404).json({ message: 'Precio no encontrado' });
    }

    if (update.price !== undefined) {
      await invalidatePriceCache(updatedPrice.item);
    }

    res.json(updatedPrice);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el precio', error: error.message });
  }
};

exports.deletePrice = async (req, res) => {
  try {
    const price = await Price.findById(req.params.id);
    if (!price) {
      return res.status(404).json({ message: 'Precio no encontrado' });
    }
    if (isProtectedItem(price.item)) {
      return res.status(400).json({
        message: `"${price.name || price.item}" es un ítem del sistema (planes e invitados) y no se puede eliminar`,
      });
    }

    await price.deleteOne();
    await invalidatePriceCache(price.item);
    res.status(200).json({ message: 'Precio eliminado con éxito', deletedPrice: price });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el precio', error: error.message });
  }
};
