// test/settle.test.js — run with: node test/settle.test.js
// Tests settleBooking() with zero real money. Mocks all external calls.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { settleBooking } = require('../services/settlementService');
const Listing = require('../models/Listing');
const paymentService = require('../services/paymentService');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
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
    ...overrides,
  };
  return {
    ...data,
    save: async function () { /* no-op — mutations happen on the object directly */ },
  };
}

async function run() {
  console.log('\n── settleBooking tests ──\n');

  // ── 1. Happy path: K100 → K10 commission, K90 payout ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    let payoutArgs = null;
    paymentService.sendPayout = async (args) => {
      payoutArgs = args;
      return { status: 'successful' };
    };

    const b = fakeBooking();
    await settleBooking(b);

    assert(b.lodgeStatus === 'paid', 'happy path → lodgeStatus=paid');
    assert(b.commissionAmount === 10, `happy path → commission=K10 (got K${b.commissionAmount})`);
    assert(b.lodgePayoutAmount === 90, `happy path → lodgePayout=K90 (got K${b.lodgePayoutAmount})`);
    assert(b.lodgeRef && b.lodgeRef.startsWith('lala-lodge-'), `happy path → lodgeRef set (${b.lodgeRef})`);
    assert(payoutArgs !== null, 'happy path → sendPayout was called');
    assert(payoutArgs.amount === 90, `happy path → payout amount=90 (got ${payoutArgs.amount})`);
    assert(payoutArgs.phone === '+260970000000', `happy path → pays to hostPhone (${payoutArgs.phone})`);
    assert(payoutArgs.operator === 'mtn', `happy path → operator=mtn (${payoutArgs.operator})`);
  }

  // ── 2. Idempotent: already paid → skip ──
  {
    let sendPayoutCalled = false;
    paymentService.sendPayout = async () => { sendPayoutCalled = true; return { status: 'successful' }; };

    const b = fakeBooking({ lodgeStatus: 'paid' });
    await settleBooking(b);

    assert(!sendPayoutCalled, 'idempotent → sendPayout NOT called');
    assert(b.lodgeStatus === 'paid', 'idempotent → lodgeStatus stays paid');
  }

  // ── 3. K5 minimum: K4 total → skipped (never calls API) ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    let sendPayoutCalled = false;
    paymentService.sendPayout = async () => { sendPayoutCalled = true; return { status: 'successful' }; };

    process.env.LENCO_COMMISSION_RATE = '0.10';
    const b = fakeBooking({ totalAmount: 4 });
    await settleBooking(b);

    assert(b.lodgeStatus === 'skipped', 'under K5 → lodgeStatus=skipped');
    assert(!sendPayoutCalled, 'under K5 → sendPayout NOT called');
  }

  // ── 4. Missing hostPhone → failed ──
  {
    Listing.findByPk = async () => ({ hostPhone: null });
    let sendPayoutCalled = false;
    paymentService.sendPayout = async () => { sendPayoutCalled = true; return { status: 'successful' }; };

    const b = fakeBooking();
    await settleBooking(b);

    assert(b.lodgeStatus === 'failed', 'no hostPhone → lodgeStatus=failed');
    assert(!sendPayoutCalled, 'no hostPhone → sendPayout NOT called');
  }

  // ── 5. Invalid operator → failed ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    let sendPayoutCalled = false;
    paymentService.sendPayout = async () => { sendPayoutCalled = true; return { status: 'successful' }; };

    const b = fakeBooking({ provider: 'vodafone' });
    await settleBooking(b);

    assert(b.lodgeStatus === 'failed', 'invalid operator → lodgeStatus=failed');
    assert(!sendPayoutCalled, 'invalid operator → sendPayout NOT called');
  }

  // ── 6. API returns failed status → lodge flagged failed ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    paymentService.sendPayout = async () => ({ status: 'failed' });

    const b = fakeBooking();
    await settleBooking(b);

    assert(b.lodgeStatus === 'failed', 'API failed → lodgeStatus=failed');
    assert(b.lodgeRef !== null, 'API failed → lodgeRef still saved for reconciliation');
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

  // ── 8. Commission stays in account (no payout for commission amount) ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260970000000' });
    let lastPayoutAmount = null;
    paymentService.sendPayout = async (args) => {
      lastPayoutAmount = args.amount;
      return { status: 'successful' };
    };

    const b = fakeBooking({ totalAmount: 250 });
    await settleBooking(b);

    assert(lastPayoutAmount === 225, `commission not paid → payout only lodge 90% (got K${lastPayoutAmount})`);
    assert(b.commissionAmount === 25, `commission recorded as K25 (got K${b.commissionAmount})`);
    assert(b.lodgePayoutAmount === 225, `lodge paid K225 (got K${b.lodgePayoutAmount})`);
  }

  // ── 9. Phone destination is hostPhone, not guestPhone ──
  {
    Listing.findByPk = async () => ({ hostPhone: '+260980000000' });
    let payoutPhone = null;
    paymentService.sendPayout = async (args) => {
      payoutPhone = args.phone;
      return { status: 'successful' };
    };

    const b = fakeBooking({ guestPhone: '+260960000000' });
    await settleBooking(b);

    assert(payoutPhone === '+260980000000', 'payout goes to hostPhone, not guestPhone');
  }

  // ── Summary ──
  console.log(`\n── ${passed} passed, ${failed} failed ──\n`);

  // Restore originals
  Listing.findByPk = origFindByPk;
  paymentService.sendPayout = origSendPayout;

  process.exit(failed > 0 ? 1 : 0);
}

run();
