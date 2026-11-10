'use strict';
const bcrypt = require('bcryptjs');
const db = require('../db');
const audit = require('../lib/audit');
const { run } = require('../lib/action');
const { ROLES, GRANTS, requirePerm } = require('../lib/acl');
const { BusinessError, NotFoundError } = require('../lib/errors');

function text(value, max, label) {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  if (!cleaned || cleaned.length > max) throw new BusinessError(`${label} wajib diisi (maksimal ${max} karakter).`);
  return cleaned;
}

async function roles() {
  const custom = await db.query('SELECT code, label, permissions FROM access_roles ORDER BY code');
  return Object.entries(ROLES).map(([code, label]) => ({ code, label, fixed: true }))
    .concat(custom.map((role) => ({ ...role, permissions: typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions })));
}

async function saveRole(ctx, body, key) {
  return run(ctx, { action: key ? 'ROLE_UPDATE' : 'ROLE_CREATE', docType: 'admin.role' }, async (conn) => {
    requirePerm(ctx, 'admin.manage');
    const code = key || text(body.code, 20, 'Kode peran').toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,19}$/.test(code) || Object.hasOwn(ROLES, code)) {
      throw new BusinessError('Gunakan kode peran baru berisi 2–20 huruf kecil, angka, atau garis bawah.');
    }
    const label = text(body.label, 80, 'Nama peran');
    const requested = [].concat(body.permissions || []);
    const permissions = GRANTS.filter((grant) => requested.includes(grant));
    if (requested.some((grant) => !GRANTS.includes(grant))) throw new BusinessError('Ada hak akses yang tidak dapat didelegasikan.');
    const previous = key && await db.q1(conn, 'SELECT label, permissions FROM access_roles WHERE code = ? FOR UPDATE', [code]);
    if (key && !previous) throw new NotFoundError('Peran tidak ditemukan.');
    if (key) await db.q(conn, 'UPDATE access_roles SET label = ?, permissions = ? WHERE code = ?', [label, JSON.stringify(permissions), code]);
    else await db.q(conn, 'INSERT INTO access_roles (code, label, permissions) VALUES (?, ?, ?)', [code, label, JSON.stringify(permissions)]);
    await audit.log(conn, ctx, { action: key ? 'ROLE_UPDATE' : 'ROLE_CREATE', docType: 'admin.role',
      docNumber: code, detail: { previous, next: { label, permissions } } });
  });
}

async function saveUser(ctx, body, id) {
  requirePerm(ctx, 'admin.manage');
  if (id !== undefined && (!Number.isSafeInteger(id) || id < 1)) throw new NotFoundError('Pengguna tidak ditemukan.');
  const username = id ? null : text(body.username, 40, 'Username').toLowerCase();
  if (username && (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) || username.endsWith('.demo'))) {
    throw new BusinessError('Username harus 3–40 karakter dan memakai huruf, angka, titik, garis bawah, atau tanda hubung. Akhiran .demo dicadangkan.');
  }
  const name = text(body.full_name, 120, 'Nama pengguna');
  const role = text(body.role, 20, 'Peran');
  const password = typeof body.password === 'string' ? body.password : '';
  if ((!id || password) && (password.length < 12 || Buffer.byteLength(password) > 72)) {
    throw new BusinessError('Kata sandi harus minimal 12 karakter dan maksimal 72 byte.');
  }
  const passwordHash = password ? await bcrypt.hash(password, 12) : null;
  const active = body.active === '1' ? 1 : 0;
  const action = id ? 'USER_UPDATE' : 'USER_CREATE';
  return run(ctx, { action, docType: 'admin.user', docId: id }, async (conn) => {
    await db.q1(conn, 'SELECT id FROM company WHERE id = 1 FOR UPDATE');
    const previous = id && await db.q1(conn, 'SELECT username, full_name, role, active FROM users WHERE id = ? FOR UPDATE', [id]);
    if (id && !previous) throw new NotFoundError('Pengguna tidak ditemukan.');
    if (role === 'owner' || previous?.role === 'owner') throw new BusinessError('Akun dan peran Owner dilindungi.');
    if (!Object.hasOwn(ROLES, role) && !(await db.q1(conn, 'SELECT code FROM access_roles WHERE code = ?', [role]))) {
      throw new BusinessError('Peran tidak ditemukan.');
    }
    if (previous?.username.endsWith('.demo') && ['master_admin', 'audit'].includes(role)) {
      throw new BusinessError('Akun demo tidak dapat memakai peran dengan akses istimewa.');
    }
    if (id === ctx.user.id && (role !== 'master_admin' || !active)) throw new BusinessError('Pertahankan akun Master Admin Anda tetap aktif.');
    let userId = id;
    if (id) {
      const revoke = Boolean(passwordHash || previous.active !== active || previous.role !== role || body.revoke === '1');
      await db.q(conn, `UPDATE users SET full_name = ?, role = ?, active = ?, password_hash = COALESCE(?, password_hash),
        session_version = session_version + ? WHERE id = ?`, [name, role, active, passwordHash, Number(revoke), id]);
    } else {
      const result = await db.q(conn, 'INSERT INTO users (username, full_name, role, active, password_hash) VALUES (?, ?, ?, ?, ?)',
        [username, name, role, active, passwordHash]);
      userId = result.insertId;
    }
    await audit.log(conn, ctx, { action, docType: 'admin.user', docId: userId, docNumber: username || previous.username,
      detail: { previous, next: { full_name: name, role, active }, passwordChanged: Boolean(passwordHash), revokeRequested: body.revoke === '1' } });
  });
}

