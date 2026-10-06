import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const COMPANY_EMAIL_DOMAIN = '@skintegritypartners.com';
const DATA_WINDOW_DAYS = 30;
const THEMES = ['dark', 'light', 'console'];
const HISTORY_TOOLS = {
  sora: 'SORA-SF Tool',
  'treatment-advisor': 'Wound Advisor',
};
let usageRows = [];
let signedInUser = null;
let recentToolUses = {
  sora: [],
  'treatment-advisor': [],
};
let selectedHistoryTool = 'sora';
const ROLE_ORDER = ['free', 'premium', 'admin'];
let accountRole = 'free';
let selectedViewRole = 'free';
let actualProfileRole = 'Free Member';
let profileFullName = '';
let supportTickets = [];
let selectedTicketId = '';
let selectedInboxStatus = 'todo';
let selectedInboxMonth = 'all';
let selectedInboxYear = 'all';

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
    sidebarThemeButton.setAttribute('aria-label', `Settings. Current theme: ${selectedTheme}. Click to change theme.`);
    sidebarThemeButton.title = `Current theme: ${selectedTheme}`;
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
  maybeStartVirtualTour(user.uid);
  await loadRecentToolUses(user.uid);
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
  const rawTier = [
    userData.membershipTier,
    userData.tier,
    userData.role,
  ].find((value) => typeof value === 'string' && value.trim()) || 'free';
  const tier = String(rawTier).toLowerCase().trim();
  const premium = admin || tier === 'premium' || tier === 'member';
  accountRole = admin ? 'admin' : premium ? 'premium' : 'free';
  const assignedRole = [
    userData.designation,
    userData.membershipBadge,
    userData.badge,
    userData.role,
  ].find((value) => (
    typeof value === 'string' &&
    value.trim() &&
    !['free', 'member', 'premium', 'admin'].includes(value.toLowerCase().trim())
  ));
  actualProfileRole = admin
    ? (assignedRole ? assignedRole.trim() : 'Admin • Staff Access')
    : assignedRole
      ? assignedRole.trim()
      : premium
        ? 'Premium Member'
        : 'Free Member';
  profileFullName = [
    userData.fullName,
    userData.name,
    user.displayName,
  ].find((value) => typeof value === 'string' && value.trim())?.trim() || '';
  const displayName = [
    userData.fullName,
    userData.name,
    user.email,
  ].find((value) => typeof value === 'string' && value.trim())?.trim() || 'Member';
  const nameElem = document.getElementById('user-display-name');
  const initialsElem = document.getElementById('profile-initials');
  const profileMenuToggle = document.getElementById('profile-menu-toggle');

  if (nameElem) nameElem.textContent = displayName;
  if (profileMenuToggle) {
    profileMenuToggle.disabled = false;
    profileMenuToggle.setAttribute('aria-label', `User profile menu for ${displayName}`);
  }
  if (initialsElem) {
    initialsElem.textContent = displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }
  const allowedRoles = ROLE_ORDER.filter((role) => ROLE_ORDER.indexOf(role) <= ROLE_ORDER.indexOf(accountRole));
  try {
    const savedViewRole = sessionStorage.getItem(`dashboard_view_role_${user.uid}`);
    selectedViewRole = allowedRoles.includes(savedViewRole) ? savedViewRole : accountRole;
  } catch (error) {
    console.error('Could not read saved interface view:', error);
    selectedViewRole = accountRole;
  }

  document.querySelectorAll('[data-view-role]').forEach((option) => {
    option.hidden = !allowedRoles.includes(option.dataset.viewRole);
  });
  updateRoleSwitcher(selectedViewRole);

  renderDashboardAccess();
}

function updateRoleSwitcher(viewRole) {
  selectedViewRole = viewRole;
  const roleElem = document.getElementById('user-display-role');
  if (roleElem) {
    roleElem.textContent = selectedViewRole === accountRole
      ? actualProfileRole
      : roleOptionLabel(selectedViewRole);
  }
  const profileMenuToggle = document.getElementById('profile-menu-toggle');
  if (profileMenuToggle) {
    const name = document.getElementById('user-display-name')?.textContent || 'user';
    profileMenuToggle.setAttribute('aria-label', `${name}. ${roleOptionLabel(selectedViewRole)}. Switch interface view.`);
  }
  document.querySelectorAll('[data-view-role]').forEach((option) => {
    option.setAttribute('aria-checked', String(option.dataset.viewRole === selectedViewRole));
  });
}

function roleOptionLabel(role) {
  if (role === 'admin') return 'Admin • Staff Access';
  if (role === 'premium') return 'Premium Member';
  return 'Free Tier';
}

