// config/envValidation.js
// Fails fast at startup when required environment variables are missing, instead of
// failing later mid-request. No secrets, wallet numbers, or credentials are ever
// hardcoded — the app refuses to guess.
require('dotenv').config();

const REQUIRED_ENV_VARS = [
  // Database & auth
  'DATABASE_URL',
  'JWT_SECRET',

  // Lenco (mobile money collections + payouts)
  'LENCO_API_URL',
  'LENCO_API_KEY',
  'LENCO_ACCOUNT_ID',

  // Commission wallet numbers (payment settlement must never guess a destination)
  'MTN_WALLET',
  'ZAMTEL_WALLET',
  'AIRTEL_WALLET',

  // Email (password resets)
  'RESEND_API_KEY',
];

/**
 * Throws a clear Error listing every missing required env var.
 * Call once at process startup (see server.js) before anything else touches the env.
 */
function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter(
    (name) => !process.env[name] || !String(process.env[name]).trim()
  );

  if (missing.length > 0) {
    throw new Error(
      '❌ Startup aborted — missing required environment variable(s):\n' +
        missing.map((name) => `  - ${name}`).join('\n') +
        '\n\nSet these in the Render dashboard (Environment tab) or your local .env. ' +
        'No wallet numbers or secrets are hardcoded; the app refuses to guess.'
    );
  }

  console.log('✓ Environment validated: all required variables present.');
}

module.exports = { validateEnv, REQUIRED_ENV_VARS };
