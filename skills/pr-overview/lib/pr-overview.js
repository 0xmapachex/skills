(function () {
  'use strict';

  const data = window.__PR_OVERVIEW_DATA__;
  if (!data) return;

  // ---------- helpers ----------
  const pick = (obj, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v != null) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  };
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // ---------- header bindings ----------
  document.querySelectorAll('[data-bind]').forEach((node) => {
    const v = pick(data, node.getAttribute('data-bind'));
    if (v == null) return;
    const prefix = node.getAttribute('data-prefix') || '';
    const suffix = node.getAttribute('data-suffix') || '';
    node.textContent = `${prefix}${v}${suffix}`;
  });
  document.querySelectorAll('[data-list]').forEach((node) => {
    const arr = pick(data, node.getAttribute('data-list'));
    if (!Array.isArray(arr)) return;
    const cls = node.getAttribute('data-item-class') || '';
    node.innerHTML = arr.map((v) => `<span class="${cls}">${escapeHTML(v)}</span>`).join('');
  });

  // ---------- theme toggle ----------
  try {
    const saved = localStorage.getItem('pr-overview.theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (_) {}
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('pr-overview.theme', next); } catch (_) {}
  });

  // ---------- detail panel ----------
  const panel = document.querySelector('[data-detail-panel]');
  const panelBody = panel?.querySelector('[data-detail-body]');
  function openDetail(htmlString) {
    if (!panel || !panelBody) return;
    panelBody.innerHTML = htmlString;
    panel.hidden = false;
  }
  function closeDetail() { if (panel) panel.hidden = true; }
  document.querySelector('[data-detail-close]')?.addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });
  document.addEventListener('click', (e) => {
    if (!panel || panel.hidden) return;
    if (!panel.contains(e.target) && !e.target.closest('[data-detail-source]')) closeDetail();
  });

  // ---------- file chip clipboard ----------
  document.addEventListener('click', (e) => {
    const chip = e.target.closest?.('.file-chip');
    if (!chip) return;
    const text = chip.textContent.trim();
    try { navigator.clipboard.writeText(text); } catch (_) {}
    const old = chip.textContent;
    chip.textContent = 'copied';
    setTimeout(() => { chip.textContent = old; }, 700);
  });

  // ---------- section mount registry ----------
  const main = document.querySelector('.pr-main');
  const RENDERERS = {
    summary:           renderSummary,
    architecture:      renderArchitecture,
    flow:              renderFlow,
    database:          renderDatabase,
    code_observations: renderCodeObservations,
    risk_rollout:      renderRiskRollout,
    open_questions:    renderOpenQuestions,
  };
  const ORDER = [
    ['summary',           'section-summary',           'Summary'],
    ['architecture',      'section-architecture',      'Architecture'],
    ['flow',              'section-flow',              'Flow'],
    ['database',          'section-database',          'Database'],
    ['code_observations', 'section-code-observations', 'Code observations'],
    ['risk_rollout',      'section-risk-rollout',      'Risk & rollout'],
    ['open_questions',    'section-open-questions',    'Open questions'],
  ];
  for (const [key, anchor, label] of ORDER) {
    if (!data[key]) continue;
    const sec = el('section', { id: anchor, class: 'pr-section' }, [
      el('h2', { class: 'pr-section__title' }, label),
      el('div', { class: 'pr-section__body' }),
    ]);
    main.appendChild(sec);
    try { RENDERERS[key](sec.querySelector('.pr-section__body'), data[key]); } catch (err) {
      console.error(`render ${key} failed`, err);
    }
  }

  // ---------- canvas (panzoom + edges) ----------
  function mountCanvas(parent) {
    const canvas = el('div', { class: 'canvas' });
    const scene = el('div', { class: 'canvas__scene' });
    const edges = el('svg', { class: 'canvas__edges', xmlns: 'http://www.w3.org/2000/svg' });
    const controls = el('div', { class: 'canvas__controls' }, [
      el('button', { type: 'button', 'data-zoom': 'in',    title: 'Zoom in' }, '+'),
      el('button', { type: 'button', 'data-zoom': 'out',   title: 'Zoom out' }, '−'),
      el('button', { type: 'button', 'data-zoom': 'fit',   title: 'Fit' }, '⤢'),
      el('button', { type: 'button', 'data-zoom': 'reset', title: 'Reset' }, '⟲'),
    ]);
    canvas.appendChild(scene); canvas.appendChild(edges); canvas.appendChild(controls);
    parent.appendChild(canvas);

    let pz = null;
    if (typeof window.panzoom === 'function') {
      pz = window.panzoom(scene, { smoothScroll: false, beforeWheel: (e) => !e.ctrlKey && !e.metaKey });
    }
    controls.addEventListener('click', (e) => {
      const action = e.target.getAttribute?.('data-zoom');
      if (!action || !pz) return;
      if (action === 'in')    pz.smoothZoom(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.25);
      if (action === 'out')   pz.smoothZoom(canvas.clientWidth / 2, canvas.clientHeight / 2, 0.8);
      if (action === 'reset') pz.zoomAbs(0, 0, 1), pz.moveTo(0, 0);
      if (action === 'fit')   fitToContent(pz, scene, canvas);
    });
    canvas.addEventListener('dblclick', () => pz && fitToContent(pz, scene, canvas));

    return { canvas, scene, edges };
  }

  function fitToContent(pz, scene, canvas) {
    const rects = [...scene.children].filter((c) => c.classList?.contains('node')).map((c) => ({
      x: parseFloat(c.style.left || 0),
      y: parseFloat(c.style.top || 0),
      w: c.offsetWidth, h: c.offsetHeight,
    }));
    if (!rects.length) return;
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    const w = maxX - minX, h = maxY - minY;
    const scale = Math.min(canvas.clientWidth / (w + 80), canvas.clientHeight / (h + 80), 1);
    pz.zoomAbs(0, 0, scale);
    pz.moveTo(-(minX - 40) * scale, -(minY - 40) * scale);
  }

  // ---------- section renderers (stubs for now; filled in later tasks) ----------
  function renderSummary(host, s) {
    const ul = el('ul', { class: 'summary-bullets' });
    s.bullets.forEach((b) => ul.appendChild(el('li', {}, b)));
    host.appendChild(ul);
  }
  function renderArchitecture(host, a) {
    const { canvas, scene, edges } = mountCanvas(host);

    // Lay nodes out in a simple grid based on incoming edges. Good enough for v1.
    const positions = layoutGrid(a.nodes, a.edges);
    const byId = new Map();

    a.nodes.forEach((n) => {
      const status = a.details?.[n.id]?.status ?? (n.changed ? 'changed' : 'context');
      const card = el('div', { class: 'node' + ' is-' + status, style: `left:${positions[n.id].x}px; top:${positions[n.id].y}px` }, [
        el('div', { class: 'node__head' }, [
          el('span', { class: 'node__kind' }, kindIcon(n.kind)),
          el('span', {}, n.label),
          status !== 'context' ? el('span', { class: `status-chip is-${status}` }, statusChipText(status)) : null,
        ]),
        renderNodeBody(a.details?.[n.id]),
      ]);
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetail(detailHTML(n, a.details?.[n.id]));
      });
      card.setAttribute('data-detail-source', n.id);
      scene.appendChild(card);
      byId.set(n.id, card);
    });

    // Draw edges as SVG paths after layout settles.
    requestAnimationFrame(() => drawEdges(a.edges, byId, edges));

    function kindIcon(k) {
      return ({ service: 'svc', module: 'mod', datastore: 'db', external: 'ext', ui: 'ui', job: 'job' })[k] || k;
    }
    function statusChipText(s) { return ({ 'is-added': '+ added', 'is-changed': '~ changed', 'is-removed': '− removed' })['is-' + s]; }
    function renderNodeBody(details) {
      if (!details?.responsibilities?.length) return el('div');
      return el('div', { class: 'node__body' }, [
        el('ul', {}, details.responsibilities.slice(0, 4).map((r) => el('li', {}, r))),
      ]);
    }
    function detailHTML(n, d) {
      const files = (d?.files ?? []).map((f) => `<span class="file-chip">${escapeHTML(f)}</span>`).join(' ');
      const resp = (d?.responsibilities ?? []).map((r) => `<li>${escapeHTML(r)}</li>`).join('');
      return `
        <h3>${escapeHTML(n.label)}</h3>
        <p><span class="kind-chip">${escapeHTML(n.kind)}</span></p>
        ${d?.summary ? `<p>${escapeHTML(d.summary)}</p>` : ''}
        ${resp ? `<h4>Responsibilities</h4><ul>${resp}</ul>` : ''}
        ${files ? `<h4>Files</h4><div class="prose-card__files">${files}</div>` : ''}
      `;
    }
  }
  function renderFlow(host, f)            { /* Task 11 */ host.appendChild(el('div', {}, 'flow')); }
  function renderDatabase(host, d)        { /* Task 10 */ host.appendChild(el('div', {}, 'database')); }
  function renderCodeObservations(host, c){ /* Task 12 */ host.appendChild(el('div', {}, 'code_observations')); }
  function renderRiskRollout(host, r)     { /* Task 12 */ host.appendChild(el('div', {}, 'risk_rollout')); }
  function renderOpenQuestions(host, o)   { /* Task 12 */ host.appendChild(el('div', {}, 'open_questions')); }

  function layoutGrid(nodes, edges) {
    // Topological-ish: sources on the left, sinks on the right. 240x180 cells.
    const incoming = new Map(nodes.map((n) => [n.id, 0]));
    for (const e of edges) incoming.set(e.to, (incoming.get(e.to) || 0) + 1);
    const sorted = [...nodes].sort((a, b) => (incoming.get(a.id) - incoming.get(b.id)));
    const colHeight = Math.max(2, Math.ceil(Math.sqrt(sorted.length)));
    const pos = {};
    sorted.forEach((n, i) => {
      const col = Math.floor(i / colHeight);
      const row = i % colHeight;
      pos[n.id] = { x: 40 + col * 320, y: 40 + row * 180 };
    });
    return pos;
  }

  function drawEdges(edges, byId, svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', `0 0 4000 4000`);
    svg.setAttribute('width', '4000'); svg.setAttribute('height', '4000');
    edges.forEach((e) => {
      const fromCard = byId.get(e.from); const toCard = byId.get(e.to);
      if (!fromCard || !toCard) return;
      const fx = parseFloat(fromCard.style.left) + fromCard.offsetWidth;
      const fy = parseFloat(fromCard.style.top)  + fromCard.offsetHeight / 2;
      const tx = parseFloat(toCard.style.left);
      const ty = parseFloat(toCard.style.top)    + toCard.offsetHeight / 2;
      const cx = (fx + tx) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${fx} ${fy} C ${cx} ${fy}, ${cx} ${ty}, ${tx} ${ty}`);
      if (e.kind === 'async') path.classList.add('is-async');
      svg.appendChild(path);
    });
  }

  // ---------- shared helpers exposed for renderers ----------
  window.__pro = { el, escapeHTML, mountCanvas, openDetail, closeDetail };
})();
