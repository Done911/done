const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const ROLES = ['general_manager', 'hr', 'finance', 'supervisor'];

const users = [
  { id: 1, username: 'admin', password: 'admin123', role: 'general_manager', active: true },
  { id: 2, username: 'hr', password: 'hr123', role: 'hr', active: true },
  { id: 3, username: 'finance', password: 'finance123', role: 'finance', active: true },
  { id: 4, username: 'supervisor', password: 'supervisor123', role: 'supervisor', active: true }
];

const couriers = [];
const dailyOps = [];
const financeRecords = [];

const PERMISSIONS = {
  general_manager: ['manage_users', 'manage_couriers', 'import_couriers', 'daily_ops', 'view_finance', 'view_insights'],
  hr: ['manage_couriers', 'import_couriers', 'view_insights'],
  finance: ['daily_ops', 'view_finance', 'view_insights'],
  supervisor: ['manage_couriers', 'import_couriers', 'daily_ops']
};

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
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
  const u = verifyToken(token);
  if (!u) return null;
  const dbUser = users.find(x => x.id === u.id && x.active);
  return dbUser || null;
}

function requireRole(req, res, roles) {
  const user = authUser(req);
  if (!user) return json(res, 401, { error: 'Unauthorized' }), null;
  if (!roles.includes(user.role)) return json(res, 403, { error: 'Forbidden for this role' }), null;
  return user;
}

