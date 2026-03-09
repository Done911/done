let token = '';
let currentUser = null;

const currentRoleChip = document.getElementById('currentRole');
const authState = document.getElementById('authState');
const insights = document.getElementById('insights');

function notify(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#fb7185' : '#86efac';
}

async function api(path, method = 'GET', body) {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'request failed');
  return data;
}

function applyRoleUI() {
  const role = currentUser?.role || 'guest';
  currentRoleChip.textContent = role;
  document.querySelectorAll('[data-roles]').forEach((el) => {
    const roles = el.getAttribute('data-roles').split(',');
    el.classList.toggle('hidden', !roles.includes(role));
  });
}

function renderDashboard(data) {
  const cards = document.getElementById('dashboardCards');
  const items = [
    ['عدد المناديب', data.drivers_count],
    ['عدد السيارات', data.vehicles_count],
    ['عدد التطبيقات', data.applications_count],
    ['الحسابات المؤجرة', data.rented_accounts_count],
    ['طلبات اليوم', data.today_orders_count],
    ['إيرادات اليوم', data.today_revenue_total],
    ['صافي الربح', data.profit.net_profit]
  ];
  cards.innerHTML = items.map(([title, value]) => `<article class="stat"><h3>${title}</h3><p>${value}</p></article>`).join('');
}

async function refreshDashboard() {
  try {
    const data = await api('/api/dashboard');
    renderDashboard(data);
  } catch (error) {
    notify(authState, error.message, true);
  }
}

async function refreshInsights() {
  try {
    const analytics = await api('/api/ai-analytics');
    const alerts = await api('/api/smart-alerts');
    insights.textContent = JSON.stringify({ analytics, alerts }, null, 2);
  } catch (error) {
    insights.textContent = `خطأ: ${error.message}`;
  }
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const data = await api('/api/auth/login', 'POST', {
      username: form.get('username'),
      password: form.get('password')
    });
    token = data.token;
    currentUser = data.user;
    notify(authState, `مرحباً ${currentUser.username}`);
    applyRoleUI();
    await refreshDashboard();
    await refreshInsights();
  } catch (error) {
    notify(authState, error.message, true);
  }
});

document.getElementById('driverForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api('/api/drivers', 'POST', Object.fromEntries(form.entries()));
    notify(authState, 'تم حفظ المندوب');
    event.target.reset();
    await refreshDashboard();
  } catch (error) {
    notify(authState, error.message, true);
  }
});

document.getElementById('appForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api('/api/applications', 'POST', {
      app_name: form.get('app_name'),
      target_type: form.get('target_type'),
      target_value: Number(form.get('target_value'))
    });
    notify(authState, 'تم حفظ التطبيق');
    event.target.reset();
    await refreshDashboard();
  } catch (error) {
    notify(authState, error.message, true);
  }
});

document.getElementById('accountForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api('/api/accounts', 'POST', {
      app_id: Number(form.get('app_id')),
      real_user_name: form.get('real_user_name'),
      real_user_iqama: form.get('real_user_iqama'),
      real_user_phone: form.get('real_user_phone')
    });
    notify(authState, 'تم حفظ الحساب');
    event.target.reset();
  } catch (error) {
    notify(authState, error.message, true);
  }
});

document.getElementById('dailyForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api('/api/daily-operations', 'POST', {
      date: form.get('date'),
      driver_id: Number(form.get('driver_id')),
      app_id: Number(form.get('app_id')),
      account_id: Number(form.get('account_id')),
      orders_count: Number(form.get('orders_count')),
      total_revenue: Number(form.get('total_revenue')),
      shift_start: form.get('shift_start'),
      shift_end: form.get('shift_end'),
      shift_hours: Number(form.get('shift_hours'))
    });
    notify(authState, 'تم حفظ العملية اليومية');
    event.target.reset();
    await refreshDashboard();
    await refreshInsights();
  } catch (error) {
    notify(authState, error.message, true);
  }
});

document.getElementById('refreshDashboardBtn').addEventListener('click', refreshDashboard);
document.getElementById('refreshInsightsBtn').addEventListener('click', refreshInsights);

applyRoleUI();
