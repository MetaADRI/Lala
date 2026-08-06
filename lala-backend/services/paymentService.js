const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

const LENCO_API_URL = process.env.LENCO_API_URL;
const LENCO_API_KEY = process.env.LENCO_API_KEY;

if (!LENCO_API_KEY) {
  logger.warn('payment.env.missing', { var: 'LENCO_API_KEY', detail: 'payments will fail' });
}
if (!process.env.LENCO_ACCOUNT_ID) {
  logger.warn('payment.env.missing', { var: 'LENCO_ACCOUNT_ID', detail: 'lodge/commission payouts will fail' });
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
  logger.info('lenco.collection.start', {
    reference,
    amount,
    operator: String(operator).toLowerCase(),
    phone: logger.maskPhone(phone),
  });
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
    logger.info('lenco.collection.done', {
      reference,
      lencoReference: data?.data?.lencoReference,
      status: data?.data?.status,
    });
    return data.data;
  } catch (err) {
    const apiError = err.response?.data || { message: err.message };
    logger.error('lenco.collection.error', {
      reference,
      amount,
      operator: String(operator).toLowerCase(),
      phone: logger.maskPhone(phone),
      apiError: JSON.stringify(apiError),
      err: err.message,
    });
    throw new Error(apiError.message || 'Failed to initiate mobile money payment');
  }
}

async function verifyCollectionStatus(reference) {
  logger.info('lenco.status.start', { reference });
  try {
    const { data } = await lenco.get(`/collections/status/${encodeURIComponent(reference)}`);
    logger.info('lenco.status.done', { reference, status: data?.data?.status });
    return data.data;
  } catch (err) {
    const apiError = err.response?.data || { message: err.message };
    logger.error('lenco.status.error', { reference, apiError: JSON.stringify(apiError), err: err.message });
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
  logger.info('lenco.transfer.start', {
    reference,
    amount,
    operator: String(operator).toLowerCase(),
    narration,
    phone: logger.maskPhone(phone),
  });
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
    logger.info('lenco.transfer.done', {
      reference,
      lencoReference: data?.data?.lencoReference,
      status: data?.data?.status,
    });
    return data.data;
  } catch (err) {
    const apiError = err.response?.data || { message: err.message };
    logger.error('lenco.transfer.error', {
      reference,
      amount,
      operator: String(operator).toLowerCase(),
      narration,
      phone: logger.maskPhone(phone),
      apiError: JSON.stringify(apiError),
      err: err.message,
    });
    throw new Error(apiError.message || 'Failed to send payout');
  }
}

/**
 * Verify / re-query a transfer's status by reference.
 * @returns {Promise<Object>} Lenco transfer data (status: pending|successful|failed)
 */
async function verifyTransferStatus(reference) {
  logger.info('lenco.transfer-status.start', { reference });
  try {
    const { data } = await lenco.get(`/transfers/status/${encodeURIComponent(reference)}`);
    logger.info('lenco.transfer-status.done', { reference, status: data?.data?.status });
    return data.data;
  } catch (err) {
    const apiError = err.response?.data || { message: err.message };
    logger.error('lenco.transfer-status.error', { reference, apiError: JSON.stringify(apiError), err: err.message });
    throw new Error(apiError.message || 'Failed to verify transfer status');
  }
}

module.exports = {
  initiateMomoPush,
  verifyCollectionStatus,
  verifyWebhookSignature,
  sendPayout,
  verifyTransferStatus,
};
