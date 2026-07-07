// lala-backend/services/settlementService.js
const crypto = require('crypto');
const paymentService = require('./paymentService');
const Listing = require('../models/Listing');

const VALID_OPERATORS = ['mtn', 'airtel', 'zamtel'];
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Settle a confirmed booking:
 *   - 90% -> lodge owner's hostPhone (ONE payout)
 *   - 10% commission STAYS in the Lenco account (no transfer)
 * CRASH-SAFE: never throws. Failures are logged + flagged; booking stays confirmed.
 */
async function settleBooking(booking) {
  try {
    // Idempotency guard
    if (booking.lodgeStatus === 'paid') {
      console.log(`[settle] Booking ${booking.id} lodge already paid — skipping.`);
      return;
    }

    const rate = Number(process.env.LENCO_COMMISSION_RATE || 0.10);
    const min  = Number(process.env.LENCO_MIN_TRANSFER || 5);
    const total = Number(booking.totalAmount);

    const commissionAmount = round2(total * rate);
    const lodgeAmount = round2(total - commissionAmount);

    booking.commissionAmount = commissionAmount;
    booking.lodgePayoutAmount = lodgeAmount;

    // Validate lodge destination
    const listing = await Listing.findByPk(booking.listingId);
    const hostPhone = listing?.hostPhone;
    if (!hostPhone) {
      console.error(`[settle] Listing ${booking.listingId} has no hostPhone (booking ${booking.id}) — flagging failed.`);
      booking.lodgeStatus = 'failed';
      await booking.save();
      return;
    }

    const operator = String(booking.provider || '').toLowerCase();
    if (!VALID_OPERATORS.includes(operator)) {
      console.error(`[settle] Invalid operator "${operator}" (booking ${booking.id}) — flagging failed.`);
      booking.lodgeStatus = 'failed';
      await booking.save();
      return;
    }

    // Enforce Lenco K5 minimum
    if (lodgeAmount < min) {
      console.warn(`[settle] Lodge amount K${lodgeAmount} < K${min} minimum (booking ${booking.id}) — flagging 'skipped' for manual settlement.`);
      booking.lodgeStatus = 'skipped';
      await booking.save();
      return;
    }

    const reference = `lala-lodge-${booking.id}-${crypto.randomBytes(3).toString('hex')}`;
    console.log(`[settle] Paying lodge K${lodgeAmount} -> ${operator} ${hostPhone} (booking ${booking.id}, ref ${reference})`);

    const result = await paymentService.sendPayout({
      amount: lodgeAmount,
      reference,
      phone: hostPhone,
      operator,
      narration: `Lala lodge payout 90% - booking ${booking.id}`,
    });

    booking.lodgeRef = reference;
    booking.lodgeStatus = (result.status === 'failed') ? 'failed' : 'paid';
    await booking.save();

    console.log(`[settle] Booking ${booking.id} lodge payout status: ${result.status}. Commission K${commissionAmount} retained in Lenco account.`);
  } catch (err) {
    // NEVER let settlement crash the booking flow
    console.error(`[settle] FAILED for booking ${booking.id}:`, err.response?.data || err.message);
    try { booking.lodgeStatus = 'failed'; await booking.save(); } catch (_) {}
    // TODO: alert (email/Slack) for manual retry
  }
}

module.exports = { settleBooking };