function renderDashboardAccess() {
  const admin = accountRole === 'admin' && selectedViewRole === 'admin';
  const premium = accountRole !== 'free' && selectedViewRole !== 'free';
  const accessStatus = document.getElementById('access-status');
  const dataToggle = document.getElementById('data-toggle');
  const inboxToggle = document.getElementById('inbox-toggle');

  if (accessStatus) {
    accessStatus.textContent = premium
      ? 'Clinical tools enabled'
      : 'Upgrade your membership to access clinical tools';
  }

  if (!admin && dataToggle?.getAttribute('aria-expanded') === 'true') {
    dataToggle.setAttribute('aria-expanded', 'false');
    dataToggle.setAttribute('aria-label', 'Open admin data');
    dataToggle.title = 'Open admin data';
    setVisible('admin-data', false);
    document.querySelectorAll('[data-main-dashboard]').forEach((element) => {
      element.hidden = false;
    });
  }
  if (!admin && inboxToggle?.getAttribute('aria-expanded') === 'true') {
    inboxToggle.setAttribute('aria-expanded', 'false');
    inboxToggle.setAttribute('aria-label', 'Admin inbox');
    inboxToggle.title = 'Admin inbox';
    setVisible('admin-inbox', false);
    document.querySelectorAll('[data-main-dashboard]').forEach((element) => {
      element.hidden = false;
    });
  }
  setVisible('data-toggle', admin);
  setVisible('inbox-toggle', admin);
  for (const [cardId, lockId] of [
    ['sora-launch', 'sora-lock'],
    ['advisor-launch', 'advisor-lock'],
  ]) {
    const link = document.getElementById(cardId);
    const card = link?.closest('.clinical-tool-card');
    setVisible(lockId, !premium);
    if (card) card.classList.toggle('is-locked', !premium);
    if (link) {
      link.setAttribute('aria-disabled', String(!premium));
      link.setAttribute('tabindex', premium ? '0' : '-1');
    }
  }
  document.querySelectorAll('[data-history-launch]').forEach((link) => {
    const enabled = premium;
    link.setAttribute('aria-disabled', String(!enabled));
    link.setAttribute('tabindex', enabled ? '0' : '-1');
  });
}

function setVisible(id, visible) {
  const element = document.getElementById(id);
  if (element) element.hidden = !visible;
}

