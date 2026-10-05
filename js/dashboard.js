import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const COMPANY_EMAIL_DOMAIN = '@skintegritypartners.com';
const DATA_WINDOW_DAYS = 30;
const THEMES = ['dark', 'light', 'console'];
let usageRows = [];
let signedInUser = null;

function applyTheme(theme, persist = false) {
  const selectedTheme = THEMES.includes(theme) ? theme : 'dark';
  document.body.dataset.theme = selectedTheme;
  const themeButton = document.getElementById('theme-toggle');
  const sidebarThemeButton = document.getElementById('sidebar-theme');
  const labels = {
    dark: 'Dark theme',
    light: 'Light theme',
    console: 'Console theme',
  };
  if (themeButton) {
    themeButton.setAttribute('aria-label', `Theme: ${labels[selectedTheme]}. Click to change theme.`);
    themeButton.title = `Theme: ${labels[selectedTheme]}`;
    themeButton.dataset.theme = selectedTheme;
    const icons = {
      dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"/></svg>',
      light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>',
      console: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m5 0h5"/></svg>',
    };
    themeButton.innerHTML = icons[selectedTheme];
  }
  if (sidebarThemeButton) {
    const label = sidebarThemeButton.querySelector('.nav-label');
    if (label) label.textContent = `Settings & Appearance · ${selectedTheme}`;
  }
  if (persist) {
    try {
      localStorage.setItem('dashboard_theme', selectedTheme);
    } catch (error) {
      console.error('Could not save dashboard theme preference:', error);
    }
  }
}

try {
  applyTheme(localStorage.getItem('dashboard_theme') || 'dark');
} catch (error) {
  console.error('Could not read dashboard theme preference:', error);
  applyTheme('dark');
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace('./index.html');
    return;
  }

  let userData = {};
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) userData = userDoc.data();
  } catch (error) {
    console.error("Could not load the user's membership profile:", error);
  }

  showDashboard(user, userData);
});

function isCompanyAdmin(user) {
  return Boolean(
    user.emailVerified &&
      user.email?.trim().toLowerCase().endsWith(COMPANY_EMAIL_DOMAIN)
  );
}

function showDashboard(user, userData) {
  signedInUser = user;
  const admin = isCompanyAdmin(user);
  const rawTier = userData.membershipTier || userData.tier || userData.role || 'free';
  const tier = String(rawTier).toLowerCase().trim();
  const role = admin
    ? 'Admin • Staff Access'
    : tier === 'premium' || tier === 'member'
      ? 'Premium Member • Access Pending'
      : 'Free Member';
  const displayName = userData.fullName || userData.name || user.email || 'Member';
  const nameElem = document.getElementById('user-display-name');
  const roleElem = document.getElementById('user-display-role');
  const initialsElem = document.getElementById('profile-initials');
  const accessStatus = document.getElementById('access-status');

  if (nameElem) nameElem.textContent = displayName;
  if (roleElem) roleElem.textContent = role;
  if (initialsElem) {
    initialsElem.textContent = displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }
  if (accessStatus) {
    accessStatus.textContent = admin
      ? 'Admin tools enabled'
      : 'Clinical tool access is currently limited to authorized Admin accounts';
  }

  setVisible('free-content', !admin);
  setVisible('upgrade-banner', !admin);
  setVisible('admin-home', admin);
  setVisible('data-toggle', admin);
  for (const [cardId, lockId] of [
    ['sora-launch', 'sora-lock'],
    ['advisor-launch', 'advisor-lock'],
  ]) {
    const link = document.getElementById(cardId);
    const card = link?.closest('.clinical-tool-card');
    setVisible(lockId, !admin);
    if (card) card.classList.toggle('is-locked', !admin);
    if (link) {
      link.setAttribute('aria-disabled', String(!admin));
      link.setAttribute('tabindex', admin ? '0' : '-1');
    }
  }

  const exploreLink = document.querySelector('[data-tool="sora-explore"]');
  if (exploreLink) {
    exploreLink.setAttribute('aria-disabled', String(!admin));
    exploreLink.setAttribute('tabindex', admin ? '0' : '-1');
  }
}

function setVisible(id, visible) {
  const element = document.getElementById(id);
  if (element) element.hidden = !visible;
}

