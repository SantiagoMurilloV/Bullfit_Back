const { recomputeDailyFinanceFields, normalizeNonNegativeInteger } = require('../financeService');

// Mock del servicio de precios
jest.mock('../priceService', () => ({
  getPriceValue: jest.fn(),
}));

const { getPriceValue } = require('../priceService');

describe('normalizeNonNegativeInteger', () => {
  test('devuelve el entero positivo correctamente', () => {
    expect(normalizeNonNegativeInteger(4)).toBe(4);
  });

  test('devuelve 0 para valores negativos', () => {
    expect(normalizeNonNegativeInteger(-5)).toBe(0);
  });

  test('devuelve 0 para NaN', () => {
    expect(normalizeNonNegativeInteger('abc')).toBe(0);
  });

  test('parsea strings numéricos', () => {
    expect(normalizeNonNegativeInteger('3')).toBe(3);
  });

  test('devuelve 0 para undefined', () => {
    expect(normalizeNonNegativeInteger(undefined)).toBe(0);
  });
});

describe('recomputeDailyFinanceFields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('caso normal: 4 reservas, 4 pagadas → pendingPayment = 0', async () => {
    getPriceValue.mockResolvedValue(9000);

    const result = await recomputeDailyFinanceFields({
      reservationCount: 4,
      numberPaidReservations: 4,
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    });

    expect(result.pendingBalance).toBe(36000);      // 4 × 9.000
    expect(result.pendingPayment).toBe(0);           // completamente pagado
    expect(result.reservationCount).toBe(4);
    expect(result.numberPaidReservations).toBe(4);
  });

  test('caso parcial: 4 reservas, 2 pagadas → pendingPayment = 18.000', async () => {
    getPriceValue.mockResolvedValue(9000);

    const result = await recomputeDailyFinanceFields({
      reservationCount: 4,
      numberPaidReservations: 2,
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    });

    expect(result.pendingBalance).toBe(36000);
    expect(result.pendingPayment).toBe(18000);       // 2 reservas sin pagar × 9.000
  });

  test('cliente paga más sesiones de las reservadas → saldo a favor (negativo)', async () => {
    getPriceValue.mockResolvedValue(9000);

    // Cliente paga 6 pero solo ha reservado 4 → tiene 2 sesiones a favor
    const result = await recomputeDailyFinanceFields({
      reservationCount: 4,
      numberPaidReservations: 6,
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    });

    // pendingPayment negativo indica saldo a favor: 36.000 - (6 × 9.000) = -18.000
    expect(result.pendingPayment).toBe(-18000);
    expect(result.numberPaidReservations).toBe(6);
    expect(result.pendingBalance).toBe(36000); // consumo total no cambia
  });

  test('saldo a favor → reservationPaymentStatus permanece como estaba (no hay deuda)', async () => {
    getPriceValue.mockResolvedValue(9000);

    const result = await recomputeDailyFinanceFields({
      reservationCount: 2,
      numberPaidReservations: 5,
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    });

    // pendingPayment < 0 no es deuda → status no se fuerza a 'No'
    expect(result.pendingPayment).toBeLessThan(0);
    expect(result.reservationPaymentStatus).toBe('No'); // conserva el valor guardado
  });

  test('con 0 reservas todo queda en 0', async () => {
    getPriceValue.mockResolvedValue(9000);

    const result = await recomputeDailyFinanceFields({
      reservationCount: 0,
      numberPaidReservations: 0,
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    });

    expect(result.pendingBalance).toBe(0);
    expect(result.pendingPayment).toBe(0);
  });

  test('reservationPaymentStatus permanece como Si cuando pendingPayment = 0 y ya era Si', async () => {
    getPriceValue.mockResolvedValue(9000);

    const result = await recomputeDailyFinanceFields({
      reservationCount: 4,
      numberPaidReservations: 4,
      reservationPaymentStatus: 'Si',
      paymentDate: '20/03/2026',
      paymentTime: '10:00:00',
    });

    expect(result.pendingPayment).toBe(0);
    expect(result.reservationPaymentStatus).toBe('Si');
  });

  test('reservationPaymentStatus se fuerza a No cuando pendingPayment > 0', async () => {
    getPriceValue.mockResolvedValue(9000);

    const result = await recomputeDailyFinanceFields({
      reservationCount: 4,
      numberPaidReservations: 0,
      reservationPaymentStatus: 'Si', // incorrecto, debe corregirse
      paymentDate: '20/03/2026',
      paymentTime: '10:00:00',
    });

    expect(result.pendingPayment).toBe(36000);
    expect(result.reservationPaymentStatus).toBe('No'); // corregido
    expect(result.paymentDate).toBe('');
    expect(result.paymentTime).toBe('');
  });

  test('calcula correctamente con precio de 12.000', async () => {
    getPriceValue.mockResolvedValue(12000);

    const result = await recomputeDailyFinanceFields({
      reservationCount: 3,
      numberPaidReservations: 1,
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    });

    expect(result.pendingBalance).toBe(36000);       // 3 × 12.000
    expect(result.pendingPayment).toBe(24000);       // 2 × 12.000
  });

  test('valores string en reservationCount se normalizan', async () => {
    getPriceValue.mockResolvedValue(9000);

    const result = await recomputeDailyFinanceFields({
      reservationCount: '4',
      numberPaidReservations: '4',
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    });

    expect(result.reservationCount).toBe(4);
    expect(result.numberPaidReservations).toBe(4);
    expect(result.pendingPayment).toBe(0);
  });

  test('valores undefined/null se tratan como 0', async () => {
    getPriceValue.mockResolvedValue(9000);

    const result = await recomputeDailyFinanceFields({
      reservationCount: undefined,
      numberPaidReservations: null,
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    });

    expect(result.reservationCount).toBe(0);
    expect(result.numberPaidReservations).toBe(0);
    expect(result.pendingBalance).toBe(0);
    expect(result.pendingPayment).toBe(0);
  });
});

