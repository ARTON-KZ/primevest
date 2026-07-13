// Admin control panel.
(function () {
  const { api, Auth, toast, money } = window.RACK;
  if (!window.RACK.requireAuth(true)) return;

  const $ = (id) => document.getElementById(id);
  $('adminEmail').textContent = Auth.user.email;

  let users = [];
  const TITLES = { users: 'Users', transactions: 'Transactions', settings: 'Settings', admins: 'Administrators' };

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  function switchTab(tab) {
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== tab));
    document.querySelectorAll('.nav-item[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('pageTitle').textContent = TITLES[tab];
    if (tab === 'transactions') loadTransactions();
    if (tab === 'settings') loadSettings();
    if (tab === 'admins') loadAdmins();
  }
  document.querySelectorAll('.nav-item[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('logoutBtn').addEventListener('click', () => { Auth.clear(); location.href = 'login.html'; });

  // ── Stats + users ─────────────────────────────────────────────────────────────
  async function loadStats() {
    const s = await api.get('/api/admin/stats');
    const cards = [
      ['Total users', s.totalUsers, ''],
      ['Active earners', s.activeEarners, 'green'],
      ['Total balance', money(s.totalBalance, 'USD'), 'green'],
      ['Total deposited', money(s.totalDeposit, 'USD'), ''],
      ['Pending deposits', money(s.pendingDeposit, 'USD'), 'amber'],
      ['Pending withdrawals', money(s.pendingWithdrawal, 'USD'), 'amber'],
    ];
    $('statsGrid').innerHTML = cards.map(([l, v, c]) =>
      `<div class="stat card"><div class="label">${l}</div><div class="value ${c}">${v}</div></div>`).join('');
  }

  function earnText(u) {
    if (!u.earn_active || !u.earn_amount) return '<span class="muted">—</span>';
    return `<span class="badge green"><span class="dot"></span>$${u.earn_amount}/${fmtInterval(u.earn_interval_sec)}</span>`;
  }
  function statusBadge(u) {
    if (u.blocked) return '<span class="badge red">blocked</span>';
    const cls = u.status === 'approved' ? 'green' : u.status === 'rejected' ? 'red' : 'amber';
    return `<span class="badge ${cls}">${u.status}</span>`;
  }
  function renderUsers(list) {
    const body = $('usersBody');
    const real = list.filter(u => u.role === 'user');
    if (!real.length) { body.innerHTML = '<tr><td colspan="6" class="empty">No users yet.</td></tr>'; return; }
    body.innerHTML = real.map(u => `
      <tr data-id="${u.id}">
        <td class="u-name">${esc(u.name)}</td>
        <td class="u-email">${esc(u.email)}</td>
        <td>${esc(u.country || '—')}</td>
        <td class="mono">${money(u.balance, u.currency)}</td>
        <td>${earnText(u)}</td>
        <td>${statusBadge(u)}</td>
      </tr>`).join('');
    body.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => openDrawer(parseInt(tr.dataset.id))));
  }
  async function loadUsers() {
    users = await api.get('/api/admin/users');
    renderUsers(users);
  }
  $('userSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderUsers(users.filter(u => (u.name + ' ' + u.email).toLowerCase().includes(q)));
  });

  // ── Interval helpers ──────────────────────────────────────────────────────────
  const UNITS = [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  function fmtInterval(sec) {
    for (const [u, s] of UNITS) if (sec % s === 0 && sec >= s) { const n = sec / s; return n === 1 ? u : n + u[0]; }
    return sec + 's';
  }
  function decompose(sec) {
    for (const [u, s] of UNITS) if (sec % s === 0 && sec >= s) return { n: sec / s, unit: s };
    return { n: sec || 1, unit: 1 };
  }

  // ── User drawer ───────────────────────────────────────────────────────────────
  const drawer = $('drawer');
  drawer.addEventListener('click', (e) => { if (e.target === drawer) closeDrawer(); });
  function closeDrawer() { drawer.classList.add('hidden'); }

  async function openDrawer(id) {
    drawer.classList.remove('hidden');
    $('drawerInner').innerHTML = '<div class="empty">Loading…</div>';
    let data;
    try { data = await api.get('/api/admin/users/' + id); } catch (e) { $('drawerInner').innerHTML = `<div class="empty">${e.message}</div>`; return; }
    const u = data.user;
    const d = decompose(u.earn_interval_sec || 3600);
    $('drawerInner').innerHTML = `
      <div class="drawer-head">
        <div><h2>${esc(u.name)}</h2><p class="muted">${esc(u.email)}</p><p class="muted">${esc(u.country || '')} · ${esc(u.phone || '')}</p>
        ${u.whatsapp ? `<p class="muted">WhatsApp: ${esc(u.whatsapp)}</p>` : ''}
        ${u.address ? `<p class="muted">${esc(u.address)}${u.office_location ? ' · ' + esc(u.office_location) : ''}</p>` : ''}</div>
        <button class="drawer-close" id="dClose">×</button>
      </div>
      <div class="drawer-bal">
        <div><span class="l">Balance</span><span class="v">${money(u.balance, u.currency)}</span></div>
        <div><span class="l">Profit</span><span class="v">${money(u.profit, u.currency)}</span></div>
        <div><span class="l">Deposited</span><span class="v">${money(u.deposit_total, u.currency)}</span></div>
        <div><span class="l">🔒 Locked</span><span class="v" style="color:var(--amber)">${money(u.locked, u.currency)}</span></div>
      </div>

      <div class="drawer-block">
        <h3>Credit / debit</h3>
        <div class="inline-form">
          <select class="select" id="dField"><option value="balance">Balance</option><option value="profit">Profit</option><option value="deposit">Deposit total</option><option value="locked">Locked balance</option></select>
          <select class="select" id="dAction"><option value="increase">Add</option><option value="reduce">Remove</option></select>
          <input class="input mono" id="dAmount" type="number" placeholder="0.00" style="max-width:120px" />
          <button class="btn btn-primary btn-sm" id="dApplyBal">Apply</button>
        </div>
      </div>

      <div class="drawer-block">
        <h3>Auto-earnings</h3>
        <p class="earn-status" id="earnStatus"></p>
        <div class="inline-form" style="margin-bottom:10px">
          <input class="input mono" id="eAmount" type="number" value="${u.earn_amount || 0}" placeholder="Amount" style="max-width:110px" />
          <span class="muted" style="align-self:center">every</span>
          <input class="input mono" id="eEvery" type="number" min="1" value="${d.n}" style="max-width:80px" />
          <select class="select" id="eUnit">
            <option value="1">seconds</option><option value="60">minutes</option>
            <option value="3600">hours</option><option value="86400">days</option>
          </select>
          <button class="btn btn-primary btn-sm" id="eApply">Set rate</button>
        </div>
        <div class="toggle-row">
          <span>Auto-earning ${u.earn_active ? 'running' : 'paused'}</span>
          <label class="switch"><input type="checkbox" id="eActive" ${u.earn_active ? 'checked' : ''}><span class="track"></span></label>
        </div>
      </div>

      <div class="drawer-block">
        <h3>Account</h3>
        <div class="btn-grid">
          ${u.status !== 'approved' ? '<button class="btn btn-outline btn-sm" data-act="approve">Approve</button>' : ''}
          ${u.blocked
            ? '<button class="btn btn-outline btn-sm" data-act="unblock">Unblock</button>'
            : '<button class="btn btn-outline btn-sm btn-danger" data-act="block">Block</button>'}
          <button class="btn btn-outline btn-sm" data-act="password">Reset password</button>
          <button class="btn btn-outline btn-sm" data-act="impersonate">Log in as user</button>
          <button class="btn btn-outline btn-sm btn-danger" data-act="clear">Clear balances</button>
          <button class="btn btn-outline btn-sm btn-danger" data-act="delete">Delete user</button>
        </div>
      </div>`;

    $('eUnit').value = String(d.unit);
    updateEarnStatus(u);
    $('dClose').addEventListener('click', closeDrawer);

    $('dApplyBal').addEventListener('click', async () => {
      const amount = parseFloat($('dAmount').value);
      if (!amount) return toast('Enter an amount', 'error');
      try {
        const r = await api.patch(`/api/admin/users/${id}/balance`, { field: $('dField').value, action: $('dAction').value, amount });
        toast('Balance updated'); refreshDrawerBal(r.user); loadUsers();
      } catch (e) { toast(e.message, 'error'); }
    });

    $('eApply').addEventListener('click', async () => {
      const amount = parseFloat($('eAmount').value);
      const interval_sec = Math.max(1, parseInt($('eEvery').value) * parseInt($('eUnit').value));
      try {
        const r = await api.patch(`/api/admin/users/${id}/earnings`, { amount, interval_sec });
        toast('Earning rate set'); updateEarnStatus(r.user); loadUsers();
      } catch (e) { toast(e.message, 'error'); }
    });

    $('eActive').addEventListener('change', async (e) => {
      try {
        const r = await api.patch(`/api/admin/users/${id}/earnings`, { active: e.target.checked });
        toast(e.target.checked ? 'Auto-earning resumed' : 'Auto-earning paused');
        updateEarnStatus(r.user); loadUsers();
      } catch (err) { toast(err.message, 'error'); e.target.checked = !e.target.checked; }
    });

    $('drawerInner').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => accountAction(id, b.dataset.act)));
  }

  function updateEarnStatus(u) {
    const el = $('earnStatus');
    if (!el) return;
    if (u.earn_active && u.earn_amount) el.innerHTML = `<span class="green">Running</span> — +${money(u.earn_amount, u.currency)} every ${fmtInterval(u.earn_interval_sec)}`;
    else if (u.earn_amount) el.innerHTML = `<span class="muted">Paused</span> — rate: +${money(u.earn_amount, u.currency)} every ${fmtInterval(u.earn_interval_sec)}`;
    else el.innerHTML = '<span class="muted">No earning rate set</span>';
  }
  function refreshDrawerBal(u) {
    const vals = drawer.querySelectorAll('.drawer-bal .v');
    if (vals.length >= 4) {
      vals[0].textContent = money(u.balance, u.currency);
      vals[1].textContent = money(u.profit, u.currency);
      vals[2].textContent = money(u.deposit_total, u.currency);
      vals[3].textContent = money(u.locked, u.currency);
    }
  }

  async function accountAction(id, act) {
    try {
      if (act === 'approve') { await api.patch(`/api/admin/users/${id}/status`, { status: 'approved' }); toast('User approved'); }
      else if (act === 'block') { await api.patch(`/api/admin/users/${id}/block`, { blocked: true }); toast('User blocked'); }
      else if (act === 'unblock') { await api.patch(`/api/admin/users/${id}/block`, { blocked: false }); toast('User unblocked'); }
      else if (act === 'password') { const r = await api.patch(`/api/admin/users/${id}/password`); prompt('New password (copy & share):', r.newPassword); }
      else if (act === 'impersonate') {
        if (!confirm('Log in as this user? This will replace your admin session in this tab.')) return;
        const r = await api.post(`/api/admin/users/${id}/impersonate`); Auth.set(r); location.href = 'dashboard.html'; return;
      }
      else if (act === 'clear') { if (!confirm('Zero all balances for this user?')) return; await api.post(`/api/admin/users/${id}/clear`); toast('Balances cleared'); }
      else if (act === 'delete') { if (!confirm('Permanently delete this user?')) return; await api.del(`/api/admin/users/${id}`); toast('User deleted'); closeDrawer(); loadUsers(); loadStats(); return; }
      await openDrawer(id); loadUsers(); loadStats();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Transactions ──────────────────────────────────────────────────────────────
  async function loadTransactions() {
    const txns = await api.get('/api/admin/transactions');
    const pending = txns.filter(t => t.status === 'pending' && (t.type === 'deposit' || t.type === 'withdrawal'));
    const cnt = $('pendCount');
    cnt.textContent = pending.length; cnt.classList.toggle('hidden', !pending.length);

    $('pendingList').innerHTML = pending.length ? pending.map(t => `
      <div class="pending-row">
        <div>
          <div class="row-title">${t.type === 'deposit' ? 'Deposit' : 'Withdrawal'} · ${t.coin || ''} <span class="mono green">${money(t.amount, 'USD')}</span></div>
          <div class="row-sub">${esc(t.user_name)} (${esc(t.user_email)}) · ${(t.created_at || '').replace('T', ' ')}</div>
          ${t.type === 'withdrawal' && t.address ? `<div class="row-sub mono">→ ${esc(t.address)}</div>` : ''}
        </div>
        <div class="pending-actions">
          <button class="btn btn-primary btn-sm" data-txn="${t.id}" data-do="approve">Approve</button>
          <button class="btn btn-outline btn-sm btn-danger" data-txn="${t.id}" data-do="reject">Reject</button>
        </div>
      </div>`).join('') : '<div class="empty">No pending approvals.</div>';

    $('pendingList').querySelectorAll('[data-txn]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try { const r = await api.patch(`/api/admin/transactions/${b.dataset.txn}`, { action: b.dataset.do }); toast(r.message); loadTransactions(); loadStats(); loadUsers(); }
      catch (e) { toast(e.message, 'error'); b.disabled = false; }
    }));

    $('allTxnBody').innerHTML = txns.length ? txns.map(t => `
      <tr><td>${esc(t.user_name || '')}</td><td>${t.type}</td><td>${t.coin || '—'}</td>
      <td class="mono">${money(t.amount, 'USD')}</td><td>${badge(t.status)}</td><td class="mono">${(t.created_at || '').replace('T', ' ')}</td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">No transactions.</td></tr>';
  }
  function badge(s) { const c = s === 'completed' ? 'green' : s === 'rejected' ? 'red' : 'amber'; return `<span class="badge ${c}">${s}</span>`; }

  // ── Settings ──────────────────────────────────────────────────────────────────
  async function loadSettings() {
    const s = await api.get('/api/admin/settings');
    ['addr_btc', 'addr_eth', 'addr_usdt', 'usdt_network', 'min_deposit', 'min_withdraw', 'support_email', 'company_office', 'company_address', 'company_whatsapp'].forEach(k => {
      const el = $('s_' + k); if (el) el.value = s[k] || '';
    });
  }
  $('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {};
    ['addr_btc', 'addr_eth', 'addr_usdt', 'usdt_network', 'min_deposit', 'min_withdraw', 'support_email', 'company_office', 'company_address', 'company_whatsapp'].forEach(k => { payload[k] = $('s_' + k).value; });
    try { const r = await api.patch('/api/admin/settings', payload); toast(r.message); } catch (err) { toast(err.message, 'error'); }
  });

  // ── Admins ────────────────────────────────────────────────────────────────────
  async function loadAdmins() {
    const admins = await api.get('/api/admin/admins');
    $('adminsList').innerHTML = admins.map(a => `
      <div class="pending-row">
        <div><div class="row-title">${esc(a.name)}</div><div class="row-sub">${esc(a.email)}</div></div>
        ${a.id === Auth.user.id ? '<span class="badge">you</span>' : `<button class="btn btn-outline btn-sm btn-danger" data-rm="${a.id}">Remove</button>`}
      </div>`).join('');
    $('adminsList').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this administrator?')) return;
      try { await api.del('/api/admin/admins/' + b.dataset.rm); toast('Administrator removed'); loadAdmins(); }
      catch (e) { toast(e.message, 'error'); }
    }));
  }
  $('addAdminForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/admins', { name: $('a_name').value.trim(), email: $('a_email').value.trim(), password: $('a_password').value });
      toast('Administrator created'); $('addAdminForm').reset(); loadAdmins();
    } catch (err) { toast(err.message, 'error'); }
  });

  // ── Utils ─────────────────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // Init
  switchTab('users');
  loadStats();
  loadUsers();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
})();
