(function () {
  'use strict';

  const data = window.__PR_OVERVIEW_DATA__;
  if (!data) return;

  // Cross-renderer namespace. Initialised early so theme-toggle and section
  // renderers can register hooks before the first render finishes.
  window.__pro = window.__pro || { themeChangeHandlers: [] };

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
  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null) node.setAttribute(k, v);
    }
    return node;
  };

  // ---------- meta / data-bind / data-list ----------
  document.querySelectorAll('[data-bind]').forEach((node) => {
    const v = pick(data, node.getAttribute('data-bind'));
    if (v == null) return;
    const prefix = node.getAttribute('data-prefix') || '';
    const suffix = node.getAttribute('data-suffix') || '';
    node.textContent = `${prefix}${v}${suffix}`;
  });

  // ---------- theme toggle ----------
  try {
    const saved = localStorage.getItem('pr-overview.theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (_) {}
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'paper' ? 'dark' : 'paper';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('pr-overview.theme', next); } catch (_) {}
    // Mermaid bakes its theme variables + classDefs into the rendered SVG, so
    // a toggle has to re-render the diagram. The architecture renderer
    // registers a callback here for that purpose.
    (window.__pro.themeChangeHandlers || []).forEach((fn) => { try { fn(next); } catch (_) {} });
  });

  // ---------- hero + footer ----------
  const heroTitle = document.querySelector('[data-hero-title]');
  if (heroTitle) heroTitle.textContent = data.meta.title;
  const heroStand = document.querySelector('[data-hero-stand]');
  if (heroStand && data.summary?.bullets?.length) {
    heroStand.textContent = data.summary.bullets[0];
  }
  const footerStand = document.querySelector('[data-footer-stand]');
  if (footerStand && data.summary?.bullets?.length) {
    const tail = data.summary.bullets.slice(0, 2).join(' ');
    footerStand.textContent = tail;
  }
  const prLink = document.querySelector('[data-footer-link]');
  if (prLink) {
    const href = data.meta.pr_url || '#';
    prLink.setAttribute('href', href);
    if (!data.meta.pr_url) {
      prLink.textContent = 'View diff →';
      prLink.style.pointerEvents = 'none';
      prLink.style.opacity = '0.6';
    }
  }
  const railPr = document.querySelector('[data-rail-pr]');
  if (railPr && data.meta.pr_url) {
    const m = data.meta.pr_url.match(/\/pull\/(\d+)/);
    if (m) railPr.textContent = '· PR #' + m[1];
  }
  const heroPr = document.querySelector('[data-hero-pr]');
  if (heroPr) {
    if (data.meta.pr_url) {
      const m = data.meta.pr_url.match(/\/pull\/(\d+)/);
      heroPr.textContent = m ? 'PR #' + m[1] : 'PR';
    } else {
      heroPr.textContent = data.meta.head;
      heroPr.classList.remove('hero__tag');
    }
  }

  // ---------- section mount registry ----------
  const main = document.querySelector('[data-sections]');
  const RENDERERS = {
    summary:           { label: 'Why this exists',  render: renderWhy },
    architecture:      { label: 'The big picture',  render: renderArchitecture },
    flow:              { label: 'How it flows',     render: renderFlow },
    database:          { label: 'Database changes', render: renderDatabase },
    code_observations: { label: 'Caught in review', render: renderCodeObservations },
    risk_rollout:      { label: 'Risk & rollout',   render: renderRiskRollout },
    open_questions:    { label: 'Open questions',   render: renderOpenQuestions },
  };
  // Anchors listed as literals so the test suite can grep for them in
  // the inlined JS source — and so this stays self-documenting.
  const ANCHORS = {
    summary:           'section-summary',
    architecture:      'section-architecture',
    flow:              'section-flow',
    database:          'section-database',
    code_observations: 'section-code-observations',
    risk_rollout:      'section-risk-rollout',
    open_questions:    'section-open-questions',
  };
  const ORDER = Object.keys(ANCHORS);

  const navOl = document.querySelector('[data-nav]');
  let n = 0;
  ORDER.forEach((key) => {
    if (!data[key]) return;
    if (key === 'summary' && !data.summary?.bullets?.length) return;
    n += 1;
    const anchor = ANCHORS[key];
    const meta = RENDERERS[key];

    // nav item
    if (navOl) {
      const li = el('li', {}, [
        el('a', { href: '#' + anchor, 'data-target': anchor }, [
          el('span', { class: 'n' }, String(n).padStart(2, '0')),
          el('span', {}, meta.label),
        ]),
      ]);
      navOl.appendChild(li);
    }

    // section
    const section = el('section', {
      class: 'section' + (key === 'architecture' || key === 'flow' || key === 'database' ? ' section--wide' : ''),
      id: anchor,
    }, [
      el('div', { class: 'kicker' }, [
        el('span', { class: 'kicker__num' }, String(n).padStart(2, '0')),
        meta.label,
      ]),
    ]);
    main.appendChild(section);
    try { meta.render(section, data[key]); } catch (err) { console.error(`render ${key} failed`, err); }
  });

  // ---------- scroll progress + scroll-spy ----------
  const progress = document.querySelector('[data-progress]');
  const onScroll = () => {
    if (progress) {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const navLinks = Array.from(document.querySelectorAll('[data-target]'));
  const navByTarget = new Map(navLinks.map((a) => [a.getAttribute('data-target'), a]));
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        navLinks.forEach((a) => a.classList.remove('is-active'));
        const a = navByTarget.get(e.target.id);
        if (a) a.classList.add('is-active');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('section.section[id]').forEach((s) => spy.observe(s));

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

  // ============================================================
  // Section renderers
  // ============================================================

  function renderWhy(host, summary) {
    const lead = el('p', { class: 'lead' });
    lead.textContent = data.meta.title + ' — at a glance.';
    host.appendChild(lead);

    // meta strip with file/insertion/deletion counts + type tags.
    const strip = el('div', { class: 'meta-strip' }, [
      el('span', { class: 'chip' }, [el('span', {}, 'base · '), el('b', {}, data.meta.base)]),
      el('span', { class: 'chip' }, [el('span', {}, '→ '), el('b', {}, data.meta.head)]),
      el('span', { class: 'chip' }, data.meta.files_changed + ' files'),
      el('span', { class: 'chip chip--add' }, '+' + data.meta.additions),
      el('span', { class: 'chip chip--del' }, '−' + data.meta.deletions),
      ...((data.meta.pr_type_tags || []).map((t) => el('span', { class: 'chip chip--accent' }, t))),
    ]);
    host.appendChild(strip);

    // Each summary bullet becomes a "gap card".
    const gaps = el('div', { class: 'gaps' });
    const icons = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];
    summary.bullets.forEach((b, i) => {
      const sentence = String(b).trim();
      // Use the first noun phrase as the heading, rest as body. Simple split on " — " or first sentence end.
      let title = sentence, body = '';
      const dashIdx = sentence.search(/[——:]\s/);
      if (dashIdx > 0 && dashIdx < 80) {
        title = sentence.slice(0, dashIdx).trim();
        body = sentence.slice(dashIdx + 2).trim();
      } else if (sentence.length > 100) {
        const periodIdx = sentence.indexOf('. ');
        if (periodIdx > 0 && periodIdx < 90) {
          title = sentence.slice(0, periodIdx).trim();
          body = sentence.slice(periodIdx + 2).trim();
        }
      }
      gaps.appendChild(el('div', { class: 'gap' }, [
        el('div', { class: 'gap__ic' }, icons[i] || String(i + 1)),
        el('div', {}, [
          el('h3', {}, title),
          body ? el('p', {}, body) : null,
        ]),
      ]));
    });
    host.appendChild(gaps);
  }

  // Architecture is rendered via Mermaid flowchart. Subgraphs group nodes by
  // kind (ui / service / module / datastore / external / job) so the graph
  // reads as a C4-style container view. Click handlers route to the detail
  // panel; status colors come from classDef.
  function renderArchitecture(host, a) {
    host.appendChild(el('p', {}, [
      el('span', {}, 'The components this branch touches, grouped by kind and connected by who calls whom. '),
      el('strong', {}, 'Click any box '),
      el('span', {}, 'to see its responsibilities, files, and status. The diagram is laid out automatically — use the controls at the bottom right to zoom or fit.'),
    ]));

    // Inline color legend so the reviewer doesn't need to remember the codes.
    const legend = el('div', { class: 'arch-legend' }, [
      el('span', { class: 'arch-legend__label' }, 'Legend'),
      el('span', { class: 'arch-legend__item' }, [
        el('span', { class: 'arch-legend__chip arch-legend__chip--added' }),
        el('span', {}, 'added'),
      ]),
      el('span', { class: 'arch-legend__item' }, [
        el('span', { class: 'arch-legend__chip arch-legend__chip--changed' }),
        el('span', {}, 'changed'),
      ]),
      el('span', { class: 'arch-legend__item' }, [
        el('span', { class: 'arch-legend__chip arch-legend__chip--context' }),
        el('span', {}, 'context (unchanged)'),
      ]),
      el('span', { class: 'arch-legend__edges' }, 'Edges: solid = sync · dashed = async/data'),
    ]);
    host.appendChild(legend);

    const id = 'arch-mmd-' + Math.random().toString(36).slice(2, 9);
    const wrap = el('div', { class: 'mmd-wrap' });
    const inner = el('div', { class: 'mmd-inner' });
    const hint = el('div', { class: 'mmd-hint' }, 'click any node · ctrl+wheel to zoom · drag to pan');
    const mmdHost = el('pre', { class: 'mermaid', id });
    inner.appendChild(mmdHost);
    wrap.appendChild(hint);
    wrap.appendChild(inner);
    wrap.appendChild(mmdControls(inner));
    host.appendChild(wrap);

    // Expose a global handler Mermaid can call from click directives.
    if (!window.__archDetailFor) {
      window.__archDetail = {};
      window.__archDetailFor = (key) => {
        const entry = window.__archDetail[key];
        if (!entry) return;
        openDetail(entry);
      };
    }
    const detailKey = id;
    window.__archDetail[detailKey] = null; // placeholder; per-node entries set below

    const renderOnce = () => {
      // textContent reset + clear the data-processed flag so Mermaid will
      // re-render this element on subsequent runs (it skips already-processed
      // nodes otherwise).
      mmdHost.textContent = buildMermaid(a, detailKey);
      mmdHost.removeAttribute('data-processed');
      runMermaid(mmdHost, () => wireMermaidInteractions(mmdHost, a, inner));
    };
    renderOnce();

    // Re-render on theme toggle: classDef colors and theme variables are baked
    // into the rendered SVG, so a toggle has to rebuild from source.
    window.__pro.themeChangeHandlers.push(renderOnce);
  }

  function buildMermaid(a, detailKey) {
    const sid = (s) => 'n_' + String(s).replace(/[^a-zA-Z0-9_]/g, '_');
    const esc = (s) => String(s).replace(/"/g, '#quot;').replace(/[<>]/g, '');
    // LR (left-right) reads as a system flow: entries on the left, datastores
    // on the right. Subgraphs group by kind so it stays organised.
    const lines = ['flowchart LR'];

    // Group nodes by kind for subgraphs. Order kinds so UI/entry points are
    // on the left, datastores/externals on the right.
    const KIND_ORDER = ['ui', 'service', 'module', 'job', 'datastore', 'external'];
    const KIND_LABEL = {
      ui: 'UI surfaces', service: 'Services', module: 'Modules',
      job: 'Jobs / Cron', datastore: 'Data', external: 'External',
    };
    const grouped = new Map();
    a.nodes.forEach((n) => {
      const k = n.kind || 'module';
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(n);
    });

    KIND_ORDER.forEach((kind) => {
      const nodes = grouped.get(kind);
      if (!nodes || !nodes.length) return;
      lines.push(`  subgraph g_${kind}["${esc(KIND_LABEL[kind] || kind)}"]`);
      lines.push('    direction TB');
      nodes.forEach((n) => {
        lines.push(`    ${sid(n.id)}["${esc(n.label)}"]`);
      });
      lines.push('  end');
    });

    // Truncate edge labels to ≤4 words so they always sit cleanly on a
    // single line. Full label still readable via the SVG <title> set
    // post-render in wireMermaidInteractions.
    const truncateLabel = (s) => {
      const words = String(s).trim().split(/\s+/);
      return words.length <= 4 ? words.join(' ') : words.slice(0, 3).join(' ') + '…';
    };
    a.edges.forEach((e) => {
      const arrow =
        e.kind === 'async' ? '-. ' :
        e.kind === 'data'  ? '== ' :
                              '-- ';
      const close =
        e.kind === 'async' ? ' .-> ' :
        e.kind === 'data'  ? ' ==> ' :
                              ' --> ';
      const label = e.label ? `"${esc(truncateLabel(e.label))}"` : '';
      lines.push(`  ${sid(e.from)} ${arrow}${label}${close}${sid(e.to)}`);
    });

    // Status colors via classDef. Boosted contrast so the difference between
    // added / changed / context is obvious at a glance — thin pale tints
    // turned out to be unreadable for reviewers scanning the diagram.
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      lines.push('  classDef added   fill:#1f4f3a,stroke:#3fb950,stroke-width:3px,color:#c8f0d2,font-weight:bold');
      lines.push('  classDef changed fill:#1f3a5a,stroke:#58a6ff,stroke-width:3px,color:#cfdbed,font-weight:bold');
      lines.push('  classDef removed fill:#4a2520,stroke:#f85149,stroke-width:3px,color:#f5c6c1,font-weight:bold,stroke-dasharray:5 5');
      lines.push('  classDef context fill:#21262d,stroke:#8b949e,stroke-width:2px,color:#c9d1d9,stroke-dasharray:4 4');
    } else {
      lines.push('  classDef added   fill:#b3d4c4,stroke:#0d4234,stroke-width:3px,color:#0d4234,font-weight:bold');
      lines.push('  classDef changed fill:#b8c8e1,stroke:#1c3a6b,stroke-width:3px,color:#1c3a6b,font-weight:bold');
      lines.push('  classDef removed fill:#e6b8a3,stroke:#5a2510,stroke-width:3px,color:#5a2510,font-weight:bold,stroke-dasharray:5 5');
      lines.push('  classDef context fill:#ece5d5,stroke:#5b5347,stroke-width:2px,color:#211e19,stroke-dasharray:4 4');
    }

    a.nodes.forEach((n) => {
      const status = a.details?.[n.id]?.status ?? (n.changed ? 'changed' : 'context');
      lines.push(`  class ${sid(n.id)} ${status}`);
    });

    // Click handlers wire each node id to a stored detail-panel entry.
    a.nodes.forEach((n) => {
      const key = detailKey + ':' + n.id;
      lines.push(`  click ${sid(n.id)} call __archDetailFor("${key}")`);
    });

    return lines.join('\n');
  }

  function runMermaid(mmdHost, afterRender) {
    const init = () => {
      const theme = document.documentElement.getAttribute('data-theme') || 'paper';
      const paper = theme === 'paper';
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose', // needed for click call directives
        // htmlLabels:false → labels are real SVG <text>, which means we can
        // use paint-order:stroke to mask the edge line where a label sits.
        // HTML labels (the default) sit in a foreignObject above the line,
        // so no text-shadow / background trick can actually cut the line.
        flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: false, nodeSpacing: 30, rankSpacing: 55, padding: 12 },
        theme: 'base',
        themeVariables: paper ? {
          fontFamily: 'IBM Plex Mono, ui-monospace, Menlo, monospace',
          background: '#fbf9f3',
          primaryColor: '#fbf9f3',
          primaryBorderColor: '#ddd4bf',
          primaryTextColor: '#211e19',
          lineColor: '#5b5347',
          secondaryColor: '#f0e6cf',
          tertiaryColor: '#e3ece6',
          // Cluster contrast: pale fill vs ink-soft border so subgraph groups
          // read clearly without competing with the node colors.
          clusterBkg: 'rgba(0,0,0,0.045)',
          clusterBorder: '#5b5347',
          edgeLabelBackground: 'transparent',
        } : {
          fontFamily: 'IBM Plex Mono, ui-monospace, Menlo, monospace',
          background: '#161b22',
          primaryColor: '#161b22',
          primaryBorderColor: '#30363d',
          primaryTextColor: '#e6edf3',
          lineColor: '#c9d1d9',
          secondaryColor: '#21262d',
          tertiaryColor: 'rgba(63,185,80,0.15)',
          clusterBkg: 'rgba(255,255,255,0.04)',
          clusterBorder: '#8b949e',
          edgeLabelBackground: 'transparent',
        },
      });
      window.mermaid.run({ nodes: [mmdHost] }).then(afterRender);
    };
    if (window.mermaid) init();
    else {
      const wait = () => window.mermaid ? init() : setTimeout(wait, 30);
      wait();
    }
  }

  function wireMermaidInteractions(mmdHost, a, scrollWrap) {
    // Store per-node detail HTML keyed by `${graphId}:${nodeId}` so the
    // Mermaid-generated click directives can find them.
    a.nodes.forEach((n) => {
      const d = a.details?.[n.id];
      const files = (d?.files ?? []).map((f) => `<span class="file-chip">${escapeHTML(f)}</span>`).join(' ');
      const resp  = (d?.responsibilities ?? []).map((r) => `<li>${escapeHTML(r)}</li>`).join('');
      const status = d?.status ?? (n.changed ? 'changed' : 'context');
      window.__archDetail[mmdHost.id + ':' + n.id] = `
        <h3>${escapeHTML(n.label)}</h3>
        <p>
          <span class="chip">${escapeHTML(n.kind || 'module')}</span>
          ${status !== 'context' ? `<span class="status-chip is-${status}" style="margin-left:6px">${status}</span>` : ''}
        </p>
        ${d?.summary ? `<p>${escapeHTML(d.summary)}</p>` : ''}
        ${resp ? `<h4>Responsibilities</h4><ul>${resp}</ul>` : ''}
        ${files ? `<h4>Files</h4><div class="spec__files">${files}</div>` : ''}
      `;
    });

    // Pin the SVG element to its viewBox dimensions in CSS pixels so the
    // browser doesn't pre-shrink content. Panzoom is then the ONLY scaler.
    const svgEl = mmdHost.querySelector('svg');
    if (!svgEl) return;
    const vbAttr = svgEl.getAttribute('viewBox');
    if (vbAttr) {
      const [, , vbW, vbH] = vbAttr.split(/\s+/).map(Number);
      if (vbW && vbH) {
        svgEl.style.width  = vbW + 'px';
        svgEl.style.height = vbH + 'px';
      }
    }
    svgEl.style.maxWidth = 'none';
    svgEl.style.display = 'block';

    // Subgraph cluster titles ("UI surfaces", "Services", etc.) render at
    // exactly the rect top, so the dashed border passes through the text.
    // Float them ABOVE the box (negative y) so the title acts like a small
    // caption sitting above the dashed border, with a clear gap. Shifting
    // them DOWN would push the title into a node when the subgraph only
    // has one node directly under it.
    svgEl.querySelectorAll('g.cluster-label').forEach((g) => {
      if (g.dataset.prShifted) return;
      const cur = g.getAttribute('transform') || '';
      g.setAttribute('transform', cur + ' translate(0,-15)');
      g.dataset.prShifted = '1';
    });

    // Lift each edge label above its line by translating the wrapper <g>.
    // Do NOT add per-text dy — Mermaid puts each word on its own <text>
    // sibling, so per-element dy would stack them into a staircase.
    svgEl.querySelectorAll('g.edgeLabel').forEach((g) => {
      if (g.dataset.prLifted) return; // idempotent across theme re-renders
      const cur = g.getAttribute('transform') || '';
      g.setAttribute('transform', cur + ' translate(0,-12)');
      g.dataset.prLifted = '1';
    });
    // Expose the full label as <title> on the rendered text so the
    // truncated 4-word version still surfaces the original on hover.
    svgEl.querySelectorAll('g.edgeLabel').forEach((g) => {
      const text = (g.textContent || '').trim();
      if (!text) return;
      const original = a.edges.find((e) => e.label && (
        e.label === text || (e.label.length > text.length && text.endsWith('…'))
      ))?.label;
      if (original && original !== text && !g.querySelector('title')) {
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = original;
        g.appendChild(title);
      }
    });

    if (typeof window.panzoom === 'function') {
      const pz = window.panzoom(svgEl, {
        smoothScroll: false,
        minZoom: 0.3, maxZoom: 4,
        beforeWheel: (e) => !e.ctrlKey && !e.metaKey,
        // Yield to clicks on nodes (open detail) and to drags on cluster
        // chrome (move the whole subgraph).
        beforeMouseDown: (e) =>
          !!e.target.closest?.('.node') ||
          !!e.target.closest?.('g.cluster'),
      });
      scrollWrap._pz = pz;
      requestAnimationFrame(() => fitMermaid(pz, svgEl, scrollWrap));
    }

    // Wire drag on each cluster so reviewers can rearrange the layout.
    wireClusterDrag(svgEl, a.edges);
  }

  // Make Mermaid g.cluster elements draggable. The cluster carries its
  // label + rect + every nested node, all under one transform — so a
  // single translate moves the whole subgraph as a unit. After each
  // delta, we redraw the edges as straight orthogonal paths between
  // the new node centers (Mermaid's pre-computed bezier curves were
  // baked to the original positions, so they'd disconnect otherwise).
  function wireClusterDrag(svgEl, edges) {
    // Tag every rendered edge with the source/target ids the spec used,
    // matching them by emission order (Mermaid renders edges in declaration
    // order, so spec edges[i] ↔ DOM edgePaths[i]).
    const edgePaths = Array.from(svgEl.querySelectorAll('g.edgePaths > path, g.edgePaths > g'));
    edgePaths.forEach((node, i) => {
      const edge = edges[i];
      if (!edge) return;
      const path = node.tagName === 'path' ? node : node.querySelector('path');
      if (!path) return;
      const sid = (s) => 'n_' + String(s).replace(/[^a-zA-Z0-9_]/g, '_');
      path.dataset.archFrom = sid(edge.from);
      path.dataset.archTo   = sid(edge.to);
    });

    // Cursor + mousedown handler per cluster.
    let drag = null;
    svgEl.querySelectorAll('g.cluster').forEach((cluster) => {
      cluster.style.cursor = 'grab';
      cluster.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.node')) return; // node click takes precedence
        e.stopPropagation();
        e.preventDefault();
        const cur = cluster.getAttribute('transform') || '';
        const m = cur.match(/translate\(\s*([-\d.]+)\s*[,\s]\s*([-\d.]+)\s*\)/);
        const ctm = svgEl.getScreenCTM();
        drag = {
          cluster,
          startX: e.clientX, startY: e.clientY,
          baseTx: m ? parseFloat(m[1]) : 0,
          baseTy: m ? parseFloat(m[2]) : 0,
          // Scale factor so mouse pixels map to SVG units.
          scale: ctm ? ctm.a : 1,
        };
        cluster.style.cursor = 'grabbing';
      });
    });

    const onMove = (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / drag.scale;
      const dy = (e.clientY - drag.startY) / drag.scale;
      const newT = `translate(${drag.baseTx + dx}, ${drag.baseTy + dy})`;
      // Preserve any other transform parts (rotate, scale) by replacing only
      // the translate; if none existed, append.
      const cur = drag.cluster.getAttribute('transform') || '';
      drag.cluster.setAttribute(
        'transform',
        /translate\(/.test(cur) ? cur.replace(/translate\([^)]+\)/, newT) : newT,
      );
      redrawArchEdges(svgEl);
    };
    const onUp = () => {
      if (!drag) return;
      drag.cluster.style.cursor = 'grab';
      drag = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function redrawArchEdges(svgEl) {
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return;
    const inv = ctm.inverse();
    const svgRect = svgEl.getBoundingClientRect();
    const nodeCache = new Map();
    const findNode = (sid) => {
      if (nodeCache.has(sid)) return nodeCache.get(sid);
      // Mermaid node ids look like `flowchart-n_welcome_page-0`.
      const node = svgEl.querySelector(`g.node[id^="flowchart-${sid}-"]`) ||
                   svgEl.querySelector(`g.node[id*="${sid}"]`);
      nodeCache.set(sid, node);
      return node;
    };
    const centerInSvg = (el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // Convert client → SVG-internal coordinates.
      try {
        const pt = new DOMPoint(cx, cy).matrixTransform(inv);
        return { x: pt.x, y: pt.y, w: r.width / ctm.a, h: r.height / ctm.d };
      } catch (_) {
        return { x: cx - svgRect.left, y: cy - svgRect.top, w: r.width, h: r.height };
      }
    };

    svgEl.querySelectorAll('g.edgePaths path, g.edgePaths g path').forEach((path) => {
      const from = path.dataset.archFrom;
      const to   = path.dataset.archTo;
      if (!from || !to) return;
      const f = findNode(from);
      const t = findNode(to);
      if (!f || !t) return;
      const fc = centerInSvg(f);
      const tc = centerInSvg(t);
      // Orthogonal path: pick the dominant axis for the elbow.
      const dx = tc.x - fc.x;
      const dy = tc.y - fc.y;
      let d;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const goingRight = dx >= 0;
        const fx = goingRight ? fc.x + fc.w / 2 : fc.x - fc.w / 2;
        const tx = goingRight ? tc.x - tc.w / 2 : tc.x + tc.w / 2;
        const elbow = fx + (tx - fx) * 0.5;
        d = `M ${fx} ${fc.y} L ${elbow} ${fc.y} L ${elbow} ${tc.y} L ${tx} ${tc.y}`;
      } else {
        const goingDown = dy >= 0;
        const fy = goingDown ? fc.y + fc.h / 2 : fc.y - fc.h / 2;
        const ty = goingDown ? tc.y - tc.h / 2 : tc.y + tc.h / 2;
        const elbow = fy + (ty - fy) * 0.5;
        d = `M ${fc.x} ${fy} L ${fc.x} ${elbow} L ${tc.x} ${elbow} L ${tc.x} ${ty}`;
      }
      path.setAttribute('d', d);
    });
  }

  function fitMermaid(pz, svgEl, container) {
    if (!pz) return;
    const bbox = svgEl.getBBox();
    if (!bbox || !bbox.width) return;
    const padding = 24;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // Compute the SVG's CSS-rendered position (it lives inside an absolutely
    // positioned scene). Account for negative-origin viewBoxes by reading
    // the viewBox attribute directly.
    const vb = (svgEl.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number);
    const vbX = vb[0] || 0, vbY = vb[1] || 0;
    // Width fit: scale so the diagram exactly fills the container width.
    // Height fit: separately, ensure we don't zoom in past 1.4x for tiny
    // diagrams, and don't shrink below ~0.5 for very large ones.
    let scale = (cw - padding * 2) / bbox.width;
    scale = Math.min(scale, 1.4);
    scale = Math.max(scale, 0.5);
    pz.zoomAbs(0, 0, scale);
    // Center horizontally; pin to top vertically with padding.
    const renderedW = bbox.width * scale;
    const renderedX = (bbox.x - vbX) * scale;
    const renderedY = (bbox.y - vbY) * scale;
    const offsetX = (cw - renderedW) / 2 - renderedX;
    const offsetY = padding - renderedY;
    pz.moveTo(offsetX, offsetY);
  }

  function mmdControls(scrollWrap) {
    const controls = el('div', { class: 'canvas__controls' }, [
      el('button', { type: 'button', 'data-zoom': 'in',    title: 'Zoom in' }, '+'),
      el('button', { type: 'button', 'data-zoom': 'out',   title: 'Zoom out' }, '−'),
      el('button', { type: 'button', 'data-zoom': 'fit',   title: 'Fit' }, '⤢'),
      el('button', { type: 'button', 'data-zoom': 'reset', title: 'Reset' }, '⟲'),
    ]);
    controls.addEventListener('click', (e) => {
      const action = e.target.getAttribute?.('data-zoom');
      const pz = scrollWrap._pz;
      if (!action || !pz) return;
      const rect = scrollWrap.getBoundingClientRect();
      if (action === 'in')    pz.smoothZoom(rect.width / 2, rect.height / 2, 1.25);
      if (action === 'out')   pz.smoothZoom(rect.width / 2, rect.height / 2, 0.8);
      if (action === 'reset') { pz.zoomAbs(0, 0, 1); pz.moveTo(0, 0); }
      if (action === 'fit') {
        const svgEl = scrollWrap.querySelector('svg');
        if (svgEl) fitMermaid(pz, svgEl, scrollWrap);
      }
    });
    return controls;
  }

  function renderFlow(host, f) {
    host.appendChild(el('p', {}, 'A real UML sequence — actors at the top, time flows down, each numbered step is a message from one actor to another.'));

    if (!f.actors.length) {
      host.appendChild(el('p', {}, 'No flow steps to render.'));
      return;
    }

    const headerH = 64, headerGapY = 36, stepGapY = 56, padding = 32, minActorW = 140, actorGapX = 40;

    const wrap     = el('div', { class: 'flow-seq' });
    const headerRow= el('div', { class: 'flow-seq__actors' });
    const stage    = el('div', { class: 'flow-seq__stage' });
    const lifeSvg  = svg('svg', { class: 'flow-seq__lifelines' });
    const msgSvg   = svg('svg', { class: 'flow-seq__messages' });
    stage.appendChild(lifeSvg);
    stage.appendChild(msgSvg);
    wrap.appendChild(headerRow);
    wrap.appendChild(stage);
    host.appendChild(wrap);

    const actorEls = f.actors.map((a) => {
      const card = el('div', { class: 'flow-actor', 'data-actor': a.id }, [
        el('span', { class: 'flow-actor__kind' }, a.kind || ''),
        el('span', { class: 'flow-actor__label' }, a.label),
      ]);
      headerRow.appendChild(card);
      return { actor: a, card };
    });

    requestAnimationFrame(() => {
      const actorW = actorEls.map(({ card }) => Math.max(minActorW, card.offsetWidth));
      const totalNatural = actorW.reduce((a, b) => a + b, 0) + actorGapX * (actorEls.length - 1);
      const availW = Math.max(stage.clientWidth - padding * 2, totalNatural);
      const extra  = Math.max(0, availW - totalNatural);
      const perGap = actorEls.length > 1 ? extra / (actorEls.length - 1) : 0;

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

      stage.style.width = stageW + 'px';
      stage.style.height = stageH + 'px';
      [lifeSvg, msgSvg].forEach((s) => {
        s.setAttribute('width', stageW);
        s.setAttribute('height', stageH);
        s.setAttribute('viewBox', `0 0 ${stageW} ${stageH}`);
      });

      while (lifeSvg.firstChild) lifeSvg.removeChild(lifeSvg.firstChild);
      actorX.forEach((x) => {
        const line = svg('line', { x1: x, x2: x, y1: 0, y2: stageH, class: 'flow-seq__lifeline' });
        lifeSvg.appendChild(line);
      });

      while (msgSvg.firstChild) msgSvg.removeChild(msgSvg.firstChild);
      appendArrowDef(msgSvg);
      const idx = new Map(f.actors.map((a, i) => [a.id, i]));
      f.steps.forEach((s, i) => {
        const fi = idx.get(s.from);
        const ti = idx.get(s.to);
        if (fi == null || ti == null) return;
        const y = headerGapY + stepGapY * (i + 0.5);
        const isSelf = fi === ti;
        let path, labelX, labelAnchor;
        if (isSelf) {
          const x = actorX[fi];
          path = svg('path', { d: `M ${x} ${y - 8} L ${x + 36} ${y - 8} L ${x + 36} ${y + 8} L ${x + 4} ${y + 8}` });
          labelX = x + 40; labelAnchor = 'start';
        } else {
          const fx = actorX[fi], tx = actorX[ti];
          path = svg('line', { x1: fx, y1: y, x2: tx, y2: y });
          const goingRight = tx > fx;
          labelX = goingRight ? fx + 8 : fx - 8;
          labelAnchor = goingRight ? 'start' : 'end';
        }
        path.setAttribute('marker-end', 'url(#edge-arrow)');
        path.setAttribute('class', 'flow-seq__msg' + (s.changed ? ' is-changed' : ''));
        msgSvg.appendChild(path);

        const availW = isSelf ? 140 : Math.abs(actorX[ti] - actorX[fi]) - 16;
        const maxChars = Math.max(20, Math.floor(availW / 7.2));
        const display = s.label.length > maxChars ? s.label.slice(0, maxChars - 1) + '…' : s.label;
        const text = svg('text', { x: labelX, y: y - 6, 'text-anchor': labelAnchor, class: 'flow-seq__label' });
        text.textContent = display;
        if (display !== s.label) {
          const t = svg('title'); t.textContent = s.label; text.appendChild(t);
        }
        msgSvg.appendChild(text);

        const num = svg('text', {
          x: actorX[fi] + (isSelf ? 0 : (actorX[ti] > actorX[fi] ? 10 : -10)),
          y: y + 4,
          'text-anchor': isSelf ? 'middle' : (actorX[ti] > actorX[fi] ? 'start' : 'end'),
          class: 'flow-seq__num',
        });
        num.textContent = (i + 1).toString();
        msgSvg.appendChild(num);

        const hit = svg('rect', {
          x: Math.min(labelX - 100, actorX[Math.min(fi, ti)]),
          y: y - 18,
          width: Math.max(200, Math.abs(actorX[ti] - actorX[fi]) + 40),
          height: 28,
          fill: 'transparent',
        });
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
    host.appendChild(el('p', {}, [
      el('span', {}, 'Tables and columns this branch adds, changes, or removes. Field rows are color-coded — green rows are new, blue are modified — amber strips mark privacy-sensitive fields. '),
      el('strong', {}, 'Drag any table '),
      el('span', {}, 'to reposition it (relations re-route live), or '),
      el('strong', {}, 'click '),
      el('span', {}, 'for its full field list and write/read paths.'),
    ]));

    const wrap = mountCanvas(host, { allowCardDrag: true });
    wrap.canvas.appendChild(el('div', { class: 'canvas__hint' }, 'drag tables · hover to focus · ctrl + wheel to zoom'));

    const byId = new Map();
    const links = (d.relations || []).map((r) => ({
      from: r.from.split('.')[0],
      to:   r.to.split('.')[0],
      status: r.status,
    }));

    d.tables.forEach((t) => {
      const card = el('div', {
        class: `node node--draggable is-${t.status}`,
        style: 'min-width:260px;',
      }, [
        el('div', { class: 'node__head' }, [
          el('span', { class: 'node__kind' }, 'tbl'),
          el('span', {}, t.name),
          t.status !== 'context' ? el('span', { class: `status-chip is-${t.status}` }, ({ added: '+ added', changed: '~ changed', removed: '− removed' })[t.status]) : null,
        ]),
        el('div', { class: 'node__body', style: 'padding:0;' },
          t.fields.map((f) => {
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
      wrap.scene.appendChild(card);
      byId.set(t.id, card);
    });

    requestAnimationFrame(() => {
      reflowAndDraw({
        scene: wrap.scene, edges: wrap.edges, byId,
        nodes: d.tables, links,
        drawLink: drawRelationEdge,
      });
      wireDrag(wrap, byId, links, drawRelationEdge);
      if (wrap.pz) fitToContent(wrap.pz, wrap.scene, wrap.canvas);
    });

    function detailForTable(t) {
      const fields = t.fields.map((f) =>
        `<li><code>${escapeHTML(f.name)}</code> · ${escapeHTML(f.type)} · <em>${escapeHTML(f.status)}</em>${f.privacy ? ' · <strong>pii</strong>' : ''}</li>`
      ).join('');
      const details = t.details || {};
      const detailLines = Object.entries(details).map(([k, v]) =>
        `<p><strong>${escapeHTML(k)}:</strong> ${escapeHTML(String(v))}</p>`
      ).join('');
      return `
        <h3>${escapeHTML(t.name)} <span class="status-chip is-${t.status}">${escapeHTML(t.status)}</span></h3>
        ${detailLines || ''}
        <h4>Fields</h4><ul>${fields}</ul>
      `;
    }
  }

  function renderCodeObservations(host, c) {
    host.appendChild(el('p', {}, 'Light callouts the reviewer should see — not blocking, not severity-labelled. Use /review for a full audit.'));
    c.items.forEach((it) => {
      const filesHtml = (it.files || []).map((f) => `<span class="file-chip">${escapeHTML(f)}</span>`).join(' ');
      const callout = el('div', { class: 'callout callout--review' }, [
        el('span', { class: 'callout__ic' }, kindIcon(it.kind)),
        el('div', { html:
          `<b>${escapeHTML(it.title)}</b>` +
          (it.note ? `<p>${escapeHTML(it.note)}</p>` : '') +
          (filesHtml ? `<div class="spec__files">${filesHtml}</div>` : '')
        }),
      ]);
      host.appendChild(callout);
    });
    function kindIcon(k) {
      return ({ pattern: '◇', 'risky-spot': '⚠', suggestion: '★' })[k] || '·';
    }
  }

  function renderRiskRollout(host, r) {
    host.appendChild(el('p', {}, 'Migration order, secret provisioning, deploy-order — the things that bite when shipped wrong.'));
    r.items.forEach((it) => {
      const filesHtml = (it.files || []).map((f) => `<span class="file-chip">${escapeHTML(f)}</span>`).join(' ');
      const callout = el('div', { class: 'callout' + (it.severity === 'careful' ? '' : ' callout--review') }, [
        el('span', { class: 'callout__ic' }, sevIcon(it.severity)),
        el('div', { html:
          `<b>${escapeHTML(it.title)}</b>` +
          (it.notes ? `<p>${escapeHTML(it.notes)}</p>` : '') +
          (filesHtml ? `<div class="spec__files">${filesHtml}</div>` : '')
        }),
      ]);
      host.appendChild(callout);
    });
    function sevIcon(s) {
      return ({ info: '○', watch: '◐', careful: '●' })[s] || '·';
    }
  }

  function renderOpenQuestions(host, o) {
    host.appendChild(el('p', {}, 'Things the reviewer should resolve before approving. Each is a real question someone needs to answer.'));
    o.items.forEach((q) => {
      host.appendChild(el('div', { class: 'callout callout--question' }, [
        el('span', { class: 'callout__ic' }, '?'),
        el('div', {}, q),
      ]));
    });
  }

  // ============================================================
  // Canvas / panzoom / layout
  // ============================================================

  function mountCanvas(parent, opts = {}) {
    const canvas = el('div', { class: 'canvas' });
    const scene  = el('div', { class: 'canvas__scene' });
    const edges  = svg('svg', { class: 'canvas__edges' });
    const controls = el('div', { class: 'canvas__controls' }, [
      el('button', { type: 'button', 'data-zoom': 'in',    title: 'Zoom in' }, '+'),
      el('button', { type: 'button', 'data-zoom': 'out',   title: 'Zoom out' }, '−'),
      el('button', { type: 'button', 'data-zoom': 'fit',   title: 'Fit' }, '⤢'),
      el('button', { type: 'button', 'data-zoom': 'reset', title: 'Reset' }, '⟲'),
    ]);
    scene.appendChild(edges);
    canvas.appendChild(scene);
    canvas.appendChild(controls);
    parent.appendChild(canvas);

    let pz = null;
    if (typeof window.panzoom === 'function') {
      pz = window.panzoom(scene, {
        smoothScroll: false,
        beforeWheel: (e) => !e.ctrlKey && !e.metaKey,
        // When card-drag is enabled for this canvas, panzoom must yield to
        // the card's own mousedown handler — otherwise the canvas pans
        // instead of the card moving.
        beforeMouseDown: opts.allowCardDrag
          ? (e) => !!e.target.closest?.('.node--draggable')
          : undefined,
      });
    }
    controls.addEventListener('click', (e) => {
      const action = e.target.getAttribute?.('data-zoom');
      if (!action || !pz) return;
      if (action === 'in')    pz.smoothZoom(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.25);
      if (action === 'out')   pz.smoothZoom(canvas.clientWidth / 2, canvas.clientHeight / 2, 0.8);
      if (action === 'reset') { pz.zoomAbs(0, 0, 1); pz.moveTo(0, 0); }
      if (action === 'fit')   fitToContent(pz, scene, canvas);
    });
    canvas.addEventListener('dblclick', () => pz && fitToContent(pz, scene, canvas));
    return { canvas, scene, edges, pz };
  }

  function fitToContent(pz, scene, canvas) {
    const rects = [...scene.children].filter((c) => c.classList?.contains('node')).map((c) => ({
      x: parseFloat(c.style.left || 0),
      y: parseFloat(c.style.top  || 0),
      w: c.offsetWidth, h: c.offsetHeight,
    }));
    if (!rects.length) return;
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    const w = maxX - minX, h = maxY - minY;
    if (w < 1 || h < 1) return;
    const scale = Math.min(canvas.clientWidth / (w + 80), canvas.clientHeight / (h + 80), 1);
    pz.zoomAbs(0, 0, scale);
    pz.moveTo(-(minX - 40) * scale, -(minY - 40) * scale);
  }

  function reflowAndDraw({ scene, edges, byId, nodes, links, drawLink }) {
    if (nodes.length === 0) return;
    const layer = assignLayers(nodes, links);
    const maxLayer = Math.max(0, ...layer.values());
    const layerGroups = Array.from({ length: maxLayer + 1 }, () => []);
    nodes.forEach((n) => layerGroups[layer.get(n.id)].push(n.id));

    const padding = 32, colGap = 110, rowGap = 28;
    const layerWidths = layerGroups.map((ids) =>
      ids.reduce((w, id) => Math.max(w, byId.get(id)?.offsetWidth || 0), 0)
    );
    const colX = [];
    let cursor = padding;
    layerWidths.forEach((w) => { colX.push(cursor); cursor += w + colGap; });
    const sceneW = cursor - colGap + padding;

    const colY = new Array(maxLayer + 1).fill(padding);
    layerGroups.forEach((ids, c) => {
      ids.forEach((id) => {
        const card = byId.get(id);
        if (!card) return;
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

    redrawEdges(edges, byId, links, drawLink);
    scene.appendChild(edges); // paint over cards so labels are never hidden

    wireFocus(scene, edges, links);
  }

  function redrawEdges(edges, byId, links, drawLink) {
    while (edges.firstChild) edges.removeChild(edges.firstChild);
    appendArrowDef(edges);
    const fanOut = new Map();
    links.forEach((link, i) => {
      const k = link.from;
      if (!fanOut.has(k)) fanOut.set(k, []);
      fanOut.get(k).push(i);
    });
    links.forEach((link, i) => {
      const siblings = fanOut.get(link.from) || [i];
      const slot = siblings.indexOf(i);
      const lane = (slot + 1) / (siblings.length + 1);
      drawLink(link, byId, edges, { lane, scene: edges.parentElement });
    });
  }

  function assignLayers(nodes, links) {
    const layer = new Map(nodes.map((n) => [n.id, 0]));
    const incoming = new Map(nodes.map((n) => [n.id, []]));
    for (const l of links) {
      if (incoming.has(l.to)) incoming.get(l.to).push(l.from);
    }
    for (let pass = 0; pass < nodes.length + 1; pass++) {
      let changed = false;
      nodes.forEach((n) => {
        const ins = incoming.get(n.id) || [];
        if (ins.length === 0) return;
        const want = Math.max(...ins.map((id) => (layer.get(id) ?? 0) + 1));
        if (want > layer.get(n.id)) { layer.set(n.id, want); changed = true; }
      });
      if (!changed) break;
    }
    const cap = 5;
    layer.forEach((v, k) => { if (v > cap) layer.set(k, cap); });
    return layer;
  }

  function wireFocus(scene, edges, links) {
    const cards = Array.from(scene.querySelectorAll('.node'));
    const linkPaths = Array.from(edges.querySelectorAll('path:not(.edge-arrow), line'));
    const byFrom = new Map(), byTo = new Map();
    links.forEach((l, i) => {
      if (!byFrom.has(l.from)) byFrom.set(l.from, []);
      if (!byTo.has(l.to)) byTo.set(l.to, []);
      byFrom.get(l.from).push(i);
      byTo.get(l.to).push(i);
    });
    const clear = () => {
      cards.forEach((c) => c.classList.remove('is-dimmed'));
      linkPaths.forEach((p) => p.classList.remove('is-focus-dim'));
    };
    const focus = (id) => {
      const related = new Set([id]);
      (byFrom.get(id) || []).forEach((i) => related.add(links[i].to));
      (byTo.get(id) || []).forEach((i) => related.add(links[i].from));
      cards.forEach((c) => c.classList.toggle('is-dimmed', !related.has(c.getAttribute('data-detail-source'))));
      linkPaths.forEach((p, i) => {
        const link = links[i];
        const active = link && (link.from === id || link.to === id);
        p.classList.toggle('is-focus-dim', !active);
      });
    };
    cards.forEach((c) => c.addEventListener('mouseenter', () => focus(c.getAttribute('data-detail-source'))));
    const cv = scene.parentElement;
    if (cv) cv.addEventListener('mouseleave', clear);
  }

  // Wire drag-to-reposition on every .node--draggable card. Edges re-route
  // live during the drag; the scene grows to fit when a card is moved past
  // the current bounds.
  function wireDrag(wrap, byId, links, drawLink) {
    const scene = wrap.scene;
    const edges = wrap.edges;
    const cards = Array.from(scene.querySelectorAll('.node--draggable'));
    let drag = null;
    cards.forEach((card) => {
      card.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        const sceneRect = scene.getBoundingClientRect();
        const scale = sceneRect.width / scene.offsetWidth || 1;
        drag = {
          card,
          startX: e.clientX, startY: e.clientY,
          origLeft: parseFloat(card.style.left || 0),
          origTop:  parseFloat(card.style.top  || 0),
          scale,
        };
        card.classList.add('is-dragging');
      });
    });
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / drag.scale;
      const dy = (e.clientY - drag.startY) / drag.scale;
      drag.card.style.left = (drag.origLeft + dx) + 'px';
      drag.card.style.top  = (drag.origTop  + dy) + 'px';
      redrawEdges(edges, byId, links, drawLink);
      scene.appendChild(edges);
    });
    document.addEventListener('mouseup', () => {
      if (!drag) return;
      drag.card.classList.remove('is-dragging');
      growSceneToFit(scene, edges);
      redrawEdges(edges, byId, links, drawLink);
      scene.appendChild(edges);
      drag = null;
    });
  }

  function growSceneToFit(scene, edges) {
    let maxRight = 0, maxBottom = 0;
    Array.from(scene.children).forEach((c) => {
      if (!c.classList?.contains('node')) return;
      const right  = parseFloat(c.style.left || 0) + c.offsetWidth;
      const bottom = parseFloat(c.style.top  || 0) + c.offsetHeight;
      if (right > maxRight)   maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    });
    const w = Math.max(scene.offsetWidth, maxRight + 60);
    const h = Math.max(scene.offsetHeight, maxBottom + 60);
    scene.style.width  = w + 'px';
    scene.style.height = h + 'px';
    edges.setAttribute('width',  w);
    edges.setAttribute('height', h);
    edges.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }

  // ---------- arrow def + edge drawers ----------
  function appendArrowDef(svgEl) {
    const defs = svg('defs');
    const marker = svg('marker', {
      id: 'edge-arrow', viewBox: '0 0 10 10',
      refX: 9, refY: 5, markerWidth: 7, markerHeight: 7,
      orient: 'auto-start-reverse',
    });
    const arrow = svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'edge-arrow' });
    arrow.setAttribute('fill', 'currentColor');
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svgEl.appendChild(defs);
  }

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
    if (Math.abs(dx) >= Math.abs(dy)) {
      const goingRight = dx >= 0;
      const fx = goingRight ? fl + fw : fl;
      const fy = ft + fh / 2 + (lane - 0.5) * (fh - 16);
      const tx = goingRight ? tl : tl + tw;
      const ty = tt + th / 2;
      const elbowX = fx + (tx - fx) * (0.5 + (lane - 0.5) * 0.4);
      return `M ${fx} ${fy} L ${elbowX} ${fy} L ${elbowX} ${ty} L ${tx} ${ty}`;
    } else {
      const goingDown = dy >= 0;
      const fx = fl + fw / 2;
      const fy = goingDown ? ft + fh : ft;
      const tx = tl + tw / 2;
      const ty = goingDown ? tt : tt + th;
      const elbowY = fy + (ty - fy) * (0.5 + (lane - 0.5) * 0.4);
      return `M ${fx} ${fy} L ${fx} ${elbowY} L ${tx} ${elbowY} L ${tx} ${ty}`;
    }
  }

  function appendEdgeLabel(svgEl, fromCard, toCard, label, scene, opts = {}) {
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
      const elbowX = fx + (tx - fx) * (0.5 + (lane - 0.5) * 0.4);
      lx = elbowX; ly = (fy + ty) / 2 + 4; anchor = 'middle';
    } else {
      const goingDown = dy >= 0;
      const fy = goingDown ? ft + fh : ft;
      const ty = goingDown ? tt : tt + th;
      const fx = fl + fw / 2;
      const tx = tl + tw / 2;
      const elbowY = fy + (ty - fy) * (0.5 + (lane - 0.5) * 0.4);
      lx = (fx + tx) / 2; ly = elbowY - 6; anchor = 'middle';
    }

    if (scene) {
      for (const node of scene.children) {
        if (node === fromCard || node === toCard) continue;
        if (!node.classList?.contains('node')) continue;
        const nl = parseFloat(node.style.left || 0), nt = parseFloat(node.style.top || 0);
        const nw = node.offsetWidth, nh = node.offsetHeight;
        if (lx >= nl - 4 && lx <= nl + nw + 4 && ly >= nt - 4 && ly <= nt + nh + 4) return;
      }
    }

    const MAX = 22;
    const display = label.length > MAX ? label.slice(0, MAX - 1) + '…' : label;
    const text = svg('text', { x: lx, y: ly, 'text-anchor': anchor, class: 'edge-label' });
    text.textContent = display;
    if (display !== label) {
      const title = svg('title');
      title.textContent = label;
      text.appendChild(title);
    }
    svgEl.appendChild(text);
  }

  function drawArchEdge(e, byId, svgEl, opts = {}) {
    const fromCard = byId.get(e.from); const toCard = byId.get(e.to);
    if (!fromCard || !toCard) return;
    const path = svg('path', { d: routePath(fromCard, toCard, opts), 'marker-end': 'url(#edge-arrow)' });
    path.setAttribute('data-from', e.from);
    path.setAttribute('data-to', e.to);
    if (e.kind === 'async') path.classList.add('is-async');
    if (e.kind === 'data')  path.classList.add('is-data');
    svgEl.appendChild(path);
    if (e.label) appendEdgeLabel(svgEl, fromCard, toCard, e.label, opts.scene || svgEl.parentElement, opts);
  }

  function drawRelationEdge(r, byId, svgEl, opts = {}) {
    const fromCard = byId.get(r.from); const toCard = byId.get(r.to);
    if (!fromCard || !toCard) return;
    const path = svg('path', { d: routePath(fromCard, toCard, opts), 'marker-end': 'url(#edge-arrow)' });
    path.setAttribute('data-from', r.from);
    path.setAttribute('data-to', r.to);
    if (r.status === 'removed') path.classList.add('is-dimmed');
    if (r.status === 'added')   path.classList.add('is-added');
    svgEl.appendChild(path);
  }

  Object.assign(window.__pro, { el, escapeHTML, openDetail, closeDetail });
})();
