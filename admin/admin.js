/* ============================================================
   AI-Solutions — Admin Dashboard JavaScript
   Handles: auth guard, sidebar toggle, stat cards,
            enquiries table (paginated + searchable),
            detail modal, logout
   Backend endpoints expected:
     GET  /api/admin/stats        → { total, new, replied, thisMonth }
     GET  /api/admin/enquiries    → [ { id, name, email, phone, company,
                                        country, job_title, message,
                                        created_at, status } ]
     POST /api/admin/logout       → 200 OK
   ============================================================ */

/* ----------------------------------------------------------
   0. AUTH GUARD — redirect to login if no token
---------------------------------------------------------- */
(function authGuard() {
  const token = sessionStorage.getItem('ais_admin_token');
  if (!token) window.location.href = 'login.html';
})();

/* ----------------------------------------------------------
   1. GLOBALS (dashboard-scoped — prefixed to avoid collisions
   with inline scripts on non-dashboard admin pages)
---------------------------------------------------------- */
var _enqAll       = [];   // full dataset from API (or mock)
var _enqFiltered  = [];   // after search filter
var _enqPage      = 1;
var _ENQ_SIZE     = 15;

/* ----------------------------------------------------------
   2. INIT
---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {

  /* Set date in topbar + welcome banner */
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  const el = document.getElementById('topbarDate');
  if (el) el.textContent = dateStr;
  const pill = document.getElementById('topbarDatePill');
  if (pill) pill.textContent = dateStr;

  /* Set current month label (dashboard only) */
  const monthLabel = now.toLocaleString('en-GB', { month:'long', year:'numeric' });
  const monthEl = document.getElementById('statMonthLabel');
  if (monthEl) monthEl.textContent = `Enquiries in ${monthLabel}`;

  /* Mobile sidebar toggle */
  document.getElementById('sidebarToggle')?.addEventListener('click', openSidebar);
  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

  /* Clear session when "View site" is clicked */
  document.querySelectorAll('.sidebar-footer a[href*="home"]').forEach(a => {
    a.addEventListener('click', () => sessionStorage.removeItem('ais_admin_token'));
  });

  /* Dashboard data — runs FIRST before any setup that could crash */
  if (document.getElementById('enquiriesBody')) {
    loadStats();
    loadEnquiries();
  }

  /* ── Avatar dropdown ── (wrapped in try-catch so a crash here never blocks anything) */
  function parseJwt(token) {
    try {
      return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    } catch { return {}; }
  }

  function doLogout() {
    fetch('/api/admin/logout', { method:'POST', credentials:'include' }).catch(()=>{});
    sessionStorage.removeItem('ais_admin_token');
    window.location.href = 'login.html';
  }

  try {
    const avatarEl = document.getElementById('topbarAvatar') || document.querySelector('.topbar-avatar');
    if (avatarEl) {
      const payload    = parseJwt(sessionStorage.getItem('ais_admin_token') || '');
      const adminName  = payload.name  || 'Admin';
      const adminEmail = payload.email || '';
      const initials   = adminName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

      avatarEl.innerHTML = '<div class="avatar-img-wrap"><img src="../logo.png" alt="' + initials + '" onerror="this.style.display=\'none\'" /></div>';
      avatarEl.insertAdjacentHTML('beforeend',
        '<div class="avatar-dropdown" id="avatarDropdown">' +
          '<div class="avatar-dropdown-header">' +
            '<div class="avatar-dropdown-name">'  + adminName  + '</div>' +
            '<div class="avatar-dropdown-email">' + adminEmail + '</div>' +
            '<span class="avatar-dropdown-role">Administrator</span>' +
          '</div>' +
          '<div class="avatar-dropdown-body">' +
            '<a href="settings.html" class="avatar-dropdown-item"><i class="fas fa-cog"></i> Settings</a>' +
            '<a href="dashboard.html" class="avatar-dropdown-item"><i class="fas fa-chart-pie"></i> Dashboard</a>' +
            '<div class="avatar-dropdown-divider"></div>' +
            '<a href="../home.html" target="_blank" class="avatar-dropdown-item"><i class="fas fa-external-link-alt"></i> View Website</a>' +
            '<div class="avatar-dropdown-divider"></div>' +
            '<button class="avatar-dropdown-item danger" id="avatarLogout"><i class="fas fa-sign-out-alt"></i> Sign Out</button>' +
          '</div>' +
        '</div>'
      );

      const dropdown = document.getElementById('avatarDropdown');
      if (dropdown) {
        avatarEl.addEventListener('click', function (e) {
          e.stopPropagation();
          dropdown.classList.toggle('open');
        });
        document.addEventListener('click', function () {
          dropdown.classList.remove('open');
        });
        document.getElementById('avatarLogout')?.addEventListener('click', doLogout);
      }
    }
  } catch (e) {
    console.error('[admin] avatar setup error:', e);
  }

  /* Logout (sidebar button) */
  document.getElementById('logoutBtn')?.addEventListener('click', function (e) {
    e.preventDefault();
    doLogout();
  });
});

