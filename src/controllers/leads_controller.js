// src/controllers/leads_controller.js
// CRUD for landing-page leads ("personas interesadas").
//   - createLead   : PUBLIC. Called by the bullfit.co landing form.
//   - listLeads    : admin. Newest first, optional ?status filter.
//   - updateLead   : admin. Change workflow status.
//   - deleteLead   : admin. Remove a lead.
//
// On a new lead we notify every admin through two channels (best-effort, never
// blocking the public response): the in-app inbox (UserNotification) and a
// web-push to their subscribed devices.

const mongoose = require('mongoose');
const Lead = require('../models/lead');
const User = require('../models/users');
const UserNotification = require('../models/userNotification');
const PushSubscription = require('../models/pushSubscription');
const { sendPush, isConfigured } = require('../lib/webPush');

const STATUSES = ['nuevo', 'contactado', 'descartado'];

// Fire-and-forget: notify all admins about a new lead.
async function notifyAdmins(lead) {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  if (!admins.length) return;
  const adminIds = admins.map((a) => a._id);

  const fullName = `${lead.nombre} ${lead.apellido}`.trim();
  const title = '📩 Nuevo interesado';
  const body = `${fullName} · ${lead.interes || 'sin interés especificado'} — enviado desde la web`;
  const url = '/';

  // 1) In-app inbox for each admin.
  await UserNotification.insertMany(
    adminIds.map((id) => ({ userId: id, title, body, type: 'system', url })),
  );

  // 2) Best-effort web push to admin devices.
  if (isConfigured()) {
    const subs = await PushSubscription.find({ userId: { $in: adminIds } }).lean();
    if (subs.length) {
      const payload = { title, body, url };
      const results = await Promise.all(subs.map((s) => sendPush(s, payload)));
      const goneIds = subs.filter((_, i) => results[i] && results[i].gone).map((s) => s._id);
      if (goneIds.length) await PushSubscription.deleteMany({ _id: { $in: goneIds } });
    }
  }
}

exports.createLead = async (req, res) => {
  const b = req.body || {};
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const nombre = str(b.nombre, 120);
  const apellido = str(b.apellido, 120);
  const whatsapp = str(b.whatsapp, 40);
  const interes = str(b.interes, 120);
  const mensaje = str(b.mensaje, 1000);
  const fuente = str(b.fuente, 60) || 'landing-bullfit';

  if (!nombre || !whatsapp) {
    return res.status(400).json({ message: 'nombre y whatsapp son requeridos' });
  }

  const parsedFecha = b.fecha ? new Date(b.fecha) : null;
  const fecha = parsedFecha && !Number.isNaN(parsedFecha.getTime()) ? parsedFecha : new Date();

  try {
    const lead = await Lead.create({ nombre, apellido, whatsapp, interes, mensaje, fuente, fecha });
    // Never block the public response on notification delivery.
    notifyAdmins(lead).catch((e) => console.error('[leads] notify admins error:', e));
    return res.status(201).json({ ok: true, id: lead._id });
  } catch (err) {
    console.error('[leads] create error:', err);
    return res.status(500).json({ message: 'Error guardando el interesado' });
  }
};

exports.listLeads = async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status && STATUSES.includes(status)) filter.status = status;
  try {
    const [leads, newCount] = await Promise.all([
      Lead.find(filter).sort({ createdAt: -1 }).limit(500).lean(),
      Lead.countDocuments({ status: 'nuevo' }),
    ]);
    return res.json({ leads, newCount });
  } catch (err) {
    console.error('[leads] list error:', err);
    return res.status(500).json({ message: 'Error cargando los interesados' });
  }
};

exports.updateLead = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'id inválido' });
  }
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ message: 'status inválido' });
  }
  try {
    const lead = await Lead.findByIdAndUpdate(id, { status }, { new: true }).lean();
    if (!lead) return res.status(404).json({ message: 'Interesado no encontrado' });
    return res.json({ lead });
  } catch (err) {
    console.error('[leads] update error:', err);
    return res.status(500).json({ message: 'Error actualizando el interesado' });
  }
};

exports.deleteLead = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'id inválido' });
  }
  try {
    const deleted = await Lead.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Interesado no encontrado' });
    return res.status(204).end();
  } catch (err) {
    console.error('[leads] delete error:', err);
    return res.status(500).json({ message: 'Error eliminando el interesado' });
  }
};