async function loadUsageData() {
  const status = document.getElementById('analytics-status');
  const exportButton = document.getElementById('export-data');
  if (status) status.textContent = 'Loading aggregate usage…';

  const firstDay = new Date();
  firstDay.setUTCDate(firstDay.getUTCDate() - (DATA_WINDOW_DAYS - 1));
  const startDate = firstDay.toISOString().slice(0, 10);
  const usageQuery = query(
    collection(db, 'toolUsage'),
    where('date', '>=', startDate),
    orderBy('date', 'asc')
  );

  try {
    const snapshot = await getDocs(usageQuery);
    usageRows = snapshot.docs.map((document) => document.data());
    renderUsageData();
    if (exportButton) exportButton.disabled = usageRows.length === 0;
  } catch (error) {
    console.error('Could not load aggregate tool usage:', error);
    if (status) status.textContent = 'Usage data could not be loaded. Please try again later.';
    usageRows = [];
    if (exportButton) exportButton.disabled = true;
  }
}

function renderUsageData() {
  const starts = usageRows.reduce((sum, row) => sum + Number(row.starts || 0), 0);
  const completions = usageRows.reduce((sum, row) => sum + Number(row.completions || 0), 0);
  const rate = starts ? `${Math.round((completions / starts) * 100)}%` : '—';
  setText('metric-starts', starts.toLocaleString());
  setText('metric-completions', completions.toLocaleString());
  setText('metric-rate', rate);

  const tools = new Map();
  for (const row of usageRows) {
    const totals = tools.get(row.tool) || { starts: 0, completions: 0 };
    totals.starts += Number(row.starts || 0);
    totals.completions += Number(row.completions || 0);
    tools.set(row.tool, totals);
  }
  const toolBreakdown = document.getElementById('tool-breakdown');
  if (toolBreakdown) {
    toolBreakdown.replaceChildren();
    for (const [tool, totals] of tools) {
      const tableRow = document.createElement('tr');
      const cells = [
        tool === 'sora' ? 'SORA-SF' : 'Treatment Advisor',
        totals.starts.toLocaleString(),
        totals.completions.toLocaleString(),
        totals.starts ? `${Math.round((totals.completions / totals.starts) * 100)}%` : '—',
      ];
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = value;
        tableRow.appendChild(cell);
      }
      toolBreakdown.appendChild(tableRow);
    }
    if (tools.size === 0) {
      const tableRow = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'No tool activity recorded yet.';
      tableRow.appendChild(cell);
      toolBreakdown.appendChild(tableRow);
    }
  }

  const status = document.getElementById('analytics-status');
  const chartWrap = document.getElementById('chart-wrap');
  if (usageRows.length === 0) {
    if (status) status.textContent = 'No usage data yet. Aggregate counts will appear after tools begin recording activity.';
    if (chartWrap) chartWrap.hidden = true;
  } else {
    if (status) status.textContent = `Showing the last ${DATA_WINDOW_DAYS} days.`;
    if (chartWrap) chartWrap.hidden = false;
    renderUsageChart();
  }

  const categories = {};
  for (const row of usageRows) {
    for (const [category, count] of Object.entries(row.categories || {})) {
      categories[category] = (categories[category] || 0) + Number(count || 0);
    }
  }
  const categoryList = document.getElementById('category-list');
  if (categoryList) {
    categoryList.replaceChildren();
    const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    if (sortedCategories.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'No outcome categories recorded yet.';
      categoryList.appendChild(item);
    } else {
      for (const [category, count] of sortedCategories) {
        const item = document.createElement('li');
        const label = document.createElement('span');
        const total = document.createElement('strong');
        label.textContent = category.replaceAll('_', ' ');
        total.textContent = count.toLocaleString();
        item.append(label, total);
        categoryList.appendChild(item);
      }
    }
  }
}

