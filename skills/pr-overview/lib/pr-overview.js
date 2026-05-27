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
  // Append a string to a host node, expanding any backtick-wrapped spans
  // (`foo`) into <code>foo</code> nodes. Used by structured framing fields
  // (architecture.summary, flow.summary, *.highlights) so code identifiers
  // get the mono-font code styling without us needing markdown anywhere.
  const appendInlineCode = (host, text) => {
    const s = String(text);
    const re = /`([^`]+)`/g;
    let last = 0, m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) host.appendChild(document.createTextNode(s.slice(last, m.index)));
      host.appendChild(el('code', {}, m[1]));
      last = re.lastIndex;
    }
    if (last < s.length) host.appendChild(document.createTextNode(s.slice(last)));
  };
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
  // Hero subhead + footer stand-fill both pull from the new TL;DR. Fall back
  // to first ship item if no tldr (defensive — schema requires tldr).
  const heroStand = document.querySelector('[data-hero-stand]');
  if (heroStand) {
    heroStand.textContent = data.summary?.tldr || data.summary?.ships?.[0] || '';
  }
  const footerStand = document.querySelector('[data-footer-stand]');
  if (footerStand) {
    footerStand.textContent = data.summary?.tldr || data.summary?.ships?.[0] || '';
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
    screenshots:       { label: 'Screenshots',      render: renderScreenshots },
    architecture:      { label: 'The big picture',  render: renderArchitecture },
    flow:              { label: 'How it flows',     render: renderFlow },
    database:          { label: 'Database changes', render: renderDatabase },
    routes:            { label: 'Routes touched',   render: renderRoutes },
    risk_rollout:      { label: 'Risk & rollout',   render: renderRiskRollout },
    open_questions:    { label: 'Open questions',   render: renderOpenQuestions },
  };
  // Anchors listed as literals so the test suite can grep for them in
  // the inlined JS source — and so this stays self-documenting.
  const ANCHORS = {
    summary:           'section-summary',
    screenshots:       'section-screenshots',
    architecture:      'section-architecture',
    flow:              'section-flow',
    database:          'section-database',
    routes:            'section-routes',
    risk_rollout:      'section-risk-rollout',
    open_questions:    'section-open-questions',
  };
  const ORDER = Object.keys(ANCHORS);

  const navOl = document.querySelector('[data-nav]');
  let n = 0;
  ORDER.forEach((key) => {
    // The flow section accepts either `flow` (single) or `flows` (array of
    // titled flows). Normalize at the dispatch site so the renderer only
    // sees one shape.
    const payload = key === 'flow' ? (data.flow || data.flows) : data[key];
    if (!payload) return;
    if (key === 'summary' && !data.summary?.tldr) return;
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
      class: 'section' + (key === 'architecture' || key === 'flow' || key === 'database' || key === 'routes' || key === 'screenshots' ? ' section--wide' : ''),
      id: anchor,
    }, [
      el('div', { class: 'kicker' }, [
        el('span', { class: 'kicker__num' }, String(n).padStart(2, '0')),
        meta.label,
      ]),
    ]);
    main.appendChild(section);
    try { meta.render(section, payload); } catch (err) { console.error(`render ${key} failed`, err); }
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
    // TL;DR — the executive lede the reviewer reads first.
    if (summary.tldr) {
      const p = el('p', { class: 'why__tldr' });
      p.appendChild(el('strong', { class: 'why__tldr-tag' }, 'TL;DR.'));
      p.appendChild(document.createTextNode(' '));
      appendInlineCode(p, summary.tldr);
      host.appendChild(p);
    }

    // Diff stats + tags.
    const strip = el('div', { class: 'meta-strip' }, [
      el('span', { class: 'chip' }, [el('span', {}, 'base · '), el('b', {}, data.meta.base)]),
      el('span', { class: 'chip' }, [el('span', {}, '→ '), el('b', {}, data.meta.head)]),
      el('span', { class: 'chip' }, data.meta.files_changed + ' files'),
      el('span', { class: 'chip chip--add' }, '+' + data.meta.additions),
      el('span', { class: 'chip chip--del' }, '−' + data.meta.deletions),
      ...((data.meta.pr_type_tags || []).map((t) => el('span', { class: 'chip chip--accent' }, t))),
    ]);
    host.appendChild(strip);

    // Three lenses: what ships · why now · what changes.
    const lenses = el('div', { class: 'why__lenses' });
    if (Array.isArray(summary.ships) && summary.ships.length) {
      lenses.appendChild(renderWhyLens('What ships', summary.ships, 'list'));
    }
    if (summary.why) {
      lenses.appendChild(renderWhyLens('Why now', summary.why, 'prose'));
    }
    if (Array.isArray(summary.changes) && summary.changes.length) {
      lenses.appendChild(renderWhyLens('What changes', summary.changes, 'list'));
    }
    host.appendChild(lenses);

    // Expandable topics — for things that don't deserve a full diagram
    // section (security invariants, key trade-offs, code worth seeing).
    if (Array.isArray(summary.topics) && summary.topics.length) {
      host.appendChild(el('h3', { class: 'why-topics__heading' }, 'Worth a closer look'));
      const list = el('div', { class: 'why-topics' });
      summary.topics.forEach((t) => list.appendChild(renderWhyTopic(t)));
      host.appendChild(list);
    }
  }

  function renderWhyLens(label, content, mode) {
    const lens = el('section', { class: 'why__lens' });
    lens.appendChild(el('h3', { class: 'why__eyebrow' }, label));
    if (mode === 'prose') {
      const p = el('p', { class: 'why__prose' });
      appendInlineCode(p, content);
      lens.appendChild(p);
    } else {
      const ul = el('ul', { class: 'why__list' });
      content.forEach((item) => {
        const li = el('li', {});
        appendInlineCode(li, item);
        ul.appendChild(li);
      });
      lens.appendChild(ul);
    }
    return lens;
  }

  function renderWhyTopic(t) {
    const card    = el('details', { class: 'why-topic' });
    const head    = el('summary', { class: 'why-topic__head' });
    const title   = el('span', { class: 'why-topic__title' }, t.title || '');
    head.appendChild(title);
    if (t.summary) {
      const lede = el('span', { class: 'why-topic__lede' });
      appendInlineCode(lede, t.summary);
      head.appendChild(lede);
    }
    card.appendChild(head);

    const body = el('div', { class: 'why-topic__body' });
    if (t.body) {
      const p = el('p', { class: 'why-topic__prose' });
      appendInlineCode(p, t.body);
      body.appendChild(p);
    }
    if (Array.isArray(t.highlights) && t.highlights.length) {
      const ul = el('ul', { class: 'why-topic__highlights' });
      t.highlights.forEach((h) => {
        const li = el('li', {});
        appendInlineCode(li, h);
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }
    if (Array.isArray(t.code) && t.code.length) {
      t.code.forEach((c) => {
        const block = el('div', { class: 'why-topic__code' });
        if (c.file) block.appendChild(el('div', { class: 'why-topic__code-head' }, [
          el('span', { class: 'why-topic__code-file' }, c.file),
          c.lang ? el('span', { class: 'why-topic__code-lang' }, c.lang) : null,
        ]));
        const pre = el('pre', { class: 'why-topic__code-body' });
        pre.textContent = c.body || '';
        block.appendChild(pre);
        body.appendChild(block);
      });
    }
    if (Array.isArray(t.images) && t.images.length) {
      body.appendChild(renderImageGrid(t.images, { class: 'why-topic__images' }));
    }
    card.appendChild(body);
    return card;
  }

  // ---------- screenshots ----------
  // Top-level visual gallery. Surfaces the new UI right after the executive
  // briefing so reviewers see what shipped before scrolling into the
  // architecture diagram. Same framing contract as every other section: lede
  // sentence + 2-4 highlight bullets, then the grid.
  function renderScreenshots(host, payload) {
    if (payload.summary) {
      const p = el('p', { class: 'arch-summary' });
      appendInlineCode(p, payload.summary);
      host.appendChild(p);
    }
    if (Array.isArray(payload.highlights) && payload.highlights.length) {
      const ul = el('ul', { class: 'arch-highlights' });
      payload.highlights.forEach((h) => {
        const li = el('li', {});
        appendInlineCode(li, h);
        ul.appendChild(li);
      });
      host.appendChild(ul);
    }
    if (Array.isArray(payload.items) && payload.items.length) {
      host.appendChild(renderImageGrid(payload.items, { class: 'screenshots-grid' }));
    }
  }

  // Shared image-grid renderer used by the top-level gallery, topic cards,
  // and (later) inline flow images. Missing src (capture not yet run) shows
  // a placeholder card so the spec still validates and renders during
  // authoring.
  function renderImageGrid(images, opts = {}) {
    const grid = el('div', { class: opts.class || 'image-grid' });
    images.forEach((img) => grid.appendChild(renderImageCard(img)));
    return grid;
  }

  function renderImageCard(img) {
    const card = el('figure', { class: 'image-card' });
    if (img.src) {
      const wrap = el('button', {
        type: 'button',
        class: 'image-card__btn',
        'data-image-zoom': '1',
        'data-image-src': img.src,
        'data-image-alt': img.alt || '',
        'data-image-caption': img.caption || '',
        'aria-label': 'Open full-size image',
      });
      wrap.appendChild(el('img', { src: img.src, alt: img.alt || '', loading: 'lazy' }));
      card.appendChild(wrap);
    } else {
      // Capture script hasn't run yet — show a placeholder so the spec is
      // still legible during authoring. The route, if present, hints at
      // what the eventual screenshot will show.
      const stub = el('div', { class: 'image-card__stub' }, [
        el('span', { class: 'image-card__stub-tag' }, 'screenshot pending'),
        el('span', { class: 'image-card__stub-hint' }, img.route || img.alt || ''),
      ]);
      card.appendChild(stub);
    }
    if (img.caption || img.route) {
      const cap = el('figcaption', { class: 'image-card__caption' });
      if (img.caption) appendInlineCode(cap, img.caption);
      if (img.route) {
        const r = el('span', { class: 'image-card__route' }, img.route);
        cap.appendChild(r);
      }
      card.appendChild(cap);
    }
    return card;
  }

  // ---------- lightbox ----------
  // Click-to-zoom for any image rendered via renderImageCard. Set up once on
  // first click; the lightbox lives directly on <body> so it overlays the
  // detail panel and the section content alike.
  let _lightbox = null;
  function ensureLightbox() {
    if (_lightbox) return _lightbox;
    const box = el('div', { class: 'lightbox', 'data-lightbox': '1', hidden: '' });
    const inner = el('div', { class: 'lightbox__inner' });
    const closer = el('button', { type: 'button', class: 'lightbox__close', 'aria-label': 'Close' }, '×');
    const img = el('img', { class: 'lightbox__img', alt: '' });
    const cap = el('div', { class: 'lightbox__caption' });
    inner.appendChild(img);
    inner.appendChild(cap);
    box.appendChild(closer);
    box.appendChild(inner);
    document.body.appendChild(box);
    const close = () => { box.hidden = true; };
    closer.addEventListener('click', close);
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    _lightbox = { box, img, cap };
    return _lightbox;
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-image-zoom]');
    if (!btn) return;
    const { box, img, cap } = ensureLightbox();
    img.src = btn.getAttribute('data-image-src') || '';
    img.alt = btn.getAttribute('data-image-alt') || '';
    const caption = btn.getAttribute('data-image-caption') || '';
    cap.textContent = caption;
    cap.style.display = caption ? '' : 'none';
    box.hidden = false;
  });

  // Architecture is rendered via Mermaid flowchart. Subgraphs group nodes by
  // kind (ui / service / module / datastore / external / job) so the graph
  // reads as a C4-style container view. Click handlers route to the detail
  // panel; status colors come from classDef.
  function renderArchitecture(host, a) {
    if (a.summary) {
      const p = el('p', { class: 'arch-summary' });
      appendInlineCode(p, a.summary);
      host.appendChild(p);
    }
    if (Array.isArray(a.highlights) && a.highlights.length) {
      const ul = el('ul', { class: 'arch-highlights' });
      a.highlights.forEach((h) => {
        const li = el('li', {});
        appendInlineCode(li, h);
        ul.appendChild(li);
      });
      host.appendChild(ul);
    }

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
      // Images render as zoomable thumbnails inside the detail panel; the
      // same data-image-zoom hook the gallery uses fires the lightbox.
      const imagesMarkup = (Array.isArray(d?.images) && d.images.length)
        ? `<h4>Screenshots</h4><div class="detail-images">${d.images.map((img) => {
            const src = escapeHTML(img.src || '');
            const alt = escapeHTML(img.alt || '');
            const cap = escapeHTML(img.caption || '');
            if (!img.src) return `<div class="detail-images__stub">screenshot pending${img.route ? ` · ${escapeHTML(img.route)}` : ''}</div>`;
            return `<button type="button" class="detail-images__btn" data-image-zoom="1" data-image-src="${src}" data-image-alt="${alt}" data-image-caption="${cap}"><img src="${src}" alt="${alt}" loading="lazy"></button>`;
          }).join('')}</div>`
        : '';
      window.__archDetail[mmdHost.id + ':' + n.id] = `
        <h3>${escapeHTML(n.label)}</h3>
        <p>
          <span class="chip">${escapeHTML(n.kind || 'module')}</span>
          ${status !== 'context' ? `<span class="status-chip is-${status}" style="margin-left:6px">${status}</span>` : ''}
        </p>
        ${d?.summary ? `<p>${escapeHTML(d.summary)}</p>` : ''}
        ${resp ? `<h4>Responsibilities</h4><ul>${resp}</ul>` : ''}
        ${files ? `<h4>Files</h4><div class="spec__files">${files}</div>` : ''}
        ${imagesMarkup}
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
      g.setAttribute('transform', cur + ' translate(0,-18)');
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
    // Mermaid 11.x paints a solid rect behind edge labels via an inline
    // `fill` that survives CSS — and on some configs uses `paint-order:
    // stroke` on the text to create a thick stroke halo that looks like a
    // rectangle. Nuke every plausible source from JS so the line shows
    // through and only the text remains.
    const KILL_BG_SELECTORS = [
      'g.edgeLabel rect',
      'g.edgeLabels rect',
      'g.edgeLabel g rect',
      'g.edgeLabel g.label rect',
      '.labelBkg',
      '.edgeLabel .background',
      '.edgeLabel rect.background',
      'foreignObject .labelBkg',
    ].join(',');
    svgEl.querySelectorAll(KILL_BG_SELECTORS).forEach((r) => {
      r.setAttribute('fill', 'none');
      r.setAttribute('fill-opacity', '0');
      r.setAttribute('stroke', 'none');
      r.style.fill = 'transparent';
      r.style.stroke = 'none';
      r.style.background = 'transparent';
      r.style.backgroundColor = 'transparent';
    });
    // Some Mermaid versions render edge labels with paint-order: stroke +
    // a thick white-ish stroke on the <text>, producing an apparent
    // rectangle behind the glyphs.
    svgEl.querySelectorAll('g.edgeLabel text, g.edgeLabel tspan, .edgeLabel text, .edgeLabel tspan').forEach((t) => {
      t.setAttribute('stroke', 'none');
      t.style.stroke = 'none';
      t.style.strokeWidth = '0';
      t.style.paintOrder = 'normal';
    });
    // foreignObject-based labels carry their background on the inner div.
    svgEl.querySelectorAll('foreignObject *').forEach((d) => {
      if (!d.style) return;
      d.style.background = 'transparent';
      d.style.backgroundColor = 'transparent';
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
    wireClusterDrag(svgEl, a);
  }

  // Make Mermaid g.cluster elements draggable. Mermaid v11 keeps cluster
  // rects in one <g> and nodes in a SIBLING <g class="nodes"> — so the
  // cluster transform alone doesn't move the contained nodes. We resolve
  // each cluster's members from the spec (cluster `g_<kind>` ↔ nodes with
  // node.kind === kind) and translate the cluster rect + every member node
  // together. After the drag, we redraw edges as straight orthogonal paths
  // since Mermaid's pre-computed bezier curves were baked to the original
  // positions.
  function wireClusterDrag(svgEl, a) {
    const edges = a.edges;

    // Build cluster → member-node-id map from the spec.
    const KIND_ORDER = ['ui', 'service', 'module', 'job', 'datastore', 'external'];
    const sid = (s) => 'n_' + String(s).replace(/[^a-zA-Z0-9_]/g, '_');
    const clusterMembers = new Map(); // clusterDomId -> [memberSid, ...]
    KIND_ORDER.forEach((kind) => {
      const members = a.nodes
        .filter((n) => (n.kind || 'module') === kind)
        .map((n) => sid(n.id));
      if (members.length) clusterMembers.set('g_' + kind, members);
    });
    // Tag every rendered edge with the source/target ids the spec used,
    // matching them by emission order (Mermaid renders edges in declaration
    // order, so spec edges[i] ↔ DOM edgePaths[i]).
    const edgePaths = Array.from(svgEl.querySelectorAll('g.edgePaths > path, g.edgePaths > g'));
    edgePaths.forEach((node, i) => {
      const edge = edges[i];
      if (!edge) return;
      const path = node.tagName === 'path' ? node : node.querySelector('path');
      if (!path) return;
      path.dataset.archFrom = sid(edge.from);
      path.dataset.archTo   = sid(edge.to);
    });

    // Capture the BASE transform of every node (Mermaid's auto-layout
    // translate) so cluster-drag deltas can be added on top without
    // accumulating across moves.
    const nodeBase = new Map();
    svgEl.querySelectorAll('g.node').forEach((n) => {
      const m = (n.getAttribute('transform') || '').match(/translate\(\s*([-\d.]+)\s*[,\s]\s*([-\d.]+)\s*\)/);
      nodeBase.set(n.id, {
        tx: m ? parseFloat(m[1]) : 0,
        ty: m ? parseFloat(m[2]) : 0,
        offsetTx: 0, // accumulated cluster-drag offset
        offsetTy: 0,
      });
    });
    const findClusterNodes = (clusterDomId) => {
      const memberSids = clusterMembers.get(clusterDomId) || [];
      return memberSids
        .map((s) => svgEl.querySelector(`g.node[id^="flowchart-${s}-"]`))
        .filter(Boolean);
    };

    // Cursor + mousedown handler per cluster.
    let drag = null;
    svgEl.querySelectorAll('g.cluster').forEach((cluster) => {
      cluster.style.cursor = 'grab';
      cluster.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.node')) return; // node click takes precedence
        e.stopPropagation();
        e.preventDefault();
        const ctm = svgEl.getScreenCTM();
        const curT = cluster.getAttribute('transform') || '';
        const m = curT.match(/translate\(\s*([-\d.]+)\s*[,\s]\s*([-\d.]+)\s*\)/);
        const nodes = findClusterNodes(cluster.id);
        drag = {
          cluster,
          nodes, // DOM elements belonging to this cluster
          startX: e.clientX, startY: e.clientY,
          clusterBaseTx: m ? parseFloat(m[1]) : 0,
          clusterBaseTy: m ? parseFloat(m[2]) : 0,
          // Snapshot each node's existing total offset so we add the new
          // delta on top of it.
          nodeBaseOffsets: nodes.map((n) => {
            const base = nodeBase.get(n.id);
            return { tx: base.tx + base.offsetTx, ty: base.ty + base.offsetTy };
          }),
          scale: ctm ? ctm.a : 1,
        };
        cluster.style.cursor = 'grabbing';
      });
    });

    const setTranslate = (el, tx, ty) => {
      const cur = el.getAttribute('transform') || '';
      const newT = `translate(${tx}, ${ty})`;
      el.setAttribute(
        'transform',
        /translate\(/.test(cur) ? cur.replace(/translate\([^)]+\)/, newT) : newT,
      );
    };

    const onMove = (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / drag.scale;
      const dy = (e.clientY - drag.startY) / drag.scale;
      // Move the cluster chrome.
      setTranslate(drag.cluster, drag.clusterBaseTx + dx, drag.clusterBaseTy + dy);
      // Move every member node by the same delta on top of its base.
      drag.nodes.forEach((n, i) => {
        const base = drag.nodeBaseOffsets[i];
        setTranslate(n, base.tx + dx, base.ty + dy);
      });
      redrawArchEdges(svgEl);
    };
    const onUp = () => {
      if (!drag) return;
      const dx = drag.nodes.length
        ? (parseFloat(drag.nodes[0].getAttribute('transform').match(/translate\(\s*([-\d.]+)/)[1]) - drag.nodeBaseOffsets[0].tx)
        : 0;
      const dy = drag.nodes.length
        ? (parseFloat(drag.nodes[0].getAttribute('transform').match(/translate\([^,]+[,\s]\s*([-\d.]+)/)[1]) - drag.nodeBaseOffsets[0].ty)
        : 0;
      // Persist the accumulated cluster offset on each node so future drags
      // add to it instead of resetting to the base.
      drag.nodes.forEach((n) => {
        const base = nodeBase.get(n.id);
        if (base) {
          base.offsetTx += dx;
          base.offsetTy += dy;
        }
      });
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
    const renderedW = bbox.width * scale;
    const renderedX = (bbox.x - vbX) * scale;
    const renderedY = (bbox.y - vbY) * scale;
    // Sequence diagrams read left-to-right; left-anchored fit avoids the
    // appearance that the first actor is offset. Flowcharts centre by default.
    const align = container.dataset?.fitAlign || 'center';
    const offsetX = align === 'left'
      ? padding - renderedX
      : (cw - renderedW) / 2 - renderedX;
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

  // Flow is rendered as one Mermaid `sequenceDiagram` per flow. The section
  // accepts either a singular `flow: { actors, steps }` or a plural
  // `flows: [{ title?, actors, steps }, ...]` — split each major flow into
  // its own diagram rather than mashing them together.
  function renderFlow(host, payload) {
    const flows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload && payload.flows)
        ? payload.flows
        : [payload];

    // No generic UML explainer — each flow carries its own title + summary
    // so the reviewer reads what the flow does, not how sequence diagrams
    // work in general.
    flows.forEach((f, i) => renderOneFlow(host, f, i, flows.length));
  }

  function renderOneFlow(host, f, idx, total) {
    if (!f || !Array.isArray(f.actors) || !f.actors.length) {
      host.appendChild(el('p', {}, 'No flow steps to render.'));
      return;
    }
    if (f.title) {
      host.appendChild(el('h3', { class: 'flow-mmd__title' },
        (total > 1 ? `${idx + 1}. ` : '') + f.title));
    }
    if (f.summary) {
      const p = el('p', { class: 'flow-mmd__summary' });
      appendInlineCode(p, f.summary);
      host.appendChild(p);
    }
    if (Array.isArray(f.highlights) && f.highlights.length) {
      const ul = el('ul', { class: 'flow-mmd__highlights' });
      f.highlights.forEach((h) => {
        const li = el('li', {});
        appendInlineCode(li, h);
        ul.appendChild(li);
      });
      host.appendChild(ul);
    }
    if (Array.isArray(f.images) && f.images.length) {
      host.appendChild(renderImageGrid(f.images, { class: 'flow-mmd__images' }));
    }

    const id = 'flow-mmd-' + Math.random().toString(36).slice(2, 9);
    const wrap = el('div', { class: 'flow-mmd' });
    // Pin first-fit + fit-button alignment to the left edge — the timeline
    // flows left-to-right, so an initial centre offset feels wrong.
    const inner = el('div', { class: 'flow-mmd__inner', 'data-fit-align': 'left' });
    const hint = el('div', { class: 'mmd-hint' }, 'ctrl + wheel to zoom · drag to pan');
    const mmdHost = el('pre', { class: 'mermaid', id });
    inner.appendChild(mmdHost);
    wrap.appendChild(hint);
    wrap.appendChild(inner);
    wrap.appendChild(mmdControls(inner));
    host.appendChild(wrap);

    const renderOnce = () => {
      mmdHost.textContent = buildSequenceMermaid(f);
      mmdHost.removeAttribute('data-processed');
      runMermaidSequence(mmdHost, () => wireFlowPanzoom(mmdHost, inner));
    };
    renderOnce();
    // Theme toggles bake colors into the rendered SVG, so rebuild from source.
    window.__pro.themeChangeHandlers.push(renderOnce);
  }

  function wireFlowPanzoom(mmdHost, scrollWrap) {
    const svgEl = mmdHost.querySelector('svg');
    if (!svgEl) return;
    // Pin SVG box to its viewBox so the browser doesn't pre-shrink the
    // diagram — panzoom is then the only scaler (same trick as the
    // architecture flowchart).
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

    if (typeof window.panzoom === 'function') {
      // Detach any panzoom from a prior render (theme toggle path) before
      // attaching a fresh one, otherwise wheel events get double-handled.
      if (scrollWrap._pz && typeof scrollWrap._pz.dispose === 'function') {
        try { scrollWrap._pz.dispose(); } catch (_) {}
      }
      const pz = window.panzoom(svgEl, {
        smoothScroll: false,
        minZoom: 0.3, maxZoom: 4,
        beforeWheel: (e) => !e.ctrlKey && !e.metaKey,
      });
      scrollWrap._pz = pz;
      requestAnimationFrame(() => fitMermaid(pz, svgEl, scrollWrap));
    }
  }

  function buildSequenceMermaid(f) {
    const sid = (s) => 'a_' + String(s).replace(/[^a-zA-Z0-9_]/g, '_');
    // Mermaid's sequenceDiagram parser treats `;` and newlines as statement
    // separators and `#` as a special token — strip / substitute any in
    // user-supplied labels so a stray punctuation char doesn't poison parsing.
    const esc = (s) => String(s)
      .replace(/[\r\n]+/g, ' ')
      .replace(/;/g, ',')
      .replace(/[<>]/g, '')
      .replace(/"/g, "'")
      .replace(/#/g, '');
    // Mermaid sequence labels don't wrap natively; keep messages one-line.
    const trim = (s) => {
      const t = String(s).trim();
      return t.length <= 80 ? t : t.slice(0, 77).trimEnd() + '…';
    };
    const lines = ['sequenceDiagram', '  autonumber'];
    f.actors.forEach((a) => {
      lines.push(`  participant ${sid(a.id)} as ${esc(a.label)}`);
    });
    f.steps.forEach((s) => {
      lines.push(`  ${sid(s.from)} ->> ${sid(s.to)}: ${esc(trim(s.label))}`);
    });
    return lines.join('\n');
  }

  function runMermaidSequence(mmdHost, afterRender) {
    const init = () => {
      const theme = document.documentElement.getAttribute('data-theme') || 'paper';
      const paper = theme === 'paper';
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        sequence: {
          useMaxWidth: false,
          wrap: false,
          actorMargin: 80,
          messageMargin: 44,
          boxMargin: 12,
          noteMargin: 12,
          mirrorActors: false,
        },
        theme: 'base',
        themeVariables: paper ? {
          fontFamily: 'IBM Plex Sans, ui-sans-serif, system-ui, sans-serif',
          background: '#fbf9f3',
          primaryColor: '#f0e6cf',
          primaryBorderColor: '#211e19',
          primaryTextColor: '#211e19',
          actorBkg: '#f0e6cf',
          actorBorder: '#211e19',
          actorTextColor: '#211e19',
          actorLineColor: '#5b5347',
          signalColor: '#211e19',
          signalTextColor: '#211e19',
          labelBoxBkgColor: '#fbf9f3',
          labelBoxBorderColor: '#211e19',
          labelTextColor: '#211e19',
          loopTextColor: '#211e19',
          noteBkgColor: '#b8431a',
          noteTextColor: '#fbf9f3',
          noteBorderColor: '#b8431a',
          activationBkgColor: '#e3ece6',
          activationBorderColor: '#5b5347',
          sequenceNumberColor: '#fbf9f3',
        } : {
          fontFamily: 'IBM Plex Sans, ui-sans-serif, system-ui, sans-serif',
          background: '#161b22',
          primaryColor: '#21262d',
          primaryBorderColor: '#c9d1d9',
          primaryTextColor: '#e6edf3',
          actorBkg: '#21262d',
          actorBorder: '#c9d1d9',
          actorTextColor: '#e6edf3',
          actorLineColor: '#8b949e',
          signalColor: '#e6edf3',
          signalTextColor: '#e6edf3',
          labelBoxBkgColor: '#161b22',
          labelBoxBorderColor: '#c9d1d9',
          labelTextColor: '#e6edf3',
          loopTextColor: '#e6edf3',
          noteBkgColor: '#b8431a',
          noteTextColor: '#fbf9f3',
          noteBorderColor: '#b8431a',
          activationBkgColor: '#21262d',
          activationBorderColor: '#8b949e',
          sequenceNumberColor: '#161b22',
        },
      });
      window.mermaid.run({ nodes: [mmdHost] }).then(afterRender || (() => {}));
    };
    if (window.mermaid) init();
    else {
      const wait = () => window.mermaid ? init() : setTimeout(wait, 30);
      wait();
    }
  }

  function renderDatabase(host, d) {
    if (d.summary) {
      const p = el('p', { class: 'db-summary' });
      appendInlineCode(p, d.summary);
      host.appendChild(p);
    }
    if (Array.isArray(d.highlights) && d.highlights.length) {
      const ul = el('ul', { class: 'db-highlights' });
      d.highlights.forEach((h) => {
        const li = el('li', {});
        appendInlineCode(li, h);
        ul.appendChild(li);
      });
      host.appendChild(ul);
    }

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

  // ---------- routes ----------
  // Compact route-delta section. It is intentionally accordion-heavy: reviewers
  // can scan the route groups, then expand one endpoint to see parameters,
  // body examples, response examples, files, tests, and review notes.
  function renderRoutes(host, payload) {
    if (payload.summary) {
      const p = el('p', { class: 'arch-summary' });
      appendInlineCode(p, payload.summary);
      host.appendChild(p);
    }

    const panel = el('div', { class: 'routes-panel' });
    const head = el('div', { class: 'routes-panel__head' }, [
      el('div', {}, [
        el('h3', {}, 'API routes touched'),
        el('p', {}, 'Grouped by product surface. Expand a route for input and response details.'),
      ]),
      renderRouteStats(payload.stats || {}),
    ]);
    panel.appendChild(head);

    if (payload.scope_note) {
      const note = el('p', { class: 'routes-panel__note' });
      appendInlineCode(note, payload.scope_note);
      panel.appendChild(note);
    }

    (payload.groups || []).forEach((group) => {
      const g = el('div', { class: 'routes-group' });
      g.appendChild(el('h4', {}, group.title));
      (group.routes || []).forEach((route) => {
        // All endpoints collapsed by default — reviewers scan paths first,
        // then expand individual routes to read parameters / responses.
        g.appendChild(renderRouteRow(route, false));
      });
      panel.appendChild(g);
    });

    host.appendChild(panel);
  }

  function renderRouteStats(stats) {
    const wrap = el('div', { class: 'routes-stats', 'aria-label': 'Route delta summary' });
    const chip = (label, cls) => el('span', { class: `route-chip${cls ? ` ${cls}` : ''}` }, label);
    if (Number.isFinite(stats.added)) wrap.appendChild(chip(`+${stats.added} added`, 'is-added'));
    if (Number.isFinite(stats.removed)) wrap.appendChild(chip(`−${stats.removed} removed`, 'is-removed'));
    if (Number.isFinite(stats.net)) wrap.appendChild(chip(`${stats.net >= 0 ? '+' : ''}${stats.net} net`, ''));
    if (Number.isFinite(stats.changed)) wrap.appendChild(chip(`${stats.changed} changed`, 'is-changed'));
    return wrap;
  }

  function renderRouteRow(route, open = false) {
    const details = el('details', { class: `route-row is-${route.status}` });
    if (open) details.setAttribute('open', '');
    details.appendChild(el('summary', {}, [
      el('span', { class: `route-method is-${route.method}` }, route.method),
      el('span', { class: 'route-path' }, route.path),
      el('span', { class: `status-chip is-${route.status}` }, route.status),
    ]));

    const body = el('div', { class: 'route-row__body' });
    body.appendChild(renderRouteFacts(route));
    if (Array.isArray(route.parameters) && route.parameters.length) {
      body.appendChild(renderRouteParameters(route.parameters));
    }
    if (route.request_body) {
      body.appendChild(renderRouteBody(route.request_body));
    }
    if (Array.isArray(route.responses) && route.responses.length) {
      body.appendChild(renderRouteResponses(route.responses));
    }
    details.appendChild(body);
    return details;
  }

  function renderRouteFacts(route) {
    const dl = el('dl', { class: 'route-facts' });
    const add = (k, v, mode) => {
      if (v == null || (Array.isArray(v) && v.length === 0)) return;
      dl.appendChild(el('dt', {}, k));
      const dd = el('dd', {});
      if (Array.isArray(v)) {
        v.forEach((item) => dd.appendChild(el('span', { class: mode === 'file' ? 'file-chip' : 'route-mini-chip' }, item)));
      } else {
        appendInlineCode(dd, v);
      }
      dl.appendChild(dd);
    };
    add('Why', route.summary);
    add('Details', route.details);
    add('Auth', route.auth);
    add('Data', route.data);
    add('Replacement', route.replacement);
    add('Files', route.files, 'file');
    add('Tests', route.tests, 'test');
    add('Reviewer focus', route.review_focus);
    return dl;
  }

  function renderRouteParameters(parameters) {
    const spec = el('div', { class: 'route-spec' }, [el('h5', {}, 'Parameters')]);
    const table = el('table', { class: 'route-param-table' }, [
      el('thead', {}, el('tr', {}, [
        el('th', {}, 'Name'),
        el('th', {}, 'In'),
        el('th', {}, 'Required'),
        el('th', {}, 'Description'),
      ])),
      el('tbody'),
    ]);
    const tbody = table.querySelector('tbody');
    parameters.forEach((p) => {
      const desc = el('td', {});
      appendInlineCode(desc, `${p.type ? `${p.type} — ` : ''}${p.description || ''}`);
      tbody.appendChild(el('tr', {}, [
        el('td', {}, el('code', {}, p.name)),
        el('td', {}, p.in),
        el('td', {}, p.required ? 'yes' : 'no'),
        desc,
      ]));
    });
    spec.appendChild(table);
    return spec;
  }

  function renderRouteBody(body) {
    const spec = el('div', { class: 'route-spec' }, [el('h5', {}, 'Input')]);
    const row = el('div', { class: 'route-body-param' });
    row.appendChild(el('div', { class: 'route-body-param__name' }, [
      el('code', {}, [
        'body',
        body.required ? el('span', { class: 'route-required' }, '* required') : null,
      ]),
      el('span', {}, body.type || 'object'),
      el('em', {}, '(body)'),
    ]));
    const content = el('div', { class: 'route-body-param__content' }, [
      el('p', {}, body.description || ''),
      el('div', { class: 'route-example-tabs' }, [
        el('strong', {}, 'Example Value'),
        el('span', {}, ' | Model'),
      ]),
      renderRouteExample(body.example),
      el('label', { class: 'route-content-type' }, [
        'Parameter content type',
        el('select', {}, el('option', {}, body.content_type || 'application/json')),
      ]),
    ]);
    row.appendChild(content);
    spec.appendChild(row);
    return spec;
  }

  function renderRouteResponses(responses) {
    const spec = el('div', { class: 'route-spec' }, [el('h5', {}, 'Responses')]);
    responses.forEach((r) => {
      const card = el('div', { class: `route-response${String(r.code).startsWith('2') ? '' : ' is-error'}` }, [
        el('div', { class: 'route-response__head' }, [
          el('span', {}, `${r.code} ${r.description}`),
          el('span', {}, r.content_type || 'application/json'),
        ]),
      ]);
      if (r.example !== undefined) card.appendChild(renderRouteExample(r.example));
      spec.appendChild(card);
    });
    return spec;
  }

  function renderRouteExample(value) {
    const pre = el('pre', { class: 'route-code' });
    if (value === undefined) {
      pre.textContent = '{}';
    } else if (typeof value === 'string') {
      pre.textContent = value;
    } else {
      pre.textContent = JSON.stringify(value, null, 2);
    }
    return pre;
  }

  function renderRiskRollout(host, r) {
    // No generic intro — each risk is its own item.
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
    // No generic intro — each open question is its own item.
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
