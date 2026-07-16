// lala-backend/services/settlementService.js
const crypto = require('crypto');
const paymentService = require('./paymentService');
const Listing = require('../models/Listing');

const VALID_OPERATORS = ['mtn', 'airtel', 'zamtel'];
const round2 = (n) => Math.round(Number(n) * 100) / 100;

// Commission destination numbers per operator. Overridable via env.
// The 10% commission is transferred to the number that matches the
// operator the guest paid with (kept hidden from the customer).
const COMMISSION_NUMBERS = {
  mtn:    process.env.LENCO_COMMISSION_MTN    || '0769723838',
  zamtel: process.env.LENCO_COMMISSION_ZAMTEL || '0954702600',
  airtel: process.env.LENCO_COMMISSION_AIRTEL || '0572587206',
};

/**
 * Detect Zambian mobile operator from phone prefix.
 * Used for lodge payouts (host may be on a different network than the guest).
 * 96/76 → MTN, 97/77/57 → Airtel, 95/75 → Zamtel
 */
function detectOperatorFromPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  const local = digits.startsWith('260') ? digits.slice(3) : digits;
  const prefix = local.slice(0, 2);
  if (['96', '76'].includes(prefix)) return 'mtn';
  if (['97', '77', '57'].includes(prefix)) return 'airtel';
  if (['95', '75'].includes(prefix)) return 'zamtel';
  return null;
}

/** Normalize phone for Lenco (digits only, keep leading 0 or 260 form as stored). */
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Settle a confirmed booking:
 *   - 90% -> lodge owner's hostPhone (payout #1), using host's network operator
 *   - 10% commission -> operator-specific commission number (payout #2)
 *        mtn -> 0769723838, zamtel -> 0954702600, airtel -> 0572587206
 * CRASH-SAFE: never throws. Failures are logged + flagged; booking stays confirmed.
 * Idempotent: lodge already paid still retries commission if commission is not paid.
 */
async function settleBooking(booking) {
  try {
    const rate = Number(process.env.LENCO_COMMISSION_RATE || 0.10);
    const min  = Number(process.env.LENCO_MIN_TRANSFER || 5);
    const total = Number(booking.totalAmount);

    const commissionAmount = round2(total * rate);
    const lodgeAmount = round2(total - commissionAmount);

    booking.commissionAmount = commissionAmount;
    booking.lodgePayoutAmount = lodgeAmount;

    // Guest payment operator (drives which commission wallet receives 10%)
    const guestOperator = String(booking.provider || '').toLowerCase();
    if (!VALID_OPERATORS.includes(guestOperator)) {
      console.error(`[settle] Invalid operator "${guestOperator}" (booking ${booking.id}) — flagging failed.`);
      if (booking.lodgeStatus !== 'paid') booking.lodgeStatus = 'failed';
      if (booking.commissionStatus !== 'paid') booking.commissionStatus = 'failed';
      await booking.save();
      return;
    }

    // -- Payout #1: lodge 90% (skip if already paid) --
    if (booking.lodgeStatus === 'paid') {
      console.log(`[settle] Booking ${booking.id} lodge already paid — checking commission only.`);
    } else {
      const listing = await Listing.findByPk(booking.listingId);
      const hostPhone = listing?.hostPhone;
      if (!hostPhone) {
        console.error(`[settle] Listing ${booking.listingId} has no hostPhone (booking ${booking.id}) — flagging failed.`);
        booking.lodgeStatus = 'failed';
        await booking.save();
        // Still try commission so Lala still receives its cut when funds allow
        await payCommission(booking, guestOperator, commissionAmount, min);
        return;
      }

      // Host may be on a different network than the guest who paid
      const hostOperator = detectOperatorFromPhone(hostPhone) || guestOperator;
      if (hostOperator !== guestOperator) {
        console.log(`[settle] Host operator (${hostOperator}) differs from guest payment operator (${guestOperator}) — using host network for lodge payout.`);
      }

      if (lodgeAmount < min) {
        console.warn(`[settle] Lodge amount K${lodgeAmount} < K${min} minimum (booking ${booking.id}) — flagging 'skipped' for manual settlement.`);
        booking.lodgeStatus = 'skipped';
        await booking.save();
        await payCommission(booking, guestOperator, commissionAmount, min);
        return;
      }

      const reference = `lala-lodge-${booking.id}-${crypto.randomBytes(3).toString('hex')}`;
      console.log(`[settle] Paying lodge K${lodgeAmount} -> ${hostOperator} ${hostPhone} (booking ${booking.id}, ref ${reference})`);

      try {
        const result = await paymentService.sendPayout({
          amount: lodgeAmount,
          reference,
          phone: normalizePhone(hostPhone),
          operator: hostOperator,
          narration: `Lala lodge payout 90% - booking ${booking.id}`,
        });

        booking.lodgeRef = reference;
        booking.lodgeStatus = (result.status === 'failed') ? 'failed' : 'paid';
        await booking.save();
        console.log(`[settle] Booking ${booking.id} lodge payout status: ${result.status}.`);
      } catch (err) {
        console.error(`[settle] Lodge payout FAILED for booking ${booking.id}:`, err.response?.data || err.message);
        booking.lodgeStatus = 'failed';
        await booking.save();
      }
    }

    // -- Payout #2: 10% commission to the guest-operator commission number --
    await payCommission(booking, guestOperator, commissionAmount, min);
  } catch (err) {
    // NEVER let settlement crash the booking flow
    console.error(`[settle] FAILED for booking ${booking.id}:`, err.response?.data || err.message);
    try {
      if (booking.lodgeStatus !== 'paid') booking.lodgeStatus = 'failed';
      await booking.save();
    } catch (_) {}
  }
}

/**
 * Transfer the 10% commission to the operator-specific commission number.
 * Crash-safe: logs + flags but never throws. Hidden from the customer.
 */
async function payCommission(booking, operator, commissionAmount, min) {
  try {
    if (booking.commissionStatus === 'paid') {
      console.log(`[settle] Booking ${booking.id} commission already paid -- skipping.`);
      return;
    }

    const dest = COMMISSION_NUMBERS[operator];
    if (!dest) {
      console.error(`[settle] No commission number for operator "${operator}" (booking ${booking.id}) -- flagging commission failed.`);
      booking.commissionStatus = 'failed';
      await booking.save();
      return;
    }

    if (commissionAmount < min) {
      console.warn(`[settle] Commission K${commissionAmount} < K${min} minimum (booking ${booking.id}) -- flagging commission 'skipped'.`);
      booking.commissionStatus = 'skipped';
      await booking.save();
      return;
    }

    const reference = `lala-comm-${booking.id}-${crypto.randomBytes(3).toString('hex')}`;
    console.log(`[settle] Paying commission K${commissionAmount} -> ${operator} ${dest} (booking ${booking.id}, ref ${reference})`);

    const result = await paymentService.sendPayout({
      amount: commissionAmount,
      reference,
      phone: normalizePhone(dest),
      operator,
      narration: `Lala commission 10% - booking ${booking.id}`,
    });

    booking.commissionRef = reference;
    booking.commissionStatus = (result.status === 'failed') ? 'failed' : 'paid';
    await booking.save();

    console.log(`[settle] Booking ${booking.id} commission payout status: ${result.status}.`);
  } catch (err) {
    console.error(`[settle] COMMISSION payout FAILED for booking ${booking.id}:`, err.response?.data || err.message);
    try { booking.commissionStatus = 'failed'; await booking.save(); } catch (_) {}
  }
}

module.exports = { settleBooking, detectOperatorFromPhone, COMMISSION_NUMBERS };
