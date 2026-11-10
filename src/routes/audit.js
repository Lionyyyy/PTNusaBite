'use strict';
const db = require('../db');
const { can } = require('../lib/acl');
const review = require('../services/audit-review');
const ui = require('../lib/ui');
const { buildList, arr } = require('../lib/listview');
const auditsvc = require('../services/auditsvc');

module.exports = (app) => {
  app.get('/audit', ui.need('audit.view'), async (req, res) => {
    res.locals.setApp('audit');
    const includeRestricted = can(req.user, 'admin.manage') || can(req.user, 'audit.review');
    const pageSize = 100;
    const before = /^\d{1,20}$/.test(req.query.before) ? req.query.before : null;
    const rows = await auditsvc.listLogs({
      limit: pageSize + 1, includeRestricted, before,
      q: String(req.query.q || '').trim().slice(0, 200), filters: arr(req.query.f),
    });
    const hasOlder = rows.length > pageSize;
    if (hasOlder) rows.pop();
    const list = buildList(req, rows, {
      search: ['doc_number', 'username', 'action', 'message', 'doc_type'],
      filters: [
        { key: 'blocked', label: 'Ditolak (denied / rejected)', group: 'r', test: (r) => r.result !== 'ok' },
        { key: 'changes', label: 'Riwayat perubahan', group: 'type', test: (r) => r.result === 'ok' && !['LOGIN', 'LOGOUT', 'LOG_NOTE'].includes(r.action) },
        { key: 'ok', label: 'OK', group: 'r', test: (r) => r.result === 'ok' },
        { key: 'denied', label: 'Akses ditolak (SR-13)', group: 'r2', test: (r) => r.result === 'denied' },
      ],
      groupBys: [
        { key: 'user', label: 'Actor', value: (r) => r.username },
        { key: 'action', label: 'Action', value: (r) => r.action },
        { key: 'doc', label: 'Document', value: (r) => r.doc_number || '—' },
        { key: 'result', label: 'Result', value: (r) => r.result },
      ],
    });
    const navigation = new URLSearchParams(list.params());
    const latest = ui.escapeHtml(navigation.toString());
    if (hasOlder) navigation.set('before', rows.at(-1).id);
    const older = ui.escapeHtml(navigation.toString());
    res.render('pages/list_page', {
      title: 'Audit Log',
      cp: { crumbs: [{ label: 'Audit' }, { label: 'Audit Log' }], list, actions: '<form method="get" action="/audit/trace" class="inline" style="display:flex;gap:6px"><input class="input" name="number" placeholder="S00008" style="width:120px"><button class="btn">Trace</button></form>' },
      intro: 'Setiap perubahan kritis dan setiap upaya yang ditolak mencatat <b>actor, time, action, document</b> (SR-13). Result <b>denied</b> = hak akses, <b>rejected</b> = aturan bisnis/constraint.' +
        (before ? ` <a href="/audit?${latest}">Terbaru</a>` : '') +
        (hasOlder ? ` <a href="/audit?${older}">Aktivitas lebih lama →</a>` : ''),
      columns: [
        { label: 'Time', value: (r) => String(r.ts).slice(0, 19) },
        { label: 'Actor', value: (r) => r.username },
        { label: 'Role', value: (r) => r.role },
        { label: 'Action', html: (r) => `<code>${ui.escapeHtml(r.action)}</code>` },
        { label: 'Document', value: (r) => r.doc_number || (r.doc_type ? `${r.doc_type}${r.doc_id ? ` #${r.doc_id}` : ''}` : '') },
        { label: 'Result', html: (r) => ui.badge(r.result) },
        { label: 'Message', value: (r) => r.message || '' },
        ...(includeRestricted ? [{ label: 'Detail', html: (r) => r.detail
          ? `<details><summary>Lihat</summary><pre style="white-space:pre-wrap">${ui.escapeHtml(typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail, null, 2))}</pre></details>` : '' }] : []),
      ],
      href: null,
    });
  });

  app.get('/audit/review', ui.need('audit.review'), async (req, res) => {
    res.locals.setApp('audit');
    const [findings, reports, products, locations] = await Promise.all([
      review.discrepancies(), review.reports(),
      db.query('SELECT sku, name FROM products ORDER BY sku'),
      db.query("SELECT code, name FROM locations WHERE usage_type = 'internal' ORDER BY code"),
    ]);
    res.render('pages/audit_review', { findings, reports, products, locations });
  });

  app.post('/audit/reports', ui.need('audit.review'), async (req, res) => {
    const id = await review.saveReport(ui.ctx(req), req.body);
    ui.flash(req, 'success', 'Laporan audit disimpan.');
    res.redirect(`/audit/reports/${id}`);
  });

  app.get('/audit/reports/:id', ui.need('audit.review'), async (req, res) => {
    res.locals.setApp('audit');
    res.render('pages/audit_report', { report: await review.report(Number(req.params.id)) });
  });

  app.get('/audit/trace', ui.need('audit.view'), async (req, res) => {
    res.locals.setApp('audit');
    const number = String(req.query.number || 'S00008').trim().toUpperCase();
    const t = await auditsvc.trace(number);
    res.render('pages/trace', { title: `Trace ${number}`, number, t });
  });
};
