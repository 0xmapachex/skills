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
    // SVG MUST be created in the SVG namespace — `document.createElement('svg')`
    // produces an HTMLUnknownElement that does not render its children as SVG.
    const edges = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    edges.setAttribute('class', 'canvas__edges');
    const controls = el('div', { class: 'canvas__controls' }, [
      el('button', { type: 'button', 'data-zoom': 'in',    title: 'Zoom in' }, '+'),
      el('button', { type: 'button', 'data-zoom': 'out',   title: 'Zoom out' }, '−'),
      el('button', { type: 'button', 'data-zoom': 'fit',   title: 'Fit' }, '⤢'),
      el('button', { type: 'button', 'data-zoom': 'reset', title: 'Reset' }, '⟲'),
    ]);
    // SVG sits INSIDE the scene so it transforms with panzoom — paths drawn
    // in scene coordinates stay aligned with the cards when the user pans/zooms.
    scene.appendChild(edges);
    canvas.appendChild(scene); canvas.appendChild(controls);
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

    return { canvas, scene, edges, pz };
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
    const { canvas, scene, edges, pz } = mountCanvas(host);
    const byId = new Map();

    a.nodes.forEach((n) => {
      const status = a.details?.[n.id]?.status ?? (n.changed ? 'changed' : 'context');
      const card = el('div', { class: 'node' + ' is-' + status }, [
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

    // Stack into columns by indegree, measure heights, size scene, draw edges, then fit.
    requestAnimationFrame(() => {
      reflowAndDraw({
        scene, edges, byId, nodes: a.nodes, links: a.edges,
        drawLink: drawArchEdge,
      });
      if (pz) fitToContent(pz, scene, canvas);
    });

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
  // Real UML sequence diagram: actors at top, dashed vertical lifelines,
  // horizontal message arrows stacked top-to-bottom (time flows down).
  function renderFlow(host, f) {
    const actorCount = f.actors.length;
    if (actorCount === 0) {
      host.appendChild(el('p', { class: 'prose-card__body' }, 'No flow steps to render.'));
      return;
    }

    // Layout constants.
    const headerH       = 56;   // actor header card height
    const headerGapY    = 36;   // gap below header before first message
    const stepGapY      = 56;   // vertical spacing between messages
    const padding       = 32;
    const minActorW     = 140;
    const actorGapX     = 40;

    // Build actor headers offscreen first so we can measure their widths.
    const actorEls = f.actors.map((a) => {
      const card = el('div', { class: 'flow-actor', 'data-actor': a.id }, [
        el('span', { class: 'flow-actor__kind' }, a.kind || ''),
        el('span', { class: 'flow-actor__label' }, a.label),
      ]);
      return { actor: a, card };
    });

    // Mount the diagram chrome.
    const wrap     = el('div', { class: 'flow-seq' });
    const headerRow= el('div', { class: 'flow-seq__actors' });
    const stage    = el('div', { class: 'flow-seq__stage' });
    const lifeSvg  = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const msgSvg   = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lifeSvg.setAttribute('class', 'flow-seq__lifelines');
    msgSvg.setAttribute('class',  'flow-seq__messages');
    stage.appendChild(lifeSvg);
    stage.appendChild(msgSvg);
    wrap.appendChild(headerRow);
    wrap.appendChild(stage);
    actorEls.forEach(({ card }) => headerRow.appendChild(card));
    host.appendChild(wrap);

    // Measure actor card widths after the DOM has them.
    requestAnimationFrame(() => {
      const actorW = actorEls.map(({ card }) => Math.max(minActorW, card.offsetWidth));

      // Distribute actors evenly across the available width if there's room,
      // otherwise stack them at their natural widths plus actorGapX.
      const totalNatural = actorW.reduce((a, b) => a + b, 0) + actorGapX * (actorCount - 1);
      const availW = Math.max(stage.clientWidth - padding * 2, totalNatural);
      const extra  = Math.max(0, availW - totalNatural);
      const perGap = actorCount > 1 ? extra / (actorCount - 1) : 0;

      const actorX = [];
      let cursor = padding;
      actorEls.forEach(({ card }, i) => {
        actorX.push(cursor + actorW[i] / 2);
        card.style.left = cursor + 'px';
        card.style.width = actorW[i] + 'px';
        cursor += actorW[i] + actorGapX + perGap;
      });
      const stageW = cursor + padding - actorGapX - perGap;
      const stageH = headerGapY + stepGapY * f.steps.length + padding;

      stage.style.width  = stageW + 'px';
      stage.style.height = stageH + 'px';
      lifeSvg.setAttribute('width',  stageW);
      lifeSvg.setAttribute('height', stageH);
      lifeSvg.setAttribute('viewBox', `0 0 ${stageW} ${stageH}`);
      msgSvg.setAttribute('width',  stageW);
      msgSvg.setAttribute('height', stageH);
      msgSvg.setAttribute('viewBox', `0 0 ${stageW} ${stageH}`);

      // Lifelines: dashed vertical lines down each actor's column.
      while (lifeSvg.firstChild) lifeSvg.removeChild(lifeSvg.firstChild);
      actorX.forEach((x) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x); line.setAttribute('x2', x);
        line.setAttribute('y1', 0); line.setAttribute('y2', stageH);
        line.setAttribute('class', 'flow-seq__lifeline');
        lifeSvg.appendChild(line);
      });

      // Messages.
      while (msgSvg.firstChild) msgSvg.removeChild(msgSvg.firstChild);
      appendArrowDef(msgSvg);
      const actorIdx = new Map(f.actors.map((a, i) => [a.id, i]));

      f.steps.forEach((s, i) => {
        const fi = actorIdx.get(s.from);
        const ti = actorIdx.get(s.to);
        if (fi == null || ti == null) return;
        const y = headerGapY + stepGapY * (i + 0.5);
        const isSelf = fi === ti;
        let path, labelX, labelAnchor;

        if (isSelf) {
          // Self-message: small loop to the right of the lifeline.
          const x = actorX[fi];
          path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const d = `M ${x} ${y - 8} L ${x + 36} ${y - 8} L ${x + 36} ${y + 8} L ${x + 4} ${y + 8}`;
          path.setAttribute('d', d);
          labelX = x + 40;
          labelAnchor = 'start';
        } else {
          const fx = actorX[fi];
          const tx = actorX[ti];
          path = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          path.setAttribute('x1', fx); path.setAttribute('y1', y);
          path.setAttribute('x2', tx); path.setAttribute('y2', y);
          // Anchor labels to the SOURCE side (in the direction of the arrow)
          // so they never extend past the canvas edge. The label flows toward
          // the target, where there's always space inside the diagram.
          const goingRight = tx > fx;
          labelX = goingRight ? fx + 8 : fx - 8;
          labelAnchor = goingRight ? 'start' : 'end';
        }
        path.setAttribute('marker-end', 'url(#edge-arrow)');
        path.setAttribute('class', 'flow-seq__msg' + (s.changed ? ' is-changed' : ''));
        msgSvg.appendChild(path);

        // Truncate based on actual horizontal room available for the label,
        // approximated as 7.2px per mono char.
        const availW = isSelf
          ? 140
          : Math.abs(actorX[ti] - actorX[fi]) - 16;
        const maxChars = Math.max(20, Math.floor(availW / 7.2));
        const truncated = s.label.length > maxChars
          ? s.label.slice(0, maxChars - 1) + '…'
          : s.label;

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', labelX);
        text.setAttribute('y', y - 6);
        text.setAttribute('text-anchor', labelAnchor);
        text.setAttribute('class', 'flow-seq__label');
        text.textContent = truncated;
        if (truncated !== s.label) {
          const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          t.textContent = s.label;
          text.appendChild(t);
        }
        msgSvg.appendChild(text);

        // Tiny step number on the source side so timing is unambiguous.
        const num = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        num.setAttribute('x', actorX[fi] + (isSelf ? 0 : (actorX[ti] > actorX[fi] ? 10 : -10)));
        num.setAttribute('y', y + 4);
        num.setAttribute('text-anchor', isSelf ? 'middle' : (actorX[ti] > actorX[fi] ? 'start' : 'end'));
        num.setAttribute('class', 'flow-seq__num');
        num.textContent = (i + 1).toString();
        msgSvg.appendChild(num);

        // Hit target for the detail panel — a transparent rect over the row.
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hit.setAttribute('x', Math.min(labelX - 100, actorX[Math.min(fi,ti)]));
        hit.setAttribute('y', y - 18);
        hit.setAttribute('width', Math.max(200, Math.abs(actorX[ti] - actorX[fi]) + 40));
        hit.setAttribute('height', 28);
        hit.setAttribute('fill', 'transparent');
        hit.style.cursor = 'pointer';
        hit.addEventListener('click', () => {
          const fromLabel = f.actors[fi]?.label || s.from;
          const toLabel   = f.actors[ti]?.label || s.to;
          openDetail(
            `<h3>Step ${i + 1}: ${escapeHTML(s.label)}</h3>` +
            `<p><strong>${escapeHTML(fromLabel)}</strong> → <strong>${escapeHTML(toLabel)}</strong></p>` +
            (s.changed ? `<p><span class="status-chip is-changed">~ changed</span></p>` : '')
          );
        });
        msgSvg.appendChild(hit);
      });
    });
  }
  function renderDatabase(host, d) {
    const { canvas, scene, edges, pz } = mountCanvas(host);
    const byId = new Map();

    // Flatten relations down to a links-by-id list for the layout heuristic.
    const links = (d.relations || []).map((r) => ({
      from: r.from.split('.')[0],
      to:   r.to.split('.')[0],
      status: r.status,
    }));

    d.tables.forEach((t) => {
      const card = el('div', {
        class: `node is-${t.status}`,
        style: 'min-width:260px;',
      }, [
        el('div', { class: 'node__head' }, [
          el('span', { class: 'node__kind' }, 'tbl'),
          el('span', {}, t.name),
          t.status !== 'context' ? el('span', { class: `status-chip is-${t.status}` }, ({ added: '+ added', changed: '~ changed', removed: '− removed' })[t.status]) : null,
        ]),
        el('div', { class: 'node__body', style: 'padding:0;' },
          t.fields.map((f) => {
            // Explicit class strings to ease testability:
            const explicit = f.status === 'added' ? 'field-row is-added'
                            : f.status === 'changed' ? 'field-row is-changed'
                            : f.status === 'removed' ? 'field-row is-removed'
                            : 'field-row';
            return el('div', { class: explicit + (f.privacy ? ' is-privacy' : '') }, [
              el('span', { class: 'field-row__name' }, f.name),
              el('span', { class: 'field-row__type' }, f.type),
              f.status !== 'context' ? el('span', { class: `status-chip is-${f.status}` }, f.status) : null,
            ]);
          })
        ),
      ]);
      card.setAttribute('data-detail-source', t.id);
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetail(detailForTable(t));
      });
      scene.appendChild(card);
      byId.set(t.id, card);
    });

    requestAnimationFrame(() => {
      reflowAndDraw({
        scene, edges, byId,
        nodes: d.tables,
        links,
        drawLink: drawRelationEdge,
      });
      if (pz) fitToContent(pz, scene, canvas);
    });

    function detailForTable(t) {
      const fields = t.fields.map((f) => `<li><code>${escapeHTML(f.name)}</code> · ${escapeHTML(f.type)} · <em>${escapeHTML(f.status)}</em></li>`).join('');
      const details = t.details || {};
      const detailLines = Object.entries(details).map(([k, v]) => `<p><strong>${escapeHTML(k)}:</strong> ${escapeHTML(String(v))}</p>`).join('');
      return `
        <h3>${escapeHTML(t.name)} <span class="status-chip is-${t.status}">${escapeHTML(t.status)}</span></h3>
        <h4>Fields</h4><ul>${fields}</ul>
        ${detailLines || ''}
      `;
    }
  }
  function renderCodeObservations(host, c) {
    c.items.forEach((it) => {
      host.appendChild(el('div', { class: 'prose-card' }, [
        el('div', { class: 'prose-card__title' }, [
          el('span', {}, it.title),
          el('span', { class: 'kind-chip' }, it.kind),
        ]),
        it.note ? el('p', { class: 'prose-card__body' }, it.note) : null,
        (it.files?.length)
          ? el('div', { class: 'prose-card__files', html: it.files.map((f) => `<span class="file-chip">${escapeHTML(f)}</span>`).join(' ') })
          : null,
      ]));
    });
  }

  function renderRiskRollout(host, r) {
    r.items.forEach((it) => {
      host.appendChild(el('div', { class: 'prose-card' }, [
        el('div', { class: 'prose-card__title' }, [
          el('span', {}, it.title),
          el('span', { class: 'kind-chip' }, it.severity),
        ]),
        el('p', { class: 'prose-card__body' }, it.notes),
        (it.files?.length)
          ? el('div', { class: 'prose-card__files', html: it.files.map((f) => `<span class="file-chip">${escapeHTML(f)}</span>`).join(' ') })
          : null,
      ]));
    });
  }

  function renderOpenQuestions(host, o) {
    const ul = el('ul', { class: 'summary-bullets' });
    o.items.forEach((q) => ul.appendChild(el('li', {}, q)));
    host.appendChild(ul);
  }

  // Layered + orthogonal layout. Sources go to layer 0, then each node lands
  // in the layer after the deepest of its incoming neighbours (Sugiyama-ish).
  // Cards in each layer are stacked vertically; edges route right-angle.
  function reflowAndDraw({ scene, edges, byId, nodes, links, drawLink }) {
    if (nodes.length === 0) return;

    const layer = assignLayers(nodes, links);
    const maxLayer = Math.max(0, ...layer.values());

    // Group node ids by layer in input order (stable).
    const layerGroups = Array.from({ length: maxLayer + 1 }, () => []);
    nodes.forEach((n) => layerGroups[layer.get(n.id)].push(n.id));

    const padding = 32;
    const colGap  = 110;  // generous so orthogonal elbows have room
    const rowGap  = 28;

    // Per-layer width = widest card in that layer.
    const layerWidths = layerGroups.map((ids) =>
      ids.reduce((w, id) => Math.max(w, byId.get(id)?.offsetWidth || 0), 0)
    );

    // Column X positions (one per layer).
    const colX = [];
    let cursor = padding;
    layerWidths.forEach((w) => { colX.push(cursor); cursor += w + colGap; });
    const sceneW = cursor - colGap + padding;

    // Stack cards in each layer.
    const colY = new Array(maxLayer + 1).fill(padding);
    layerGroups.forEach((ids, c) => {
      ids.forEach((id) => {
        const card = byId.get(id);
        if (!card) return;
        // Center each card horizontally inside its layer's column width.
        const cardX = colX[c] + (layerWidths[c] - card.offsetWidth) / 2;
        card.style.left = cardX + 'px';
        card.style.top  = colY[c] + 'px';
        colY[c] += card.offsetHeight + rowGap;
      });
    });
    const sceneH = Math.max(padding * 2, ...colY) + padding;

    scene.style.width  = sceneW + 'px';
    scene.style.height = sceneH + 'px';
    edges.setAttribute('viewBox', `0 0 ${sceneW} ${sceneH}`);
    edges.setAttribute('width',  sceneW);
    edges.setAttribute('height', sceneH);

    while (edges.firstChild) edges.removeChild(edges.firstChild);
    appendArrowDef(edges);

    // Distribute multiple edges between the same pair so they don't overlap.
    // Also bucket edges per source card so each gets its own exit Y.
    const fanOut = new Map(); // sourceId -> [edgeIndices...]
    links.forEach((link, i) => {
      const k = link.from;
      if (!fanOut.has(k)) fanOut.set(k, []);
      fanOut.get(k).push(i);
    });

    links.forEach((link, i) => {
      const siblings = fanOut.get(link.from) || [i];
      const slot = siblings.indexOf(i);
      const lane = (slot + 1) / (siblings.length + 1); // 0..1, never 0 or 1
      drawLink(link, byId, edges, { lane, scene });
    });

    // Move SVG to the end of scene so labels paint OVER cards (with
    // pointer-events:none so clicks still hit cards beneath).
    scene.appendChild(edges);

    // Wire hover focus on cards: dim all unrelated cards + edges.
    wireFocus(scene, edges, links);
  }

  // Longest-path layer assignment over a DAG. For cycles we fall back to the
  // source's layer + 1 (still safe because each node's layer is monotonically
  // non-decreasing).
  function assignLayers(nodes, links) {
    const layer = new Map(nodes.map((n) => [n.id, 0]));
    const incoming = new Map(nodes.map((n) => [n.id, []]));
    for (const l of links) {
      if (incoming.has(l.to)) incoming.get(l.to).push(l.from);
    }
    // Iterate until stable, capped to avoid infinite loops on cycles.
    for (let pass = 0; pass < nodes.length + 1; pass++) {
      let changed = false;
      nodes.forEach((n) => {
        const ins = incoming.get(n.id) || [];
        if (ins.length === 0) return;
        const want = Math.max(...ins.map((id) => (layer.get(id) ?? 0) + 1));
        if (want > layer.get(n.id)) {
          layer.set(n.id, want);
          changed = true;
        }
      });
      if (!changed) break;
    }
    // Cap at a reasonable max — wider diagrams get hard to read past ~5 layers.
    const cap = 5;
    layer.forEach((v, k) => { if (v > cap) layer.set(k, cap); });
    return layer;
  }

  function wireFocus(scene, edges, links) {
    const cards = Array.from(scene.querySelectorAll('.node'));
    const linkPaths = Array.from(edges.querySelectorAll('path:not(.edge-arrow)'));
    const linksByFrom = new Map();
    const linksByTo = new Map();
    links.forEach((l, i) => {
      if (!linksByFrom.has(l.from)) linksByFrom.set(l.from, []);
      if (!linksByTo.has(l.to)) linksByTo.set(l.to, []);
      linksByFrom.get(l.from).push(i);
      linksByTo.get(l.to).push(i);
    });

    const clearDim = () => {
      cards.forEach((c) => c.classList.remove('is-dimmed'));
      linkPaths.forEach((p) => p.classList.remove('is-focus-dim'));
    };
    const applyFocus = (id) => {
      const related = new Set([id]);
      (linksByFrom.get(id) || []).forEach((i) => related.add(links[i].to));
      (linksByTo.get(id) || []).forEach((i) => related.add(links[i].from));
      cards.forEach((c) => {
        c.classList.toggle('is-dimmed', !related.has(c.getAttribute('data-detail-source')));
      });
      linkPaths.forEach((p, i) => {
        const link = links[i];
        const active = link && (link.from === id || link.to === id);
        p.classList.toggle('is-focus-dim', !active);
      });
    };
    cards.forEach((c) => {
      c.addEventListener('mouseenter', () => applyFocus(c.getAttribute('data-detail-source')));
    });
    // Clear when the mouse leaves the canvas entirely, NOT when it merely
    // transitions between cards inside the canvas. mouseleave on the canvas
    // container doesn't bubble from children, so it fires only at the boundary.
    const canvas = scene.parentElement; // .canvas
    if (canvas) canvas.addEventListener('mouseleave', clearDim);
  }

  // Reusable arrowhead marker. One <defs> per SVG; drawLink references it.
  function appendArrowDef(svg) {
    const ns = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(ns, 'defs');
    const marker = document.createElementNS(ns, 'marker');
    marker.setAttribute('id', 'edge-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrow = document.createElementNS(ns, 'path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrow.setAttribute('fill', 'currentColor');
    arrow.setAttribute('class', 'edge-arrow');
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svg.appendChild(defs);
  }

  // Orthogonal "Manhattan" routing: right-angle path with two elbows. The
  // `lane` param (0..1) shifts the elbow point vertically when many edges
  // share the same source, so they don't all stack on top of each other.
  function routePath(fromCard, toCard, opts = {}) {
    const lane = typeof opts.lane === 'number' ? opts.lane : 0.5;
    const fl = parseFloat(fromCard.style.left), ft = parseFloat(fromCard.style.top);
    const fw = fromCard.offsetWidth,             fh = fromCard.offsetHeight;
    const tl = parseFloat(toCard.style.left),    tt = parseFloat(toCard.style.top);
    const tw = toCard.offsetWidth,               th = toCard.offsetHeight;
    const fcx = fl + fw / 2, fcy = ft + fh / 2;
    const tcx = tl + tw / 2, tcy = tt + th / 2;
    const dx = tcx - fcx;
    const dy = tcy - fcy;
    // Source anchor sits a fraction of card height down so multiple edges
    // from the same source exit at different Y positions.
    const sourceOffsetY = (lane - 0.5) * (fh - 16);

    if (Math.abs(dx) >= Math.abs(dy)) {
      // Horizontal-dominant: source right → vertical leg → target left.
      const goingRight = dx >= 0;
      const fx = goingRight ? fl + fw : fl;
      const fy = ft + fh / 2 + sourceOffsetY;
      const tx = goingRight ? tl : tl + tw;
      const ty = tt + th / 2;
      // Elbow X sits between the two cards, biased toward target by lane.
      const elbowX = fx + (tx - fx) * (0.5 + (lane - 0.5) * 0.4);
      return `M ${fx} ${fy} L ${elbowX} ${fy} L ${elbowX} ${ty} L ${tx} ${ty}`;
    } else {
      // Vertical-dominant: source bottom/top → horizontal leg → target top/bottom.
      const goingDown = dy >= 0;
      const fx = fl + fw / 2;
      const fy = goingDown ? ft + fh : ft;
      const tx = tl + tw / 2;
      const ty = goingDown ? tt : tt + th;
      const elbowY = fy + (ty - fy) * (0.5 + (lane - 0.5) * 0.4);
      return `M ${fx} ${fy} L ${fx} ${elbowY} L ${tx} ${elbowY} L ${tx} ${ty}`;
    }
  }

  function drawArchEdge(e, byId, svg, opts = {}) {
    const fromCard = byId.get(e.from); const toCard = byId.get(e.to);
    if (!fromCard || !toCard) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', routePath(fromCard, toCard, opts));
    path.setAttribute('marker-end', 'url(#edge-arrow)');
    path.setAttribute('data-from', e.from);
    path.setAttribute('data-to', e.to);
    if (e.kind === 'async') path.classList.add('is-async');
    if (e.kind === 'data')  path.classList.add('is-data');
    svg.appendChild(path);
    if (e.label) appendEdgeLabel(svg, fromCard, toCard, e.label, opts.scene || svg.parentElement, opts);
  }

  function drawRelationEdge(r, byId, svg, opts = {}) {
    const fromCard = byId.get(r.from); const toCard = byId.get(r.to);
    if (!fromCard || !toCard) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', routePath(fromCard, toCard, opts));
    path.setAttribute('marker-end', 'url(#edge-arrow)');
    path.setAttribute('data-from', r.from);
    path.setAttribute('data-to', r.to);
    if (r.status === 'removed') path.classList.add('is-dimmed');
    if (r.status === 'added')   path.classList.add('is-added');
    svg.appendChild(path);
  }

  // Position labels on the vertical leg of orthogonal edges — that's the
  // inter-column gap, guaranteed empty space. Per-lane vertical offset
  // staggers labels for edges sharing the same source.
  function appendEdgeLabel(svg, fromCard, toCard, label, scene, opts = {}) {
    const lane = typeof opts.lane === 'number' ? opts.lane : 0.5;
    const fl = parseFloat(fromCard.style.left), ft = parseFloat(fromCard.style.top);
    const fw = fromCard.offsetWidth,             fh = fromCard.offsetHeight;
    const tl = parseFloat(toCard.style.left),    tt = parseFloat(toCard.style.top);
    const tw = toCard.offsetWidth,               th = toCard.offsetHeight;
    const dx = (tl + tw / 2) - (fl + fw / 2);
    const dy = (tt + th / 2) - (ft + fh / 2);
    const horizontal = Math.abs(dx) >= Math.abs(dy);

    let lx, ly, anchor;
    if (horizontal) {
      const goingRight = dx >= 0;
      const fx = goingRight ? fl + fw : fl;
      const tx = goingRight ? tl : tl + tw;
      const fy = ft + fh / 2 + (lane - 0.5) * (fh - 16);
      const ty = tt + th / 2;
      // Elbow X matches routePath. Center label on the vertical leg so it
      // doesn't extend toward either neighbouring card.
      const elbowX = fx + (tx - fx) * (0.5 + (lane - 0.5) * 0.4);
      lx = elbowX;
      ly = (fy + ty) / 2 + 4;
      anchor = 'middle';
    } else {
      const goingDown = dy >= 0;
      const fy = goingDown ? ft + fh : ft;
      const ty = goingDown ? tt : tt + th;
      const fx = fl + fw / 2;
      const tx = tl + tw / 2;
      const elbowY = fy + (ty - fy) * (0.5 + (lane - 0.5) * 0.4);
      lx = (fx + tx) / 2;
      ly = elbowY - 6;
      anchor = 'middle';
    }

    // Skip labels whose anchor falls inside an unrelated card.
    if (scene) {
      for (const node of scene.children) {
        if (node === fromCard || node === toCard) continue;
        if (!node.classList?.contains('node')) continue;
        const nl = parseFloat(node.style.left || 0), nt = parseFloat(node.style.top || 0);
        const nw = node.offsetWidth, nh = node.offsetHeight;
        if (lx >= nl - 4 && lx <= nl + nw + 4 && ly >= nt - 4 && ly <= nt + nh + 4) return;
      }
    }

    // Truncate labels longer than the inter-column gap can fit (~20 chars
    // at 11px mono ≈ 130px). Full label still lives in the spec JSON.
    const MAX = 22;
    const display = label.length > MAX ? label.slice(0, MAX - 1) + '…' : label;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', lx);
    text.setAttribute('y', ly);
    text.setAttribute('text-anchor', anchor);
    text.setAttribute('class', 'edge-label');
    text.textContent = display;
    if (display !== label) {
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = label;
      text.appendChild(title);
    }
    svg.appendChild(text);
  }

  // ---------- shared helpers exposed for renderers ----------
  window.__pro = { el, escapeHTML, mountCanvas, openDetail, closeDetail };
})();
