const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const ROLES = ['general_manager', 'hr', 'finance', 'supervisor'];
const DRIVER_STATUS = ['active', 'vacation', 'suspended'];
const VEHICLE_OWNERSHIP = ['company_owned', 'driver_owned'];
const TARGET_TYPE = ['orders', 'revenue'];
const ACCOUNT_STATUS = ['available', 'rented', 'inactive'];
const RENTAL_STATUS = ['active', 'completed', 'cancelled'];
const FINANCE_TYPES = ['salary', 'advance', 'debt', 'bonus', 'deduction', 'user_rent'];

const users = [
  { id: 1, username: 'admin', password: 'admin123', role: 'general_manager', active: true },
  { id: 2, username: 'hr', password: 'hr123', role: 'hr', active: true },
  { id: 3, username: 'finance', password: 'finance123', role: 'finance', active: true },
  { id: 4, username: 'supervisor', password: 'supervisor123', role: 'supervisor', active: true }
];

const drivers = [];
const driverDocuments = [];
const vehicles = [];
const applications = [];
const accounts = [];
const accountRentals = [];
const dailyOperations = [];
const financeTransactions = [];

const PERMISSIONS = {
  general_manager: ['all'],
  hr: ['drivers.manage', 'documents.manage', 'vehicles.manage'],
  finance: ['finance.manage', 'reports.view', 'dashboard.view'],
  supervisor: ['daily_ops.manage', 'import.manage', 'reports.view']
};

const PATH_PERMISSIONS = {
  '/api/drivers': ['general_manager', 'hr', 'supervisor', 'finance'],
  '/api/driver-documents': ['general_manager', 'hr'],
  '/api/vehicles': ['general_manager', 'hr'],
  '/api/applications': ['general_manager', 'supervisor'],
  '/api/accounts': ['general_manager', 'supervisor'],
  '/api/account-rentals': ['general_manager', 'supervisor', 'finance'],
  '/api/daily-operations': ['general_manager', 'supervisor', 'finance'],
  '/api/finance-transactions': ['general_manager', 'finance'],
  '/api/dashboard': ['general_manager', 'hr', 'finance', 'supervisor'],
  '/api/reports': ['general_manager', 'finance', 'supervisor'],
  '/api/ai-analytics': ['general_manager', 'hr', 'finance'],
  '/api/smart-alerts': ['general_manager', 'hr', 'finance', 'supervisor']
};

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function signToken(payload) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  if (expected !== s) return null;
  return JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
}

function authUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const payload = verifyToken(token);
  if (!payload) return null;
  return users.find((u) => u.id === payload.id && u.active) || null;
}

function requireRoles(req, res, roles) {
  const user = authUser(req);
  if (!user) {
    json(res, 401, { error: 'Unauthorized' });
    return null;
  }
  if (!roles.includes(user.role)) {
    json(res, 403, { error: 'Forbidden' });
    return null;
  }
  return user;
}

