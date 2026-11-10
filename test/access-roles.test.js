'use strict';
const { test } = require('node:test');
const { once } = require('node:events');
const { assert, db, fresh } = require('./helpers');
const { createApp } = require('../src/app');
const { ensureAccessSchema } = require('../src/access-schema');
const { can } = require('../src/lib/acl');

function client(base) {
  const cookies = new Map();
  let csrf = '';
  return async (path, form) => {
    const headers = { cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') };
    const body = form && new URLSearchParams(Object.entries({ ...form, _csrf: csrf }).flatMap(([key, value]) =>
      [].concat(value).map((item) => [key, item])));
    const response = await globalThis.fetch(base + path, {
      headers, redirect: 'manual', method: form ? 'POST' : 'GET', body,
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const equals = pair.indexOf('=');
      cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
    const html = await response.text();
    csrf = html.match(/name="_csrf" value="([^"]+)"/)?.[1] || csrf;
    return { status: response.status, location: response.headers.get('location'), html };
  };
}

test('Custom grants distinguish create, read, update, delete and approval', () => {
  const user = { role: 'special', grants: ['sales.view', 'sales.edit:create', 'masterdata.manage:delete', 'payroll.prepare:approve', 'admin.manage'] };
  assert.ok(can(user, 'sales.view'));
  assert.ok(can(user, 'sales.edit', 'create'));
  assert.ok(!can(user, 'sales.edit', 'update'));
  assert.ok(can(user, 'masterdata.manage', 'delete'));
  assert.ok(!can(user, 'masterdata.manage', 'create'));
  assert.ok(can(user, 'payroll.prepare', 'approve'));
  assert.ok(!can(user, 'payroll.prepare', 'create'));
  assert.ok(!can(user, 'admin.manage'));
});

test('Migrates old data and enforces Master Admin and Audit through HTTP', async (t) => {
  await fresh();
  const before = await db.one('SELECT COUNT(*) AS count FROM sale_orders');
  t.after(async () => {
    delete process.env.MASTER_ADMIN_INITIAL_PASSWORD;
    await db.closePool();
  });
  const password = 'integration-only-1!';
  process.env.MASTER_ADMIN_INITIAL_PASSWORD = password;
  await ensureAccessSchema();
  await ensureAccessSchema();
  assert.deepEqual(await db.one('SELECT COUNT(*) AS count FROM sale_orders'), before);
  assert.equal((await db.one("SELECT COUNT(*) AS count FROM users WHERE role = 'master_admin'")).count, 1);
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function signIn(username, credential) {
    const request = client(base);
    assert.equal((await request('/login')).status, 200);
    const login = await request('/login', { username, password: credential });
    assert.equal(login.location, '/');
    assert.equal((await request('/')).status, 200);
    return request;
  }

  const master = await signIn('master.admin', password);
  assert.equal((await master('/admin')).status, 200);
  assert.equal((await master('/sales/orders')).status, 403);
  assert.equal((await master('/admin/users', { username: 'auditor.test', full_name: 'Auditor Test', role: 'audit', password, active: '1' })).status, 302);
  assert.equal((await master('/admin/catalog')).status, 200);
  assert.equal((await master('/admin/roles', { code: 'quote_test', label: 'Quotation creator', permissions: ['sales.view', 'sales.edit:create'] })).location, '/admin#roles');
  assert.equal((await master('/admin/users', { username: 'quoter.test', full_name: 'Quoter Test', role: 'quote_test', password, active: '1' })).status, 302);
  const quoter = await signIn('quoter.test', password);
  assert.equal((await quoter('/sales/orders/new')).status, 200);
  const order = await db.one('SELECT id FROM sale_orders LIMIT 1');
  assert.equal((await quoter(`/sales/orders/${order.id}/edit`, {})).status, 403);
  assert.equal((await master('/admin/roles/quote_test', { label: 'Quotation reader', permissions: 'sales.view' })).status, 302);
  assert.equal((await quoter('/sales/orders/new')).status, 403);
  assert.equal((await master('/admin/catalog/create', { kind: 'department', code: 'QA', name: 'Quality Assurance' })).status, 302);
  assert.equal((await db.one("SELECT name FROM master_catalog WHERE kind = 'department' AND code = 'QA'")).name, 'Quality Assurance');
  assert.equal((await master('/admin/catalog/delete', { kind: 'department', code: 'QA' })).status, 302);

  const auditor = await signIn('auditor.test', password);
  assert.equal((await auditor('/audit/review')).status, 200);
  assert.equal((await auditor('/sales/orders')).status, 200);
  assert.equal((await auditor('/audit?f=changes')).status, 200);
  assert.equal((await auditor('/admin')).status, 403);
  assert.equal((await auditor('/sales/orders/new', {})).status, 403);
  assert.equal((await auditor('/payroll/generate', { period: '2026-10' })).status, 403);
  assert.equal((await auditor('/notes', { doc_type: 'sale.order', doc_id: '1', body: 'blocked note' })).status, 302);
  assert.equal(await db.one("SELECT id FROM messages WHERE body = 'blocked note'"), null);
  const report = await auditor('/audit/reports', { title: 'Hitung fisik', body: 'Selisih harus ditelusuri.', sku: 'BRG-REG', location: 'OUTLET-SUD', physical: '0' });
  assert.match(report.location, /^\/audit\/reports\/\d+$/);
  assert.match((await auditor(report.location)).html, /Perbandingan stok fisik/);
  assert.equal((await db.one("SELECT on_hand FROM stock_quants q JOIN products p ON p.id=q.product_id JOIN locations l ON l.id=q.location_id WHERE p.sku='BRG-REG' AND l.code='OUTLET-SUD'")).on_hand, 18);
  assert.equal((await master(report.location)).status, 403);

  const account = await db.one("SELECT id FROM users WHERE username = 'auditor.test'");
  assert.equal((await master(`/admin/users/${account.id}`, { full_name: 'Auditor Test', role: 'audit', active: '0' })).status, 302);
  assert.match((await auditor('/audit/review')).location, /^\/login/);
});