function getTicketDate(ticket) {
  const createdAt = ticket.createdAt;
  if (createdAt && typeof createdAt.toDate === 'function') {
    const date = createdAt.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof createdAt === 'string' || createdAt instanceof Date) {
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

async function loadSupportInbox() {
  const status = document.getElementById('inbox-status');
  if (status) status.textContent = 'Loading support inquiries…';

  try {
    const snapshot = await getDocs(query(collection(db, 'supportTickets'), orderBy('createdAt', 'desc')));
    supportTickets = snapshot.docs.map((ticketDoc) => ({ id: ticketDoc.id, ...ticketDoc.data() }));
    populateInboxYears();
    renderSupportInbox();
    if (status) status.textContent = `${supportTickets.length} support ${supportTickets.length === 1 ? 'inquiry' : 'inquiries'} loaded.`;
  } catch (error) {
    console.error('Could not load the Skintegrity Suite support inbox:', error);
    supportTickets = [];
    renderSupportInbox();
    if (status) status.textContent = 'The inbox could not be loaded. Verify Admin access and try refreshing.';
  }
}

function populateInboxYears() {
  const yearSelect = document.getElementById('inbox-year');
  if (!yearSelect) return;

  const years = [...new Set(supportTickets
    .map(getTicketDate)
    .filter(Boolean)
    .map((date) => String(date.getFullYear())))]
    .sort((first, second) => Number(second) - Number(first));
  yearSelect.replaceChildren();

  const allYears = document.createElement('option');
  allYears.value = 'all';
  allYears.textContent = 'All Years';
  yearSelect.appendChild(allYears);
  for (const year of years) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearSelect.appendChild(option);
  }

  if (years.includes(selectedInboxYear)) yearSelect.value = selectedInboxYear;
  else {
    selectedInboxYear = 'all';
    yearSelect.value = 'all';
  }
}

function getFilteredSupportTickets() {
  return supportTickets.filter((ticket) => {
    if (ticket.status !== selectedInboxStatus) return false;
    const date = getTicketDate(ticket);
    if (!date) return false;
    if (selectedInboxMonth !== 'all' && date.getMonth() !== Number(selectedInboxMonth)) return false;
    return selectedInboxYear === 'all' || date.getFullYear() === Number(selectedInboxYear);
  });
}

function renderSupportInbox() {
  const ticketList = document.getElementById('inbox-ticket-list');
  const detail = document.getElementById('inbox-ticket-detail');
  if (!ticketList || !detail) return;

  setText('inbox-todo-count', String(supportTickets.filter((ticket) => ticket.status === 'todo').length));
  setText('inbox-completed-count', String(supportTickets.filter((ticket) => ticket.status === 'completed').length));
  document.querySelectorAll('[data-inbox-status]').forEach((tab) => {
    const active = tab.dataset.inboxStatus === selectedInboxStatus;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  const filteredTickets = getFilteredSupportTickets();
  if (!filteredTickets.some((ticket) => ticket.id === selectedTicketId)) selectedTicketId = '';
  ticketList.replaceChildren();

  if (filteredTickets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'inbox-empty';
    empty.textContent = 'No inquiries match this status and date range.';
    ticketList.appendChild(empty);
  } else {
    for (const ticket of filteredTickets) {
      const button = document.createElement('button');
      button.className = `inbox-ticket${ticket.id === selectedTicketId ? ' is-selected' : ''}`;
      button.type = 'button';
      button.setAttribute('aria-pressed', String(ticket.id === selectedTicketId));
      const title = document.createElement('strong');
      title.textContent = typeof ticket.subject === 'string' ? ticket.subject : 'Support inquiry';
      const metadata = document.createElement('span');
      const date = getTicketDate(ticket);
      metadata.textContent = `${ticket.source || 'Skintegrity Suite'} · ${date
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
        : 'Date unavailable'}`;
      const excerpt = document.createElement('span');
      excerpt.textContent = typeof ticket.message === 'string' ? ticket.message.slice(0, 140) : '';
      button.append(title, metadata, excerpt);
      button.addEventListener('click', () => {
        selectedTicketId = ticket.id;
        renderSupportInbox();
      });
      ticketList.appendChild(button);
    }
  }

  renderSupportTicketDetail(detail, filteredTickets.find((ticket) => ticket.id === selectedTicketId));
}

function renderSupportTicketDetail(detail, ticket) {
  detail.replaceChildren();
  if (!ticket) {
    const empty = document.createElement('p');
    empty.className = 'inbox-empty';
    empty.textContent = 'Select an inquiry to view its details and reply.';
    detail.appendChild(empty);
    return;
  }

  const heading = document.createElement('div');
  heading.className = 'inbox-detail-heading';
  const title = document.createElement('h3');
  title.textContent = typeof ticket.subject === 'string' ? ticket.subject : 'Support inquiry';
  const metadata = document.createElement('p');
  const date = getTicketDate(ticket);
  metadata.textContent = `${ticket.senderName || ticket.senderEmail || 'Suite member'} · ${ticket.source || 'Skintegrity Suite'} · ${date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(date)
    : 'Date unavailable'}`;
  heading.append(title, metadata);
  detail.appendChild(heading);

  const labels = document.createElement('p');
  labels.className = 'inbox-ticket-labels';
  labels.textContent = `${ticket.category === 'clinical' ? 'General clinical question' : 'Application support'} · ${ticket.urgency || 'low'} urgency`;
  detail.appendChild(labels);

  const message = document.createElement('p');
  message.className = 'inbox-ticket-message';
  message.textContent = typeof ticket.message === 'string' ? ticket.message : '';
  detail.appendChild(message);

  const replies = Array.isArray(ticket.replies) ? ticket.replies : [];
  if (replies.length) {
    const repliesHeading = document.createElement('h4');
    repliesHeading.textContent = 'Replies';
    detail.appendChild(repliesHeading);
    const replyList = document.createElement('div');
    replyList.className = 'inbox-replies';
    for (const reply of replies) {
      const replyCard = document.createElement('article');
      const replyText = document.createElement('p');
      replyText.textContent = typeof reply.message === 'string' ? reply.message : '';
      const byline = document.createElement('small');
      const replyDate = reply.createdAt && typeof reply.createdAt.toDate === 'function'
        ? reply.createdAt.toDate()
        : null;
      byline.textContent = `${reply.authorEmail || 'Skintegrity Suite Admin'}${replyDate
        ? ` · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(replyDate)}`
        : ''}`;
      replyCard.append(replyText, byline);
      replyList.appendChild(replyCard);
    }
    detail.appendChild(replyList);
  }

  const replyForm = document.createElement('form');
  replyForm.className = 'inbox-reply-form';
  const replyLabel = document.createElement('label');
  replyLabel.textContent = 'Reply within the Skintegrity Suite';
  const replyInput = document.createElement('textarea');
  replyInput.name = 'reply';
  replyInput.rows = 4;
  replyInput.maxLength = 4000;
  replyInput.required = true;
  replyInput.placeholder = 'Write a non-identifying response…';
  replyInput.addEventListener('input', () => replyInput.setCustomValidity(''));
  const actions = document.createElement('div');
  actions.className = 'inbox-detail-actions';
  const statusButton = document.createElement('button');
  statusButton.type = 'button';
  statusButton.className = 'tool-button button-secondary';
  statusButton.textContent = ticket.status === 'todo' ? 'Mark Completed' : 'Reopen';
  statusButton.addEventListener('click', () => updateSupportTicket(ticket, {
    status: ticket.status === 'todo' ? 'completed' : 'todo',
  }));
  const sendButton = document.createElement('button');
  sendButton.className = 'tool-button button-primary';
  sendButton.type = 'submit';
  sendButton.textContent = 'SAVE REPLY';
  actions.append(statusButton, sendButton);
  replyForm.append(replyLabel, replyInput, actions);
  replyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = replyInput.value.trim();
    if (response.length < 10) {
      replyInput.setCustomValidity('Please enter at least 10 characters.');
      replyInput.reportValidity();
      return;
    }
    await updateSupportTicket(ticket, {
      replies: [
        ...replies,
        {
          authorId: signedInUser.uid,
          authorEmail: signedInUser.email || '',
          message: response,
          createdAt: Timestamp.now(),
        },
      ],
    });
  });
  detail.appendChild(replyForm);
}