function daysUntil(dateString) {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

function hrAlerts() {
  const alerts = [];
  for (const c of couriers) {
    const iq = daysUntil(c.iqamaExpiry);
    const wc = daysUntil(c.workCardExpiry);
    const vr = daysUntil(c.vacationEndDate);
    if (iq !== null && iq <= 30) alerts.push({ courierId: c.id, courierName: c.name, type: 'iqama_expiry', severity: iq < 0 ? 'critical' : 'warning', dueInDays: iq });
    if (wc !== null && wc <= 30) alerts.push({ courierId: c.id, courierName: c.name, type: 'work_card_expiry', severity: wc < 0 ? 'critical' : 'warning', dueInDays: wc });
    if (vr !== null && vr >= 0 && vr <= 7) alerts.push({ courierId: c.id, courierName: c.name, type: 'vacation_return', severity: 'info', dueInDays: vr });
  }
  return alerts.sort((a, b) => a.dueInDays - b.dueInDays);
}

function aiInsights() {
  const byCourier = new Map();
  for (const op of dailyOps) {
    const prev = byCourier.get(op.courierId) || { orders: 0, target: 0, commission: 0, debt: 0, advances: 0, notesCount: 0 };
    prev.orders += op.orders;
    prev.target += op.target;
    prev.commission += op.commission;
    prev.debt += op.debt;
    prev.advances += op.advances;
    if (op.notes) prev.notesCount += 1;
    byCourier.set(op.courierId, prev);
  }
  const rows = Array.from(byCourier.entries()).map(([courierId, s]) => ({ ...s, courierId, targetRate: s.target ? s.orders / s.target : 0, riskScore: s.debt + s.advances - s.commission * 0.3 }));
  rows.sort((a, b) => b.targetRate - a.targetRate);
  const appDistribution = couriers.reduce((a, c) => (a[c.appName || 'غير مصنف'] = (a[c.appName || 'غير مصنف'] || 0) + 1, a), {});
  const hr = hrAlerts();
  return { topPerformers: rows.slice(0, 5), riskCases: rows.filter(r => r.riskScore > 500), hrAlerts: hr, appDistribution, summary: { couriersCount: couriers.length, totalOrders: rows.reduce((x, y) => x + y.orders, 0), hrCriticalCount: hr.filter(h => h.severity === 'critical').length } };
}

function toCsv(records) {
  const header = 'date,courierId,shift,orders,target,commission,advances,debt,notes\n';
  return header + records.map(r => [r.date, r.courierId, r.shift, r.orders, r.target, r.commission, r.advances, r.debt, (r.notes || '').replaceAll(',', ' ')].join(',')).join('\n');
}

function normalizeCourierInput(body, createdBy) {
  return {
    id: couriers.length + 1,
    name: body.name,
    phone: body.phone,
    area: body.area || 'غير محدد',
    appName: body.appName || 'غير مصنف',
    iqamaExpiry: body.iqamaExpiry || null,
    workCardExpiry: body.workCardExpiry || null,
    vacationEndDate: body.vacationEndDate || null,
    createdBy
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
    return res.end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req).catch(() => null);
    if (!body) return json(res, 400, { error: 'Invalid JSON' });
    const user = users.find(u => u.username === body.username && u.password === body.password && u.active);
    if (!user) return json(res, 401, { error: 'Invalid credentials' });
    const payload = { id: user.id, username: user.username, role: user.role, permissions: PERMISSIONS[user.role] || [], iat: Date.now() };
    return json(res, 200, { token: signToken(payload), user: payload });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = authUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, { id: user.id, username: user.username, role: user.role, permissions: PERMISSIONS[user.role] || [] });
  }

  if (req.method === 'GET' && url.pathname === '/api/users') {
    const user = requireRole(req, res, ['general_manager']);
    if (!user) return;
    return json(res, 200, users.map(u => ({ id: u.id, username: u.username, role: u.role, active: u.active })));
  }

  if (req.method === 'POST' && url.pathname === '/api/users') {
    const user = requireRole(req, res, ['general_manager']);
    if (!user) return;
    const body = await readBody(req).catch(() => null);
    if (!body?.username || !body?.password || !ROLES.includes(body.role)) return json(res, 400, { error: 'username, password, role are required' });
    if (users.some(u => u.username === body.username)) return json(res, 409, { error: 'username already exists' });
    const newUser = { id: users.length + 1, username: body.username, password: body.password, role: body.role, active: true };
    users.push(newUser);
    return json(res, 201, { id: newUser.id, username: newUser.username, role: newUser.role, active: true });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/users/')) {
    const admin = requireRole(req, res, ['general_manager']);
    if (!admin) return;
    const id = Number(url.pathname.split('/').pop());
    const body = await readBody(req).catch(() => null);
    const user = users.find(u => u.id === id);
    if (!user) return json(res, 404, { error: 'User not found' });
    if (body.role && ROLES.includes(body.role)) user.role = body.role;
    if (typeof body.active === 'boolean') user.active = body.active;
    if (body.password) user.password = body.password;
    return json(res, 200, { id: user.id, username: user.username, role: user.role, active: user.active });
  }

  if (req.method === 'POST' && url.pathname === '/api/couriers') {
    const user = requireRole(req, res, ['general_manager', 'hr', 'supervisor']);
    if (!user) return;
    const body = await readBody(req).catch(() => null);
    if (!body?.name || !body?.phone) return json(res, 400, { error: 'name and phone are required' });
    const courier = normalizeCourierInput(body, user.username);
    couriers.push(courier);
    return json(res, 201, courier);
  }

  if (req.method === 'POST' && url.pathname === '/api/couriers/import') {
    const user = requireRole(req, res, ['general_manager', 'hr', 'supervisor']);
    if (!user) return;
    const body = await readBody(req).catch(() => null);
    if (!Array.isArray(body?.rows)) return json(res, 400, { error: 'rows array is required' });
    const imported = []; const errors = [];
    body.rows.forEach((row, idx) => {
      if (!row.name || !row.phone) return errors.push({ row: idx + 1, error: 'name and phone are required' });
      const c = normalizeCourierInput(row, user.username); couriers.push(c); imported.push(c);
    });
    return json(res, 201, { importedCount: imported.length, errors, imported });
  }

  if (req.method === 'GET' && url.pathname === '/api/couriers') {
    const user = requireRole(req, res, ['general_manager', 'hr', 'finance', 'supervisor']);
    if (!user) return;
    return json(res, 200, couriers);
  }

  if (req.method === 'POST' && url.pathname === '/api/daily-ops') {
    const user = requireRole(req, res, ['general_manager', 'supervisor', 'finance']);
    if (!user) return;
    const body = await readBody(req).catch(() => null);
    const required = ['courierId', 'date', 'shift', 'orders', 'target', 'commission', 'advances', 'debt'];
    if (!body || required.some(k => body[k] === undefined)) return json(res, 400, { error: 'missing fields' });
    const op = { courierId: Number(body.courierId), date: body.date, shift: body.shift, orders: Number(body.orders), target: Number(body.target), commission: Number(body.commission), advances: Number(body.advances), debt: Number(body.debt), notes: body.notes || '' };
    dailyOps.push(op);
    financeRecords.push({ id: financeRecords.length + 1, courierId: op.courierId, date: op.date, type: 'daily_closing', amount: op.commission - op.advances - op.debt, note: `auto by ${user.username}${op.notes ? ` | ${op.notes}` : ''}` });
    return json(res, 201, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/finance') {
    const user = requireRole(req, res, ['general_manager', 'finance']);
    if (!user) return;
    return json(res, 200, financeRecords);
  }

  if (req.method === 'GET' && url.pathname === '/api/insights') {
    const user = requireRole(req, res, ['general_manager', 'finance', 'hr']);
    if (!user) return;
    return json(res, 200, aiInsights());
  }

  if (req.method === 'GET' && url.pathname === '/api/export/daily-ops.csv') {
    const user = requireRole(req, res, ['general_manager', 'supervisor', 'finance']);
    if (!user) return;
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="daily-ops.csv"' });
    return res.end(toCsv(dailyOps));
  }

  const filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (filePath.startsWith(path.join(__dirname, 'public')) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript' };
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
