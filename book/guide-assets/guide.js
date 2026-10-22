/*
 * A Guide to Autonomy, local edition.
 * Builds the cover, the "Where to start?" page, the introduction, the part
 * openings, the chapters, the glossary and the page of all actions from
 * content.js and config.js, with hash routing, page tables of contents, search
 * and a checklist kept in localStorage. No network request is made: only the
 * links the reader opens lead outside.
 *
 * On proofconference.com (book/en/), every page arrives complete from
 * guide-ui/build_integration.py, with window.GUIDE_SITE and <main data-ssr>.
 * The script then enhances that page in place instead of building it: ticks,
 * progress, contents, search (index loaded on first use), the former #/ routes
 * sent to their real address, and a one-time import of the former checklist.
 */
(function () {
  'use strict';

  const MAIN = document.getElementById('main');
  const SITE = window.GUIDE_SITE && MAIN && MAIN.dataset.ssr ? window.GUIDE_SITE : null;

  const CONTENT = SITE ? SITE.chapters : Array.isArray(window.GUIDE_CONTENT) ? window.GUIDE_CONTENT : [];
  const PAGES = SITE ? [] : Array.isArray(window.GUIDE_PAGES) ? window.GUIDE_PAGES : [];
  const CONFIG = window.GUIDE_CONFIG || {};
  const BOOK = CONFIG.book || { title: 'A Guide to Autonomy' };
  const EDITION = CONFIG.edition || {};
  const PARTS = CONFIG.parts || [];
  const PLAN = CONFIG.plan || {};

  const chapters = CONTENT.slice().sort((a, b) => a.number - b.number);
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const pageById = new Map(PAGES.map((p) => [p.id, p]));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- helpers ---------- */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, '0');
  const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const partOf = (n) => PARTS.find((p) => p.number === n) || { number: n, name: 'Part ' + n };
  const route = (...segs) => '#/' + segs.filter(Boolean).map(encodeURIComponent).join('/');
  const chapterHref = (id, section) => route('chapter', id, section);
  const pageHref = (id, section) => route('page', id, section);
  const actionsHref = (section) => route('actions', section);
  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  // Same length as the input, so that match positions map back to the original text.
  function alignedFold(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const f = fold(s[i]);
      out += f.length === 1 ? f : s[i];
    }
    return out;
  }

  function textOf(node, exclude) {
    const clone = node.cloneNode(true);
    if (exclude) $$(exclude, clone).forEach((n) => n.remove());
    return squash(clone.textContent);
  }

  /* ---------- browser-local storage ---------- */

  const store = (function () {
    const prefix = CONFIG.storagePrefix || 'guide-autonomy.v1';
    const memory = {};
    let persistent = true;
    try {
      localStorage.setItem(prefix + '.probe', '1');
      localStorage.removeItem(prefix + '.probe');
    } catch (e) {
      persistent = false;
    }
    return {
      prefix,
      persistent,
      get(name) {
        if (!persistent) return Object.assign({}, memory[name]);
        try {
          const v = JSON.parse(localStorage.getItem(prefix + '.' + name));
          return v && typeof v === 'object' ? v : {};
        } catch (e) {
          return {};
        }
      },
      set(name, value) {
        memory[name] = value;
        if (!persistent) return;
        try { localStorage.setItem(prefix + '.' + name, JSON.stringify(value)); } catch (e) { /* quota or private mode */ }
      },
      remove(name) {
        delete memory[name];
        if (!persistent) return;
        try { localStorage.removeItem(prefix + '.' + name); } catch (e) { /* ignore */ }
      }
    };
  })();

  function toggleKey(name, key, on) {
    const v = store.get(name);
    if (on) v[key] = true; else delete v[key];
    store.set(name, v);
  }

  const storageSentence = store.persistent
    ? 'Your ticks and read marks are saved in this browser only, on this device, with no account.'
    : 'This browser does not allow local storage here, so your ticks last until you close the page.';

  /* ---------- page building (chapters and the other pages of the book) ---------- */

  const KIND_LABEL = {
    brief: '', explain: 'Understand', compare: 'Compare', steps: 'Tutorial',
    pitfalls: 'Watch out', further: 'Go further', sources: 'References', checklist: 'Act', glossary: 'Terms'
  };
  const KIND_BY_ID = {
    'in-brief': 'brief', 'step-by-step': 'steps', 'mistakes-to-avoid': 'pitfalls',
    'go-further': 'further', 'sources': 'sources', 'your-checklist': 'checklist'
  };
  const isTodo = (li) => /^\s*\[ \]/.test(li.textContent);

  function sectionKind(sec, id, ctx) {
    if (!ctx.isChapter) {
      if (id === 'sources') return 'sources';
      return ctx.doc.kind === 'glossary' ? 'glossary' : 'explain';
    }
    if ($$('li', sec).some(isTodo)) return 'checklist';
    if (KIND_BY_ID[id]) return KIND_BY_ID[id];
    if (sec.querySelector('table')) return 'compare';
    return 'explain';
  }

  // Short name of a page, used in search results.
  function docLabel(doc, isChapter) {
    if (isChapter) return 'Ch. ' + doc.number;
    if (doc.kind === 'part') return 'Part ' + doc.part + ' opening';
    return doc.title;
  }

  function claim(ctx, base) {
    let id = base;
    for (let k = 2; ctx.ids.has(id); k++) id = base + '-' + k;
    ctx.ids.add(id);
    return id;
  }

  const built = new Map();
  const builtPages = new Map();

  function buildDoc(doc, isChapter) {
    const tpl = document.createElement('template');
    tpl.innerHTML = doc.html;
    const root = document.createElement('div');
    let sec = null;
    let count = 0;
    Array.from(tpl.content.childNodes).forEach((node) => {
      if (node.nodeType === 1 && node.tagName === 'H2') {
        count += 1;
        sec = document.createElement('section');
        sec.className = 'sec';
        sec.dataset.no = pad(count);
        root.appendChild(sec);
      }
      (sec || root).appendChild(node);
    });

    $$('a[href]', root).forEach((a) => {
      if (/^https?:\/\//i.test(a.getAttribute('href'))) {
        a.classList.add('ext');
        a.rel = 'noopener noreferrer';
      }
    });

    const href = (section) => isChapter ? chapterHref(doc.id, section) : pageHref(doc.id, section);
    const ctx = {
      doc, isChapter, href, label: docLabel(doc, isChapter),
      actions: [], index: [], ids: new Set($$('[id]', root).map((el) => el.id)), steps: 0, checklistId: null
    };

    $$('section.sec', root).forEach((s) => {
      const h2 = $('h2', s);
      const kind = sectionKind(s, h2.id, ctx);
      const title = squash(h2.textContent);
      s.classList.add('sec--' + kind);
      s.setAttribute('aria-labelledby', h2.id);
      h2.tabIndex = -1;

      const kicker = document.createElement('p');
      kicker.className = 'sec-kicker';
      kicker.innerHTML = '<span class="sec-no">' + s.dataset.no + '</span>' +
        (KIND_LABEL[kind] ? '<span class="sec-kind">' + KIND_LABEL[kind] + '</span>' : '');
      s.insertBefore(kicker, h2);

      indexSubsections(s, title, ctx);
      if (kind === 'explain') addCited(s);
      if (kind === 'compare' || (!isChapter && s.querySelector('table'))) wrapTables(s, title, ctx, kind === 'compare');
      if (kind === 'steps') markSteps(s, title, ctx);
      if (kind === 'checklist') { buildChecklist(s, ctx); ctx.checklistId = h2.id; }
      if (kind === 'glossary') markTerms(s, title, ctx);
      if (kind === 'sources' || kind === 'further') $$('ul', s).forEach((ul) => ul.classList.add('refs'));

      ctx.index.push({
        type: 'section', part: doc.part, title,
        kicker: isChapter ? ctx.label + ' · ' + (KIND_LABEL[kind] || 'In brief') : ctx.label,
        text: textOf(s, '.sec-kicker, h2, .compare-cap, .sec-cited, .cl-head, .cl-hint, .effort'),
        href: href(h2.id)
      });
    });

    const toc = (function map(list) {
      return (list || []).map((h, i) => {
        const el = root.querySelector('[id="' + h.id + '"]');
        return {
          id: h.id,
          no: h.level === 2 ? pad(i + 1) : '',
          label: el ? squash(el.textContent) : h.name,
          href: href(h.id),
          children: map(h.children)
        };
      });
    })(doc.headings);

    ctx.index.unshift(isChapter ? {
      type: 'chapter', part: doc.part, title: doc.title,
      kicker: 'Chapter ' + doc.number + ' · ' + partOf(doc.part).name,
      text: toc.map((t) => t.label).join(' · '),
      href: href()
    } : {
      type: 'page', part: doc.part, title: doc.title,
      kicker: doc.kind === 'part' ? 'Part ' + doc.part + ' · ' + partOf(doc.part).name + ' · Opening essay' : 'Book',
      text: toc.map((t) => t.label).join(' · '),
      href: href()
    });

    return { html: root.innerHTML, actions: ctx.actions, index: ctx.index, toc, checklistId: ctx.checklistId };
  }

  // Headings of level 3, such as the questions of the part openings, are search targets too.
  function indexSubsections(sec, parentTitle, ctx) {
    $$('h3[id]', sec).forEach((h3) => {
      h3.tabIndex = -1;
      const text = [];
      for (let n = h3.nextElementSibling; n && !/^H[23]$/.test(n.tagName); n = n.nextElementSibling) text.push(n.textContent);
      ctx.index.push({
        type: 'section', part: ctx.doc.part, title: squash(h3.textContent),
        kicker: ctx.label + ' · ' + parentTitle,
        text: squash(text.join(' ')),
        href: ctx.href(h3.id)
      });
    });
  }

  function addCited(sec) {
    const urls = [];
    $$('a.ext', sec).forEach((a) => {
      const url = a.getAttribute('href');
      if (urls.indexOf(url) === -1) urls.push(url);
    });
    if (!urls.length) return;
    const seenHosts = {};
    const links = urls.map((url) => {
      const host = hostOf(url);
      seenHosts[host] = (seenHosts[host] || 0) + 1;
      const label = seenHosts[host] > 1 ? host + ' (' + seenHosts[host] + ')' : host;
      return '<li><a class="ext" rel="noopener noreferrer" href="' + esc(url) + '">' + esc(label) + '</a></li>';
    });
    const box = document.createElement('div');
    box.className = 'sec-cited';
    box.innerHTML = '<p class="sec-cited-label">Cited in this section</p><ul>' + links.join('') + '</ul>';
    sec.appendChild(box);
  }

  // Verified first-column labels of the 33 source tables identify their rows. Unknown table types stay unchanged.
  const ROW_HEADER_COLUMNS = new Set(["app", "service", "family", "need", "habit", "browser", "search engine", "provider", "option", "wallet", "device", "where", "route", "messenger", "tool", "client", "manager", "key", "system", "app source", "asset", "method", "approach", "platform", "after"]);

  function wrapTables(sec, title, ctx, indexRows) {
    const tables = $$('table', sec);
    tables.forEach((table, i) => {
      const rows = table.tBodies[0] ? Array.from(table.tBodies[0].rows) : [];
      const heads = table.tHead && table.tHead.rows[0] ? Array.from(table.tHead.rows[0].cells, (c) => squash(c.textContent)) : [];
      if (table.tHead) $$('th', table.tHead).forEach((th) => th.setAttribute('scope', 'col'));
      if (heads.length && ROW_HEADER_COLUMNS.has(heads[0].toLowerCase())) rows.forEach((tr) => {
        const cell = tr.cells[0];
        if (!cell || !squash(cell.textContent)) return;
        const th = document.createElement('th');
        Array.from(cell.attributes).forEach((a) => th.setAttribute(a.name, a.value));
        th.setAttribute('scope', 'row');
        while (cell.firstChild) th.appendChild(cell.firstChild);
        cell.replaceWith(th);
      });
      const fig = document.createElement('figure');
      fig.className = 'compare';
      const cap = document.createElement('figcaption');
      cap.className = 'compare-cap';
      cap.innerHTML = '<span>' + (indexRows ? plural(rows.length, 'option', 'options') : plural(rows.length, 'row', 'rows')) +
        ' · ' + plural(heads.length, 'column', 'columns') + '</span>' +
        '<span class="compare-hint" aria-hidden="true">Scroll sideways →</span>';
      const scroller = document.createElement('div');
      scroller.className = 'table-scroll';
      scroller.setAttribute('role', 'region');
      scroller.setAttribute('aria-label', (indexRows ? 'Comparison table: ' : 'Table: ') + title + (tables.length > 1 ? ', ' + (i + 1) + ' of ' + tables.length : ''));
      scroller.tabIndex = 0;
      table.replaceWith(fig);
      fig.append(cap, scroller);
      scroller.appendChild(table);
      if (!indexRows) return;

      rows.forEach((tr) => {
        const name = squash(tr.cells[0].textContent);
        tr.id = claim(ctx, 'row-' + (slug(name) || 'item'));
        ctx.index.push({
          type: 'tool', part: ctx.doc.part, title: name,
          kicker: ctx.label + ' · Compared in “' + title + '”',
          text: Array.from(tr.cells).slice(1).map((c, j) => (heads[j + 1] ? heads[j + 1] + ': ' : '') + squash(c.textContent)).join(' · '),
          href: ctx.href(tr.id)
        });
      });
    });
  }

  // The 1st list of steps on a page keeps step-1, step-2...; any later list gets step-2-1...
  function markSteps(sec, title, ctx) {
    $$('ol', sec).forEach((ol) => {
      ctx.steps += 1;
      const prefix = ctx.steps === 1 ? 'step-' : 'step-' + ctx.steps + '-';
      ol.classList.add('steps');
      Array.from(ol.children).forEach((li, i) => {
        li.id = claim(ctx, prefix + (i + 1));
        const lead = li.querySelector('strong');
        const name = squash(lead ? lead.textContent : li.textContent.slice(0, 64)).replace(/[.:]$/, '');
        ctx.index.push({
          type: 'step', part: ctx.doc.part, title: 'Step ' + (i + 1) + ': ' + name,
          kicker: ctx.label + ' · ' + title,
          text: squash(li.textContent),
          href: ctx.href(li.id)
        });
      });
    });
  }

  function markTerms(sec, group, ctx) {
    $$('p', sec).forEach((p) => {
      const lead = p.firstChild;
      if (!lead || lead.nodeName !== 'STRONG') return;
      const term = squash(lead.textContent).replace(/[.:]$/, '');
      p.id = claim(ctx, 'term-' + (slug(term) || 'item'));
      p.classList.add('term');
      ctx.index.push({
        type: 'term', part: null, title: term,
        kicker: ctx.label + ' · ' + group,
        text: squash(p.textContent.slice(lead.textContent.length)),
        href: ctx.href(p.id)
      });
    });
  }

  function actionItem(a) {
    return '<li class="action" id="action-' + esc(a.id) + '"><label class="action-row">' +
      '<input type="checkbox" class="action-cb" data-action="' + esc(a.id) + '">' +
      '<span class="action-text">' + a.html + '</span>' +
      (a.effort ? '<span class="effort"><span class="sr-only">, effort: </span>' + esc(a.effort) + '</span>' : '') +
      '</label></li>';
  }

  function checklistHead(chId, total) {
    return '<div class="cl-head"><p class="cl-count"><strong data-stat="ch-done" data-ch="' + chId + '">0</strong> of ' +
      total + ' actions done</p><span class="bar" data-bar="ch" data-ch="' + chId + '" aria-hidden="true"><i></i></span></div>';
  }

  // Action IDs come from content.js, where the importer took them from scripts/action-registry.json.
  function buildChecklist(sec, ctx) {
    const items = $$('li', sec).filter(isTodo);
    if (!items.length) return;
    const ch = ctx.doc;
    const known = ch.actions || [];
    const list = items[0].parentElement;
    const span = document.createElement('span');

    items.forEach((li, i) => {
      let html = li.innerHTML.replace(/^\s*\[ \]\s*/, '');
      let effort = '';
      const m = html.match(/\s*\(([^()<>]+)\)\s*$/);
      if (m) { effort = m[1].trim(); html = html.slice(0, m.index); }
      span.innerHTML = html;
      const text = squash(span.textContent);
      let id = known[i] && known[i].id;
      if (!id) {
        id = ch.id + '-' + (i + 1);
        console.warn('No action ID in content.js for "' + text + '". Run scripts/import_book.py again.');
      } else if (fold(squash(known[i].text)) !== fold(text)) {
        console.warn('Action ' + id + ' does not match its text in content.js. Run scripts/import_book.py again.');
      }
      ctx.actions.push({ id, text, effort, html });
      ctx.index.push({
        type: 'action', part: ch.part, title: text,
        kicker: ctx.label + ' · Checklist action' + (effort ? ', ' + effort : ''),
        text: '', href: chapterHref(ch.id, 'action-' + id)
      });
    });

    const wrap = document.createElement('div');
    wrap.className = 'checklist';
    wrap.innerHTML = checklistHead(ch.id, items.length) + '<ul class="actions">' + ctx.actions.map(actionItem).join('') + '</ul>';
    const hint = document.createElement('p');
    hint.className = 'cl-hint';
    hint.innerHTML = 'One action at a time is enough. ' + esc(storageSentence) + ' <a href="' + actionsHref() + '">See all actions on one page</a>.';
    wrap.appendChild(hint);
    list.replaceWith(wrap);
  }

  chapters.forEach((ch) => {
    // On the site the pages are already built: only the action IDs of each chapter are needed, for the counts.
    if (SITE) built.set(ch.id, { actions: ch.actions.map((id) => ({ id })), index: [], toc: [] });
    else if (ch.available !== false && ch.html) built.set(ch.id, buildDoc(ch, true));
  });
  PAGES.forEach((p) => { if (p.html) builtPages.set(p.id, buildDoc(p, false)); });
  const available = chapters.filter((c) => built.has(c.id));
  const totalActions = available.reduce((n, c) => n + built.get(c.id).actions.length, 0);
  const planChapters = PLAN.chapters || chapters.length;
  const planActions = PLAN.actions || totalActions;

  const pageOf = (kind, part) => PAGES.find((p) => p.kind === kind && (part === undefined || p.part === part) && builtPages.has(p.id));
  const intro = pageOf('introduction');
  const glossary = pageOf('glossary');
  const partPage = (n) => pageOf('part', n);
  const partPages = PARTS.map((p) => partPage(p.number)).filter(Boolean);
  const termCount = glossary ? builtPages.get(glossary.id).index.filter((e) => e.type === 'term').length : 0;
  const actionsOf = (list) => list.reduce((n, c) => n + (built.has(c.id) ? built.get(c.id).actions.length : 0), 0);

  function rangeLabel(list) {
    const nums = list.map((c) => c.number);
    if (!nums.length) return '';
    const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    if (nums.length === 1) return 'chapter ' + nums[0];
    return contiguous ? 'chapters ' + nums[0] + ' to ' + nums[nums.length - 1] : 'chapters ' + nums.join(', ');
  }

  // Reading order of the book: introduction, each part opening and its chapters, all actions, glossary.
  const navOf = {
    chapter: (c) => ({ key: 'chapter/' + c.id, href: chapterHref(c.id), dir: 'Chapter ' + c.number, title: c.title, part: c.part }),
    page: (p) => ({
      key: 'page/' + p.id, href: pageHref(p.id), title: p.title, part: p.part,
      dir: p.kind === 'part' ? 'Part ' + p.part + ' opening' : p.kind === 'glossary' ? 'Reference' : 'Before the chapters'
    }),
    actions: () => ({ key: 'actions/', href: actionsHref(), dir: 'Global checklist', title: 'All actions' }),
    cover: () => ({ key: 'home/', href: '#/', dir: 'Cover', title: 'Back to the cover' })
  };
  const sequence = [].concat(
    intro ? [navOf.page(intro)] : [],
    ...PARTS.map((p) => [].concat(
      partPage(p.number) ? [navOf.page(partPage(p.number))] : [],
      available.filter((c) => c.part === p.number).map(navOf.chapter))),
    totalActions ? [navOf.actions()] : [],
    glossary ? [navOf.page(glossary)] : []
  );
  function neighbours(key) {
    const i = sequence.findIndex((s) => s.key === key);
    return { prev: sequence[i - 1] || navOf.cover(), next: sequence[i + 1] || navOf.cover() };
  }

  /* ---------- shared fragments ---------- */

  function chapterItem(ch, currentId) {
    const b = built.get(ch.id);
    const no = '<span class="ch-n">' + pad(ch.number) + '</span>';
    if (!b) {
      return '<li class="ch-item is-planned part-' + ch.part + '"><div class="ch-row">' + no +
        '<span class="ch-t">' + esc(ch.title) + '</span><span class="ch-s">Missing from content.js</span></div></li>';
    }
    return '<li class="ch-item part-' + ch.part + '" data-ch-item="' + ch.id + '"><a class="ch-row" href="' + chapterHref(ch.id) + '"' +
      (ch.id === currentId ? ' aria-current="page"' : '') + '>' + no +
      '<span class="ch-t">' + esc(ch.title) + '</span><span class="ch-s"><span data-stat="ch-done" data-ch="' + ch.id + '">0</span> of ' +
      b.actions.length + ' actions done<span data-read-label="' + ch.id + '"></span></span></a></li>';
  }

  // Introduction, part openings, all actions and glossary, in the same lists as the chapters.
  function extraItem(key, currentKey) {
    let no, title, sub, href, part = null;
    if (key === 'actions') {
      no = '✓'; title = 'All actions'; href = actionsHref();
      sub = '<span data-stat="actions-done">0</span> of ' + totalActions + ' actions done';
    } else {
      const p = pageById.get(key);
      href = pageHref(p.id);
      title = p.title;
      if (p.kind === 'part') { no = '··'; part = p.part; sub = 'Opening essay of part ' + p.part; }
      else if (p.kind === 'glossary') { no = 'Az'; sub = plural(termCount, 'term', 'terms'); }
      else { no = '00'; sub = 'Before the chapters'; }
    }
    return '<li class="ch-item' + (part ? ' part-' + part : '') + '"><a class="ch-row" href="' + href + '"' +
      (key === currentKey ? ' aria-current="page"' : '') + '><span class="ch-n">' + no + '</span>' +
      '<span class="ch-t">' + esc(title) + '</span><span class="ch-s">' + sub + '</span></a></li>';
  }
  const beforeKeys = () => (intro ? [intro.id] : []);
  const afterKeys = () => (totalActions ? ['actions'] : []).concat(glossary ? [glossary.id] : []);
  const extraList = (keys, currentKey, cls) => keys.length
    ? '<ol class="ch-list' + (cls ? ' ' + cls : '') + '">' + keys.map((k) => extraItem(k, currentKey)).join('') + '</ol>' : '';
  const partList = (n, currentKey) => '<ol class="ch-list">' +
    (partPage(n) ? extraItem(partPage(n).id, currentKey) : '') +
    chapters.filter((c) => c.part === n).map((c) => chapterItem(c, currentKey)).join('') + '</ol>';

  function tocBlock(items) {
    if (!items.length) return '';
    return '<div class="toc-aside">' +
      '<button type="button" class="toc-toggle" aria-expanded="false" aria-controls="page-toc">' +
      '<span class="toc-toggle-label">On this page</span><span class="toc-current" aria-hidden="true"></span>' +
      '<span class="toc-chevron" aria-hidden="true"></span></button>' +
      '<nav class="page-toc" id="page-toc" aria-labelledby="page-toc-title">' +
      '<p class="toc-title" id="page-toc-title">On this page</p>' + tocList(items, 0) + '</nav></div>';
  }

  function tocList(items, depth) {
    return '<ol class="toc-list' + (depth ? ' toc-sub' : '') + '">' + items.map((it) =>
      '<li><a href="' + it.href + '" data-target="' + esc(it.id) + '">' +
      (it.no ? '<span class="toc-no">' + it.no + '</span>' : '') +
      '<span class="toc-label">' + esc(it.label) + '</span></a>' +
      (it.children && it.children.length ? tocList(it.children, depth + 1) : '') + '</li>'
    ).join('') + '</ol>';
  }

  function layout(items, mainHtml, extraClass) {
    return '<div class="page-layout' + (items.length ? '' : ' no-toc') + (extraClass ? ' ' + extraClass : '') + '">' +
      tocBlock(items) + '<div class="page-main">' + mainHtml + '</div></div>';
  }

  function stat(valueHtml, total, label, bar) {
    return '<div class="stat"><p class="stat-n">' + valueHtml + '<small> / ' + total + '</small></p>' +
      '<p class="stat-l">' + label + '</p>' + (bar ? '<span class="bar" data-bar="' + bar + '" aria-hidden="true"><i></i></span>' : '') + '</div>';
  }

  function pagerHtml(prev, next, label) {
    const link = (it, dir, cls) => '<a class="' + cls + (it.part ? ' part-' + it.part : '') + '" href="' + it.href + '">' +
      '<span class="pager-dir">' + dir + ' · ' + esc(it.dir) + '</span><span class="pager-title">' + esc(it.title) + '</span></a>';
    return '<nav class="pager" aria-label="' + label + '">' + link(prev, 'Previous', 'pager-prev') + link(next, 'Next', 'pager-next') + '</nav>';
  }

  // "the introduction, the 3 part openings and the glossary"
  function extrasSentence() {
    const parts = [];
    if (intro) parts.push('the introduction');
    if (partPages.length) parts.push('the ' + plural(partPages.length, 'part opening', 'part openings'));
    if (glossary) parts.push('the glossary');
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts.join('');
  }

  /* ---------- views ---------- */

  function viewHome() {
    const startCh = built.has(CONFIG.startChapter) ? byId.get(CONFIG.startChapter) : available[0];
    const first = available[0];
    const lines = (BOOK.titleLines || [BOOK.title]).map((l, i) =>
      '<span class="cover-line' + (i === BOOK.outlinedLine ? ' is-outlined' : '') + '">' + esc(l) + '</span>').join(' ');
    const partSizes = PARTS.map((p) => chapters.filter((c) => c.part === p.number).length);
    const maxSize = Math.max.apply(null, partSizes.concat(1));

    const coverParts = PARTS.map((p, i) => {
      const list = chapters.filter((c) => c.part === p.number);
      return '<li class="part-' + p.number + '" style="--share:' + (partSizes[i] / maxSize).toFixed(3) + '">' +
        '<span class="cp-no">Part ' + p.number + '</span><span class="cp-name">' + esc(p.name) + '</span>' +
        '<span class="cp-range">' + rangeLabel(list).replace(/^c/, 'C') + '</span></li>';
    }).join('');

    const actions = startCh
      ? '<a class="btn btn--dark" href="' + chapterHref(startCh.id) + '"><span class="btn-main">Start reading <span aria-hidden="true">→</span></span>' +
        '<span class="btn-sub">Chapter ' + startCh.number + ' · ' + esc(startCh.title) + '</span></a>'
      : '';

    const alt = [];
    if (intro) alt.push('<a href="' + pageHref(intro.id) + '">Read the introduction</a>');
    if (first && startCh && first.id !== startCh.id) alt.push('<a href="' + chapterHref(first.id) + '">Or begin with chapter ' + first.number + '</a>');
    alt.push('<a href="#/home/contents">See all ' + chapters.length + ' chapters</a>');

    const cover = '<section class="cover" aria-labelledby="page-title">' +
      '<div class="cover-main">' +
        '<p class="cover-kicker">' + esc(BOOK.kicker || '') + '</p>' +
        '<h1 class="cover-title" id="page-title" tabindex="-1">' + lines + '</h1>' +
        '<ol class="cover-parts" aria-label="The ' + PARTS.length + ' parts of the book">' + coverParts + '</ol>' +
      '</div>' +
      '<div class="cover-side">' +
        '<div class="edition">' +
          '<p class="wordmark"><span class="wm-big">' + esc(EDITION.wordmark || '') + '</span><span class="wm-conf">' + esc(EDITION.wordmarkSuffix || '') + '</span></p>' +
          '<p class="edition-line">' + esc(EDITION.label || '') + ' · ' + esc(EDITION.name || '') + '</p>' +
          '<p class="edition-by">An initiative of ' + esc(EDITION.initiative || '') + '</p>' +
        '</div>' +
        '<div class="cover-intro">' + (BOOK.intro || []).map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>' +
        '<div class="cover-actions">' + actions + '<a class="btn btn--line" href="#/start">Where to start?</a></div>' +
        '<p class="cover-alt">' + alt.join('<span aria-hidden="true"> · </span>') + '</p>' +
      '</div>' +
    '</section>';

    const parts = PARTS.map((p) =>
      '<section class="part-col part-' + p.number + '" aria-labelledby="part-' + p.number + '">' +
      '<h3 id="part-' + p.number + '" tabindex="-1"><span class="part-no">Part ' + p.number + '</span><span class="part-name">' + esc(p.name) + '</span></h3>' +
      partList(p.number) + '</section>'
    ).join('');

    const extras = extrasSentence();
    const main =
      '<section class="block" aria-labelledby="contents">' +
        '<p class="block-kicker">General contents</p>' +
        '<h2 id="contents" tabindex="-1">Contents</h2>' +
        '<p class="block-lead">' + plural(chapters.length, 'chapter', 'chapters') + ' in ' + PARTS.length + ' parts' +
          (extras ? ', with ' + extras : '') + (totalActions ? ', and all ' + totalActions + ' actions on one page' : '') + '.</p>' +
        extraList(beforeKeys(), null, 'contents-extra') +
        '<div class="parts-grid">' + parts + '</div>' +
        extraList(afterKeys(), null, 'contents-extra') +
      '</section>' +

      '<section class="block" aria-labelledby="preview">' +
        '<p class="block-kicker">Edition coverage</p>' +
        '<h2 id="preview" tabindex="-1">This edition</h2>' +
        '<div class="stats">' +
          stat(String(available.length), planChapters, 'chapters readable here') +
          stat(String(totalActions), planActions, 'checklist actions usable here') +
        '</div>' +
        '<div class="block-text">' +
          '<p>The plan of the book counts ' + planChapters + ' chapters and ' + planActions + ' checklist actions. This local edition contains ' +
            available.length + ' chapters with their ' + totalActions + ' actions' + (extras ? ', plus ' + extras : '') +
            '. These numbers describe the available content, not your completion.</p>' +
          '<p>The text is in English. A Lithuanian version exists in the original PROOF book and is not part of this edition; a French edition is planned.</p>' +
          '<p>This edition runs from local files and is not published.</p>' +
        '</div>' +
      '</section>' +

      '<section class="block" aria-labelledby="progress">' +
        '<p class="block-kicker">In this browser</p>' +
        '<h2 id="progress" tabindex="-1">Your progress</h2>' +
        '<div class="stats">' +
          stat('<span data-stat="actions-done">0</span>', totalActions, 'actions done', 'actions') +
          stat('<span data-stat="chapters-read">0</span>', available.length, 'chapters marked as read', 'read') +
        '</div>' +
        '<div class="block-text"><p>Tick actions in a chapter checklist, or on the page of all actions, to update the actions count. Use the "I have read this chapter" checkbox at the end of a chapter to update the reading count. Scrolling through a page does not mark it as read.</p>' +
        (startCh ? '<p><a class="btn" href="' + chapterHref(startCh.id, built.get(startCh.id).checklistId) + '">Open a checklist</a></p>' : '') +
        (totalActions ? '<p><a href="' + actionsHref() + '">See all ' + totalActions + ' actions on one page</a></p>' : '') +
        '<p>' + storageSentence + ' Ticks can be removed at any time from each checklist.</p>' +
        '<p><button type="button" class="btn-quiet" data-reset>Clear my progress in this browser</button></p>' +
        '<p class="sr-only" id="progress-status" aria-live="polite"></p></div>' +
      '</section>' +

      '<section class="block" aria-labelledby="edition">' +
        '<p class="block-kicker">Colophon</p>' +
        '<h2 id="edition" tabindex="-1">About this edition</h2>' +
        '<div class="block-text">' +
          '<p>' + esc(EDITION.label || '') + ' of ' + esc(BOOK.title) + ', in the identity of the PROOF Conference. The initiative is carried by ' +
            esc(EDITION.initiative || '') + '. Later editions are independent: a community can fork the book and adapt its look, layout, navigation, structure, content and code.</p>' +
          '<p>No ads and no account. The pages run from local files, and only the source links you open lead to other sites.</p>' +
        '</div>' +
      '</section>';

    const toc = [
      { id: 'contents', label: 'Contents', href: route('home', 'contents'),
        children: PARTS.map((p) => ({ id: 'part-' + p.number, label: 'Part ' + p.number + ' · ' + p.name, href: route('home', 'part-' + p.number) })) },
      { id: 'preview', label: 'This edition', href: route('home', 'preview') },
      { id: 'progress', label: 'Your progress', href: route('home', 'progress') },
      { id: 'edition', label: 'About this edition', href: route('home', 'edition') }
    ];

    return { html: cover + layout(toc, main, 'is-home'), title: '' };
  }

  function viewStart() {
    const paths = CONFIG.startPaths || [];
    const pathHtml = paths.map((p, i) => {
      const main = (p.chapters || []).map((id) => byId.get(id)).filter(Boolean);
      const deeper = (p.deeper || []).map((id) => byId.get(id)).filter(Boolean);
      const all = main.concat(deeper);
      const part = main[0] ? main[0].part : 1;
      return '<section class="path part-' + part + '" aria-labelledby="' + esc(p.id) + '">' +
        '<p class="path-no">Path ' + pad(i + 1) + '</p>' +
        '<h2 id="' + esc(p.id) + '" tabindex="-1">' + esc(p.title) + '</h2>' +
        '<p class="path-desc">' + esc(p.text) + '</p>' +
        '<ol class="ch-list">' + main.map((c) => chapterItem(c)).join('') + '</ol>' +
        (deeper.length ? '<h3 class="path-sub">' + esc(p.deeperTitle || 'To go deeper') + '</h3><ol class="ch-list">' + deeper.map((c) => chapterItem(c)).join('') + '</ol>' : '') +
        '<p class="path-avail">' + plural(all.length, 'chapter', 'chapters') + ' · ' + plural(actionsOf(all), 'action', 'actions') + '</p>' +
        '</section>';
    }).join('');

    const guides = [];
    if (intro) guides.push('The <a href="' + pageHref(intro.id) + '">introduction</a> explains why the book exists and how to use it.');
    if (partPages.length) guides.push('Each part opens with a short essay: ' +
      partPages.map((p) => '<a href="' + pageHref(p.id) + '">' + esc(p.title) + '</a>').join(', ') + '.');
    if (glossary) guides.push('The <a href="' + pageHref(glossary.id) + '">glossary</a> explains the words that come back.');
    if (totalActions) guides.push('All ' + totalActions + ' actions are also gathered on <a href="' + actionsHref() + '">one page</a>.');

    const main =
      '<header class="page-head">' +
        '<p class="block-kicker">Orientation</p>' +
        '<h1 id="page-title" class="page-title" tabindex="-1">Where to start?</h1>' +
        '<div class="start-lead"><p>Autonomy is built gradually.</p>' +
        '<p>Pick a concrete need, explore its chapter, then start with 1 action suited to your situation.</p></div>' +
      '</header>' +
      '<div class="paths">' + pathHtml + '</div>' +
      '<section class="block" aria-labelledby="how-chapters-work">' +
        '<p class="block-kicker">Method</p>' +
        '<h2 id="how-chapters-work" tabindex="-1">How each chapter works</h2>' +
        '<ol class="anatomy">' +
          '<li><span class="an-no">01</span><span class="an-t">The need</span><span class="an-d">What is at stake, and why it concerns you.</span></li>' +
          '<li><span class="an-no">02</span><span class="an-t">Options and limits</span><span class="an-d">Tools compared side by side, with what each one asks of you.</span></li>' +
          '<li><span class="an-no">03</span><span class="an-t">Steps</span><span class="an-d">A step-by-step tutorial for one reasonable setup.</span></li>' +
          '<li><span class="an-no">04</span><span class="an-t">Sources</span><span class="an-d">Linked next to the passages they support, and listed at the end.</span></li>' +
        '</ol>' +
        '<div class="block-text"><p>Each chapter ends with a checklist where every action is tagged with its effort, such as 5 min or 1 hour. Do 1 action at a time. ' +
          storageSentence + '</p>' + (guides.length ? '<p>' + guides.join(' ') + '</p>' : '') + '</div>' +
      '</section>';

    const toc = paths.map((p, i) => ({ id: p.id, no: pad(i + 1), label: p.title, href: route('start', p.id) }))
      .concat([{ id: 'how-chapters-work', label: 'How each chapter works', href: route('start', 'how-chapters-work') }]);

    return { html: layout(toc, main, 'is-start'), title: 'Where to start?' };
  }

  function viewChapter(ch) {
    const b = built.get(ch.id);
    const part = partOf(ch.part);
    const i = available.indexOf(ch);
    const seq = neighbours('chapter/' + ch.id);
    const prevCh = available[i - 1];
    const nextCh = available[i + 1];
    const prev = prevCh ? navOf.chapter(prevCh) : seq.prev;
    const next = nextCh ? navOf.chapter(nextCh) : seq.next;
    const opening = partPage(ch.part);
    const nextOpening = nextCh && nextCh.part !== ch.part ? partPage(nextCh.part) : null;
    const partLabel = 'Part ' + part.number + ' · ' + esc(part.name);

    const html =
      '<article class="chapter part-' + ch.part + '" aria-labelledby="page-title">' +
        '<header class="chapter-head">' +
          '<p class="ch-kicker">' + (opening ? '<a href="' + pageHref(opening.id) + '">' + partLabel + '</a>' : partLabel) + '</p>' +
          '<h1 class="ch-title" id="page-title" tabindex="-1"><span class="sr-only">Chapter ' + ch.number + ': </span>' + esc(ch.title) + '</h1>' +
          '<p class="ch-bignum" aria-hidden="true">' + pad(ch.number) + '</p>' +
          '<div class="ch-meta">' +
            '<span>Chapter ' + ch.number + ' of ' + chapters.length + '</span>' +
            (b.checklistId ? '<a href="' + chapterHref(ch.id, b.checklistId) + '"><span data-stat="ch-done" data-ch="' + ch.id + '">0</span> of ' + b.actions.length + ' actions done</a>' : '') +
            '<span class="ch-readstate" data-read-state="' + ch.id + '"></span>' +
          '</div>' +
        '</header>' +
        '<div class="prose">' + b.html + '</div>' +
        '<footer class="chapter-end">' +
          '<label class="read-row"><input type="checkbox" class="read-cb" data-read="' + ch.id + '"><span>I have read this chapter</span></label>' +
          '<noscript><p class="cl-hint">Marking this chapter as read requires JavaScript.</p></noscript>' +
          pagerHtml(prev, next, 'Chapters of the book') +
          (nextOpening ? '<p class="pager-note">Part ' + nextOpening.part + ' opens with an essay: <a href="' + pageHref(nextOpening.id) + '">' + esc(nextOpening.title) + '</a></p>' : '') +
        '</footer>' +
      '</article>';

    return { html: layout(b.toc, html, 'is-chapter part-' + ch.part), title: ch.title, reading: true, part: ch.part };
  }

  // Introduction, part openings and glossary. No read mark: only the 18 chapters have one.
  function viewPage(p) {
    const b = builtPages.get(p.id);
    const isPart = p.kind === 'part';
    const part = isPart ? partOf(p.part) : null;
    const list = isPart ? chapters.filter((c) => c.part === p.part) : [];
    const seq = neighbours('page/' + p.id);
    let kicker, meta;
    if (isPart) {
      kicker = 'Part ' + part.number + ' · ' + esc(part.name) + ' · Opening essay';
      meta = plural(list.length, 'chapter', 'chapters') + ' · ' + plural(actionsOf(list), 'action', 'actions');
    } else if (p.kind === 'glossary') {
      kicker = 'Reference';
      meta = plural(termCount, 'term', 'terms');
    } else {
      kicker = 'Before the chapters';
      meta = plural(chapters.length, 'chapter', 'chapters') + ' in ' + PARTS.length + ' parts';
    }

    const chaptersBlock = isPart
      ? '<section class="block" aria-labelledby="part-chapters">' +
          '<p class="block-kicker">Part ' + part.number + '</p>' +
          '<h2 id="part-chapters" tabindex="-1">The chapters of this part</h2>' +
          '<ol class="ch-list">' + list.map((c) => chapterItem(c)).join('') + '</ol>' +
        '</section>'
      : '';

    const html =
      '<article class="chapter page-doc' + (isPart ? ' part-' + p.part : '') + '" aria-labelledby="page-title">' +
        '<header class="chapter-head">' +
          '<p class="ch-kicker">' + kicker + '</p>' +
          '<h1 class="ch-title" id="page-title" tabindex="-1">' + (isPart ? '<span class="sr-only">Part ' + p.part + ': </span>' : '') + esc(p.title) + '</h1>' +
          '<div class="ch-meta"><span>' + meta + '</span></div>' +
        '</header>' +
        '<div class="prose">' + b.html + '</div>' +
        chaptersBlock +
        '<footer class="chapter-end">' + pagerHtml(seq.prev, seq.next, 'Pages of the book') + '</footer>' +
      '</article>';

    const toc = isPart ? b.toc.concat([{ id: 'part-chapters', label: 'The chapters of this part', href: pageHref(p.id, 'part-chapters') }]) : b.toc;
    return {
      html: layout(toc, html, 'is-chapter is-page' + (isPart ? ' part-' + p.part : '')),
      title: isPart ? 'Part ' + p.part + ': ' + p.title : p.title, reading: true, part: isPart ? p.part : null
    };
  }

  // The global checklist promised by the introduction. Same checkboxes, same storage keys.
  function viewActions() {
    const seq = neighbours('actions/');
    const groups = PARTS.map((p) => {
      const list = available.filter((c) => c.part === p.number);
      if (!list.length) return '';
      return '<section class="sec part-' + p.number + '" aria-labelledby="actions-part-' + p.number + '">' +
        '<p class="sec-kicker"><span class="sec-no">Part ' + p.number + '</span><span class="sec-kind">' + plural(actionsOf(list), 'action', 'actions') + '</span></p>' +
        '<h2 id="actions-part-' + p.number + '" tabindex="-1">' + esc(p.name) + '</h2>' +
        list.map((c) => {
          const b = built.get(c.id);
          return '<div class="checklist" id="actions-' + c.id + '" tabindex="-1">' +
            '<h3 class="cl-title"><a href="' + chapterHref(c.id) + '"><span class="cl-title-n">' + pad(c.number) + '</span>' + esc(c.title) + '</a></h3>' +
            checklistHead(c.id, b.actions.length) + '<ul class="actions">' + b.actions.map(actionItem).join('') + '</ul></div>';
        }).join('') +
        '</section>';
    }).join('');

    const html =
      '<header class="page-head">' +
        '<p class="block-kicker">Global checklist</p>' +
        '<h1 id="page-title" class="page-title page-title--md" tabindex="-1">All actions</h1>' +
        '<div class="block-text"><p>The ' + totalActions + ' actions of the ' + available.length + ' chapters on a single page. ' +
          'A tick here is the same tick as in the chapter checklist, so each action counts once.</p><p>' + storageSentence + '</p></div>' +
        '<div class="stats">' +
          stat('<span data-stat="actions-done">0</span>', totalActions, 'actions done', 'actions') +
          stat('<span data-stat="chapters-read">0</span>', available.length, 'chapters marked as read', 'read') +
        '</div>' +
      '</header>' +
      '<div class="prose">' + groups + '</div>' +
      '<footer class="chapter-end">' + pagerHtml(seq.prev, seq.next, 'Pages of the book') + '</footer>';

    const toc = PARTS.filter((p) => available.some((c) => c.part === p.number)).map((p) => ({
      id: 'actions-part-' + p.number, label: 'Part ' + p.number + ' · ' + p.name, href: actionsHref('actions-part-' + p.number),
      children: available.filter((c) => c.part === p.number).map((c) => ({ id: 'actions-' + c.id, no: pad(c.number), label: c.title, href: actionsHref('actions-' + c.id) }))
    }));
    return { html: layout(toc, html, 'is-actions'), title: 'All actions' };
  }

  function viewNotice(kicker, title, body, part) {
    const html =
      '<header class="page-head' + (part ? ' part-' + part : '') + '">' +
        '<p class="block-kicker">' + kicker + '</p>' +
        '<h1 id="page-title" class="page-title page-title--md" tabindex="-1">' + esc(title) + '</h1>' +
      '</header>' +
      '<div class="notice" role="note">' + body +
        '<p class="notice-links"><a href="#/">Cover</a><button type="button" class="link-btn" data-open="contents">Contents</button><a href="#/start">Where to start?</a></p>' +
      '</div>';
    return { html: layout([], html, 'is-notice'), title };
  }

  // Only shown if content.js lacks a chapter of the plan.
  function viewUnavailable(ch) {
    const part = partOf(ch.part);
    return viewNotice('Chapter ' + ch.number + ' · Part ' + part.number + ' · ' + esc(part.name), ch.title,
      '<p><strong>Missing from content.js.</strong> Run <code>python3 scripts/import_book.py</code> from the project folder to regenerate the chapters.</p>',
      ch.part);
  }

  function viewMissing() {
    return viewNotice('Not found', 'This page does not exist',
      '<p>The address does not match a page of this edition.</p>');
  }

  function contentsHtml(currentKey) {
    return '<nav class="drawer" aria-label="Book contents">' +
      '<ul class="drawer-links"><li><a href="#/">Cover</a></li><li><a href="#/start">Where to start?</a></li><li><a href="#/home/progress">Your progress</a></li></ul>' +
      extraList(beforeKeys(), currentKey) +
      PARTS.map((p) =>
        '<section class="drawer-part part-' + p.number + '" aria-labelledby="dp-' + p.number + '">' +
        '<h3 class="drawer-part-title" id="dp-' + p.number + '"><span>Part ' + p.number + '</span> ' + esc(p.name) + '</h3>' +
        partList(p.number, currentKey) + '</section>'
      ).join('') +
      '<div class="drawer-part">' + extraList(afterKeys(), currentKey) + '</div>' +
      '<p class="drawer-scope">Local edition: ' + available.length + ' chapters and ' + totalActions + ' actions, in English.</p>' +
      '</nav>';
  }

  function footerHtml() {
    const L = CONFIG.licence || {};
    const lic = (x) => x ? '<a class="ext" rel="noopener noreferrer" href="' + esc(x.url) + '">' + esc(x.label) + '</a>' : '';
    return '<div class="footer-inner">' +
      '<p class="footer-mark"><span class="wm">' + esc(EDITION.wordmark || '') + '</span> ' + esc(BOOK.title) + '</p>' +
      '<p>' + esc(EDITION.label || '') + ', ' + esc(EDITION.name || '') + '. An initiative of ' + esc(EDITION.initiative || '') +
        '. Local edition, not published: ' + available.length + ' chapters and ' + totalActions + ' actions.</p>' +
      '<p>Text ' + lic(L.content) + ' · original code ' + lic(L.code) + '. ' + esc(L.note || '') + '</p>' +
      '<p>' + storageSentence + '</p>' +
      '</div>';
  }

  /* ---------- progress ---------- */

  function chapterDone(id, done) {
    const b = built.get(id);
    return b ? b.actions.filter((a) => done[a.id]).length : 0;
  }

  function refresh() {
    const done = store.get('actions');
    const read = store.get('read');
    let doneTotal = 0;
    let readTotal = 0;
    available.forEach((c) => {
      doneTotal += chapterDone(c.id, done);
      if (read[c.id]) readTotal += 1;
    });

    $$('[data-stat]').forEach((el) => {
      const s = el.dataset.stat;
      if (s === 'ch-done') el.textContent = chapterDone(el.dataset.ch, done);
      else if (s === 'actions-done') el.textContent = doneTotal;
      else if (s === 'chapters-read') el.textContent = readTotal;
    });
    $$('[data-bar]').forEach((el) => {
      let v = 0;
      if (el.dataset.bar === 'ch') {
        const b = built.get(el.dataset.ch);
        v = b && b.actions.length ? chapterDone(el.dataset.ch, done) / b.actions.length : 0;
      } else if (el.dataset.bar === 'actions') v = totalActions ? doneTotal / totalActions : 0;
      else if (el.dataset.bar === 'read') v = available.length ? readTotal / available.length : 0;
      el.style.setProperty('--p', v.toFixed(3));
    });
    $$('[data-read-label]').forEach((el) => { el.textContent = read[el.dataset.readLabel] ? ' · read' : ''; });
    $$('[data-read-state]').forEach((el) => { el.textContent = read[el.dataset.readState] ? 'Marked as read' : ''; });
    $$('[data-ch-item]').forEach((el) => el.classList.toggle('is-read', !!read[el.dataset.chItem]));
    $$('.action-cb').forEach((cb) => {
      cb.checked = !!done[cb.dataset.action];
      cb.closest('.action').classList.toggle('is-done', cb.checked);
    });
    $$('.read-cb').forEach((cb) => { cb.checked = !!read[cb.dataset.read]; });
  }

  // The confirmation lasts 6 seconds, and as long as the button keeps the focus, so that a keyboard or screen reader
  // user has the time to hear it; moving the focus away cancels it.
  let resetTimer = null;
  function disarmReset(btn) {
    if (!btn.dataset.armed) return;
    clearTimeout(resetTimer);
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.label;
    const status = $('#progress-status');
    if (status) status.textContent = '';
  }
  function onReset(btn) {
    const status = $('#progress-status');
    if (btn.dataset.armed) {
      clearTimeout(resetTimer);
      store.remove('actions');
      store.remove('read');
      // The migration mark stays: a cleared progress is never filled again from the former checklist.
      store.remove('last');
      const resume = $('[data-resume]');
      if (resume) resume.hidden = true;
      delete btn.dataset.armed;
      btn.textContent = btn.dataset.label;
      refresh();
      if (status) status.textContent = 'Your progress in this browser has been cleared.';
      return;
    }
    btn.dataset.armed = '1';
    btn.dataset.label = btn.textContent;
    btn.textContent = 'Confirm: clear all ticks and read marks';
    if (status) status.textContent = 'Press again to confirm.';
    resetTimer = setTimeout(function wait() {
      if (document.activeElement === btn) resetTimer = setTimeout(wait, 6000);
      else disarmReset(btn);
    }, 6000);
    btn.addEventListener('blur', () => disarmReset(btn), { once: true });
  }

  /* ---------- search ---------- */

  const TYPE_WEIGHT = { chapter: 8, term: 7, tool: 7, section: 6, page: 5, step: 4, action: 4 };

  function pageEntries() {
    const entries = [
      { type: 'page', title: 'Contents', kicker: 'Cover', text: chapters.map((c) => c.title).concat(PAGES.map((p) => p.title)).join(' · '), href: route('home', 'contents') },
      { type: 'page', title: 'This edition', kicker: 'Cover', text: 'Edition coverage: ' + available.length + ' chapters and ' + totalActions + ' actions available, with ' + extrasSentence() + '. Languages: English; Lithuanian in the original PROOF book; French planned. Local edition, not published.', href: route('home', 'preview') },
      { type: 'page', title: 'Your progress', kicker: 'Cover', text: 'Actions done and chapters read, saved in this browser. Open a checklist. Clear progress.', href: route('home', 'progress') },
      { type: 'page', title: 'About this edition', kicker: 'Cover', text: 'PROOF Conference, ' + (EDITION.initiative || '') + ', licence, fork, independent editions.', href: route('home', 'edition') },
      { type: 'page', title: 'Where to start?', kicker: 'Orientation', text: 'Autonomy is built gradually. Pick a concrete need, explore its chapter, then start with 1 action suited to your situation.', href: route('start') },
      { type: 'page', title: 'How each chapter works', kicker: 'Where to start?', text: 'The need, options and limits, steps, sources. Checklist with effort tags, 1 action at a time.', href: route('start', 'how-chapters-work') }
    ];
    if (totalActions) {
      entries.push({ type: 'page', title: 'All actions', kicker: 'Global checklist', text: 'The ' + totalActions + ' checklist actions of the ' + available.length + ' chapters on a single page, grouped by chapter, with the same ticks.', href: actionsHref() });
    }
    (CONFIG.startPaths || []).forEach((p) => {
      const titles = (p.chapters || []).concat(p.deeper || []).map((id) => byId.get(id)).filter(Boolean).map((c) => c.title);
      entries.push({ type: 'page', title: p.title, kicker: 'Where to start? · Path', text: p.text + ' ' + titles.join(' · '), href: route('start', p.id) });
    });
    return entries;
  }

  let searchIndex = [];
  function prepareIndex() {
    const all = [];
    if (SITE) all.push.apply(all, window.GUIDE_SEARCH || []);
    else {
      if (intro) all.push.apply(all, builtPages.get(intro.id).index);
      PARTS.forEach((p) => {
        if (partPage(p.number)) all.push.apply(all, builtPages.get(partPage(p.number).id).index);
        available.filter((c) => c.part === p.number).forEach((c) => all.push.apply(all, built.get(c.id).index));
      });
      if (glossary) all.push.apply(all, builtPages.get(glossary.id).index);
      all.push.apply(all, pageEntries());
    }
    searchIndex = all.map((e) => Object.assign({}, e, { ft: alignedFold(e.title), fx: alignedFold(e.text || '') }));
  }

  // On the site, the index of every page (search-index.js) loads the first time the search opens.
  let searchLoading = false;
  function loadSearch() {
    if (window.GUIDE_SEARCH) { prepareIndex(); renderResults(searchInput.value); return; }
    if (searchLoading) return;
    searchLoading = true;
    searchStatus.textContent = 'Loading the search index.';
    const s = document.createElement('script');
    s.src = SITE.search;
    s.onload = () => { searchLoading = false; prepareIndex(); renderResults(searchInput.value); };
    s.onerror = () => {
      searchLoading = false;
      s.remove();
      const msg = 'The search index could not be loaded. Check the connection and open the search again.';
      searchResults.innerHTML = '<p class="results-empty">' + msg + '</p>';
      searchStatus.textContent = msg;
    };
    document.head.appendChild(s);
  }
  const searchReady = () => !SITE || searchIndex.length > 0;

  function search(query) {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    const hits = [];
    if (!terms.length) return { hits, terms };
    searchIndex.forEach((e) => {
      let score = 0;
      for (const t of terms) {
        const inTitle = e.ft.indexOf(t) !== -1;
        if (!inTitle && e.fx.indexOf(t) === -1) return;
        score += inTitle ? 10 : 1;
        if (inTitle && e.ft.indexOf(t) === 0) score += 3;
      }
      hits.push({ e, score: score + (TYPE_WEIGHT[e.type] || 0) });
    });
    hits.sort((a, b) => b.score - a.score);
    return { hits: hits.slice(0, 40), total: hits.length, terms };
  }

  function highlight(text, terms) {
    const f = alignedFold(text);
    const ranges = [];
    terms.forEach((t) => {
      for (let i = f.indexOf(t); i !== -1; i = f.indexOf(t, i + t.length)) ranges.push([i, i + t.length]);
    });
    if (!ranges.length) return esc(text);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((r) => {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice());
    });
    let out = '';
    let pos = 0;
    merged.forEach((r) => {
      out += esc(text.slice(pos, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>';
      pos = r[1];
    });
    return out + esc(text.slice(pos));
  }

  function snippet(text, terms) {
    if (!text) return '';
    const f = alignedFold(text);
    let at = -1;
    terms.forEach((t) => { const i = f.indexOf(t); if (i !== -1 && (at === -1 || i < at)) at = i; });
    if (at === -1) at = 0;
    let start = Math.max(0, at - 60);
    if (start > 0) { const sp = text.indexOf(' ', start); if (sp !== -1 && sp < at) start = sp + 1; }
    let end = Math.min(text.length, start + 180);
    if (end < text.length) { const sp = text.lastIndexOf(' ', end); if (sp > at) end = sp; }
    return (start > 0 ? '… ' : '') + highlight(text.slice(start, end), terms) + (end < text.length ? ' …' : '');
  }

  const searchInput = $('#search-input');
  const searchResults = $('#search-results');
  const searchStatus = $('#search-status');
  let statusTimer = null;

  function renderResults(q) {
    const query = q.trim();
    clearTimeout(statusTimer);
    if (!query) {
      searchStatus.textContent = '';
      const sugg = CONFIG.searchSuggestions || [];
      searchResults.innerHTML = sugg.length
        ? '<div class="search-suggest"><p class="search-suggest-title">Try</p><ul>' +
          sugg.map((s) => '<li><button type="button" class="chip" data-suggest="' + esc(s) + '">' + esc(s) + '</button></li>').join('') + '</ul></div>'
        : '';
      return;
    }
    const r = search(query);
    searchResults.innerHTML = r.hits.length
      ? '<ol class="results" aria-label="Results">' + r.hits.map((h) => {
          const e = h.e;
          const snip = e.text ? snippet(e.text, r.terms) : '';
          return '<li><a class="result' + (e.part ? ' part-' + e.part : '') + '" href="' + e.href + '">' +
            '<span class="r-kind">' + esc(e.kicker) + '</span><span class="r-title">' + highlight(e.title, r.terms) + '</span>' +
            (snip ? '<span class="r-snip">' + snip + '</span>' : '') + '</a></li>';
        }).join('') + '</ol>'
      : '<p class="results-empty">No match in the pages of this edition.</p>';
    const msg = plural(r.total, 'result', 'results') + (r.total > r.hits.length ? ', the first ' + r.hits.length + ' shown' : '') + '.';
    statusTimer = setTimeout(() => { searchStatus.textContent = msg; }, 450);
  }

  /* ---------- dialogs, menus ---------- */

  const dialogs = { search: $('#search-dialog'), contents: $('#contents-dialog') };
  const langBtn = $('#lang-btn');
  const langPanel = $('#lang-panel');

  function openDialog(name, opener) {
    const d = dialogs[name];
    if (!d || d.open) return;
    closeDialogs(false);
    setLang(false);
    setToc(false);
    if (name === 'contents') {
      // On the site the contents are part of the page already, with the current page marked.
      if (!SITE) {
        const r = parseRoute();
        const current = !r ? null : r.page === 'chapter' ? r.id : r.page === 'page' ? r.id : r.page === 'actions' ? 'actions' : null;
        $('#contents-body').innerHTML = contentsHtml(current);
      }
      refresh();
    }
    d._opener = opener || document.activeElement;
    d._restore = true;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    if (name === 'search') {
      searchInput.focus();
      searchInput.select();
      if (searchReady()) renderResults(searchInput.value); else loadSearch();
    } else {
      (d.querySelector('[aria-current="page"]') || d.querySelector('.dialog-close')).focus();
    }
  }

  function closeDialog(d, restore) {
    if (!d || !d.open) return;
    d._restore = restore !== false;
    if (typeof d.close === 'function') d.close();
    else { d.removeAttribute('open'); d.dispatchEvent(new Event('close')); }
  }
  function closeDialogs(restore) { Object.keys(dialogs).forEach((k) => closeDialog(dialogs[k], restore)); }

  Object.keys(dialogs).forEach((k) => {
    const d = dialogs[k];
    d.addEventListener('close', () => {
      const o = d._opener;
      d._opener = null;
      if (d._restore && o && document.contains(o)) o.focus({ preventScroll: true });
    });
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); });
    d.querySelector('[data-close]').addEventListener('click', () => closeDialog(d));
  });

  dialogs.search.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [searchInput].concat($$('a.result, [data-suggest]', searchResults));
    const i = items.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    items[e.key === 'ArrowDown' ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0)].focus();
  });
  searchInput.addEventListener('input', () => { if (searchReady()) renderResults(searchInput.value); else loadSearch(); });
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const first = $('a.result', searchResults);
    if (first) { closeDialog(dialogs.search, false); navigate(first.getAttribute('href')); }
  });

  function setLang(open) {
    if (!langBtn) return;
    langBtn.setAttribute('aria-expanded', String(open));
    langPanel.hidden = !open;
  }

  function setToc(open) {
    const aside = $('.toc-aside');
    if (!aside) return;
    aside.classList.toggle('is-open', open);
    $('.toc-toggle', aside).setAttribute('aria-expanded', String(open));
  }

  /* ---------- routing ---------- */

  const main = MAIN;
  const readBar = $('#read-progress');
  let currentKey = null;
  let firstRoute = true;
  let tocTargets = [];
  let activeTarget = null;

  function parseRoute() {
    const h = location.hash;
    if (!h || h === '#' || h === '#/') return { page: 'home' };
    if (h.indexOf('#/') !== 0) return null;
    let segs;
    try { segs = h.slice(2).split('/').map(decodeURIComponent); } catch (e) { return { page: 'missing' }; }
    if (segs[0] === '' || segs[0] === 'home') return { page: 'home', section: segs[1] || null };
    if (segs[0] === 'start') return { page: 'start', section: segs[1] || null };
    if (segs[0] === 'chapter') return { page: 'chapter', id: segs[1] || '', section: segs[2] || null };
    if (segs[0] === 'page') return { page: 'page', id: segs[1] || '', section: segs[2] || null };
    if (segs[0] === 'actions') return { page: 'actions', section: segs[1] || null };
    return { page: 'missing' };
  }

  function navigate(href) {
    if (SITE) { location.assign(href); return; }
    if (location.hash === href || (href === '#/' && !location.hash)) onRoute();
    else location.hash = href;
  }

  function render(r) {
    let view;
    if (r.page === 'home') view = viewHome();
    else if (r.page === 'start') view = viewStart();
    else if (r.page === 'chapter') {
      const ch = byId.get(r.id);
      view = !ch ? viewMissing() : built.has(ch.id) ? viewChapter(ch) : viewUnavailable(ch);
    } else if (r.page === 'page') {
      view = builtPages.has(r.id) ? viewPage(pageById.get(r.id)) : viewMissing();
    } else if (r.page === 'actions') view = totalActions ? viewActions() : viewMissing();
    else view = viewMissing();

    main.innerHTML = view.html;
    document.title = view.title
      ? view.title + ' — ' + BOOK.title
      : BOOK.title + ' — ' + (EDITION.name || '');
    readBar.hidden = !view.reading;
    readBar.className = 'read-progress' + (view.part ? ' part-' + view.part : '');

    tocTargets = $$('#page-toc a').map((a) => ({ a, el: document.getElementById(a.dataset.target) })).filter((t) => t.el);
    activeTarget = null;
    refresh();
    measureTables();
  }

  function onRoute() {
    let r = parseRoute();
    if (!r) {
      if (currentKey) return;
      r = { page: 'home' };
    }
    const key = r.page + '/' + (r.id || '');
    const changed = key !== currentKey;
    if (changed) { render(r); currentKey = key; }
    setToc(false);
    const focus = !firstRoute;
    firstRoute = false;

    $$('.is-target').forEach((el) => el.classList.remove('is-target'));
    const target = r.section ? document.getElementById(r.section) : null;
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'start', behavior: changed || reduceMotion.matches ? 'auto' : 'smooth' });
        if (target.matches('tr, li, .term')) target.classList.add('is-target');
        if (focus) {
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
        onScroll();
      });
    } else {
      window.scrollTo(0, 0);
      const h1 = document.getElementById('page-title');
      if (focus && h1) h1.focus({ preventScroll: true });
      onScroll();
    }
  }

  /* ---------- on the site: real addresses, former routes and former checklist ---------- */

  // Real address of a route of the local edition (#/chapter/passwords/step-by-step -> /book/en/passwords/#step-by-step).
  function siteHref(r) {
    const R = SITE.routes;
    const at = (path, section) => path + (section ? '#' + encodeURIComponent(section) : '');
    if (r && r.page === 'home') return at(R.home, r.section);
    if (r && r.page === 'start') return at(R.start, r.section);
    if (r && r.page === 'chapter' && R.chapter[r.id]) return at(R.chapter[r.id], r.section);
    if (r && r.page === 'page' && R.page[r.id]) return at(R.page[r.id], r.section);
    if (r && r.page === 'actions') return at(R.actions, r.section);
    return R.home;
  }

  // The browser scrolls to #anchors by itself: only former #/ routes are sent on, and rows, steps and actions are marked.
  function onSiteRoute() {
    if (location.hash.indexOf('#/') === 0) { location.replace(siteHref(parseRoute())); return; }
    $$('.is-target').forEach((el) => el.classList.remove('is-target'));
    let id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { /* malformed: no target */ }
    let target = id ? document.getElementById(id) : null;
    if (target && target.classList.contains('legacy-anchor')) target = target.closest('.action');
    if (target && target.matches('tr, li, .term')) target.classList.add('is-target');
    onScroll();
  }

  // One-time import of the former book (book.js, same origin): checked IDs (JSON array of '<slug>-<n>', shared by the
  // English and Lithuanian pages), chapters read (JSON array of slugs) and the last chapter opened (raw slug).
  // Nothing of the former keys is changed or removed. Ticks already saved here are kept: it is a union. Unknown IDs and
  // slugs, such as the introduction or the part openings, are ignored. The mark is written only when a former key
  // exists, and is never removed, so a cleared progress is not filled again.
  function migrateLegacy() {
    const L = SITE.legacy;
    if (!L || !store.persistent || store.get('migration').legacy) return;
    let raw;
    try {
      raw = { actions: localStorage.getItem(L.keys.actions), read: localStorage.getItem(L.keys.read), last: localStorage.getItem(L.keys.last) };
    } catch (e) { return; }
    if (raw.actions === null && raw.read === null && raw.last === null) return;
    const list = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
    const actions = store.get('actions');
    const read = store.get('read');
    const n = { actions: 0, read: 0, ignored: 0, last: false };
    list(raw.actions).forEach((old) => {
      const id = typeof old === 'string' && Object.prototype.hasOwnProperty.call(L.actions, old) ? L.actions[old] : null;
      if (!id) { n.ignored += 1; return; }
      if (!actions[id]) { actions[id] = true; n.actions += 1; }
    });
    list(raw.read).forEach((slug) => {
      if (typeof slug !== 'string' || L.chapters.indexOf(slug) === -1) { n.ignored += 1; return; }
      if (!read[slug]) { read[slug] = true; n.read += 1; }
    });
    if (n.actions) store.set('actions', actions);
    if (n.read) store.set('read', read);
    if (typeof raw.last === 'string' && L.chapters.indexOf(raw.last) !== -1 && !store.get('last').chapter) {
      store.set('last', { chapter: raw.last });
      n.last = true;
    }
    store.set('migration', Object.assign({ legacy: 1 }, n));
  }

  // Cover: "Continue reading" towards the last chapter opened.
  function showResume() {
    const slot = $('[data-resume]');
    const ch = slot && byId.get(store.get('last').chapter);
    if (!ch || !SITE.routes.chapter[ch.id]) return;
    slot.innerHTML = 'Continue reading: <a href="' + esc(SITE.routes.chapter[ch.id]) + '">Chapter ' + ch.number + ' · ' + esc(ch.title) + '</a>';
    slot.hidden = false;
  }

  function startSite() {
    $$('[data-js-only]').forEach((el) => { el.hidden = false; });
    $$('[data-open="contents"]').forEach((el) => el.setAttribute('aria-haspopup', 'dialog'));
    $$('.action-cb, .read-cb').forEach((cb) => { cb.disabled = false; });
    migrateLegacy();
    const key = MAIN.dataset.ssr;
    if (key.indexOf('chapter/') === 0 && byId.has(key.slice(8))) store.set('last', { chapter: key.slice(8) });
    showResume();
    tocTargets = $$('#page-toc a').map((a) => ({ a, el: document.getElementById(a.dataset.target) })).filter((t) => t.el);
    refresh();
    measureTables();
    onSiteRoute();
    if ('serviceWorker' in navigator && SITE.sw) {
      navigator.serviceWorker.register(SITE.sw, { scope: SITE.swScope }).then(offlineState, () => offlineState(null));
    } else offlineState(null);
  }

  // Cover, "About this edition": whether the pages of this version are saved for offline reading. A worker only
  // confirms its complete CORE, then this page checks its own exact asset URLs in that same cache.
  const OFFLINE = {
    ready: 'Offline copy: saved in this browser. Every page of this edition, the search, the glossary and all actions open without a connection, chapters not opened yet included. Links to other sites need a connection.',
    saving: 'Offline copy: being saved in this browser. Keep this page open and online for a moment.',
    failed: 'Offline copy: not saved. Reload this page while online to try again.',
    none: 'Offline copy: not available in this browser. The pages work online.'
  };
  function offlineState(reg) {
    const slot = $('[data-offline]');
    if (!slot) return;
    const say = (key) => { slot.textContent = OFFLINE[key]; slot.hidden = false; };
    if (!reg || !window.caches) { say('none'); return; }
    const check = async (miss) => {
      const worker = reg.active;
      if (!worker || worker.state !== 'activated') { say(miss || 'saving'); return; }
      const required = [SITE.search].concat($$('script[src], link[rel="stylesheet"]').map((el) => el.src || el.href));
      const status = await new Promise((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 3000);
        channel.port1.onmessage = (e) => { clearTimeout(timer); channel.port1.close(); resolve(e.data); };
        worker.postMessage({ type: 'PROOF_OFFLINE_STATUS' }, [channel.port2]);
      });
      if (!status || !status.ready || !status.cache || !status.cache.startsWith('proof-book-')) {
        say(miss || 'failed'); return;
      }
      try {
        const cache = await caches.open(status.cache);
        const hits = await Promise.all(required.map((u) => cache.match(u)));
        say(hits.every(Boolean) ? 'ready' : miss || 'saving');
      } catch (e) { say('none'); }
    };
    const watch = () => {
      const worker = reg.installing || reg.waiting;
      if (!worker) { check(); return; }
      say('saving');
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') check();
        else if (worker.state === 'redundant' && !reg.installing && !reg.waiting) check('failed');
      });
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => check());
    reg.addEventListener('updatefound', watch);
    watch();
  }

  /* ---------- scroll: active section, reading progress ---------- */

  const header = $('.site-header');
  function anchorOffset() {
    const toggle = $('.toc-toggle');
    const bar = toggle && toggle.offsetParent !== null ? toggle.offsetHeight : 0;
    return header.offsetHeight + bar + 16;
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateActive();
      if (!readBar.hidden) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        readBar.style.setProperty('--p', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : '0');
      }
    });
  }

  function updateActive() {
    if (!tocTargets.length) return;
    const offset = anchorOffset() + 4;
    let active = null;
    for (const t of tocTargets) {
      if (t.el.getBoundingClientRect().top - offset <= 0) active = t; else break;
    }
    if (active && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      active = tocTargets[tocTargets.length - 1];
    }
    if (active === activeTarget) return;
    if (activeTarget) activeTarget.a.removeAttribute('aria-current');
    activeTarget = active;
    if (active) active.a.setAttribute('aria-current', 'true');
    const current = $('.toc-current');
    if (current) current.textContent = active ? $('.toc-label', active.a).textContent : '';
  }

  function measureTables() {
    $$('.compare').forEach((fig) => {
      const s = $('.table-scroll', fig);
      fig.classList.toggle('is-scrollable', s.scrollWidth > s.clientWidth + 1);
    });
  }

  /* ---------- events ---------- */

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest('.lang')) setLang(false);
    if (!t.closest('.toc-aside')) setToc(false);

    const opener = t.closest('[data-open]');
    if (opener) {
      // On the site, "Contents" is also a link to the contents of the cover, for a new tab or without JavaScript.
      if (opener.tagName === 'A') {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
      }
      openDialog(opener.dataset.open, opener);
      return;
    }

    if (t.closest('.toc-toggle')) {
      const btn = t.closest('.toc-toggle');
      setToc(btn.getAttribute('aria-expanded') !== 'true');
      return;
    }
    if (t.closest('#lang-btn')) { setLang(langBtn.getAttribute('aria-expanded') !== 'true'); return; }

    const reset = t.closest('[data-reset]');
    if (reset) { onReset(reset); return; }

    const sugg = t.closest('[data-suggest]');
    if (sugg) {
      searchInput.value = sugg.dataset.suggest;
      renderResults(searchInput.value);
      searchInput.focus();
      return;
    }

    if (t.closest('.skip-link')) {
      e.preventDefault();
      const target = document.getElementById('page-title') || main;
      target.focus();
      return;
    }

    if (SITE) {
      // Real links: the browser follows them. A dialog or the page contents close first, in case the target is on this page.
      const link = t.closest('a[href]');
      if (link && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const d = link.closest('dialog');
        if (d) closeDialog(d, false);
        if (link.closest('.toc-aside')) setToc(false);
      }
      return;
    }

    const a = t.closest('a[href^="#/"]');
    if (a && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      const d = a.closest('dialog');
      if (d) closeDialog(d, false);
      const href = a.getAttribute('href');
      if (location.hash === href || (href === '#/' && !location.hash)) {
        e.preventDefault();
        onRoute();
      }
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('.action-cb')) { toggleKey('actions', t.dataset.action, t.checked); refresh(); }
    else if (t.matches('.read-cb')) { toggleKey('read', t.dataset.read, t.checked); refresh(); }
  });

  document.addEventListener('keydown', (e) => {
    const anyDialog = Object.keys(dialogs).some((k) => dialogs[k].open);
    if (e.key === 'Escape') {
      if (langPanel && !langPanel.hidden) { setLang(false); langBtn.focus(); return; }
      const aside = $('.toc-aside.is-open');
      if (aside) { setToc(false); $('.toc-toggle', aside).focus(); return; }
      if (anyDialog && typeof HTMLDialogElement !== 'function') closeDialogs();
      return;
    }
    if (anyDialog) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openDialog('search', document.activeElement); return; }
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); openDialog('search', document.activeElement); }
  });

  window.addEventListener('hashchange', SITE ? onSiteRoute : onRoute);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { measureTables(); onScroll(); });
  window.addEventListener('storage', (e) => { if (!e.key || e.key.indexOf(store.prefix) === 0) refresh(); });

  /* ---------- start ---------- */

  function applyTheme() {
    const rootStyle = document.documentElement.style;
    PARTS.forEach((p) => {
      if (p.accent) rootStyle.setProperty('--part-' + p.number, p.accent);
      if (p.accentText) rootStyle.setProperty('--part-' + p.number + '-text', p.accentText);
    });
    const theme = CONFIG.theme || {};
    if (theme.background) rootStyle.setProperty('--black', theme.background);
    if (theme.foreground) rootStyle.setProperty('--white', theme.foreground);
  }

  function applyConfig() {
    applyTheme();
    if (BOOK.lang) document.documentElement.lang = BOOK.lang;

    const fills = { title: BOOK.title, wordmark: EDITION.wordmark };
    const langs = CONFIG.languages || [];
    const current = langs.find((l) => l.current) || langs[0];
    if (current) fills.lang = current.code.toUpperCase();
    $$('[data-fill]').forEach((el) => { if (fills[el.dataset.fill]) el.textContent = fills[el.dataset.fill]; });

    langPanel.innerHTML = '<p class="lang-title">Languages</p><ul class="lang-list">' + langs.map((l) =>
      '<li class="lang-item' + (l.current ? ' is-current' : '') + '"' + (l.current ? ' aria-current="true"' : '') + '>' +
      '<span class="lang-code" aria-hidden="true">' + esc(l.code.toUpperCase()) + '</span>' +
      '<span class="lang-body"><span class="lang-name" lang="' + esc(l.code) + '">' + esc(l.name) + '</span>' +
      (l.current ? '<span class="lang-state">You are reading this one</span>' : '') +
      '<span class="lang-note">' + esc(l.note || '') + '</span></span></li>'
    ).join('') + '</ul>';

    $('#site-footer').innerHTML = footerHtml();
  }

  if (SITE) {
    // The page, its header, its footer and its language links come from the build: the browser keeps its own
    // scroll restoration, and nothing of the page is rendered again.
    applyTheme();
    startSite();
  } else {
    try { history.scrollRestoration = 'manual'; } catch (e) { /* older browsers */ }
    applyConfig();
    prepareIndex();
    onRoute();
  }
})();
