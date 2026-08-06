// utils/logger.js
// Minimal structured logger (JSON lines) — zero dependencies, 2G-friendly.
// Every entry is one greppable JSON object: { level, event, ts, ...fields }.
// Money-path events should pass bookingId/reference/amount so a single
// booking's whole lifecycle is traceable end-to-end.

function maskPhone(phone) {
  if (phone == null) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 5) return '***';
  return '******' + digits.slice(-4);
}

function write(level, event, fields) {
  const line = JSON.stringify({
    level,
    event,
    ts: new Date().toISOString(),
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const logger = {
  info: (event, fields = {}) => write('info', event, fields),
  warn: (event, fields = {}) => write('warn', event, fields),
  error: (event, fields = {}) => write('error', event, fields),
  maskPhone,
};

module.exports = logger;
