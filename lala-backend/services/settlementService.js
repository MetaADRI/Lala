// lala-backend/services/settlementService.js
const crypto = require('crypto');
const paymentService = require('./paymentService');
const Listing = require('../models/Listing');
const User = require('../models/User');
const Car = require('../models/Car');
const logger = require('../utils/logger');

const VALID_OPERATORS = ['mtn', 'airtel', 'zamtel'];
const round2 = (n) => Math.round(Number(n) * 100) / 100;

// Commission destination numbers per operator.
// MUST come ONLY from environment variables (MTN_WALLET / ZAMTEL_WALLET / AIRTEL_WALLET).
// A settlement service must never guess a wallet number — if one is missing we throw
// instead of silently routing money to a hardcoded destination.
// Presence is validated at startup (config/envValidation.js); this is the runtime safety net.
function getCommissionNumbers() {
  const numbers = {
    mtn:    process.env.MTN_WALLET,
    zamtel: process.env.ZAMTEL_WALLET,
    airtel: process.env.AIRTEL_WALLET,
  };
  const missing = Object.keys(numbers).filter((op) => !numbers[op]);
  if (missing.length > 0) {
    throw new Error(
      '[settlementService] Missing commission wallet env var(s): ' +
        missing.map((op) => `${op.toUpperCase()}_WALLET`).join(', ') +
        '. Refusing to guess a payout destination — configure the wallet numbers in the environment.'
    );
  }
  return numbers;
}

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
 * Settle a confirmed booking.
 * Guest was charged: stay (subtotal) + 10% service fee.
 *   e.g. K90 stay + K9 fee = K99 total
 *   - lodge gets full stay (subtotal) → hostPhone
 *   - 10% service fee → operator commission wallet (MTN_WALLET / ZAMTEL_WALLET / AIRTEL_WALLET)
 * CRASH-SAFE: never throws. Failures are logged + flagged; booking stays confirmed.
 * Idempotent: lodge already paid still retries commission if commission is not paid.
 */
