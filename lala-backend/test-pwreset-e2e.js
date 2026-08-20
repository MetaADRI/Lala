const BASE = 'http://localhost:5000/api';
const TEST_EMAIL = `pwreset-${Date.now()}@lalabookings.com`;
const TEST_PASS = 'Test1234!';
const NEW_PASS  = 'NewPass5678!';
const MAX_RESETS = 3;

let passed = 0;
let failed = 0;
function assert(label, condition, detail) {
  if (condition) { passed++; console.log(`  PASS ${label}`); }
  else { failed++; console.log(`  FAIL ${label} — ${detail || 'condition not met'}`); }
}

async function req(method, path, body, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}

(async () => {
  // ── Setup: register + confirm a user ──
  console.log('\n=== Setup: register + confirm ===');
  const reg = await req('POST', '/auth/register', { email: TEST_EMAIL, password: TEST_PASS, name: 'PW Reset Test' });
  assert('register returns 201', reg.status === 201, reg.status);

  const confirmToken = reg.data.devToken;
  const cf = await req('POST', '/auth/confirm-email', { token: confirmToken });
  assert('email confirmed', cf.status === 200, cf.status);

  // Login to get JWT
  const login1 = await req('POST', '/auth/login', { email: TEST_EMAIL, password: TEST_PASS });
  assert('login returns OTP required', login1.data.requiresOTP === true, JSON.stringify(login1.data));
  const otp1 = await req('POST', '/auth/verify-otp', { email: TEST_EMAIL, code: login1.data.devOTP });
  assert('verify OTP returns JWT', !!otp1.data.token, JSON.stringify(otp1.data));
  const jwt = otp1.data.token;

  // ── Test 1: forgot-password returns devResetUrl ──
  console.log('\n=== Forgot Password ===');
  const fp = await req('POST', '/auth/forgot-password', { email: TEST_EMAIL });
  assert('forgot-password returns 200', fp.status === 200, fp.status);
  assert('returns devResetUrl', !!fp.data.devResetUrl, JSON.stringify(fp.data));
  assert('returns devToken', !!fp.data.devToken, JSON.stringify(fp.data));

  const resetToken = fp.data.devToken;

  // ── Test 2: reset password with token ──
  console.log('\n=== Reset Password ===');
  const rp = await req('POST', '/auth/reset-password', { token: resetToken, password: NEW_PASS });
  assert('reset-password returns 200', rp.status === 200, rp.status);
  assert('returns passwordResetsRemaining', rp.data.passwordResetsRemaining === (MAX_RESETS - 1), JSON.stringify(rp.data));

  // ── Test 3: old password no longer works ──
  console.log('\n=== Old password rejected ===');
  const oldLogin = await req('POST', '/auth/login', { email: TEST_EMAIL, password: TEST_PASS });
  assert('old password rejected', oldLogin.status === 400, oldLogin.status);

  // ── Test 4: new password works ──
  console.log('\n=== New password works ===');
  const newLogin = await req('POST', '/auth/login', { email: TEST_EMAIL, password: NEW_PASS });
  assert('new password accepted', newLogin.status === 200, newLogin.status);
  assert('returns requiresOTP', newLogin.data.requiresOTP === true, JSON.stringify(newLogin.data));

  // ── Test 5: token single-use ──
  console.log('\n=== Token single-use ===');
  const reuse = await req('POST', '/auth/reset-password', { token: resetToken, password: 'Xx123456!' });
  assert('reused token rejected', reuse.status === 400, reuse.status);

  // ── Test 6: max 3 resets lifetime ──
  console.log('\n=== Max 3 resets ===');
  let currentPass = NEW_PASS;
  for (let i = 2; i <= MAX_RESETS; i++) {
    const fpI = await req('POST', '/auth/forgot-password', { email: TEST_EMAIL });
    assert(`forgot-password attempt ${i} succeeds`, fpI.status === 200, fpI.status);

    const rpI = await req('POST', '/auth/reset-password', { token: fpI.data.devToken, password: `ResetPass${i}!!` });
    assert(`reset ${i} succeeds`, rpI.status === 200, rpI.status);
    currentPass = `ResetPass${i}!!`;
  }

  // ── Test 7: 4th reset blocked ──
  console.log('\n=== 4th reset blocked ===');
  const blocked = await req('POST', '/auth/forgot-password', { email: TEST_EMAIL });
  assert('4th forgot-password blocked', blocked.status === 403, blocked.status);
  assert('error mentions support', (blocked.data.error || '').toLowerCase().includes('support'), blocked.data.error);

  // ── Test 8: expired token ──
  console.log('\n=== Expired token ===');
  const PasswordResetToken = require('./models/PasswordResetToken');
  const expired = await PasswordResetToken.create({
    email: TEST_EMAIL,
    token: 'expired-token-1234567890abcdef',
    expiresAt: new Date(Date.now() - 60000), // 1 minute ago
  });
  const expR = await req('POST', '/auth/reset-password', { token: 'expired-token-1234567890abcdef', password: 'Xx123456!' });
  assert('expired token rejected', expR.status === 400, expR.status);
  assert('error mentions expired', (expR.data.error || '').toLowerCase().includes('expired'), expR.data.error);

  // ── Test 9: invalid token ──
  console.log('\n=== Invalid token ===');
  const invR = await req('POST', '/auth/reset-password', { token: 'totally-fake-token', password: 'Xx123456!' });
  assert('invalid token rejected', invR.status === 400, invR.status);

  // ── Summary ──
  console.log(`\nE2E: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