async function updateSupportTicket(ticket, updates) {
  const status = document.getElementById('inbox-status');
  if (status) status.textContent = 'Saving inquiry update…';
  try {
    await updateDoc(doc(db, 'supportTickets', ticket.id), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await loadSupportInbox();
    if (status) status.textContent = 'Inquiry updated.';
  } catch (error) {
    console.error('Could not update support inquiry:', error);
    if (status) status.textContent = 'The update could not be saved. Please try again.';
  }
}

async function submitSupportInquiry(event) {
  event.preventDefault();
  if (!signedInUser) {
    window.alert('Sign in to submit a support inquiry.');
    return;
  }

  const form = document.getElementById('support-form');
  const status = document.getElementById('support-form-status');
  const submit = document.getElementById('support-submit');
  if (!form || !status || !submit) return;
  const formData = new FormData(form);
  const subject = String(formData.get('subject') || '').trim();
  const message = String(formData.get('message') || '').trim();
  const category = String(formData.get('category') || '');
  if (subject.length < 5 || subject.length > 120 || message.length < 10 || message.length > 4000) {
    status.textContent = 'Check the subject and message length, then try again.';
    return;
  }
  if (!['clinical', 'app_support'].includes(category)) {
    status.textContent = 'Select a valid inquiry type.';
    return;
  }

  submit.disabled = true;
  status.textContent = 'Sending your inquiry…';
  try {
    await addDoc(collection(db, 'supportTickets'), {
      userId: signedInUser.uid,
      senderEmail: signedInUser.email || '',
      senderName: profileFullName || signedInUser.email || 'Suite member',
      source: 'membership',
      subject,
      category,
      urgency: 'low',
      message,
      createdAt: serverTimestamp(),
      status: 'todo',
      replies: [],
    });
    form.reset();
    await loadMemberSupportTickets();
    status.textContent = 'Your inquiry was sent to the Skintegrity Suite support inbox.';
    window.setTimeout(() => document.getElementById('support-dialog')?.close(), 1600);
  } catch (error) {
    console.error('Could not submit Skintegrity Suite support inquiry:', error);
    status.textContent = 'Your inquiry could not be sent. Please try again later.';
  } finally {
    submit.disabled = false;
  }
}

async function loadRecentToolUses(userId) {
  const status = document.getElementById('history-status');
  if (status) status.textContent = 'Loading recent results…';

  try {
    const entries = await Promise.all(
      Object.keys(HISTORY_TOOLS).map(async (tool) => {
        const historySnapshot = await getDoc(doc(db, 'users', userId, 'toolHistory', tool));
        const uses = historySnapshot.exists() ? historySnapshot.data().uses : [];
        return [tool, Array.isArray(uses) ? uses.slice(0, 5) : []];
      })
    );
    recentToolUses = Object.fromEntries(entries);

    const latestUse = Object.entries(recentToolUses)
      .flatMap(([tool, uses]) => uses.map((use) => ({ tool, date: getHistoryDate(use) })))
      .filter((use) => use.date)
      .sort((first, second) => second.date.getTime() - first.date.getTime())[0];
    selectedHistoryTool = latestUse?.tool || 'sora';
    renderRecentToolUses();
  } catch (error) {
    console.error('Could not load recent tool history:', error);
    recentToolUses = { sora: [], 'treatment-advisor': [] };
    if (status) status.textContent = 'Recent results could not be loaded. Please try again later.';
    renderRecentToolUses();
  }
}

function getHistoryDate(use) {
  const timestamp = use?.completedAt;
  if (timestamp && typeof timestamp.toDate === 'function') {
    const date = timestamp.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

function formatHistoryCategory(category) {
  return category
    .replaceAll('_', ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function renderRecentToolUses() {
  const status = document.getElementById('history-status');
  const historyList = document.getElementById('history-list');
  const breakdown = document.getElementById('history-breakdown');
  const toolUses = recentToolUses[selectedHistoryTool] || [];
  const tabId = selectedHistoryTool === 'sora' ? 'history-tab-sora' : 'history-tab-advisor';

  document.querySelectorAll('[data-history-tool]').forEach((tab) => {
    const isSelected = tab.dataset.historyTool === selectedHistoryTool;
    tab.classList.toggle('is-active', isSelected);
    tab.setAttribute('aria-selected', String(isSelected));
  });

  const panel = document.getElementById('history-panel');
  if (panel) panel.setAttribute('aria-labelledby', tabId);
  if (status) {
    status.textContent = toolUses.length
      ? `Showing ${toolUses.length} most recent ${HISTORY_TOOLS[selectedHistoryTool]} completions.`
      : `No completed ${HISTORY_TOOLS[selectedHistoryTool]} uses yet.`;
  }

  if (historyList) {
    historyList.replaceChildren();
    for (const use of toolUses) {
      const item = document.createElement('li');
      const date = getHistoryDate(use);
      const time = document.createElement('time');
      const category = document.createElement('span');
      category.className = 'history-category';
      category.textContent = typeof use.category === 'string'
        ? formatHistoryCategory(use.category)
        : 'Completed';
      if (date) {
        time.dateTime = date.toISOString();
        time.textContent = new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(date);
      } else {
        time.textContent = 'Date unavailable';
      }
      item.append(time, category);
      historyList.appendChild(item);
    }
  }

  if (breakdown) {
    breakdown.replaceChildren();
    const categories = new Map();
    for (const use of toolUses) {
      const category = typeof use.category === 'string' ? formatHistoryCategory(use.category) : 'Completed';
      categories.set(category, (categories.get(category) || 0) + 1);
    }
    for (const [category, count] of categories) {
      const item = document.createElement('div');
      const label = document.createElement('span');
      const total = document.createElement('strong');
      label.textContent = category;
      total.textContent = String(count);
      item.append(label, total);
      breakdown.appendChild(item);
    }
  }
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
    const inboxToggle = document.getElementById('inbox-toggle');
    dataToggle.setAttribute('aria-expanded', String(showData));
    dataToggle.setAttribute('aria-label', showData ? 'Return to dashboard' : 'Open admin data');
    dataToggle.title = showData ? 'Return to dashboard' : 'Open admin data';
    if (inboxToggle) {
      inboxToggle.setAttribute('aria-expanded', 'false');
      inboxToggle.setAttribute('aria-label', 'Admin inbox');
      inboxToggle.title = 'Admin inbox';
    }
    setVisible('admin-inbox', false);
    setVisible('admin-data', showData);
    setVisible('results-summary', false);
    document.querySelectorAll('[data-main-dashboard]').forEach((element) => {
      element.hidden = showData;
    });
    if (showData) await loadUsageData();
  });
}

const inboxToggle = document.getElementById('inbox-toggle');
if (inboxToggle) {
  inboxToggle.addEventListener('click', async () => {
    const showInbox = inboxToggle.getAttribute('aria-expanded') !== 'true';
    const dataToggle = document.getElementById('data-toggle');
    if (dataToggle) {
      dataToggle.setAttribute('aria-expanded', 'false');
      dataToggle.setAttribute('aria-label', 'Open admin data');
      dataToggle.title = 'Open admin data';
    }
    inboxToggle.setAttribute('aria-expanded', String(showInbox));
    inboxToggle.setAttribute('aria-label', showInbox ? 'Return to dashboard' : 'Admin inbox');
    inboxToggle.title = showInbox ? 'Return to dashboard' : 'Admin inbox';
    setVisible('admin-data', false);
    setVisible('results-summary', false);
    setVisible('admin-inbox', showInbox);
    document.querySelectorAll('[data-main-dashboard]').forEach((element) => {
      element.hidden = showInbox;
    });
    if (showInbox) await loadSupportInbox();
  });
}

const inboxReload = document.getElementById('inbox-reload');
if (inboxReload) inboxReload.addEventListener('click', loadSupportInbox);

document.querySelectorAll('[data-inbox-status]').forEach((tab) => {
  tab.addEventListener('click', () => {
    selectedInboxStatus = tab.dataset.inboxStatus;
    selectedTicketId = '';
    renderSupportInbox();
  });
});

const inboxMonth = document.getElementById('inbox-month');
if (inboxMonth) {
  inboxMonth.addEventListener('change', () => {
    selectedInboxMonth = inboxMonth.value;
    selectedTicketId = '';
    renderSupportInbox();
  });
}

const inboxYear = document.getElementById('inbox-year');
if (inboxYear) {
  inboxYear.addEventListener('change', () => {
    selectedInboxYear = inboxYear.value;
    selectedTicketId = '';
    renderSupportInbox();
  });
}

const supportDialog = document.getElementById('support-dialog');
function openSupportDialog() {
  if (!signedInUser) {
    window.alert('Sign in to contact Skintegrity Suite support.');
    return;
  }
  supportDialog?.showModal();
  void loadMemberSupportTickets();
}

async function loadMemberSupportTickets() {
  const status = document.getElementById('member-support-status');
  const list = document.getElementById('member-support-list');
  if (!signedInUser || !status || !list) return;

  status.textContent = 'Loading your inquiries…';
  try {
    const snapshot = await getDocs(query(
      collection(db, 'supportTickets'),
      where('userId', '==', signedInUser.uid),
      limit(20)
    ));
    const tickets = snapshot.docs
      .map((ticketDoc) => ({ id: ticketDoc.id, ...ticketDoc.data() }))
      .sort((first, second) => (getTicketDate(second)?.getTime() || 0) - (getTicketDate(first)?.getTime() || 0));
    list.replaceChildren();

    if (tickets.length === 0) {
      status.textContent = 'You have not submitted any inquiries yet.';
      return;
    }

    status.textContent = `Showing your ${tickets.length} most recent inquiries.`;
    for (const ticket of tickets) {
      const card = document.createElement('article');
      card.className = 'member-support-ticket';
      const heading = document.createElement('div');
      const subject = document.createElement('strong');
      subject.textContent = ticket.subject || 'Support inquiry';
      const date = getTicketDate(ticket);
      const metadata = document.createElement('small');
      metadata.textContent = `${ticket.status === 'completed' ? 'Completed' : 'To Do'}${date
        ? ` · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)}`
        : ''}`;
      heading.append(subject, metadata);
      const message = document.createElement('p');
      message.textContent = ticket.message || '';
      card.append(heading, message);
      if (Array.isArray(ticket.replies)) {
        for (const reply of ticket.replies) {
          const replyCard = document.createElement('blockquote');
          const replyText = document.createElement('p');
          replyText.textContent = reply.message || '';
          const byline = document.createElement('small');
          byline.textContent = 'Skintegrity Suite Support';
          replyCard.append(replyText, byline);
          card.appendChild(replyCard);
        }
      }
      list.appendChild(card);
    }
  } catch (error) {
    console.error('Could not load the member support history:', error);
    status.textContent = 'Your inquiries could not be loaded. Please try again later.';
  }
}

for (const trigger of [
  document.getElementById('contact-toggle'),
  document.getElementById('sidebar-contact'),
  document.getElementById('status-contact'),
]) {
  if (trigger) trigger.addEventListener('click', openSupportDialog);
}

const supportClose = document.getElementById('support-close');
if (supportClose) supportClose.addEventListener('click', () => supportDialog?.close());

const supportForm = document.getElementById('support-form');
if (supportForm) supportForm.addEventListener('submit', submitSupportInquiry);

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

const profileMenuToggle = document.getElementById('profile-menu-toggle');
const profileRoleMenu = document.getElementById('profile-role-menu');

function closeProfileMenu(returnFocus = false) {
  if (!profileRoleMenu || profileRoleMenu.hidden) return;
  profileRoleMenu.hidden = true;
  if (profileMenuToggle) profileMenuToggle.setAttribute('aria-expanded', 'false');
  if (returnFocus) profileMenuToggle?.focus();
}

if (profileMenuToggle && profileRoleMenu) {
  profileMenuToggle.addEventListener('click', () => {
    const isOpen = profileMenuToggle.getAttribute('aria-expanded') === 'true';
    profileRoleMenu.hidden = isOpen;
    profileMenuToggle.setAttribute('aria-expanded', String(!isOpen));
  });

  document.querySelectorAll('[data-view-role]').forEach((option) => {
    option.addEventListener('click', () => {
      const requestedRole = option.dataset.viewRole;
      const allowed = ROLE_ORDER.includes(requestedRole) &&
        ROLE_ORDER.indexOf(requestedRole) <= ROLE_ORDER.indexOf(accountRole);
      if (!allowed || !signedInUser) {
        console.error('Blocked an interface view not available to the signed-in account.');
        return;
      }

      if (document.getElementById('data-toggle')?.getAttribute('aria-expanded') === 'true') {
        document.getElementById('data-toggle').click();
      }
      updateRoleSwitcher(requestedRole);
      try {
        sessionStorage.setItem(`dashboard_view_role_${signedInUser.uid}`, requestedRole);
      } catch (error) {
        console.error('Could not save selected interface view:', error);
      }
      renderDashboardAccess();
      closeProfileMenu(true);
    });
  });

  document.addEventListener('click', (event) => {
    if (!profileRoleMenu.hidden && !profileRoleMenu.contains(event.target) && !profileMenuToggle.contains(event.target)) {
      closeProfileMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeProfileMenu(true);
  });
}

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
  link.addEventListener('click', (event) => {
    if (link.dataset.navSection === 'results-summary') {
      event.preventDefault();
      setVisible('results-summary', true);
      setVisible('admin-data', false);
      document.querySelectorAll('[data-main-dashboard]').forEach((element) => {
        element.hidden = true;
      });
      if (dataToggle) {
        dataToggle.setAttribute('aria-expanded', 'false');
        dataToggle.setAttribute('aria-label', 'Open admin data');
        dataToggle.title = 'Open admin data';
      }
      if (inboxToggle) {
        inboxToggle.setAttribute('aria-expanded', 'false');
        inboxToggle.setAttribute('aria-label', 'Admin inbox');
        inboxToggle.title = 'Admin inbox';
      }
      setVisible('admin-inbox', false);
    } else {
      setVisible('results-summary', false);
      setVisible('admin-inbox', false);
      if (dataToggle?.getAttribute('aria-expanded') === 'true') {
        dataToggle.setAttribute('aria-expanded', 'false');
        dataToggle.setAttribute('aria-label', 'Open admin data');
        dataToggle.title = 'Open admin data';
        setVisible('admin-data', false);
      }
      if (inboxToggle?.getAttribute('aria-expanded') === 'true') {
        inboxToggle.setAttribute('aria-expanded', 'false');
        inboxToggle.setAttribute('aria-label', 'Admin inbox');
        inboxToggle.title = 'Admin inbox';
      }
      document.querySelectorAll('[data-main-dashboard]').forEach((element) => {
        element.hidden = false;
      });
    }
    document.querySelectorAll('.primary-nav [data-nav-section]').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.navSection === link.dataset.navSection);
    });
  });
});

