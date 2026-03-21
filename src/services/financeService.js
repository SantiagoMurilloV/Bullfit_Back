const { getPriceValue } = require('./priceService');

const normalizeNonNegativeInteger = (value) => {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isNaN(parsedValue) ? 0 : Math.max(parsedValue, 0);
};

const recomputeDailyFinanceFields = async (financeLike) => {
  const reservationCount = normalizeNonNegativeInteger(financeLike.reservationCount);
  // No se limita a reservationCount: el cliente puede pagar sesiones por adelantado
  const numberPaidReservations = normalizeNonNegativeInteger(financeLike.numberPaidReservations);

  // Usa el precio guardado en el registro histórico si existe.
  // Solo consulta el precio actual cuando es un registro nuevo (sin pricePerReservation).
  // Esto protege el historial financiero ante cambios de precio futuros.
  const storedPrice = normalizeNonNegativeInteger(financeLike.pricePerReservation);
  const dailyPrice = storedPrice > 0
    ? storedPrice
    : await getPriceValue({ item: 'Diario' });

  const pendingBalance = reservationCount * dailyPrice;
  // Puede ser negativo: significa que el cliente tiene saldo a favor (pagó por adelantado)
  const pendingPayment = pendingBalance - (numberPaidReservations * dailyPrice);

  return {
    reservationCount,
    numberPaidReservations,
    pendingBalance,
    pendingPayment,
    pricePerReservation: dailyPrice,
    reservationPaymentStatus: pendingPayment > 0 ? 'No' : financeLike.reservationPaymentStatus,
    paymentDate: pendingPayment > 0 ? '' : (financeLike.paymentDate || ''),
    paymentTime: pendingPayment > 0 ? '' : (financeLike.paymentTime || ''),
  };
};

const applyDailyFinanceFields = async (financeDoc) => {
  const recalculatedFields = await recomputeDailyFinanceFields(financeDoc);
  Object.assign(financeDoc, recalculatedFields);
  return financeDoc;
};

module.exports = {
  normalizeNonNegativeInteger,
  recomputeDailyFinanceFields,
  applyDailyFinanceFields,
};
