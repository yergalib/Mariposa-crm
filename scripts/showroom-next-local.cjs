// Requires a completed local Next build. No .env files or real database permitted.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const net = require('node:net'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const f of fs.readdirSync(root)) assert(!/^\.env(?:\.|$)/.test(f) || f.endsWith('.example'), 'Remove real env from isolated test checkout');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, { DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic', NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' });
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
  const origin = 'http://localhost:' + port;
  try {
    let ready = false; for (let i = 0; i < 100; i++) { try { const r = await fetch(origin + '/login'); if (r.ok) { ready = true; break; } } catch {} await delay(100); }
    assert(ready, 'local Next startup');
    for (const route of ['/showroom', '/showroom?view=contacts', '/showroom?view=fitting', '/showroom?view=catalog']) {
      const r = await fetch(origin + route); assert.equal(r.status, 200, route); const html = await r.text(); assert(html.includes('MARIPOSA'));
      if (route.endsWith('fitting')) { assert(html.includes('Онлайн-отправка заявок пока не открыта')); assert(!html.includes('name="replyContact"')); }
    }
    for (const route of ['/orders', '/products', '/showroom/private', '/api/showroom/private']) { const r = await fetch(origin + route, { redirect: 'manual' }); assert.equal(r.status, 307, route); assert(new URL(r.headers.get('location'), origin).pathname === '/login'); }
    const api = await fetch(origin + '/api/v1/rental/branches'); assert.equal(api.status, 401); assert.deepEqual(await api.json(), { error: { code: 'UNAUTHORIZED' } });
    const intake = await fetch(origin + '/api/showroom/inquiries', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(intake.status, 503); assert((await intake.json()).error.includes('пока не открыта'));
    const assistant = await fetch(origin + '/api/showroom/assistant', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(assistant.status, 401, JSON.stringify(await assistant.json()));
    const photo = await fetch(origin + '/api/showroom/photo?imageId=invalid'); assert.equal(photo.status,404); assert.equal(photo.headers.get('cache-control'),'private, no-store');
    const logo = await fetch(origin + '/brand/mariposa-logo.png'); assert.equal(logo.status, 200); assert(logo.headers.get('content-type').startsWith('image/'));
    console.log('PASS: actual built Next routes; anonymous home/contacts/fitting; unavailable catalog fails closed; CRM redirects and API 401 preserved; closed intake rejects empty request before DB; staff-only assistant; approved public logo. No real env/DB.');
  } finally { child.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
