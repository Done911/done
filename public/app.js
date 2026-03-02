let token = '';
let currentUser = null;

const authState = document.getElementById('authState');
const insights = document.getElementById('insights');
const importState = document.getElementById('importState');
const userState = document.getElementById('userState');
const currentRoleChip = document.getElementById('currentRole');

function toast(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#fb7185' : '#86efac';
}

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => row[h] = vals[i] || '');
    return row;
  });
}

function applyRoleUI() {
  const role = currentUser?.role || 'guest';
  currentRoleChip.textContent = role;
  document.querySelectorAll('[data-roles]').forEach(el => {
    const roles = el.getAttribute('data-roles').split(',').map(x => x.trim());
    el.classList.toggle('hidden', !roles.includes(role));
  });
}

async function refreshUsers() {
  if (currentUser?.role !== 'general_manager') return;
  const tbody = document.querySelector('#usersTable tbody');
  const list = await api('/api/users');
  tbody.innerHTML = '';
  list.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.id}</td><td>${u.username}</td><td>${u.role}</td><td><button class="btn small-btn" data-id="${u.id}" data-active="${u.active}">${u.active ? 'تعطيل' : 'تفعيل'}</button></td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/api/auth/login', 'POST', { username: fd.get('username'), password: fd.get('password') });
    token = data.token;
    currentUser = data.user;
    applyRoleUI();
    toast(authState, `تم تسجيل الدخول: ${currentUser.username} (${currentUser.role})`);
    if (currentUser.role === 'general_manager') await refreshUsers();
  } catch (err) {
    toast(authState, err.message, true);
  }
});

document.getElementById('userForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/users', 'POST', { username: fd.get('username'), password: fd.get('password'), role: fd.get('role') });
    toast(userState, 'تم إنشاء المستخدم بنجاح');
    e.target.reset();
    await refreshUsers();
  } catch (err) {
    toast(userState, err.message, true);
  }
});

document.getElementById('refreshUsersBtn')?.addEventListener('click', refreshUsers);

document.querySelector('#usersTable tbody')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  try {
    await api(`/api/users/${btn.dataset.id}`, 'PUT', { active: btn.dataset.active !== 'true' });
    await refreshUsers();
  } catch (err) {
    toast(userState, err.message, true);
  }
});

document.getElementById('courierForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const courier = await api('/api/couriers', 'POST', {
      name: fd.get('name'), phone: fd.get('phone'), area: fd.get('area'), appName: fd.get('appName'),
      iqamaExpiry: fd.get('iqamaExpiry') || null, workCardExpiry: fd.get('workCardExpiry') || null, vacationEndDate: fd.get('vacationEndDate') || null
    });
    toast(authState, `تم حفظ المندوب ID ${courier.id}`);
    e.target.reset();
  } catch (err) { toast(authState, err.message, true); }
});

document.getElementById('opsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/daily-ops', 'POST', {
      courierId: Number(fd.get('courierId')), date: fd.get('date'), shift: fd.get('shift'),
      orders: Number(fd.get('orders')), target: Number(fd.get('target')), commission: Number(fd.get('commission')),
      advances: Number(fd.get('advances')), debt: Number(fd.get('debt')), notes: fd.get('notes')
    });
    toast(authState, 'تم حفظ الإغلاق اليومي');
    e.target.reset();
  } catch (err) { toast(authState, err.message, true); }
});

document.getElementById('importForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('importFile').files[0];
  if (!file) return;
  try {
    const rows = parseCsv(await file.text());
    const data = await api('/api/couriers/import', 'POST', { rows });
    toast(importState, `تم استيراد ${data.importedCount} مندوب`);
  } catch (err) { toast(importState, err.message, true); }
});

document.getElementById('insightsBtn').addEventListener('click', async () => {
  try { insights.textContent = JSON.stringify(await api('/api/insights'), null, 2); }
  catch (err) { insights.textContent = `خطأ: ${err.message}`; }
});

applyRoleUI();