document.querySelectorAll('[data-history-tool]').forEach((tab) => {
  tab.addEventListener('click', () => {
    const selectedTool = tab.dataset.historyTool;
    if (selectedTool in HISTORY_TOOLS) {
      selectedHistoryTool = selectedTool;
      renderRecentToolUses();
    }
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

const VIRTUAL_TOUR_STEPS = [
  {
    id: 'clinical-assessment',
    target: '#nav-clinical-assessment',
    title: 'Clinical Assessment',
    description: 'Start here to return to the main workspace and access the clinical tools available to your account.',
    arrow: 'left',
  },
  {
    id: 'results-summary',
    target: '#nav-results-summary',
    title: 'Results Summary',
    description: 'Review up to five recent completions per tool, with dates and broad result categories. Assessment answers and patient identifiers are not stored here.',
    arrow: 'top',
  },
  {
    id: 'guidance-advisor',
    target: '#advisor-tool-title',
    title: 'Guidance & Advisor',
    description: 'Explore the Wound Advisor and the quick links below for workspace utilities and public research.',
    arrow: 'top',
  },
  {
    id: 'settings',
    target: '#sidebar-theme',
    mobileTarget: '#theme-toggle',
    title: 'Settings',
    description: 'Switch between dark, light, and console themes. The top-bar theme control provides the same options.',
    arrow: 'bottom',
  },
  {
    id: 'help-support',
    target: '#sidebar-contact',
    mobileTarget: '#contact-toggle',
    title: 'Help & Support',
    description: 'Open the in-suite support form for application questions. Do not include patient identifiers or protected health information.',
    arrow: 'bottom',
  },
  {
    id: 'logout',
    target: '#sidebar-logout',
    title: 'Log Out',
    description: 'Sign out securely and return to the Skintegrity sign-in page.',
    arrow: 'bottom',
  },
  {
    id: 'search-bar',
    target: '#input-search-bar',
    title: 'Search',
    description: 'The top-bar search field is reserved for finding tools and guides as search features are added.',
    arrow: 'top',
  },
  {
    id: 'user-profile',
    target: '#profile-menu-toggle',
    title: 'Your Profile',
    description: 'View the role assigned to your account and switch to any lower-access interface view available to you.',
    arrow: 'right',
  },
];

const virtualTour = document.getElementById('virtual-tour');
const tourCard = document.getElementById('tour-card');
const tourSpotlight = document.getElementById('tour-spotlight');
const tourTitle = document.getElementById('tour-title');
const tourDescription = document.getElementById('tour-description');
const tourStepCount = document.getElementById('tour-step-count');
const tourProgress = document.getElementById('tour-progress');
const tourArrow = document.getElementById('tour-arrow');
const tourPrevious = document.getElementById('tour-previous');
const tourNext = document.getElementById('tour-next');
const tourReplay = document.getElementById('tour-replay');
let currentTourSteps = [];
let currentTourStepIndex = 0;
let currentTourTarget = null;
let tourTimer = null;
let tourUserKey = '';
let tourReturnFocus = null;

function maybeStartVirtualTour(userId) {
  const storageKey = `skintegrity_tour_completed_${userId}`;
  try {
    if (localStorage.getItem(storageKey)) return;
  } catch (error) {
    console.error('Could not read virtual tour preference:', error);
  }
  startVirtualTour(storageKey);
}

function getVisibleTourSteps() {
  const isMobile = window.matchMedia('(max-width: 760px)').matches;
  return VIRTUAL_TOUR_STEPS.map((step) => {
    const selector = isMobile && step.mobileTarget ? step.mobileTarget : step.target;
    const target = document.querySelector(selector);
    if (!target || !target.getClientRects().length || getComputedStyle(target).visibility === 'hidden') {
      return null;
    }
    return { ...step, selector };
  }).filter(Boolean);
}

function startVirtualTour(storageKey) {
  if (!virtualTour || !tourCard) return;
  clearTimeout(tourTimer);
  tourReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  tourUserKey = storageKey;
  currentTourSteps = getVisibleTourSteps();
  if (!currentTourSteps.length) {
    console.error('Could not start the virtual tour because no tour targets are visible.');
    return;
  }
  currentTourStepIndex = 0;
  virtualTour.hidden = false;
  virtualTour.setAttribute('aria-hidden', 'false');
  setVirtualTourStep();
}

function setVirtualTourStep() {
  clearTimeout(tourTimer);
  const step = currentTourSteps[currentTourStepIndex];
  if (!step) {
    finishVirtualTour();
    return;
  }

  document.querySelectorAll('.tour-target-active').forEach((target) => {
    target.classList.remove('tour-target-active');
  });
  const quickLinks = document.getElementById('quick-links-section');
  quickLinks?.classList.toggle('tour-quick-links-active', step.id === 'guidance-advisor');

  currentTourTarget = document.querySelector(step.selector);
  if (!currentTourTarget) {
    console.error(`Could not find virtual tour target "${step.selector}".`);
    finishVirtualTour();
    return;
  }
  currentTourTarget.classList.add('tour-target-active');
  tourTitle.textContent = step.title;
  tourDescription.textContent = step.description;
  tourStepCount.textContent = `STEP ${currentTourStepIndex + 1} OF ${currentTourSteps.length}`;
  tourPrevious.hidden = currentTourStepIndex === 0;
  tourNext.textContent = currentTourStepIndex === currentTourSteps.length - 1 ? 'Finish' : 'Next';
  tourArrow.dataset.position = step.arrow;

  const isVisible = currentTourTarget.getBoundingClientRect().top >= 12
    && currentTourTarget.getBoundingClientRect().bottom <= window.innerHeight - 12;
  if (!isVisible) currentTourTarget.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  window.setTimeout(positionVirtualTour, isVisible ? 0 : 400);
  tourCard.querySelector('#tour-next').focus({ preventScroll: true });
  tourProgress.style.animation = 'none';
  void tourProgress.offsetWidth;
  tourProgress.style.animation = 'tour-progress 4.5s linear forwards';
  tourTimer = window.setTimeout(() => {
    if (currentTourStepIndex < currentTourSteps.length - 1) {
      currentTourStepIndex += 1;
      setVirtualTourStep();
    } else {
      finishVirtualTour();
    }
  }, 4500);
}

function positionVirtualTour() {
  if (!virtualTour || virtualTour.hidden || !currentTourTarget || !tourCard || !tourSpotlight) return;
  const targetRect = currentTourTarget.getBoundingClientRect();
  const cardRect = tourCard.getBoundingClientRect();
  const margin = 12;
  const gap = 17;
  let arrowPosition = tourArrow.dataset.position;
  const hasRoomBelow = targetRect.bottom + gap + cardRect.height <= window.innerHeight - margin;
  const hasRoomAbove = targetRect.top - gap - cardRect.height >= margin;
  const hasRoomBeside = window.innerWidth > cardRect.width + targetRect.width + gap * 2;
  if ((arrowPosition === 'left' || arrowPosition === 'right') && !hasRoomBeside) {
    arrowPosition = hasRoomBelow ? 'top' : 'bottom';
  }
  if (arrowPosition === 'top' && !hasRoomBelow && hasRoomAbove) arrowPosition = 'bottom';
  if (arrowPosition === 'bottom' && !hasRoomAbove && hasRoomBelow) arrowPosition = 'top';
  tourArrow.dataset.position = arrowPosition;
  let left = targetRect.left + (targetRect.width - cardRect.width) / 2;
  let top = targetRect.bottom + gap;

  if (arrowPosition === 'bottom') top = targetRect.top - cardRect.height - gap;
  if (arrowPosition === 'left') {
    left = targetRect.right + gap;
    top = targetRect.top + (targetRect.height - cardRect.height) / 2;
  }
  if (arrowPosition === 'right') {
    left = targetRect.left - cardRect.width - gap;
    top = targetRect.top + (targetRect.height - cardRect.height) / 2;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - cardRect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - cardRect.height - margin));
  const arrowOffset = arrowPosition === 'top' || arrowPosition === 'bottom'
    ? Math.max(18, Math.min(targetRect.left + targetRect.width / 2 - left, cardRect.width - 18))
    : Math.max(18, Math.min(targetRect.top + targetRect.height / 2 - top, cardRect.height - 18));
  tourCard.style.left = `${left}px`;
  tourCard.style.top = `${top}px`;
  tourCard.style.setProperty('--tour-arrow-offset', `${arrowOffset}px`);
  tourSpotlight.style.left = `${Math.max(0, targetRect.left - 6)}px`;
  tourSpotlight.style.top = `${Math.max(0, targetRect.top - 6)}px`;
  tourSpotlight.style.width = `${targetRect.width + 12}px`;
  tourSpotlight.style.height = `${targetRect.height + 12}px`;
}

function finishVirtualTour() {
  clearTimeout(tourTimer);
  tourTimer = null;
  if (virtualTour) {
    virtualTour.hidden = true;
    virtualTour.setAttribute('aria-hidden', 'true');
  }
  currentTourTarget?.classList.remove('tour-target-active');
  currentTourTarget = null;
  document.getElementById('quick-links-section')?.classList.remove('tour-quick-links-active');
  if (tourUserKey) {
    try {
      localStorage.setItem(tourUserKey, 'true');
    } catch (error) {
      console.error('Could not save virtual tour preference:', error);
    }
  }
  tourReturnFocus?.focus({ preventScroll: true });
}

if (tourReplay) {
  tourReplay.addEventListener('click', () => {
    const userId = signedInUser?.uid;
    if (userId) startVirtualTour(`skintegrity_tour_completed_${userId}`);
  });
}

tourNext?.addEventListener('click', () => {
  if (currentTourStepIndex < currentTourSteps.length - 1) {
    currentTourStepIndex += 1;
    setVirtualTourStep();
  } else {
    finishVirtualTour();
  }
});
tourPrevious?.addEventListener('click', () => {
  if (currentTourStepIndex > 0) {
    currentTourStepIndex -= 1;
    setVirtualTourStep();
  }
});
document.getElementById('tour-skip')?.addEventListener('click', finishVirtualTour);
window.addEventListener('resize', positionVirtualTour);
window.addEventListener('scroll', positionVirtualTour, true);
document.addEventListener('keydown', (event) => {
  if (!virtualTour || virtualTour.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    finishVirtualTour();
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    tourNext?.click();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    tourPrevious?.click();
  } else if (event.key === 'Tab') {
    const controls = Array.from(tourCard.querySelectorAll('button:not([hidden])'));
    const firstControl = controls[0];
    const lastControl = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === firstControl) {
      event.preventDefault();
      lastControl.focus();
    } else if (!event.shiftKey && document.activeElement === lastControl) {
      event.preventDefault();
      firstControl.focus();
    }
  }
});

const carouselStates = [];
const carouselIntervalMs = 4500;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function setCarouselSlide(state, selectedIndex) {
  state.index = selectedIndex;
  state.slides.forEach((slide, index) => {
    const active = index === selectedIndex;
    slide.classList.toggle('is-active', active);
    slide.setAttribute('aria-hidden', String(!active));
  });
  state.dots.forEach((dot, index) => {
    const active = index === selectedIndex;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-pressed', String(active));
  });
}

function startCarousel(state) {
  if (state.timer || state.paused || document.hidden || reduceMotion.matches) return;
  state.timer = window.setInterval(() => {
    setCarouselSlide(state, (state.index + 1) % state.slides.length);
  }, carouselIntervalMs);
}

function stopCarousel(state) {
  if (!state.timer) return;
  window.clearInterval(state.timer);
  state.timer = null;
}

document.querySelectorAll('[data-carousel]').forEach((track) => {
  const slides = Array.from(track.querySelectorAll('.carousel-slide'));
  const container = track.closest('[data-carousel-container]');
  const card = track.closest('.clinical-tool-card');
  const dots = Array.from(container?.querySelectorAll('.carousel-dot') || []);
  if (!card || slides.length < 2 || slides.length !== dots.length) {
    console.error(`Carousel "${track.dataset.carousel}" has incomplete slides or indicators.`);
    return;
  }

  const state = { card, slides, dots, index: 0, timer: null, paused: false };
  carouselStates.push(state);

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => setCarouselSlide(state, index));
  });

  card.addEventListener('pointerenter', () => {
    state.paused = true;
    stopCarousel(state);
  });
  card.addEventListener('pointerleave', () => {
    state.paused = false;
    startCarousel(state);
  });
  card.addEventListener('focusin', () => {
    state.paused = true;
    stopCarousel(state);
  });
  card.addEventListener('focusout', (event) => {
    if (!card.contains(event.relatedTarget)) {
      state.paused = false;
      startCarousel(state);
    }
  });

  startCarousel(state);
});

document.addEventListener('visibilitychange', () => {
  carouselStates.forEach((state) => {
    if (document.hidden) stopCarousel(state);
    else startCarousel(state);
  });
});

reduceMotion.addEventListener('change', () => {
  carouselStates.forEach((state) => {
    if (reduceMotion.matches) stopCarousel(state);
    else startCarousel(state);
  });
});
