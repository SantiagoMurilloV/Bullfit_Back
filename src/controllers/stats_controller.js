const User = require('../models/users');
const UserFinance = require('../models/finances');
const Reservation = require('../models/reservations');
const UserStore = require('../models/store');

const getStats = async (req, res) => {
  try {
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Optional query params: ?month=YYYY-MM&plan=Mensual
    const selectedMonth = req.query.month || defaultMonth;
    const planFilter = req.query.plan || null; // 'Mensual', 'Diario', or null (all)

    // Month filter for reservations (day starts with YYYY-MM)
    const monthRegex = `^${selectedMonth}`;

    // Plan match stage (used for filtered queries)
    const planMatch = planFilter ? { Plan: planFilter } : {};

    const [
      userStats,
      reservationsByHour,
      reservationsByDay,
      monthlyReservations,
      trainingTypes,
      financeRevenue,
      storeRevenueByMonth,
      storeProducts,
      registrationTrend,
      topUsers,
      avgPerHour,
      selectedMonthFinance,
      selectedMonthStore,
    ] = await Promise.all([
      // 1. User counts (optionally filtered by plan)
      User.aggregate([
        { $match: planFilter ? { Plan: planFilter } : {} },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $in: ['$Active', ['Si', 'Sí']] }, 1, 0] } },
            mensual: { $sum: { $cond: [{ $eq: ['$Plan', 'Mensual'] }, 1, 0] } },
            diario: { $sum: { $cond: [{ $eq: ['$Plan', 'Diario'] }, 1, 0] } },
          },
        },
      ]),

      // 2. Reservations by hour (filtered by selected month)
      Reservation.aggregate([
        { $match: { day: { $regex: monthRegex } } },
        { $group: { _id: '$hour', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      // 3. Reservations by day of week (filtered by selected month)
      Reservation.aggregate([
        { $match: { day: { $regex: monthRegex } } },
        { $group: { _id: '$dayOfWeek', count: { $sum: 1 } } },
      ]),

      // 4. Monthly reservation trends (last 12 months, always unfiltered)
      Reservation.aggregate([
        { $addFields: { month: { $substr: ['$day', 0, 7] } } },
        {
          $group: {
            _id: '$month',
            total: { $sum: 1 },
            attended: {
              $sum: { $cond: [{ $eq: ['$Attendance', 'Si'] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ]),

      // 5. Training types (filtered by selected month)
      Reservation.aggregate([
        { $match: { day: { $regex: monthRegex }, TrainingType: { $nin: [null, ''] } } },
        { $group: { _id: '$TrainingType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // 6. Finance revenue by month (last 12, always unfiltered for trend)
      UserFinance.aggregate([
        { $addFields: { month: { $substr: ['$startDate', 0, 7] } } },
        {
          $group: {
            _id: { month: '$month', plan: '$Plan' },
            revenue: { $sum: '$pendingBalance' },
            count: { $sum: 1 },
            paid: {
              $sum: {
                $cond: [{ $eq: ['$reservationPaymentStatus', 'Si'] }, 1, 0],
              },
            },
          },
        },
        { $sort: { '_id.month': -1 } },
        { $limit: 24 },
      ]),

      // 7. Store revenue by month (last 12, always unfiltered for trend)
      UserStore.aggregate([
        { $addFields: { month: { $substr: ['$dateOfPurchase', 0, 7] } } },
        {
          $group: {
            _id: '$month',
            revenue: { $sum: '$value' },
            count: { $sum: '$quantity' },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ]),

      // 8. Store products (filtered by selected month)
      UserStore.aggregate([
        { $match: { dateOfPurchase: { $regex: monthRegex } } },
        {
          $group: {
            _id: '$item',
            count: { $sum: '$quantity' },
            revenue: { $sum: '$value' },
          },
        },
        { $sort: { revenue: -1 } },
      ]),

      // 9. Registration trend (last 12, always unfiltered)
      User.aggregate([
        { $match: { registrationDate: { $nin: [null, ''] } } },
        { $addFields: { month: { $substr: ['$registrationDate', 0, 7] } } },
        { $group: { _id: '$month', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ]),

      // 10. Top 10 users for selected month
      Reservation.aggregate([
        { $match: { day: { $regex: monthRegex } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $project: {
            count: 1,
            name: { $concat: ['$user.FirstName', ' ', '$user.LastName'] },
            plan: '$user.Plan',
          },
        },
      ]),

      // 11. Average per hour for selected month
      Reservation.aggregate([
        { $match: { day: { $regex: monthRegex } } },
        {
          $group: {
            _id: { day: '$day', hour: '$hour' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.hour',
            avg: { $avg: '$count' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 12. Selected month finance summary
      UserFinance.aggregate([
        {
          $match: {
            startDate: { $regex: monthRegex },
            ...planMatch,
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$pendingBalance' },
            count: { $sum: 1 },
            paid: {
              $sum: { $cond: [{ $eq: ['$reservationPaymentStatus', 'Si'] }, 1, 0] },
            },
            unpaid: {
              $sum: { $cond: [{ $eq: ['$reservationPaymentStatus', 'No'] }, 1, 0] },
            },
          },
        },
      ]),

      // 13. Selected month store summary
      UserStore.aggregate([
        { $match: { dateOfPurchase: { $regex: monthRegex } } },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$value' },
            count: { $sum: '$quantity' },
          },
        },
      ]),
    ]);

    // Normalize day-of-week. The `dayOfWeek` field in the DB is a mess of
    // English/Spanish, accented/unaccented values ("Wednesday", "Miércoles",
    // "Miercoles"). We canonicalize by stripping accents + lowercasing so all
    // variants collapse onto a single bucket. Without this, ~3800 "Miércoles"
    // reservations fell through and Wednesday looked nearly empty.
    const dayOrder = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const dayCanonical = {
      monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miercoles',
      thursday: 'Jueves', friday: 'Viernes', saturday: 'Sabado', sunday: 'Domingo',
      lunes: 'Lunes', martes: 'Martes', miercoles: 'Miercoles',
      jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sabado', domingo: 'Domingo',
    };
    const dayMap = {};
    reservationsByDay.forEach((d) => {
      const raw = (d._id || '').toString().trim();
      const norm = stripAccents(raw).toLowerCase();
      const key = dayCanonical[norm] || raw;
      dayMap[key] = (dayMap[key] || 0) + d.count;
    });

    // Merge finance + store revenue for trend chart
    const revenueMap = {};
    financeRevenue.forEach((r) => {
      const m = r._id.month;
      if (!revenueMap[m]) revenueMap[m] = { mensual: 0, diario: 0, store: 0, total: 0 };
      if (r._id.plan === 'Mensual') revenueMap[m].mensual += r.revenue;
      else revenueMap[m].diario += r.revenue;
      revenueMap[m].total += r.revenue;
    });
    storeRevenueByMonth.forEach((r) => {
      if (!revenueMap[r._id]) revenueMap[r._id] = { mensual: 0, diario: 0, store: 0, total: 0 };
      revenueMap[r._id].store += r.revenue;
      revenueMap[r._id].total += r.revenue;
    });

    const revenueByMonth = Object.entries(revenueMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, data]) => ({ month, ...data }));

    // Average per hour map
    const avgMap = {};
    avgPerHour.forEach((h) => {
      avgMap[h._id] = Math.round(h.avg * 10) / 10;
    });

    // Selected month KPIs
    const smRes = monthlyReservations.find((m) => m._id === selectedMonth);
    const smFinance = selectedMonthFinance[0] || { revenue: 0 };
    const smStore = selectedMonthStore[0] || { revenue: 0 };
    const totalRevenue = (smFinance.revenue || 0) + (smStore.revenue || 0);

    res.json({
      selectedMonth,
      planFilter: planFilter || 'Todos',
      users: userStats[0] || { total: 0, active: 0, mensual: 0, diario: 0 },
      currentMonth: {
        reservations: smRes?.total || 0,
        attended: smRes?.attended || 0,
        attendanceRate: smRes?.total
          ? Math.round((smRes.attended / smRes.total) * 100)
          : 0,
        revenue: totalRevenue,
        financeRevenue: smFinance.revenue || 0,
        storeRevenue: smStore.revenue || 0,
        paid: smFinance.paid || 0,
        unpaid: smFinance.unpaid || 0,
      },
      reservationsByHour: reservationsByHour.map((r) => ({
        hour: r._id,
        count: r.count,
        avg: avgMap[r._id] || 0,
      })),
      reservationsByDay: dayOrder.map((day) => ({ day, count: dayMap[day] || 0 })),
      monthlyReservations: [...monthlyReservations].reverse(),
      trainingTypes: trainingTypes.map((t) => ({ type: t._id, count: t.count })),
      revenueByMonth,
      storeProducts: storeProducts.map((p) => ({
        item: p._id,
        count: p.count,
        revenue: p.revenue,
      })),
      registrationTrend: [...registrationTrend].reverse(),
      topUsers: topUsers.map((u) => ({ name: u.name, count: u.count, plan: u.plan })),
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Error al obtener estadisticas' });
  }
};

module.exports = { getStats };
