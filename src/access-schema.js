'use strict';
const bcrypt = require('bcryptjs');
const db = require('./db');

async function ensureAccessSchema() {
  const conn = await db.getPool().getConnection();
  try {
    const lock = await db.q1(conn, "SELECT GET_LOCK(SHA2(CONCAT(DATABASE(), ':access-schema'), 256), 20) AS acquired");
    if (!lock?.acquired) throw new Error('Migrasi akses sedang dijalankan proses lain.');
    const columns = await db.q(conn, 'SHOW COLUMNS FROM users');
    if (columns.find((c) => c.Field === 'role').Type.startsWith('enum')) {
      await db.q(conn, 'ALTER TABLE users MODIFY role VARCHAR(20) NOT NULL');
    }
    if (!columns.some((c) => c.Field === 'session_version')) {
      await db.q(conn, 'ALTER TABLE users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0');
    }
    await db.q(conn, `CREATE TABLE IF NOT EXISTS access_roles (
      code VARCHAR(20) PRIMARY KEY,
      label VARCHAR(80) NOT NULL,
      permissions JSON NOT NULL
    ) ENGINE=InnoDB`);
    await db.q(conn, `CREATE TABLE IF NOT EXISTS master_catalog (
      kind ENUM('department','category') NOT NULL,
      code VARCHAR(20) NOT NULL,
      name VARCHAR(80) NOT NULL,
      PRIMARY KEY (kind, code)
    ) ENGINE=InnoDB`);
    await db.q(conn, `CREATE TABLE IF NOT EXISTS audit_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      author_id INT NOT NULL,
      author VARCHAR(40) NOT NULL,
      title VARCHAR(120) NOT NULL,
      body TEXT NOT NULL,
      stock_snapshot JSON NULL,
      created_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB`);
    const password = process.env.MASTER_ADMIN_INITIAL_PASSWORD;
    if (password && !(await db.q1(conn, "SELECT 1 FROM users WHERE role = 'master_admin' LIMIT 1"))) {
      if (password.length < 12 || Buffer.byteLength(password) > 72) {
        throw new Error('MASTER_ADMIN_INITIAL_PASSWORD harus minimal 12 karakter dan maksimal 72 byte.');
      }
      await db.q(conn, "INSERT INTO users (username, full_name, role, password_hash) VALUES ('master.admin', 'Master Admin', 'master_admin', ?)",
        [await bcrypt.hash(password, 12)]);
    }
  } finally {
    try {
      await db.q(conn, "SELECT RELEASE_LOCK(SHA2(CONCAT(DATABASE(), ':access-schema'), 256))");
      conn.release();
    } catch {
      conn.destroy();
    }
  }
}

module.exports = { ensureAccessSchema };