// -------------------------------------------------------------------
// pricePerReservation — protección del historial financiero
// El precio se guarda en el registro y NO cambia aunque el admin
// modifique el catálogo de precios en el futuro.
// -------------------------------------------------------------------
describe('pricePerReservation: protección del historial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('usa pricePerReservation guardado en el registro, sin consultar el precio actual', async () => {
    getPriceValue.mockResolvedValue(12000); // precio actual en MongoDB (cambiado por admin)

    const registroHistorico = {
      reservationCount: 4,
      numberPaidReservations: 4,
      pricePerReservation: 9000, // precio que estaba vigente cuando se creó el registro
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    };

    const result = await recomputeDailyFinanceFields(registroHistorico);

    // Debe usar 9.000 (histórico), NO 12.000 (actual)
    expect(result.pendingBalance).toBe(36000);   // 4 × 9.000
    expect(result.pendingPayment).toBe(0);        // 4/4 pagadas
    expect(result.pricePerReservation).toBe(9000);
    // No debe haber consultado el precio actual
    expect(getPriceValue).not.toHaveBeenCalled();
  });

  test('consulta precio actual solo cuando pricePerReservation no está guardado (registro legado)', async () => {
    getPriceValue.mockResolvedValue(12000);

    const registroLegado = {
      reservationCount: 4,
      numberPaidReservations: 0,
      // pricePerReservation ausente → registro creado antes de este fix
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    };

    const result = await recomputeDailyFinanceFields(registroLegado);

    // Debe consultar el precio actual porque el registro no tiene el precio guardado
    expect(getPriceValue).toHaveBeenCalledWith({ item: 'Diario' });
    expect(result.pendingBalance).toBe(48000);      // 4 × 12.000 (precio actual)
    expect(result.pricePerReservation).toBe(12000); // guarda el precio para futuras consultas
  });

  test('registro con pricePerReservation = 0 también consulta precio actual', async () => {
    getPriceValue.mockResolvedValue(12000);

    const result = await recomputeDailyFinanceFields({
      reservationCount: 2,
      numberPaidReservations: 0,
      pricePerReservation: 0,
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    });

    expect(getPriceValue).toHaveBeenCalled();
    expect(result.pricePerReservation).toBe(12000);
  });

  test('escenario del bug reportado: precio cambió 9.000→12.000, historial preservado', async () => {
    getPriceValue.mockResolvedValue(12000); // precio actual

    // Registro de enero creado cuando precio era 9.000
    const registroEnero = {
      reservationCount: 4,
      numberPaidReservations: 4,
      pricePerReservation: 9000, // precio vigente en enero
      reservationPaymentStatus: 'No',
      paymentDate: '',
      paymentTime: '',
    };

    const result = await recomputeDailyFinanceFields(registroEnero);

    // El historial de enero sigue reflejando 9.000, no 12.000
    expect(result.pendingBalance).toBe(36000);   // 4 × 9.000 (enero)
    expect(result.pendingPayment).toBe(0);
    expect(result.pricePerReservation).toBe(9000);
    expect(getPriceValue).not.toHaveBeenCalled(); // no consultó precio actual
  });

  test('la fórmula BUGGY del frontend habría producido -12.000 con cambio de precio', () => {
    const pendingBalanceEnDB = 36000;
    const precioActual = 12000;
    const reservasPagadas = 4;
    const pendingPaymentBuggy = pendingBalanceEnDB - (reservasPagadas * precioActual);
    expect(pendingPaymentBuggy).toBe(-12000);
  });
});