async function settleBooking(booking) {
  const bookingId = booking.id;
  try {
    const rate = Number(process.env.LENCO_COMMISSION_RATE || 0.10);
    const min  = Number(process.env.LENCO_MIN_TRANSFER || 5);
    const total = Number(booking.totalAmount);

    // total = subtotal * (1 + rate)  →  lodge = subtotal, commission = fee
    // e.g. total 99, rate 0.10 → lodge 90, commission 9
    const lodgeAmount = round2(total / (1 + rate));
    const commissionAmount = round2(total - lodgeAmount);

    booking.commissionAmount = commissionAmount;
    booking.lodgePayoutAmount = lodgeAmount;

    // Guest payment operator (drives which commission wallet receives 10%)
    const guestOperator = String(booking.provider || '').toLowerCase();
    if (!VALID_OPERATORS.includes(guestOperator)) {
      logger.error('settle.invalid-operator', {
        bookingId,
        operator: guestOperator,
        reason: 'flagging failed',
      });
      if (booking.lodgeStatus !== 'paid') booking.lodgeStatus = 'failed';
      if (booking.commissionStatus !== 'paid') booking.commissionStatus = 'failed';
      await booking.save();
      return;
    }

    // -- Payout #1: lodge 90% (skip if already paid) --
    if (booking.lodgeStatus === 'paid') {
      logger.info('settle.lodge.skipped', { bookingId, reason: 'already paid — checking commission only' });
    } else {
      const listing = await Listing.findByPk(booking.listingId);
      // Prefer listing.hostPhone; fall back to host user's phone on the User record
      let hostPhone = listing?.hostPhone || null;
      if (!hostPhone && listing?.hostId) {
        const host = await User.findByPk(listing.hostId);
        hostPhone = host?.phone || null;
        if (hostPhone) {
          logger.info('settle.listing.hostphone-missing', {
            bookingId,
            listingId: listing.id,
            detail: 'using host user phone',
          });
          // Persist so future settlements don't re-lookup
          try {
            listing.hostPhone = hostPhone;
            await listing.save();
          } catch (_) {}
        }
      }
      if (!hostPhone) {
        logger.error('settle.lodge.no-hostphone', {
          bookingId,
          listingId: booking.listingId,
          detail: 'lodge failed; still attempting commission',
        });
        booking.lodgeStatus = 'failed';
        await booking.save();
        // Still try commission so Lala still receives its cut when funds allow
        await payCommission(booking, guestOperator, commissionAmount, min);
        return;
      }

      // Host may be on a different network than the guest who paid
      const hostOperator = detectOperatorFromPhone(hostPhone) || guestOperator;
      if (hostOperator !== guestOperator) {
        logger.info('settle.host-operator-differs', {
          bookingId,
          hostOperator,
          guestOperator,
          detail: 'using host network for lodge payout',
        });
      }

      if (lodgeAmount < min) {
        logger.warn('settle.lodge.below-min', {
          bookingId,
          amount: lodgeAmount,
          min,
          detail: "flagging 'skipped' for manual settlement",
        });
        booking.lodgeStatus = 'skipped';
        await booking.save();
        await payCommission(booking, guestOperator, commissionAmount, min);
        return;
      }

      const reference = `lala-lodge-${booking.id}-${crypto.randomBytes(3).toString('hex')}`;
      logger.info('settle.lodge.start', {
        bookingId,
        amount: lodgeAmount,
        operator: hostOperator,
        phone: logger.maskPhone(hostPhone),
        reference,
      });

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
        logger.info('settle.lodge.done', { bookingId, status: result.status, lodgeStatus: booking.lodgeStatus });
      } catch (err) {
        logger.error('settle.lodge.error', {
          bookingId,
          err: err.response?.data ? JSON.stringify(err.response.data) : err.message,
          reference,
        });
        booking.lodgeStatus = 'failed';
        await booking.save();
      }
    }

    // -- Payout #2: 10% commission to the guest-operator commission number --
    await payCommission(booking, guestOperator, commissionAmount, min);
  } catch (err) {
    // NEVER let settlement crash the booking flow
    logger.error('settle.failed', {
      bookingId,
      err: err.response?.data ? JSON.stringify(err.response.data) : err.message,
    });
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
  const bookingId = booking.id;
  try {
    if (booking.commissionStatus === 'paid') {
      logger.info('settle.commission.skipped', { bookingId, reason: 'already paid' });
      return;
    }

    // Re-read env each time so Render env changes apply without code edits
    const numbers = getCommissionNumbers();
    const dest = numbers[operator];
    if (!dest) {
      logger.error('settle.commission.no-number', {
        bookingId,
        operator,
        detail: 'flagging commission failed',
      });
      booking.commissionStatus = 'failed';
      await booking.save();
      return;
    }

    if (commissionAmount < min) {
      logger.warn('settle.commission.below-min', {
        bookingId,
        amount: commissionAmount,
        min,
        detail: "flagging commission 'skipped'",
      });
      booking.commissionStatus = 'skipped';
      await booking.save();
      return;
    }

    const reference = `lala-comm-${booking.id}-${crypto.randomBytes(3).toString('hex')}`;
    logger.info('settle.commission.start', {
      bookingId,
      amount: commissionAmount,
      operator,
      phone: logger.maskPhone(dest),
      reference,
    });

    const result = await paymentService.sendPayout({
      amount: commissionAmount,
      reference,
      phone: normalizePhone(dest),
      operator,
      narration: `Lala commission 10% - booking ${booking.id}`,
    });

    booking.commissionRef = reference;
    // Only mark paid when Lenco reports success; pending stays pending for later verify/retry
    if (result.status === 'failed') {
      booking.commissionStatus = 'failed';
    } else if (result.status === 'successful' || result.status === 'success') {
      booking.commissionStatus = 'paid';
    } else {
      // pending / processing — keep pending so admin retry / status poll can re-check
      booking.commissionStatus = 'pending';
      logger.warn('settle.commission.pending', {
        bookingId,
        status: result.status,
        reference,
        detail: 'left as pending',
      });
    }
    await booking.save();

    logger.info('settle.commission.done', {
      bookingId,
      status: result.status,
      commissionStatus: booking.commissionStatus,
    });
  } catch (err) {
    logger.error('settle.commission.error', {
      bookingId,
      err: err.response?.data ? JSON.stringify(err.response.data) : err.message,
    });
    try { booking.commissionStatus = 'failed'; await booking.save(); } catch (_) {}
  }
}