function renderUsageChart() {
  const svg = document.getElementById('usage-chart');
  if (!svg) return;

  const byDay = new Map();
  for (const row of usageRows) {
    const totals = byDay.get(row.date) || { starts: 0, completions: 0 };
    totals.starts += Number(row.starts || 0);
    totals.completions += Number(row.completions || 0);
    byDay.set(row.date, totals);
  }

  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxValue = Math.max(1, ...days.flatMap(([, totals]) => [totals.starts, totals.completions]));
  const x = (index) => 32 + (index * 656) / Math.max(1, days.length - 1);
  const y = (value) => 190 - (value * 160) / maxValue;
  svg.replaceChildren();

  for (const [field, color] of [['starts', '#3b82f6'], ['completions', '#38bdf8']]) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('points', days.map(([, totals], index) => `${x(index)},${y(totals[field])}`).join(' '));
    svg.appendChild(line);
    for (const [index, [, totals]] of days.entries()) {
      const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      point.setAttribute('cx', String(x(index)));
      point.setAttribute('cy', String(y(totals[field])));
      point.setAttribute('r', '3');
      point.setAttribute('fill', color);
      svg.appendChild(point);
    }
  }

  days.forEach(([date], index) => {
    if (index === 0 || index === days.length - 1 || index % 5 === 0) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x(index)));
      label.setAttribute('y', '218');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#8190a5');
      label.setAttribute('font-size', '10');
      label.textContent = date.slice(5);
      svg.appendChild(label);
    }
  });
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function exportUsageCsv() {
  const headings = ['date', 'tool', 'starts', 'completions', 'category', 'category_count'];
  const rows = [headings];
  for (const row of usageRows) {
    const categories = Object.entries(row.categories || {});
    if (categories.length === 0) {
      rows.push([row.date, row.tool, row.starts || 0, row.completions || 0, '', '']);
    } else {
      for (const [category, count] of categories) {
        rows.push([row.date, row.tool, row.starts || 0, row.completions || 0, category, count]);
      }
    }
  }

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = 'skintegrity-tool-usage.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const dataToggle = document.getElementById('data-toggle');
if (dataToggle) {
  dataToggle.addEventListener('click', async () => {
    const showData = dataToggle.getAttribute('aria-expanded') !== 'true';
    dataToggle.setAttribute('aria-expanded', String(showData));
    dataToggle.setAttribute('aria-label', showData ? 'Return to dashboard' : 'Open admin data');
    dataToggle.title = showData ? 'Return to dashboard' : 'Open admin data';
    setVisible('admin-home', !showData);
    setVisible('admin-data', showData);
    for (const selector of ['.section-heading', '.tool-grid', '.utility-section', '.metrics-row']) {
      document.querySelectorAll(selector).forEach((element) => {
        if (!element.closest('#admin-data')) element.hidden = showData;
      });
    }
    if (showData) await loadUsageData();
  });
}

const exportButton = document.getElementById('export-data');
if (exportButton) exportButton.addEventListener('click', exportUsageCsv);

const logoutButton = document.getElementById('logout-btn');
if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.replace('./index.html');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  });
}

const themeToggle = document.getElementById('theme-toggle');
const sidebarThemeToggle = document.getElementById('sidebar-theme');
function cycleTheme() {
  const currentTheme = document.body.dataset.theme || 'dark';
  const nextTheme = THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length];
  applyTheme(nextTheme, true);
}
if (themeToggle) themeToggle.addEventListener('click', cycleTheme);
if (sidebarThemeToggle) sidebarThemeToggle.addEventListener('click', cycleTheme);

document.querySelectorAll('[data-handoff]').forEach((link) => {
  link.addEventListener('click', async (event) => {
    if (!signedInUser || link.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const targetName = `clinical-tool-${Date.now()}`;
    const launchWindow = window.open('about:blank', targetName);
    if (!launchWindow) {
      window.alert('Please allow pop-ups for this site to open the clinical tool.');
      return;
    }
    try {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = link.dataset.handoff;
      form.target = targetName;
      const token = document.createElement('input');
      token.type = 'hidden';
      token.name = 'idToken';
      token.value = await signedInUser.getIdToken();
      form.appendChild(token);
      document.body.appendChild(form);
      form.submit();
      form.remove();
    } catch (error) {
      launchWindow.close();
      console.error('Could not securely open the clinical tool:', error);
      window.alert('Could not securely open the clinical tool. Please try again.');
    }
  });
});

document.querySelectorAll('.tool-card-actions > a:not([data-handoff])').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (link.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });
});

document.querySelectorAll('[data-nav-section]').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelectorAll('[data-nav-section]').forEach((item) => item.classList.remove('is-active'));
    link.classList.add('is-active');
  });
});

const logoutSidebar = document.getElementById('sidebar-logout');
if (logoutSidebar) {
  logoutSidebar.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.replace('./index.html');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  });
}
