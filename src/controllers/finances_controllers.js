const User = require('../models/users'); 
const Reservation = require('../models/reservations'); 
const Finance = require('../models/finances'); 

exports.getFinances = async (req, res) => {
  try {
    const finances = await Finance.find();
    res.json(finances);
  } catch (error) {
    res.status(500).send(error.message);
  }
};


exports.calculateAndStoreFinances = async (req, res) => {
  try {
    const users = await User.find();

    for (const user of users) {

      const reservationCount = await Reservation.countDocuments({ userId: user._id });


      let totalAccountReservations;
      if (user.Plan === 'Mensual') {
        totalAccountReservations = 120000;
      } else {
        totalAccountReservations = reservationCount * 10000; 
      }

      const totalOtherConsumptions = user.otherConsumptionsAmounts.reduce((acc, curr) => acc + curr, 0);

      await Finance.findOneAndUpdate(
        { userId: user._id },
        {
          userName: `${user.FirstName} ${user.LastName}`,
          plan: user.Plan,
          startDate: user.startDate,
          endDate: user.endDate,
          reservationCount,
          totalAccountReservations,
          totalOtherConsumptions
        },
        { upsert: true, new: true }
      );
    }

    res.json({ message: "Finanzas calculadas y almacenadas correctamente" });
  } catch (error) {
    res.status(500).send(error.message);
  }
};


