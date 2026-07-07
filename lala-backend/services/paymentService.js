const axios = require('axios');
const crypto = require('crypto');

const LENCO_API_URL = process.env.LENCO_API_URL;
const LENCO_API_KEY = process.env.LENCO_API_KEY;

if (!LENCO_API_KEY) {
  console.warn('[paymentService] LENCO_API_KEY is not set — payments will fail.');
}

const lenco = axios.create({
  baseURL: LENCO_API_URL,
  headers: {
    Authorization: `Bearer ${LENCO_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

async function initiateMomoPush({ amount, reference, phone, operator }) {
  try {
    const { data } = await lenco.post('/collections/mobile-money', {
      amount,
      currency: 'ZMW',
      reference,
      phone,
      operator: String(operator).toLowerCase(),
      country: 'zm',
      bearer: 'merchant',
    });
    return data.data;
  } catch (err) {
    const apiError = err.response?.data || { message: err.message };
    console.error('[paymentService.initiateMomoPush] error:', apiError);
    throw new Error(apiError.message || 'Failed to initiate mobile money payment');
  }
}

async function verifyCollectionStatus(reference) {
  try {
    const { data } = await lenco.get(`/collections/status/${encodeURIComponent(reference)}`);
    return data.data;
  } catch (err) {
    const apiError = err.response?.data || { message: err.message };
    console.error('[paymentService.verifyCollectionStatus] error:', apiError);
    throw new Error(apiError.message || 'Failed to verify payment status');
  }
}

function verifyWebhookSignature(rawBody, signature) {
  if (!signature) return false;
  const webhookHashKey = crypto
    .createHash('sha256')
    .update(LENCO_API_KEY)
    .digest('hex');
  const expected = crypto
    .createHmac('sha512', webhookHashKey)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Send a mobile money payout (transfer) via Lenco.
 * @returns {Promise<Object>} Lenco transfer data (includes status, reference, lencoReference)
 */
async function sendPayout({ amount, reference, phone, operator, narration }) {
  try {
    const { data } = await lenco.post('/transfers/mobile-money', {
      accountId: process.env.LENCO_ACCOUNT_ID,
      amount,
      currency: 'ZMW',
      reference,
      narration,
      phone,
      operator: String(operator).toLowerCase(),
      country: 'zm',
    });
    return data.data;
  } catch (err) {
    const apiError = err.response?.data || { message: err.message };
    console.error('[paymentService.sendPayout] error:', apiError);
    throw new Error(apiError.message || 'Failed to send payout');
  }
}

/**
 * Verify / re-query a transfer's status by reference.
 * @returns {Promise<Object>} Lenco transfer data (status: pending|successful|failed)
 */
async function verifyTransferStatus(reference) {
  try {
    const { data } = await lenco.get(`/transfers/status/${encodeURIComponent(reference)}`);
    return data.data;
  } catch (err) {
    const apiError = err.response?.data || { message: err.message };
    console.error('[paymentService.verifyTransferStatus] error:', apiError);
    throw new Error(apiError.message || 'Failed to verify transfer status');
  }
}

module.exports = {
  ...module.exports,   // keep initiateMomoPush, verifyCollectionStatus, verifyWebhookSignature
  sendPayout,
  verifyTransferStatus,
};
