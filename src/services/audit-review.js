'use strict';
const db = require('../db');
const audit = require('../lib/audit');
const { run } = require('../lib/action');
const { requirePerm } = require('../lib/acl');
const { BusinessError, NotFoundError } = require('../lib/errors');
const { nowStr } = require('../lib/time');
const { computePayslip } = require('./payroll');
const { text } = require('./admin');

async function discrepancies() {
  const [journals, invoices, payroll, stock] = await Promise.all([
    db.query(`SELECT j.id, j.number, j.total_debit, j.total_credit,
      COALESCE(SUM(l.debit), 0) AS actual_debit, COALESCE(SUM(l.credit), 0) AS actual_credit
      FROM journal_entries j LEFT JOIN journal_lines l ON l.entry_id = j.id
      WHERE j.state = 'posted' GROUP BY j.id, j.number, j.total_debit, j.total_credit
      HAVING COUNT(l.id) = 0 OR actual_debit <> actual_credit OR actual_debit <> j.total_debit OR actual_credit <> j.total_credit`),
    db.query(`SELECT i.id, i.number,
      CONCAT('/invoicing/invoices/', i.id) AS href
      FROM invoices i LEFT JOIN journal_entries j ON j.id = i.journal_entry_id
      LEFT JOIN (SELECT invoice_id, SUM(amount) AS amount FROM reconciliations GROUP BY invoice_id) r ON r.invoice_id = i.id
      WHERE i.state = 'posted' AND (j.id IS NULL OR j.state <> 'posted'
        OR i.amount_untaxed + i.amount_tax <> i.amount_total
        OR (i.move_type <> 'out_refund' AND i.amount_residual <> i.amount_total - COALESCE(r.amount, 0)))`),
    db.query(`SELECT p.id, p.number, p.state, p.base_salary, p.fixed_allowance, p.planned_days, p.attended_days,
      p.base_paid, p.allowance_paid, p.gross, p.net, j.state AS journal_state, b.state AS payment_state
      FROM payslips p LEFT JOIN journal_entries j ON j.id = p.journal_entry_id
      LEFT JOIN journal_entries b ON b.id = p.payment_entry_id`),
    db.query(`SELECT p.sku, l.code, q.on_hand, q.reserved FROM stock_quants q
      JOIN products p ON p.id = q.product_id JOIN locations l ON l.id = q.location_id
      WHERE q.on_hand < 0 OR q.reserved < 0 OR q.reserved > q.on_hand`),
  ]);
  const payrollFindings = payroll.flatMap((p) => {
    const expected = p.planned_days > 0 && p.attended_days >= 0 && p.attended_days <= p.planned_days
      ? computePayslip({ baseSalary: p.base_salary, allowance: p.fixed_allowance, plannedDays: p.planned_days, attendedDays: p.attended_days })
      : null;
    const findings = [];
    if (!expected || expected.basePaid !== p.base_paid || expected.allowancePaid !== p.allowance_paid ||
        expected.gross !== p.gross || expected.net !== p.net) {
      findings.push('Hari hadir atau nilai payslip perlu diperiksa.');
    }
    if ((['posted', 'paid'].includes(p.state) && p.journal_state !== 'posted') || (p.state === 'paid' && p.payment_state !== 'posted')) {
      findings.push('Jurnal posting atau pembayaran belum sesuai status payslip.');
    }
    return findings.map((reason) => ({ area: 'Payroll', reference: p.number, href: `/payroll/${p.id}`, reason }));
  });
  return [
    ...journals.map((j) => ({ area: 'Keuangan', reference: j.number, href: `/accounting/entries/${j.id}`,
      reason: 'Jurnal tanpa baris atau total debit/kredit tidak sesuai.' })),
    ...invoices.map((i) => ({ area: 'Keuangan', reference: i.number, href: i.href, reason: 'Total, sisa tagihan, atau jurnal posting perlu diperiksa.' })),
    ...payrollFindings,
    ...stock.map((s) => ({ area: 'Stok', reference: `${s.sku} · ${s.code}`, href: '/inventory/stock',
      reason: `Stok sistem ${s.on_hand}, reservasi ${s.reserved}. Periksa saldo dan reservasi.` })),
  ];
}

async function reports() {
  return db.query('SELECT id, title, author, created_at FROM audit_reports ORDER BY id DESC LIMIT 200');
}

async function report(id) {
  const row = await db.one('SELECT id, title, body, author, created_at, stock_snapshot FROM audit_reports WHERE id = ?', [id]);
  if (!row) throw new NotFoundError('Laporan audit tidak ditemukan.');
  if (typeof row.stock_snapshot === 'string') row.stock_snapshot = JSON.parse(row.stock_snapshot);
  return row;
}

async function stockSnapshot(conn, input) {
  if (!input.sku && !input.location && !input.physical) return null;
  const sku = text(input.sku, 30, 'SKU');
  const location = text(input.location, 20, 'Lokasi');
  const physical = Number(input.physical);
  if (!/^\d+$/.test(String(input.physical ?? '')) || !Number.isSafeInteger(physical) || physical > 2147483647) {
    throw new BusinessError('Jumlah fisik harus berupa bilangan bulat dari 0 hingga 2147483647.');
  }
  const stock = await db.q1(conn, `SELECT p.sku, l.code AS location, COALESCE(q.on_hand, 0) AS system_qty
    FROM products p CROSS JOIN locations l LEFT JOIN stock_quants q ON q.product_id = p.id AND q.location_id = l.id
    WHERE p.sku = ? AND l.code = ? AND l.usage_type = 'internal'`, [sku, location]);
  if (!stock) throw new BusinessError('SKU atau lokasi internal tidak ditemukan.');
  return { ...stock, physical, difference: physical - stock.system_qty };
}

async function saveReport(ctx, body) {
  return run(ctx, { action: 'AUDIT_REPORT_CREATE', docType: 'audit.report' }, async (conn) => {
    requirePerm(ctx, 'audit.review');
    const title = text(body.title, 120, 'Judul');
    const note = text(body.body, 8000, 'Temuan dan bukti');
    const stock = await stockSnapshot(conn, body);
    const result = await db.q(conn, `INSERT INTO audit_reports (title, body, author_id, author, stock_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`, [title, note, ctx.user.id, ctx.user.username, stock && JSON.stringify(stock), nowStr()]);
    await audit.log(conn, ctx, { action: 'AUDIT_REPORT_CREATE', docType: 'audit.report', docId: result.insertId });
    return result.insertId;
  });
}

module.exports = { discrepancies, reports, report, saveReport };