/**
 * Settle a confirmed transfer (car/airport) booking.
 * Guest was charged: transfer price + 10% service fee.
 *   e.g. K90 transfer + K9 fee = K99 total
 *   - driver gets full transfer price → Car.driverPhone
 *   - 10% service fee → operator commission wallet (MTN_WALLET / ZAMTEL_WALLET / AIRTEL_WALLET)
 * CRASH-SAFE: never throws. Failures are logged + flagged; booking stays confirmed.
 * Idempotent: driver already paid still retries commission if commission is not paid.
 */
async function settleCarBooking(booking) {
  const bookingId = booking.id;
  try {
    const rate = Number(process.env.LENCO_COMMISSION_RATE || 0.10);
    const min  = Number(process.env.LENCO_MIN_TRANSFER || 5);
    const total = Number(booking.totalAmount);

    // total = price * (1 + rate)  →  driver = price, commission = fee
    // e.g. total 99, rate 0.10 → driver 90, commission 9
    const driverAmount = round2(total / (1 + rate));
    const commissionAmount = round2(total - driverAmount);

    booking.commissionAmount = commissionAmount;
    booking.driverPayoutAmount = driverAmount;

    // Guest payment operator (drives which commission wallet receives 10%)
    const guestOperator = String(booking.provider || '').toLowerCase();
    if (!VALID_OPERATORS.includes(guestOperator)) {
      logger.error('car.settle.invalid-operator', {
        bookingId,
        operator: guestOperator,
        reason: 'flagging failed',
      });
      if (booking.driverStatus !== 'paid') booking.driverStatus = 'failed';
      if (booking.commissionStatus !== 'paid') booking.commissionStatus = 'failed';
      await booking.save();
      return;
    }

    // -- Payout #1: driver full price (skip if already paid) --
    if (booking.driverStatus === 'paid') {
      logger.info('car.settle.driver.skipped', { bookingId, reason: 'already paid — checking commission only' });
    } else {
      const car = await Car.findByPk(booking.carId);
      const driverPhone = car?.driverPhone || null;
      if (!driverPhone) {
        logger.error('car.settle.driver.no-phone', {
          bookingId,
          carId: booking.carId,
          detail: 'driver failed; still attempting commission',
        });
        booking.driverStatus = 'failed';
        await booking.save();
        // Still try commission so Lala still receives its cut when funds allow
        await payCommission(booking, guestOperator, commissionAmount, min);
        return;
      }

      // Driver may be on a different network than the guest who paid
      const driverOperator = detectOperatorFromPhone(driverPhone) || guestOperator;

      if (driverAmount < min) {
        logger.warn('car.settle.driver.below-min', {
          bookingId,
          amount: driverAmount,
          min,
          detail: "flagging 'skipped' for manual settlement",
        });
        booking.driverStatus = 'skipped';
        await booking.save();
        await payCommission(booking, guestOperator, commissionAmount, min);
        return;
      }

      const reference = `lala-driver-${booking.id}-${crypto.randomBytes(3).toString('hex')}`;
      logger.info('car.settle.driver.start', {
        bookingId,
        amount: driverAmount,
        operator: driverOperator,
        phone: logger.maskPhone(driverPhone),
        reference,
      });

      try {
        const result = await paymentService.sendPayout({
          amount: driverAmount,
          reference,
          phone: normalizePhone(driverPhone),
          operator: driverOperator,
          narration: `Lala transfer driver payout - booking ${booking.id}`,
        });

        booking.driverRef = reference;
        booking.driverStatus = (result.status === 'failed') ? 'failed' : 'paid';
        await booking.save();
        logger.info('car.settle.driver.done', { bookingId, status: result.status, driverStatus: booking.driverStatus });
      } catch (err) {
        logger.error('car.settle.driver.error', {
          bookingId,
          err: err.response?.data ? JSON.stringify(err.response.data) : err.message,
          reference,
        });
        booking.driverStatus = 'failed';
        await booking.save();
      }
    }

    // -- Payout #2: 10% commission to the guest-operator commission number --
    await payCommission(booking, guestOperator, commissionAmount, min);
  } catch (err) {
    // NEVER let settlement crash the booking flow
    logger.error('car.settle.failed', {
      bookingId,
      err: err.response?.data ? JSON.stringify(err.response.data) : err.message,
    });
    try {
      if (booking.driverStatus !== 'paid') booking.driverStatus = 'failed';
      await booking.save();
    } catch (_) {}
  }
}

module.exports = { settleBooking, settleCarBooking, detectOperatorFromPhone, getCommissionNumbers };
