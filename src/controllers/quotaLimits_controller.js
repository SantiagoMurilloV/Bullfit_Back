
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

const startProfiler = (label) => {
  const profilerLabel = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  console.time(profilerLabel);
  return profilerLabel;
};
const endProfiler = (label) => {
  if (label) {
    console.timeEnd(label);
  }
};

exports.getSlots = async (req, res) => {
  const profiler = startProfiler('getSlots');
  try {
    const slots = await Slot.find().select('day hour slots').lean();
    res.json(slots);
  } catch (error) {
    res.status(500).send('Error retrieving slots');
  } finally {
    endProfiler(profiler);
  }
};