/* ----------------------------------------------------------
   3. SIDEBAR MOBILE
---------------------------------------------------------- */
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
}

/* ----------------------------------------------------------
   4. LOAD STATS — GET /api/admin/stats
---------------------------------------------------------- */
async function loadStats() {
  try {
    const res  = await fetch('/api/admin/stats', {
      headers: authHeaders(),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('stats fetch failed');
    const data = await res.json();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? 0; };
    set('statTotal',   data.total);
    set('statNew',     data.new);
    set('statReplied', data.replied);
    set('statMonth',   data.thisMonth);

    const badge = document.getElementById('unreadBadge');
    if (badge) {
      badge.textContent = data.new ?? 0;
      badge.classList.toggle('hidden', !data.new);
    }

    const qlBlog  = document.getElementById('qlBlog');
    const qlEvents = document.getElementById('qlEvents');
    const qlSubs  = document.getElementById('qlSubs');
    if (qlBlog)   qlBlog.textContent   = `${data.blogPosts ?? 0} posts published`;
    if (qlEvents) qlEvents.textContent = `${data.upcomingEvents ?? 0} upcoming events`;
    if (qlSubs)   qlSubs.textContent   = `${data.subscribers ?? 0} active subscribers`;
  } catch {
    /* Dev / offline mode — derive stats from mock data */
    setTimeout(() => {
      const t = _enqAll.length;
      const n = _enqAll.filter(e => e.status === 'new').length;
      const r = _enqAll.filter(e => e.status === 'replied').length;
      const m = _enqAll.filter(e => {
        const d = new Date(e.created_at);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('statTotal',   t);
      set('statNew',     n);
      set('statReplied', r);
      set('statMonth',   m);
      const badge = document.getElementById('unreadBadge');
      if (badge) { badge.textContent = n; badge.classList.toggle('hidden', !n); }
    }, 500);
  }
}

/* ----------------------------------------------------------
   5. LOAD ENQUIRIES — GET /api/admin/enquiries
---------------------------------------------------------- */
async function loadEnquiries() {
  const icon = document.getElementById('refreshIcon');
  icon?.classList.add('spin');

  try {
    const res = await fetch('/api/admin/enquiries', {
      headers: authHeaders(),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('enquiries fetch failed');
    const data = await res.json();
    _enqAll = Array.isArray(data) ? data : [];
  } catch {
    _enqAll = mockEnquiries();
  }

  _enqFiltered = _enqAll.slice();
  _enqPage = 1;
  renderTable();
  loadStats();

  icon?.classList.remove('spin');
}

/* ----------------------------------------------------------
   6. RENDER TABLE (paginated)
---------------------------------------------------------- */
function renderTable() {
  const tbody = document.getElementById('enquiriesBody');
  if (!tbody) return;

  const total = _enqFiltered.length;
  const start = (_enqPage - 1) * _ENQ_SIZE;
  const end   = Math.min(start + _ENQ_SIZE, total);
  const slice = _enqFiltered.slice(start, end);

  const countEl = document.getElementById('tableCount');
  if (countEl) countEl.textContent = `${total} total`;
  const pgInfo = document.getElementById('paginationInfo');
  if (pgInfo) pgInfo.textContent = total === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${total}`;
  const prevBtn = document.getElementById('prevPage');
  if (prevBtn) prevBtn.disabled = _enqPage === 1;
  const nextBtn = document.getElementById('nextPage');
  if (nextBtn) nextBtn.disabled = end >= total;

  if (slice.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-loading">
          <i class="fas fa-inbox"></i>
          No enquiries found.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = slice.map((row, i) => `
    <tr style="cursor:pointer" onclick="openDetail(${row.id || start + i})">
      <td style="color:var(--light-text);font-size:.78rem">#${row.id ?? (start + i + 1)}</td>
      <td class="name-cell">${esc(row.name)}</td>
      <td class="email-cell">${esc(row.email)}</td>
      <td>${esc(row.company || '—')}</td>
      <td>${esc(row.country || '—')}</td>
      <td>${esc(row.job_title || '—')}</td>
      <td style="white-space:nowrap">${formatDate(row.created_at)}</td>
      <td>${statusBadge(row.status)}</td>
    </tr>
  `).join('');
}

/* ----------------------------------------------------------
   7. SEARCH FILTER
---------------------------------------------------------- */
function filterTable(query) {
  const q = query.toLowerCase().trim();
  _enqFiltered = q
    ? _enqAll.filter(r =>
        [r.name, r.email, r.company, r.country, r.job_title, r.message]
          .some(v => (v || '').toLowerCase().includes(q))
      )
    : [..._enqAll];
  _enqPage = 1;
  renderTable();
}

/* ----------------------------------------------------------
   8. PAGINATION
---------------------------------------------------------- */
function changePage(dir) {
  const maxPage = Math.ceil(_enqFiltered.length / _ENQ_SIZE);
  _enqPage = Math.max(1, Math.min(_enqPage + dir, maxPage));
  renderTable();
}

/* ----------------------------------------------------------
   9. DETAIL MODAL
---------------------------------------------------------- */
function openDetail(id) {
  const row = _enqAll.find(r => r.id == id) ||
              _enqAll[id] ||   // fallback for index-based mock
              _enqAll[parseInt(id)];
  if (!row) return;

  document.getElementById('modalTitle').textContent = `Enquiry from ${row.name}`;
  document.getElementById('modalContent').innerHTML = `
    <div style="display:grid;gap:14px">
      ${detailRow('fas fa-user',         'Name',        row.name)}
      ${detailRow('fas fa-envelope',     'Email',       row.email)}
      ${detailRow('fas fa-phone',        'Phone',       row.phone || '—')}
      ${detailRow('fas fa-building',     'Company',     row.company || '—')}
      ${detailRow('fas fa-globe',        'Country',     row.country || '—')}
      ${detailRow('fas fa-briefcase',    'Job Title',   row.job_title || '—')}
      ${detailRow('fas fa-calendar-alt', 'Submitted',   formatDate(row.created_at))}
      ${detailRow('fas fa-tag',          'Status',      statusBadge(row.status))}
      <div style="border-top:1px solid rgba(0,0,0,.06);padding-top:12px">
        <div style="font-size:.78rem;font-weight:600;color:var(--light-text);margin-bottom:6px">MESSAGE</div>
        <p style="font-size:.875rem;color:var(--body-text);line-height:1.7;white-space:pre-wrap">${esc(row.message || 'No message provided.')}</p>
      </div>
    </div>
  `;
  const modal = document.getElementById('detailModal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function detailRow(icon, label, value) {
  return `
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div style="width:32px;height:32px;background:rgba(31,137,222,.09);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--blue);flex-shrink:0;font-size:.85rem">
        <i class="${icon}"></i>
      </div>
      <div>
        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.8px;color:var(--light-text);font-weight:600;margin-bottom:2px">${label}</div>
        <div style="font-size:.88rem;color:var(--navy);font-weight:500">${value}</div>
      </div>
    </div>
  `;
}

function closeDetail() {
  document.getElementById('detailModal').style.display = 'none';
  document.body.style.overflow = '';
}

/* Close modal on backdrop click */
document.getElementById('detailModal')?.addEventListener('click', function (e) {
  if (e.target === this) closeDetail();
});

/* Esc key closes any modal */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeDetail();
    const overlay = document.getElementById('modal');
    if (overlay) overlay.style.display = 'none';
  }
});

/* ----------------------------------------------------------
   10. HELPERS
---------------------------------------------------------- */
function authHeaders() {
  const token = sessionStorage.getItem('ais_admin_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day:'2-digit', month:'short', year:'numeric'
    });
  } catch { return dateStr; }
}

function statusBadge(status) {
  const map = {
    new:          ['status-new',          'New'],
    read:         ['status-read',         'Read'],
    replied:      ['status-replied',      'Replied'],
    published:    ['status-published',    'Published'],
    draft:        ['status-draft',        'Draft'],
    active:       ['status-active',       'Active'],
    inactive:     ['status-inactive',     'Inactive'],
    upcoming:     ['status-upcoming',     'Upcoming'],
    past:         ['status-past',         'Past'],
    hidden:       ['status-hidden',       'Hidden'],
    unsubscribed: ['status-unsubscribed', 'Unsubscribed'],
  };
  const [cls, label] = map[status] || ['status-new', status || 'Unknown'];
  return `<span class="status-badge ${cls}">${label}</span>`;
}

/* ----------------------------------------------------------
   TOAST NOTIFICATIONS (global — used by all admin pages)
---------------------------------------------------------- */
function showToast(message, type = 'success') {
  let container = document.getElementById('toasts');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toasts';
    document.body.appendChild(container);
  }
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${esc(String(message))}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all .3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ----------------------------------------------------------
   11. FILE UPLOAD HELPER
---------------------------------------------------------- */
function uploadImg(inputId) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.click();
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) { fileInput.remove(); return; }
    const fd = new FormData();
    fd.append('image', file);
    const token = sessionStorage.getItem('ais_admin_token');
    showToast('Uploading image…', 'info');
    try {
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: fd,
      });
      const data = await res.json();
      if (data.url) {
        document.getElementById(inputId).value = data.url;
        showToast('Image uploaded!', 'success');
      } else {
        showToast(data.message || 'Upload failed', 'error');
      }
    } catch (e) {
      showToast('Upload error: ' + e.message, 'error');
    }
    fileInput.remove();
  });
}

/* ----------------------------------------------------------
   12. MOCK DATA (remove when backend is connected)
   Simulates what GET /api/admin/enquiries returns.
---------------------------------------------------------- */
function mockEnquiries() {
  const statuses = ['new', 'new', 'new', 'read', 'replied'];
  const countries = ['United Kingdom', 'United States', 'Germany', 'France', 'Netherlands'];
  const companies = ['Horizon Care', 'UrbanStyle Retail', 'Nova International College', 'SwiftMove Logistics', 'Nexa Corporate'];
  const jobs = ['Head of AI', 'CTO', 'Data Science Lead', 'Operations Director', 'IT Manager'];
  const names = [
    ['Dr. Melissa Carter', 'melissa.carter@horizoncare.nhs.uk'],
    ['Daniel Brooks',      'daniel.brooks@urbanstyle.com'],
    ['Priya Sharma',       'priya.sharma@novacollege.ac.uk'],
    ['Eric Thompson',      'eric.t@swiftmovelogistics.co.uk'],
    ['Karen White',        'karen.white@nexacorp.com'],
    ['James O\'Connor',    'james.oconnor@medicore.io'],
    ['Sophie Zhang',       'sophie.zhang@edutechglobal.com'],
    ['Raj Patel',          'raj.patel@fleetops.co.uk'],
    ['Laura Bennett',      'l.bennett@securasys.co.uk'],
    ['Mohamed Al-Rashid',  'm.alrashid@novainvest.ae'],
    ['Chloe Dubois',       'c.dubois@datacloud.fr'],
    ['Tobias Werner',      'tobias.werner@aiautomation.de'],
    ['Aisha Johnson',      'aisha.johnson@healthnexus.ng'],
    ['Carlos Rivera',      'c.rivera@retailmind.mx'],
    ['Hannah Kim',         'h.kim@edunova.kr'],
    ['Oliver Hayes',       'o.hayes@fleetpilot.co.uk'],
    ['Natasha Ivanova',    'n.ivanova@securevision.ru'],
    ['David Osei',         'david.osei@techbridge.gh'],
  ];

  const messages = [
    'We are interested in deploying HealthSync AI across our 3-hospital trust. Can we schedule a demo?',
    'RetailMind looks like exactly what we need for our 50-store chain. Please get in touch.',
    'Would love to discuss EduNova for our 2,000+ student college. Available for a call next week?',
    'We run a national fleet of 300 vehicles. FleetPilot AI could be transformative. Let\'s talk.',
    'Our data centre security needs modernising. SecureVision looks promising. Please contact me.',
    'Looking to integrate AI quality control into our manufacturing line. Can you advise?',
    'Interested in your Data Foundation platform for our data lake migration project.',
    'We need AI model monitoring for our production NLP pipeline. Is this something you can help with?',
    'We\'d like to understand your pricing and deployment timelines. Please reach out.',
    'We\'re evaluating AI vendors for a £2M transformation project. Can we arrange a call?',
    'Can your platform handle GDPR-compliant data pipelines? Please advise.',
    'We need AI-assisted diagnostics integrated with our existing PACS system.',
    'Looking for an AI partner to help us automate our customer segmentation.',
    'Can you provide a case study from the retail sector before we proceed?',
    'We\'re a government agency and need ISO 27001-certified solutions.',
    'Interested in a pilot project for fleet route optimisation. What\'s the minimum commitment?',
    'Our security team wants to evaluate SecureVision against our current CCTV setup.',
    'Please send pricing information for the Model & Agent Orchestration platform.',
  ];

  return names.map(([name, email], i) => ({
    id: i + 1,
    name,
    email,
    phone: `+44 7${String(700 + i).padStart(3,'0')} ${String(900000 + i * 17).padStart(6,'0')}`,
    company:   companies[i % companies.length],
    country:   countries[i % countries.length],
    job_title: jobs[i % jobs.length],
    message:   messages[i % messages.length],
    status:    statuses[i % statuses.length],
    created_at: new Date(Date.now() - i * 86400000 * 2.3).toISOString(),
  }));
}
