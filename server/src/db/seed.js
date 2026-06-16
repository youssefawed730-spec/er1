// db/seed.js
// Run once: node src/db/seed.js
// Seeds demo users with proper bcrypt-hashed passwords.

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./schema');

const SALT_ROUNDS = 12;

async function seed() {
  const existing = db.prepare('SELECT COUNT(*) as n FROM users').get();
  if (existing.n > 0) {
    console.log('[seed] Users already exist, skipping.');
    return;
  }

  const users = [
    { name: 'System Admin',       email: 'admin@logistics.com',        password: 'admin123',      role: 'admin' },
    { name: 'General Manager',    email: 'manager@logistics.com',      password: 'manager123',    role: 'manager' },
    { name: 'Head of Accounting', email: 'accounting@logistics.com',   password: 'accounting123', role: 'head_of_accounting' },
    { name: 'Accountant II',      email: 'accountant2@logistics.com',  password: 'accounting456', role: 'accounting' },
    { name: 'Sales Rep',          email: 'sales@logistics.com',        password: 'sales123',      role: 'sales' },
    { name: 'Head of Sales',      email: 'head.sales@logistics.com',   password: 'head123',       role: 'head_of_sales' },
    { name: 'Staff Member',       email: 'staff@logistics.com',        password: 'staff123',      role: 'operation' },
    { name: 'Operations Manager', email: 'operation@logistics.com',    password: 'operation123',  role: 'operation' },
    { name: 'External Contact',   email: 'contact@logistics.com',      password: 'contact123',    role: 'contact' },
    { name: 'Partner',            email: 'partner@external.com',       password: 'partner123',    role: 'contact' },
  ];

  const insert = db.prepare(`
    INSERT INTO users (id, name, email, password, role)
    VALUES (@id, @name, @email, @password, @role)
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });

  const hashed = await Promise.all(
    users.map(async (u) => ({
      id: uuidv4(),
      name: u.name,
      email: u.email,
      password: await bcrypt.hash(u.password, SALT_ROUNDS),
      role: u.role,
    }))
  );

  insertMany(hashed);
  console.log(`[seed] Inserted ${hashed.length} users.`);

  // Seed default chart-of-accounts
  const accounts = [
    { id: uuidv4(), code: '1000', name: 'Cash',                   type: 'asset' },
    { id: uuidv4(), code: '1100', name: 'Accounts Receivable',    type: 'asset' },
    { id: uuidv4(), code: '1200', name: 'Inventory',              type: 'asset' },
    { id: uuidv4(), code: '2000', name: 'Accounts Payable',       type: 'liability' },
    { id: uuidv4(), code: '2100', name: 'Accrued Expenses',       type: 'liability' },
    { id: uuidv4(), code: '3000', name: 'Owner Equity',           type: 'equity' },
    { id: uuidv4(), code: '4000', name: 'Revenue',                type: 'revenue' },
    { id: uuidv4(), code: '5000', name: 'Cost of Goods Sold',     type: 'expense' },
    { id: uuidv4(), code: '5100', name: 'Operating Expenses',     type: 'expense' },
    { id: uuidv4(), code: '5200', name: 'Payroll Expenses',       type: 'expense' },
  ];

  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO accounts (id, code, name, type) VALUES (@id, @code, @name, @type)
  `);
  const insertAccounts = db.transaction((rows) => { for (const r of rows) insertAccount.run(r); });
  insertAccounts(accounts);
  console.log(`[seed] Inserted ${accounts.length} accounts.`);
}

seed().catch(console.error);
