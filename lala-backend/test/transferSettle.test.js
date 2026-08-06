// test/transferSettle.test.js — run with: node test/transferSettle.test.js
// Tests settleCarBooking() with zero real money. Mocks all external calls.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
// Unit test — never connects to a database. The Sequelize config is now strictly
// env-driven (no hardcoded fallback), so supply a placeholder URL when .env has none.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/lala_test';
}
const { settleCarBooking } = require('../services/settlementService');
const Car = require('../models/Car');
const paymentService = require('../services/paymentService');

// Commission destination numbers are read from env only (never hardcoded in the app).
// Set them here as clearly-fake test fixtures (000… suffix) so tests never touch real wallets.
const TEST_WALLETS = {
  mtn: '0769000000',
  zamtel: '0959000000',
  airtel: '0579000000',
};
process.env.MTN_WALLET = TEST_WALLETS.mtn;
process.env.ZAMTEL_WALLET = TEST_WALLETS.zamtel;
process.env.AIRTEL_WALLET = TEST_WALLETS.airtel;

const COMM = { ...TEST_WALLETS };

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  \u2713 ${msg}`); }
  else { failed++; console.error(`  \u2717 ${msg}`); }
}

// ── Mock infrastructure ──────────────────────────────────
const origCarFindByPk = Car.findByPk;
const origSendPayout = paymentService.sendPayout;

function fakeCarBooking(overrides = {}) {
  const data = {
    id: 'car-test-uuid',
    carId: 'car-uuid',
    // Guest total = transfer + 10% fee (e.g. K90 transfer + K9 = K99)
    totalAmount: 99,
    provider: 'mtn',
    driverStatus: 'pending',
    driverRef: null,
    driverPayoutAmount: null,
    commissionAmount: null,
    commissionStatus: 'pending',
    commissionRef: null,
    ...overrides,
  };
  return {
    ...data,
    save: async function () { /* no-op — mutations happen on the object directly */ },
  };
}

// Records every sendPayout call so we can inspect both the driver and commission payouts.
function mockPayouts(statusFor = () => 'successful') {
  const calls = [];
  paymentService.sendPayout = async (args) => {
    calls.push(args);
    return { status: statusFor(args) };
  };
  return calls;
}
const driverCall = (calls) => calls.find(c => /driver payout/i.test(c.narration || ''));
const commCall  = (calls) => calls.find(c => /commission/i.test(c.narration || ''));

async function run() {
  console.log('\n── settleCarBooking tests ──\n');

  // ── 1. Happy path (MTN): guest pays K99 (K90 transfer + K9 fee) → driver K90 + commission K9 ──
  {
    Car.findByPk = async () => ({ driverPhone: '+260970000000' });
    const calls = mockPayouts();

    const b = fakeCarBooking();
    await settleCarBooking(b);

    assert(b.driverStatus === 'paid', 'happy path → driverStatus=paid');
    assert(b.commissionStatus === 'paid', 'happy path → commissionStatus=paid');
    assert(b.driverPayoutAmount === 90, `happy path → driverPayout=K90 (got K${b.driverPayoutAmount})`);
    assert(b.commissionAmount === 9, `happy path → commission=K9 (got K${b.commissionAmount})`);
    assert(b.driverRef && b.driverRef.startsWith('lala-driver-'), `happy path → driverRef set (${b.driverRef})`);
    assert(b.commissionRef && b.commissionRef.startsWith('lala-comm-'), `happy path → commissionRef set (${b.commissionRef})`);

    const d = driverCall(calls);
    const c = commCall(calls);
    assert(calls.length === 2, `happy path → TWO payouts sent (got ${calls.length})`);
    assert(d && d.amount === 90, `happy path → driver payout amount=90 (got ${d && d.amount})`);
    assert(d && d.phone === '260970000000', `happy path → driver pays driverPhone (${d && d.phone})`);
    assert(c && c.amount === 9, `happy path → commission payout amount=9 (got ${c && c.amount})`);
    assert(c && c.phone === COMM.mtn, `happy path → commission goes to MTN number ${COMM.mtn} (got ${c && c.phone})`);
    assert(c && c.operator === 'mtn', `happy path → commission operator=mtn (${c && c.operator})`);
  }

  // ── 2. Driver on different network: guest Airtel, driver MTN phone ──
  {
    // 096… is MTN; guest paid with airtel
    Car.findByPk = async () => ({ driverPhone: '260960111222' });
    const calls = mockPayouts();

    const b = fakeCarBooking({ provider: 'airtel' });
    await settleCarBooking(b);

    const d = driverCall(calls);
    const c = commCall(calls);
    assert(d && d.operator === 'mtn', `driver MTN phone → driver operator=mtn (got ${d && d.operator})`);
    assert(c && c.operator === 'airtel', `guest paid airtel → commission operator=airtel (got ${c && c.operator})`);
    assert(c && c.phone === COMM.airtel, `commission still to Airtel number (got ${c && c.phone})`);
    assert(b.commissionStatus === 'paid', 'different networks → commission paid');
  }

  // ── 3. Idempotent: driver already paid → skip driver, still pay commission if pending ──
  {
    const calls = mockPayouts();
    const b = fakeCarBooking({ driverStatus: 'paid', commissionStatus: 'pending' });
    await settleCarBooking(b);

    assert(calls.length === 1, `idempotent driver → only commission payout (got ${calls.length})`);
    assert(b.driverStatus === 'paid', 'idempotent → driverStatus stays paid');
    assert(b.commissionStatus === 'paid', 'idempotent driver → commission still paid');
  }

  // ── 3b. Fully settled → no payouts ──
  {
    const calls = mockPayouts();
    const b = fakeCarBooking({ driverStatus: 'paid', commissionStatus: 'paid' });
    await settleCarBooking(b);

    assert(calls.length === 0, 'fully settled → no payouts called');
  }

  // ── 4. K5 minimum: K4 total → driver skipped, commission also under min ──
  {
    Car.findByPk = async () => ({ driverPhone: '+260970000000' });
    const calls = mockPayouts();

    process.env.LENCO_COMMISSION_RATE = '0.10';
    const b = fakeCarBooking({ totalAmount: 4 });
    await settleCarBooking(b);

    assert(b.driverStatus === 'skipped', 'under K5 → driverStatus=skipped');
    assert(b.commissionStatus === 'skipped', 'under K5 → commissionStatus=skipped');
    assert(calls.length === 0, 'under K5 → no payouts called');
  }

  // ── 5. Missing driver phone → driver failed, commission still attempted ──
  {
    Car.findByPk = async () => ({ driverPhone: null });
    const calls = mockPayouts();

    const b = fakeCarBooking();
    await settleCarBooking(b);

    assert(b.driverStatus === 'failed', 'no driverPhone → driverStatus=failed');
    assert(calls.length === 1, `no driverPhone → commission still attempted (got ${calls.length})`);
    assert(b.commissionStatus === 'paid', 'no driverPhone → commission still paid');
  }

  // ── 6. Invalid operator → failed, no payouts ──
  {
    Car.findByPk = async () => ({ driverPhone: '+260970000000' });
    const calls = mockPayouts();

    const b = fakeCarBooking({ provider: 'vodafone' });
    await settleCarBooking(b);

    assert(b.driverStatus === 'failed', 'invalid operator → driverStatus=failed');
    assert(b.commissionStatus === 'failed', 'invalid operator → commissionStatus=failed');
    assert(calls.length === 0, 'invalid operator → no payouts called');
  }

  // ── 7. Driver API returns failed → driver flagged failed (commission still attempted) ──
  {
    Car.findByPk = async () => ({ driverPhone: '+260970000000' });
    const calls = mockPayouts((args) => /driver payout/i.test(args.narration || '') ? 'failed' : 'successful');

    const b = fakeCarBooking();
    await settleCarBooking(b);

    assert(b.driverStatus === 'failed', 'driver API failed → driverStatus=failed');
    assert(b.driverRef !== null, 'driver API failed → driverRef still saved for reconciliation');
    assert(b.commissionStatus === 'paid', 'driver API failed → commission still paid');
  }

  // ── 8. sendPayout throws → caught, flagged failed, never crashes ──
  {
    Car.findByPk = async () => ({ driverPhone: '+260970000000' });
    paymentService.sendPayout = async () => { throw new Error('Network error'); };

    const b = fakeCarBooking();
    let threw = false;
    try {
      await settleCarBooking(b);
    } catch {
      threw = true;
    }

    assert(!threw, 'sendPayout throws → settleCarBooking does NOT throw');
    assert(b.driverStatus === 'failed', 'sendPayout throws → driverStatus=failed');
  }

  // ── 9. Phone digits normalized (strip +) ──
  {
    Car.findByPk = async () => ({ driverPhone: '+260970000000' });
    const calls = mockPayouts();

    const b = fakeCarBooking();
    await settleCarBooking(b);

    const d = driverCall(calls);
    assert(d && d.phone === '260970000000', `driver phone normalized to digits (got ${d && d.phone})`);
  }

  // ── Summary ──
  console.log(`\n── ${passed} passed, ${failed} failed ──\n`);

  // Restore originals
  Car.findByPk = origCarFindByPk;
  paymentService.sendPayout = origSendPayout;

  process.exit(failed > 0 ? 1 : 0);
}

run();
