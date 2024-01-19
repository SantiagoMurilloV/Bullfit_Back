
const Slot = require('../models/quotaLimits');

exports.createSlot = async (req, res) => {
  try {
    const { day, hour, slots } = req.body;
    let slot = new Slot({ day, hour,  slots: slots || 0 });
    await slot.save();
    res.status(201).json(slot);
  } catch (error) {
    res.status(500).send('Error creating the slot');
  }
};

exports.updateSlot = async (req, res) => {
  try {
    const { day, hour } = req.params;
    const { slots } = req.body;

    let slot = await Slot.findOneAndUpdate({ day, hour }, { slots }, { new: true });
    if (!slot) {
      return res.status(404).send('Slot not found');
    }
    res.json(slot);
  } catch (error) {
    res.status(500).send('Error updating the slot');
  }
};

exports.getSlots = async (req, res) => {
  try {
    const slots = await Slot.find();
    res.json(slots);
  } catch (error) {
    res.status(500).send('Error retrieving slots');
  }
};