function idOf(list) {
  return list.length ? Math.max(...list.map((x) => x.id)) + 1 : 1;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function computeTargetProgress(op) {
  const app = applications.find((x) => x.id === op.app_id);
  if (!app || !app.target_value) return 0;
  const actual = app.target_type === 'orders' ? op.orders_count : op.total_revenue;
  return Number(((actual / app.target_value) * 100).toFixed(2));
}

function walletByDriver(driverId) {
  const tx = financeTransactions.filter((t) => t.driver_id === driverId);
  const totals = {
    total_salary: 0,
    total_advance: 0,
    total_debt: 0,
    total_deduction: 0,
    total_bonus: 0,
    total_user_rent: 0
  };
  for (const t of tx) {
    if (t.transaction_type === 'salary') totals.total_salary += t.amount;
    if (t.transaction_type === 'advance') totals.total_advance += t.amount;
    if (t.transaction_type === 'debt') totals.total_debt += t.amount;
    if (t.transaction_type === 'deduction') totals.total_deduction += t.amount;
    if (t.transaction_type === 'bonus') totals.total_bonus += t.amount;
    if (t.transaction_type === 'user_rent') totals.total_user_rent += t.amount;
  }
  const final_balance = totals.total_salary + totals.total_bonus + totals.total_user_rent - totals.total_advance - totals.total_debt - totals.total_deduction;
  return { driver_id: driverId, ...totals, final_balance: Number(final_balance.toFixed(2)) };
}

function companyProfit() {
  const total_revenue = dailyOperations.reduce((sum, row) => sum + row.total_revenue, 0) + financeTransactions.filter((t) => t.transaction_type === 'user_rent').reduce((s, t) => s + t.amount, 0);
  const total_costs = financeTransactions.filter((t) => ['salary', 'advance', 'debt', 'deduction'].includes(t.transaction_type)).reduce((sum, t) => sum + t.amount, 0);
  const net_profit = total_revenue - total_costs;
  return {
    total_revenue: Number(total_revenue.toFixed(2)),
    total_costs: Number(total_costs.toFixed(2)),
    net_profit: Number(net_profit.toFixed(2))
  };
}

function aiAnalytics() {
  const map = new Map();
  for (const op of dailyOperations) {
    const prev = map.get(op.driver_id) || { orders: 0, revenue: 0, hours: 0, targetHit: 0, operations: 0 };
    prev.orders += op.orders_count;
    prev.revenue += op.total_revenue;
    prev.hours += op.shift_hours;
    prev.targetHit += op.target_progress_percentage >= 100 ? 1 : 0;
    prev.operations += 1;
    map.set(op.driver_id, prev);
  }
  const rows = Array.from(map.entries()).map(([driverId, value]) => {
    const target_rate = value.operations ? value.targetHit / value.operations : 0;
    const productivity = value.hours ? value.orders / value.hours : 0;
    const score = Number((target_rate * 45 + productivity * 35 + (value.revenue / Math.max(1, value.operations * 100)) * 20).toFixed(2));
    return { driver_id: driverId, ...value, target_rate: Number((target_rate * 100).toFixed(2)), productivity: Number(productivity.toFixed(2)), driver_score: score };
  });
  rows.sort((a, b) => b.driver_score - a.driver_score);

  const appComparison = applications.map((app) => {
    const appOps = dailyOperations.filter((op) => op.app_id === app.id);
    return {
      app_id: app.id,
      app_name: app.app_name,
      total_orders: appOps.reduce((s, o) => s + o.orders_count, 0),
      total_revenue: Number(appOps.reduce((s, o) => s + o.total_revenue, 0).toFixed(2)),
      avg_target_progress: Number((appOps.reduce((s, o) => s + o.target_progress_percentage, 0) / Math.max(1, appOps.length)).toFixed(2))
    };
  });

  return {
    best_drivers: rows.slice(0, 5),
    low_performance_drivers: rows.slice(-5).reverse(),
    shift_vs_orders: rows.map((r) => ({ driver_id: r.driver_id, orders: r.orders, hours: r.hours, productivity: r.productivity })),
    app_comparison: appComparison
  };
}

function smartAlerts() {
  const alerts = [];
  for (const op of dailyOperations) {
    if (op.target_progress_percentage < 70) alerts.push({ type: 'target_not_achieved', driver_id: op.driver_id, daily_operation_id: op.id, severity: 'warning' });
    if (op.shift_hours < 4) alerts.push({ type: 'low_shift_hours', driver_id: op.driver_id, daily_operation_id: op.id, severity: 'info' });
  }
  for (const acc of accounts) {
    const used = dailyOperations.some((op) => op.account_id === acc.id);
    if (!used && acc.account_status === 'available') alerts.push({ type: 'unused_account', account_id: acc.id, severity: 'warning' });
  }
  return alerts;
}

function dashboard() {
  const today = todayString();
  const todayOps = dailyOperations.filter((x) => x.date === today);
  return {
    drivers_count: drivers.length,
    vehicles_count: vehicles.length,
    applications_count: applications.length,
    rented_accounts_count: accounts.filter((a) => a.account_status === 'rented').length,
    today_orders_count: todayOps.reduce((s, o) => s + o.orders_count, 0),
    today_revenue_total: Number(todayOps.reduce((s, o) => s + o.total_revenue, 0).toFixed(2)),
    profit: companyProfit()
  };
}

function jsonToCsv(rows, headers) {
  const head = `${headers.join(',')}\n`;
  const body = rows
    .map((row) => headers.map((h) => String(row[h] ?? '').replaceAll(',', ' ')).join(','))
    .join('\n');
  return `${head}${body}`;
}

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req).catch(() => null);
    if (!body?.username || !body?.password) return json(res, 400, { error: 'username and password are required' });
    const user = users.find((u) => u.username === body.username && u.password === body.password && u.active);
    if (!user) return json(res, 401, { error: 'Invalid credentials' });
    const payload = { id: user.id, username: user.username, role: user.role, permissions: PERMISSIONS[user.role], iat: Date.now() };
    return json(res, 200, { token: signToken(payload), user: payload });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = authUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, { id: user.id, username: user.username, role: user.role, permissions: PERMISSIONS[user.role] });
  }

  for (const [prefix, roles] of Object.entries(PATH_PERMISSIONS)) {
    if (matchesPrefix(url.pathname, prefix)) {
      const current = requireRoles(req, res, roles);
      if (!current) return;
      break;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/drivers') {
    const body = await readBody(req).catch(() => null);
    if (!body?.full_name || !body?.iqama_number || !body?.phone) return json(res, 400, { error: 'full_name, iqama_number, phone are required' });
    if (body.status && !DRIVER_STATUS.includes(body.status)) return json(res, 400, { error: 'invalid status' });
    const record = { id: idOf(drivers), full_name: body.full_name, iqama_number: body.iqama_number, phone: body.phone, nationality: body.nationality || '', date_of_birth: body.date_of_birth || null, join_date: body.join_date || todayString(), status: body.status || 'active' };
    drivers.push(record);
    return json(res, 201, record);
  }

  if (req.method === 'GET' && url.pathname === '/api/drivers') return json(res, 200, drivers);

  if (req.method === 'POST' && url.pathname === '/api/driver-documents') {
    const body = await readBody(req).catch(() => null);
    if (!body?.driver_id) return json(res, 400, { error: 'driver_id is required' });
    const exists = drivers.some((d) => d.id === Number(body.driver_id));
    if (!exists) return json(res, 404, { error: 'driver not found' });
    const record = { id: idOf(driverDocuments), driver_id: Number(body.driver_id), iqama_copy: body.iqama_copy || null, license_copy: body.license_copy || null, contract_copy: body.contract_copy || null, personal_photo: body.personal_photo || null, iqama_expiry: body.iqama_expiry || null, license_expiry: body.license_expiry || null };
    driverDocuments.push(record);
    return json(res, 201, record);
  }

  if (req.method === 'GET' && url.pathname === '/api/driver-documents') return json(res, 200, driverDocuments);

  if (req.method === 'POST' && url.pathname === '/api/vehicles') {
    const body = await readBody(req).catch(() => null);
    if (!body?.driver_id || !body?.ownership_type || !body?.plate_number) return json(res, 400, { error: 'driver_id, ownership_type, plate_number are required' });
    if (!VEHICLE_OWNERSHIP.includes(body.ownership_type)) return json(res, 400, { error: 'invalid ownership_type' });
    const record = { id: idOf(vehicles), driver_id: Number(body.driver_id), ownership_type: body.ownership_type, car_brand: body.car_brand || '', car_model: body.car_model || '', plate_number: body.plate_number, registration_expiry: body.registration_expiry || null, insurance_expiry: body.insurance_expiry || null, status: body.status || 'active' };
    vehicles.push(record);
    return json(res, 201, record);
  }

  if (req.method === 'GET' && url.pathname === '/api/vehicles') return json(res, 200, vehicles);

  if (req.method === 'POST' && url.pathname === '/api/applications') {
    const body = await readBody(req).catch(() => null);
    if (!body?.app_name || !body?.target_type || body.target_value === undefined) return json(res, 400, { error: 'app_name, target_type, target_value are required' });
    if (!TARGET_TYPE.includes(body.target_type)) return json(res, 400, { error: 'invalid target_type' });
    const record = { id: idOf(applications), app_name: body.app_name, target_type: body.target_type, target_value: Number(body.target_value) };
    applications.push(record);
    return json(res, 201, record);
  }

  if (req.method === 'GET' && url.pathname === '/api/applications') return json(res, 200, applications);

  if (req.method === 'POST' && url.pathname === '/api/accounts') {
    const body = await readBody(req).catch(() => null);
    if (!body?.app_id || !body?.real_user_name || !body?.real_user_iqama || !body?.real_user_phone) return json(res, 400, { error: 'missing required account fields' });
    if (body.account_status && !ACCOUNT_STATUS.includes(body.account_status)) return json(res, 400, { error: 'invalid account_status' });
    const record = { id: idOf(accounts), app_id: Number(body.app_id), real_user_name: body.real_user_name, real_user_iqama: body.real_user_iqama, real_user_phone: body.real_user_phone, account_status: body.account_status || 'available' };
    accounts.push(record);
    return json(res, 201, record);
  }

  if (req.method === 'GET' && url.pathname === '/api/accounts') return json(res, 200, accounts);

  if (req.method === 'POST' && url.pathname === '/api/account-rentals') {
    const body = await readBody(req).catch(() => null);
    if (!body?.account_id || !body?.renter_name || !body?.rent_start_date || body.rent_price === undefined) return json(res, 400, { error: 'missing required rental fields' });
    if (body.status && !RENTAL_STATUS.includes(body.status)) return json(res, 400, { error: 'invalid rental status' });
    const account = accounts.find((a) => a.id === Number(body.account_id));
    if (!account) return json(res, 404, { error: 'account not found' });
    account.account_status = 'rented';
    const record = { id: idOf(accountRentals), account_id: Number(body.account_id), renter_name: body.renter_name, renter_iqama: body.renter_iqama || '', renter_phone: body.renter_phone || '', rent_start_date: body.rent_start_date, rent_end_date: body.rent_end_date || null, rent_price: Number(body.rent_price), status: body.status || 'active' };
    accountRentals.push(record);
    financeTransactions.push({ id: idOf(financeTransactions), driver_id: null, transaction_type: 'user_rent', amount: record.rent_price, date: body.rent_start_date, notes: `rental #${record.id}` });
    return json(res, 201, record);
  }

  if (req.method === 'GET' && url.pathname === '/api/account-rentals') return json(res, 200, accountRentals);

  if (req.method === 'POST' && url.pathname === '/api/daily-operations') {
    const body = await readBody(req).catch(() => null);
    const required = ['date', 'driver_id', 'app_id', 'account_id', 'orders_count', 'total_revenue', 'shift_start', 'shift_end', 'shift_hours'];
    if (!body || required.some((k) => body[k] === undefined || body[k] === null || body[k] === '')) return json(res, 400, { error: 'missing required daily operations fields' });
    const record = { id: idOf(dailyOperations), date: body.date, driver_id: Number(body.driver_id), app_id: Number(body.app_id), account_id: Number(body.account_id), orders_count: Number(body.orders_count), total_revenue: Number(body.total_revenue), shift_start: body.shift_start, shift_end: body.shift_end, shift_hours: Number(body.shift_hours), target_progress_percentage: 0 };
    record.target_progress_percentage = computeTargetProgress(record);
    dailyOperations.push(record);
    return json(res, 201, record);
  }

  if (req.method === 'GET' && url.pathname === '/api/daily-operations') return json(res, 200, dailyOperations);

  if (req.method === 'POST' && url.pathname === '/api/finance-transactions') {
    const body = await readBody(req).catch(() => null);
    if (!body?.driver_id || !body?.transaction_type || body.amount === undefined || !body?.date) return json(res, 400, { error: 'driver_id, transaction_type, amount, date are required' });
    if (!FINANCE_TYPES.includes(body.transaction_type)) return json(res, 400, { error: 'invalid transaction_type' });
    const record = { id: idOf(financeTransactions), driver_id: Number(body.driver_id), transaction_type: body.transaction_type, amount: Number(body.amount), date: body.date, notes: body.notes || '' };
    financeTransactions.push(record);
    return json(res, 201, record);
  }

  if (req.method === 'GET' && url.pathname === '/api/finance-transactions') return json(res, 200, financeTransactions);

  if (req.method === 'GET' && url.pathname === '/api/wallets') {
    const wallets = drivers.map((d) => walletByDriver(d.id));
    return json(res, 200, wallets);
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') return json(res, 200, dashboard());

  if (req.method === 'GET' && url.pathname === '/api/profit-analysis') {
    const byApp = applications.map((app) => ({
      app_id: app.id,
      app_name: app.app_name,
      revenue: Number(dailyOperations.filter((op) => op.app_id === app.id).reduce((s, op) => s + op.total_revenue, 0).toFixed(2))
    }));
    const byDriver = drivers.map((d) => ({
      driver_id: d.id,
      full_name: d.full_name,
      revenue: Number(dailyOperations.filter((op) => op.driver_id === d.id).reduce((s, op) => s + op.total_revenue, 0).toFixed(2))
    }));
    const byAccount = accounts.map((acc) => ({
      account_id: acc.id,
      revenue: Number(dailyOperations.filter((op) => op.account_id === acc.id).reduce((s, op) => s + op.total_revenue, 0).toFixed(2))
    }));
    return json(res, 200, { by_app: byApp, by_driver: byDriver, by_account: byAccount });
  }

  if (req.method === 'GET' && url.pathname === '/api/ai-analytics') return json(res, 200, aiAnalytics());

  if (req.method === 'GET' && url.pathname === '/api/smart-alerts') return json(res, 200, smartAlerts());

  if (req.method === 'GET' && url.pathname.startsWith('/api/reports')) {
    const reportType = url.searchParams.get('type') || 'driver_performance';
    const format = url.searchParams.get('format') || 'json';
    let rows = [];

    if (reportType === 'driver_performance') rows = aiAnalytics().best_drivers.concat(aiAnalytics().low_performance_drivers);
    if (reportType === 'application_performance') rows = aiAnalytics().app_comparison;
    if (reportType === 'financial') rows = financeTransactions;
    if (reportType === 'accounts_rental') rows = accountRentals;
    if (reportType === 'target_achievement') rows = dailyOperations.map((op) => ({ id: op.id, driver_id: op.driver_id, app_id: op.app_id, target_progress_percentage: op.target_progress_percentage }));

    if (format === 'excel') {
      const headers = rows.length ? Object.keys(rows[0]) : ['empty'];
      const csv = jsonToCsv(rows.length ? rows : [{ empty: 'no_data' }], headers);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${reportType}.csv"` });
      return res.end(csv);
    }

    if (format === 'pdf') {
      const simulatedPdf = `Delivery System Report\nType: ${reportType}\nGenerated: ${new Date().toISOString()}\n\n${JSON.stringify(rows, null, 2)}`;
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${reportType}.pdf"` });
      return res.end(simulatedPdf);
    }

    return json(res, 200, { report_type: reportType, rows });
  }

  const filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (filePath.startsWith(path.join(__dirname, 'public')) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8'
    };
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  return json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