async function saveCompany(ctx, body) {
  return run(ctx, { action: 'SYSTEM_CONFIG_UPDATE', docType: 'admin.config' }, async (conn) => {
    requirePerm(ctx, 'admin.manage');
    const next = { name: text(body.name, 120, 'Nama perusahaan'), short_name: text(body.short_name, 40, 'Nama aplikasi'), city: text(body.city, 60, 'Kota') };
    const previous = await db.q1(conn, 'SELECT name, short_name, city FROM company WHERE id = 1 FOR UPDATE');
    await db.q(conn, 'UPDATE company SET name = ?, short_name = ?, city = ? WHERE id = 1', Object.values(next));
    await audit.log(conn, ctx, { action: 'SYSTEM_CONFIG_UPDATE', docType: 'admin.config', detail: { previous, next } });
  });
}

async function catalog() {
  const [branches, other] = await Promise.all([
    db.query("SELECT 'branch' AS kind, code, name, city FROM locations WHERE usage_type = 'internal' ORDER BY code"),
    db.query('SELECT kind, code, name, NULL AS city FROM master_catalog ORDER BY kind, code'),
  ]);
  return branches.concat(other);
}

async function saveCatalog(ctx, body, operation) {
  const action = `MASTER_DATA_${operation.toUpperCase()}`;
  return run(ctx, { action, docType: 'admin.catalog' }, async (conn) => {
    requirePerm(ctx, 'masterdata.manage', null, operation);
    const kind = body.kind;
    if (!['branch', 'department', 'category'].includes(kind)) throw new BusinessError('Jenis master data tidak dikenal.');
    const code = text(body.code, 20, 'Kode').toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) throw new BusinessError('Kode hanya boleh berisi huruf, angka, tanda hubung, atau garis bawah.');
    const branch = kind === 'branch';
    const previous = branch
      ? await db.q1(conn, "SELECT code, name, city FROM locations WHERE code = ? AND usage_type = 'internal' FOR UPDATE", [code])
      : await db.q1(conn, 'SELECT code, name FROM master_catalog WHERE kind = ? AND code = ? FOR UPDATE', [kind, code]);
    if (operation !== 'create' && !previous) throw new NotFoundError('Master data tidak ditemukan.');
    let next = null;
    if (operation === 'delete') {
      if (branch && ['WH-PKU', 'OUTLET-SUD'].includes(code)) throw new BusinessError('Lokasi operasional default dilindungi.');
      try {
        if (branch) await db.q(conn, 'DELETE FROM locations WHERE code = ?', [code]);
        else await db.q(conn, 'DELETE FROM master_catalog WHERE kind = ? AND code = ?', [kind, code]);
      } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') throw new BusinessError('Lokasi masih dipakai oleh stok, karyawan, atau dokumen.');
        throw error;
      }
    } else {
      const name = text(body.name, 80, 'Nama');
      const city = branch ? text(body.city, 60, 'Kota') : null;
      next = { code, name, city };
      if (branch && operation === 'create') await db.q(conn, "INSERT INTO locations (code, name, loc_type, usage_type, city) VALUES (?, ?, 'Internal Location', 'internal', ?)", [code, name, city]);
      else if (branch) await db.q(conn, 'UPDATE locations SET name = ?, city = ? WHERE code = ?', [name, city, code]);
      else if (operation === 'create') await db.q(conn, 'INSERT INTO master_catalog (kind, code, name) VALUES (?, ?, ?)', [kind, code, name]);
      else await db.q(conn, 'UPDATE master_catalog SET name = ? WHERE kind = ? AND code = ?', [name, kind, code]);
    }
    await audit.log(conn, ctx, { action, docType: 'admin.catalog', docNumber: code, detail: { kind, previous, next } });
  });
}

module.exports = { text, roles, saveRole, saveUser, saveCompany, catalog, saveCatalog };
