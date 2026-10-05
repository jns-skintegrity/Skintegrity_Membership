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
let usageRows = [];

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
  const admin = isCompanyAdmin(user);
  const role = admin ? 'admin' : 'free';
  const nameElem = document.getElementById('user-display-name');
  const roleElem = document.getElementById('user-display-role');

  if (nameElem) {
    nameElem.textContent = userData.fullName || userData.name || user.email || 'Member';
  }
  if (roleElem) roleElem.textContent = `${role.toUpperCase()} ACCESS`;

  setVisible('free-content', !admin);
  setVisible('upgrade-banner', !admin);
  setVisible('admin-home', admin);
  setVisible('sora-launch', admin);
  setVisible('advisor-launch', admin);
  setVisible('data-toggle', admin);
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

  for (const [field, color] of [['starts', '#a64f3d'], ['completions', '#173f36']]) {
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
      label.setAttribute('fill', '#596a61');
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
    dataToggle.textContent = showData ? 'Dashboard' : 'Data';
    setVisible('admin-home', !showData);
    setVisible('admin-data', showData);
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
