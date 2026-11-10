'use strict';
const config = require('../config');
const auth = require('../services/auth');
const ui = require('../lib/ui');
const audit = require('../lib/audit');

const DEMO = [
  ['sales.demo', 'Sales', 'Quotation, SO, CRM'],
  ['warehouse.demo', 'Warehouse', 'Delivery, Receipt/QC, Transfer, PO'],
  ['finance.demo', 'Finance', 'Invoice, Bill, Payment, Jurnal'],
  ['hr.demo', 'HR', 'Employees, Payslip'],
  ['cashier.demo', 'Cashier', 'Quick Counter Order'],
  ['owner.demo', 'Owner', 'Semua + persetujuan'],
];

function safeNext(n) {
  return typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

module.exports = (app) => {
  app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('pages/login', { next: safeNext(req.query.next), username: '', demoAccounts: DEMO, demoPassword: config.demoPassword });
  });

  app.post('/login', async (req, res) => {
    const user = await auth.login(req.body.username, req.body.password);
    if (!user) {
      ui.flash(req, 'error', 'Username atau password salah.');
      return res.redirect(`/login?next=${encodeURIComponent(safeNext(req.body.next))}`);
    }
    req.session.csrf = null;
    req.session.uid = user.id;
    req.session.version = user.version;
    req.session.username = user.username;
    res.redirect(safeNext(req.body.next));
  });

  app.post('/logout', async (req, res) => {
    if (req.user) await audit.logOutside(ui.ctx(req), { action: 'LOGOUT', docType: 'res.users', docId: req.user.id });
    req.session = null;
    res.redirect('/login');
  });
};
