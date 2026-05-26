(function () {
  'use strict';

  const data = window.__PR_OVERVIEW_DATA__;
  if (!data) return;

  const main = document.querySelector('.pr-main');

  // Always: summary, architecture, open_questions
  const sections = [
    { key: 'summary',           anchor: 'section-summary',           label: 'Summary' },
    { key: 'architecture',      anchor: 'section-architecture',      label: 'Architecture' },
    { key: 'flow',              anchor: 'section-flow',              label: 'Flow' },
    { key: 'database',          anchor: 'section-database',          label: 'Database' },
    { key: 'code_observations', anchor: 'section-code-observations', label: 'Code observations' },
    { key: 'risk_rollout',      anchor: 'section-risk-rollout',      label: 'Risk & rollout' },
    { key: 'open_questions',    anchor: 'section-open-questions',    label: 'Open questions' },
  ];

  for (const s of sections) {
    if (!data[s.key]) continue;
    const el = document.createElement('section');
    el.id = s.anchor;
    el.className = 'pr-section';
    el.innerHTML = `<h2 class="pr-section__title">${s.label}</h2><div class="pr-section__body" data-section="${s.key}"></div>`;
    main.appendChild(el);
  }

  // Bind meta values to header (data-bind="meta.title" etc.)
  function pick(obj, path) {
    return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  }
  document.querySelectorAll('[data-bind]').forEach((el) => {
    const v = pick(data, el.getAttribute('data-bind'));
    if (v == null) return;
    const prefix = el.getAttribute('data-prefix') || '';
    const suffix = el.getAttribute('data-suffix') || '';
    el.textContent = `${prefix}${v}${suffix}`;
  });
  document.querySelectorAll('[data-list]').forEach((el) => {
    const arr = pick(data, el.getAttribute('data-list'));
    if (!Array.isArray(arr)) return;
    const cls = el.getAttribute('data-item-class') || '';
    el.innerHTML = arr.map((v) => `<span class="${cls}">${v}</span>`).join('');
  });

  // Theme toggle
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('pr-overview.theme', next); } catch (_) {}
  });
  try {
    const saved = localStorage.getItem('pr-overview.theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (_) {}
})();
