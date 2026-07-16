// test/settle.test.js — run with: node test/settle.test.js
// Tests settleBooking() with zero real money. Mocks all external calls.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { settleBooking } = require('../services/settlementService');
const Listing = require('../models/Listing');
const paymentService = require('../services/paymentService');

// Commission destination numbers (defaults in settlementService; override here for determinism)
const COMM = {
  mtn:    process.env.LENCO_COMMISSION_MTN    || '0769723838',
  zamtel: process.env.LENCO_COMMISSION_ZAMTEL || '0954702600',
  airtel: process.env.LENCO_COMMISSION_AIRTEL || '0572587206',
};

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  \u2713 ${msg}`); }
  else { failed++; console.error(`  \u2717 ${msg}`); }
}

// ── Mock infrastructure ──────────────────────────────────
const origFindByPk = Listing.findByPk;
const origSendPayout = paymentService.sendPayout;

function fakeBooking(overrides = {}) {
  const data = {
    id: 'test-uuid',
    listingId: 'listing-uuid',
    totalAmount: 100,
    provider: 'mtn',
    lodgeStatus: 'pending',
    lodgeRef: null,
    lodgePayoutAmount: null,
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

// Records every sendPayout call so we can inspect both the lodge (90%) and commission (10%) payouts.
function mockPayouts(statusFor = () => 'successful') {
  const calls = [];
  paymentService.sendPayout = async (args) => {
    calls.push(args);
    return { status: statusFor(args) };
  };
  return calls;
}
const lodgeCall = (calls) => calls.find(c => /lodge payout/i.test(c.narration || ''));
const commCall  = (calls) => calls.find(c => /commission/i.test(c.narration || ''));

async function run() {
  console.log('\n── settleBooking tests ──\n');

  // ── 1. Happy path (MTN): K100 → K90 lodge + K10 commission to MTN number ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    const calls = mockPayouts();

    const b = fakeBooking();
    await settleBooking(b);

    assert(b.lodgeStatus === 'paid', 'happy path → lodgeStatus=paid');
    assert(b.commissionStatus === 'paid', 'happy path → commissionStatus=paid');
    assert(b.commissionAmount === 10, `happy path → commission=K10 (got K${b.commissionAmount})`);
    assert(b.lodgePayoutAmount === 90, `happy path → lodgePayout=K90 (got K${b.lodgePayoutAmount})`);
    assert(b.lodgeRef && b.lodgeRef.startsWith('lala-lodge-'), `happy path → lodgeRef set (${b.lodgeRef})`);
    assert(b.commissionRef && b.commissionRef.startsWith('lala-comm-'), `happy path → commissionRef set (${b.commissionRef})`);

    const lodge = lodgeCall(calls);
    const comm  = commCall(calls);
    assert(calls.length === 2, `happy path → TWO payouts sent (got ${calls.length})`);
    assert(lodge && lodge.amount === 90, `happy path → lodge payout amount=90 (got ${lodge && lodge.amount})`);
    assert(lodge && lodge.phone === '260970000000', `happy path → lodge pays hostPhone (${lodge && lodge.phone})`);
    assert(comm && comm.amount === 10, `happy path → commission payout amount=10 (got ${comm && comm.amount})`);
    assert(comm && comm.phone === COMM.mtn, `happy path → commission goes to MTN number ${COMM.mtn} (got ${comm && comm.phone})`);
    assert(comm && comm.operator === 'mtn', `happy path → commission operator=mtn (${comm && comm.operator})`);
  }

  // ── 1b. Airtel routing: commission → Airtel number ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    const calls = mockPayouts();

    const b = fakeBooking({ provider: 'airtel' });
    await settleBooking(b);

    const comm = commCall(calls);
    assert(comm && comm.phone === COMM.airtel, `airtel → commission goes to Airtel number ${COMM.airtel} (got ${comm && comm.phone})`);
    assert(b.commissionStatus === 'paid', 'airtel → commissionStatus=paid');
  }

  // ── 1c. Zamtel routing: commission → Zamtel number ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    const calls = mockPayouts();

    const b = fakeBooking({ provider: 'zamtel' });
    await settleBooking(b);

    const comm = commCall(calls);
    assert(comm && comm.phone === COMM.zamtel, `zamtel → commission goes to Zamtel number ${COMM.zamtel} (got ${comm && comm.phone})`);
    assert(b.commissionStatus === 'paid', 'zamtel → commissionStatus=paid');
  }

  // ── 2. Idempotent: lodge already paid → skip lodge, still pay commission if pending ──
  {
    const calls = mockPayouts();
    const b = fakeBooking({ lodgeStatus: 'paid', commissionStatus: 'pending' });
    await settleBooking(b);

    assert(calls.length === 1, `idempotent lodge → only commission payout (got ${calls.length})`);
    assert(b.lodgeStatus === 'paid', 'idempotent → lodgeStatus stays paid');
    assert(b.commissionStatus === 'paid', 'idempotent lodge → commission still paid');
  }

  // ── 2b. Fully settled → no payouts ──
  {
    const calls = mockPayouts();
    const b = fakeBooking({ lodgeStatus: 'paid', commissionStatus: 'paid' });
    await settleBooking(b);

    assert(calls.length === 0, 'fully settled → no payouts called');
  }

  // ── 3. K5 minimum: K4 total → lodge skipped, commission also under min ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    const calls = mockPayouts();

    process.env.LENCO_COMMISSION_RATE = '0.10';
    const b = fakeBooking({ totalAmount: 4 });
    await settleBooking(b);

    assert(b.lodgeStatus === 'skipped', 'under K5 → lodgeStatus=skipped');
    assert(b.commissionStatus === 'skipped', 'under K5 → commissionStatus=skipped');
    assert(calls.length === 0, 'under K5 → no payouts called');
  }

  // ── 4. Missing hostPhone → lodge failed, commission still attempted ──
  {
    Listing.findByPk = async () => ({ hostPhone: null });
    const calls = mockPayouts();

    const b = fakeBooking();
    await settleBooking(b);

    assert(b.lodgeStatus === 'failed', 'no hostPhone → lodgeStatus=failed');
    assert(calls.length === 1, `no hostPhone → commission still attempted (got ${calls.length})`);
    assert(b.commissionStatus === 'paid', 'no hostPhone → commission still paid');
  }

  // ── 5. Invalid operator → failed, no payouts ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    const calls = mockPayouts();

    const b = fakeBooking({ provider: 'vodafone' });
    await settleBooking(b);

    assert(b.lodgeStatus === 'failed', 'invalid operator → lodgeStatus=failed');
    assert(calls.length === 0, 'invalid operator → no payouts called');
  }

  // ── 6. Lodge API returns failed → lodge flagged failed (commission still attempted) ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    // lodge fails, commission succeeds
    const calls = mockPayouts((args) => /lodge payout/i.test(args.narration || '') ? 'failed' : 'successful');

    const b = fakeBooking();
    await settleBooking(b);

    assert(b.lodgeStatus === 'failed', 'lodge API failed → lodgeStatus=failed');
    assert(b.lodgeRef !== null, 'lodge API failed → lodgeRef still saved for reconciliation');
  }

  // ── 7. sendPayout throws → caught, flagged failed, never crashes ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    paymentService.sendPayout = async () => { throw new Error('Network error'); };

    const b = fakeBooking();
    let threw = false;
    try {
      await settleBooking(b);
    } catch {
      threw = true;
    }

    assert(!threw, 'sendPayout throws → settleBooking does NOT throw');
    assert(b.lodgeStatus === 'failed', 'sendPayout throws → lodgeStatus=failed');
  }

  // ── 8. Commission IS paid out (K250 → K25 commission to operator number) ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    const calls = mockPayouts();

    const b = fakeBooking({ totalAmount: 250, provider: 'airtel' });
    await settleBooking(b);

    const lodge = lodgeCall(calls);
    const comm  = commCall(calls);
    assert(lodge && lodge.amount === 225, `lodge paid K225 (got K${lodge && lodge.amount})`);
    assert(comm && comm.amount === 25, `commission paid out K25 (got K${comm && comm.amount})`);
    assert(comm && comm.phone === COMM.airtel, `commission K25 goes to Airtel number (got ${comm && comm.phone})`);
    assert(b.commissionAmount === 25, `commission recorded as K25 (got K${b.commissionAmount})`);
    assert(b.lodgePayoutAmount === 225, `lodge amount recorded K225 (got K${b.lodgePayoutAmount})`);
  }

  // ── 9. Lodge payout goes to hostPhone, not guestPhone ──
  {
    Listing.findByPk = async () => ({ hostPhone: '260980000000' });
    const calls = mockPayouts();

    const b = fakeBooking({ guestPhone: '260960000000' });
    await settleBooking(b);

    const lodge = lodgeCall(calls);
    assert(lodge && lodge.phone === '260980000000', 'lodge payout goes to hostPhone, not guestPhone');
  }

  // ── 10. Host on different network: guest Airtel pay, host MTN phone ──
  {
    // 096… is MTN; guest paid with airtel
    Listing.findByPk = async () => ({ hostPhone: '260960111222' });
    const calls = mockPayouts();

    const b = fakeBooking({ provider: 'airtel' });
    await settleBooking(b);

    const lodge = lodgeCall(calls);
    const comm  = commCall(calls);
    assert(lodge && lodge.operator === 'mtn', `host MTN phone → lodge operator=mtn (got ${lodge && lodge.operator})`);
    assert(comm && comm.operator === 'airtel', `guest paid airtel → commission operator=airtel (got ${comm && comm.operator})`);
    assert(comm && comm.phone === COMM.airtel, `commission still to Airtel number (got ${comm && comm.phone})`);
  }

  // ── 11. Phone digits normalized (strip +) ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    const calls = mockPayouts();

    const b = fakeBooking();
    await settleBooking(b);

    const lodge = lodgeCall(calls);
    assert(lodge && lodge.phone === '260970000000', `host phone normalized to digits (got ${lodge && lodge.phone})`);
  }

  // ── Summary ──
  console.log(`\n── ${passed} passed, ${failed} failed ──\n`);

  // Restore originals
  Listing.findByPk = origFindByPk;
  paymentService.sendPayout = origSendPayout;

  process.exit(failed > 0 ? 1 : 0);
}

run();
