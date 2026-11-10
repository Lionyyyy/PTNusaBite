'use strict';
const db = require('../db');
const ui = require('../lib/ui');
const { can, GRANTS } = require('../lib/acl');
const { nowStr } = require('../lib/time');
const admin = require('../services/admin');

module.exports = (app) => {
  app.get('/admin', ui.need('admin.manage'), async (req, res) => {
    res.locals.setApp('administration');
    const [users, roles, companyConfig, activity] = await Promise.all([
      db.query('SELECT id, username, full_name, role, active FROM users ORDER BY username'),
      admin.roles(),
      db.one('SELECT name, short_name, city, currency FROM company WHERE id = 1'),
      db.one(`SELECT COUNT(*) AS events, SUM(result <> 'ok') AS blocked,
        SUM(action = 'LOGIN_FAILED') AS login_failures, SUM(action = 'SERVER_ERROR') AS server_errors
        FROM audit_logs WHERE ts >= CAST(? AS DATETIME) - INTERVAL 24 HOUR`, [nowStr()]),
    ]);
    res.render('pages/admin', { users, roles, grants: GRANTS, companyConfig, activity });
  });

  app.post('/admin/users', ui.need('admin.manage'), async (req, res) => {
    await admin.saveUser(ui.ctx(req), req.body);
    ui.flash(req, 'success', 'Akun dibuat.');
    res.redirect('/admin#users');
  });
  app.post('/admin/users/:id', ui.need('admin.manage'), async (req, res) => {
    await admin.saveUser(ui.ctx(req), req.body, Number(req.params.id));
    ui.flash(req, 'success', 'Akun diperbarui.');
    res.redirect('/admin#users');
  });
  app.post('/admin/roles', ui.need('admin.manage'), async (req, res) => {
    await admin.saveRole(ui.ctx(req), req.body);
    ui.flash(req, 'success', 'Peran dibuat.');
    res.redirect('/admin#roles');
  });
  app.post('/admin/roles/:code', ui.need('admin.manage'), async (req, res) => {
    await admin.saveRole(ui.ctx(req), req.body, req.params.code);
    ui.flash(req, 'success', 'Hak akses peran diperbarui.');
    res.redirect('/admin#roles');
  });
  app.post('/admin/config', ui.need('admin.manage'), async (req, res) => {
    await admin.saveCompany(ui.ctx(req), req.body);
    ui.flash(req, 'success', 'Konfigurasi disimpan.');
    res.redirect('/admin#configuration');
  });

  app.get('/admin/catalog', ui.need('masterdata.view'), async (req, res) => {
    res.locals.setApp('administration');
    const allowed = Object.fromEntries(['create', 'update', 'delete'].map((op) => [op, can(req.user, 'masterdata.manage', op)]));
    res.render('pages/master_catalog', { rows: await admin.catalog(), allowed });
  });
  for (const operation of ['create', 'update', 'delete']) {
    app.post(`/admin/catalog/${operation}`, ui.need('masterdata.view'), async (req, res) => {
      await admin.saveCatalog(ui.ctx(req), req.body, operation);
      ui.flash(req, 'success', 'Master data diperbarui.');
      res.redirect('/admin/catalog');
    });
  }
};
