// PROOF book. Checklist state (chapter pages + recap page) lives only in this browser (localStorage).
// No server, no tracking.
(function () {
  var KEY = 'proof-book-v2';        // checklist: ids of the actions done
  var READ = 'proof-book-read';     // reading: slugs of the chapters read to the end
  var LAST = 'proof-book-last';     // reading: slug of the last chapter opened (where "Continue reading" resumes)
  var items = Array.prototype.slice.call(document.querySelectorAll('.bk-cl-item'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('.bk-cl-group'));

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function save(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) {}
  }
  function loadRead() {
    try { return JSON.parse(localStorage.getItem(READ)) || []; } catch (e) { return []; }
  }
  function saveRead(slugs) {
    try { localStorage.setItem(READ, JSON.stringify(slugs)); } catch (e) {}
  }
  try { localStorage.removeItem('proof-book-v1'); } catch (e) {}

  // Recap page only: counters per part, progress bar, "all done" banner
  function refresh() {
    if (!groups.length) return;
    var total = items.length, done = 0;
    groups.forEach(function (group) {
      var n = group.querySelectorAll('.bk-cl-item.done').length;
      done += n;
      var count = group.querySelector('.bk-count');
      if (count) count.textContent = n + ' / ' + group.querySelectorAll('.bk-cl-item').length;
      var seg = document.querySelector('.bk-tools-bar .bk-bar .' + group.dataset.block);
      if (seg) seg.style.width = (n / total * 100) + '%';
    });
    var el = document.getElementById('bk-done');
    if (el) el.textContent = done + ' / ' + total;
    var all = document.getElementById('bk-alldone');
    if (all) all.hidden = done !== total;
  }

  // Nav bar (every page): overall progress, one segment per part
  var navp = document.getElementById('bk-navp');
  function refreshNav() {
    if (!navp) return;
    var map = {}, total = parseInt(navp.dataset.total, 10) || 1, done = 0, per = { priv: 0, auto: 0, mono: 0 };
    try { map = JSON.parse(navp.dataset.map); } catch (e) {}
    load().forEach(function (id) {
      var part = map[id.replace(/-\d+$/, '')];
      if (part) { per[part]++; done++; }
    });
    navp.querySelector('.bk-navp-n').textContent = done + ' / ' + total;
    Object.keys(per).forEach(function (part) {
      navp.querySelector('.bk-bar .' + part).style.width = (per[part] / total * 100) + '%';
    });
  }
  refreshNav();

  // Nav bar (every page): chapters read
  var navr = document.getElementById('bk-navr');
  function refreshNavRead() {
    if (!navr) return;
    var slugs = [];
    try { slugs = JSON.parse(navr.dataset.slugs); } catch (e) {}
    var n = loadRead().filter(function (s) { return slugs.indexOf(s) !== -1; }).length;
    navr.querySelector('.bk-navp-n').textContent = n + ' / ' + slugs.length;
    navr.querySelector('.bk-bar i').style.width = (slugs.length ? n / slugs.length * 100 : 0) + '%';
  }
  refreshNavRead();

  var state = load();
  items.forEach(function (item) {
    var box = item.querySelector('input[type="checkbox"]');
    var id = item.dataset.id;
    if (state.indexOf(id) !== -1) { box.checked = true; item.classList.add('done'); }
    box.addEventListener('change', function () {
      item.classList.toggle('done', box.checked);
      // A page only shows part of the checklist: update this id, keep the others
      var ids = load().filter(function (x) { return x !== id; });
      if (box.checked) ids.push(id);
      save(ids);
      refresh();
      refreshNav();
    });
  });
  refresh();

  // Effort filter (recap page): all / 1 (5 min) / 2 (1 hour) / 3 (weekend)
  var filters = Array.prototype.slice.call(document.querySelectorAll('.bk-filter'));
  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.dataset.filter;
      filters.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      items.forEach(function (item) { item.hidden = f !== 'all' && item.dataset.effort !== f; });
      Array.prototype.forEach.call(document.querySelectorAll('.bk-cl-group .bk-cl'), function (list) {
        var empty = !list.querySelector('.bk-cl-item:not([hidden])');
        list.hidden = empty;
        var title = list.previousElementSibling;
        if (title && title.classList.contains('bk-cl-chapter')) title.hidden = empty;
      });
      groups.forEach(function (group) {
        group.hidden = !group.querySelector('.bk-cl-item:not([hidden])');
      });
    });
  });

  var reset = document.getElementById('bk-reset');
  // Two clicks instead of a confirm() dialog: embedded browsers and some mobile browsers block dialogs
  var resetLabel = reset ? reset.textContent : '', resetTimer = null;
  if (reset) reset.addEventListener('click', function () {
    if (!reset.classList.contains('armed')) {
      reset.classList.add('armed');
      reset.textContent = reset.dataset.confirm;
      resetTimer = setTimeout(function () { reset.classList.remove('armed'); reset.textContent = resetLabel; }, 4000);
      return;
    }
    clearTimeout(resetTimer);
    reset.classList.remove('armed');
    reset.textContent = resetLabel;
    items.forEach(function (item) {
      item.classList.remove('done');
      item.querySelector('input[type="checkbox"]').checked = false;
    });
    save([]);
    saveRead([]);
    try { localStorage.removeItem(LAST); } catch (e) {}
    refresh();
    refreshNav();
    refreshNavRead();
  });

  // Reading progress (chapter pages): thin line under the nav; the chapter counts as read at the end of the text
  var line = document.getElementById('bk-read');
  var page = document.querySelector('.bk-page[data-slug]');
  var article = document.querySelector('.bk-article');
  if (line && page && page.dataset.slug && article) {
    var slug = page.dataset.slug, marked = loadRead().indexOf(slug) !== -1, ticking = false;
    try { localStorage.setItem(LAST, slug); } catch (e) {}
    var update = function () {
      ticking = false;
      var end = article.getBoundingClientRect().bottom + window.scrollY - window.innerHeight;
      var p = end <= 0 ? 1 : Math.min(1, Math.max(0, window.scrollY / end));
      line.style.width = (p * 100) + '%';
      if (p >= 1 && !marked) {
        marked = true;
        var slugs = loadRead();
        if (slugs.indexOf(slug) === -1) { slugs.push(slug); saveRead(slugs); }
        refreshNavRead();
      }
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // Cover dashboard: chapters read, actions done (overall and per part)
  var dash = document.getElementById('bk-dash');
  if (dash) {
    var dmap = {}, dtotals = {}, dslugs = [];
    try { dmap = JSON.parse(dash.dataset.map); dtotals = JSON.parse(dash.dataset.totals); dslugs = JSON.parse(dash.dataset.slugs); } catch (e) {}
    var dper = {}, ddone = 0, dtotal = 0;
    Object.keys(dtotals).forEach(function (part) { dper[part] = 0; dtotal += dtotals[part]; });
    load().forEach(function (id) {
      var part = dmap[id.replace(/-\d+$/, '')];
      if (part) { dper[part]++; ddone++; }
    });
    var dread = loadRead().filter(function (s) { return dslugs.indexOf(s) !== -1; }).length;
    dash.querySelector('#bk-dash-read b').textContent = dread;
    dash.querySelector('#bk-dash-read .bk-bar i').style.width = (dslugs.length ? dread / dslugs.length * 100 : 0) + '%';
    dash.querySelector('#bk-dash-done b').textContent = ddone;
    Object.keys(dper).forEach(function (part) {
      dash.querySelector('#bk-dash-done .bk-bar .' + part).style.width = (dtotal ? dper[part] / dtotal * 100 : 0) + '%';
      var row = dash.querySelector('.bk-dash-parts [data-part="' + part + '"]');
      if (!row) return;
      row.querySelector('.bk-dash-c').textContent = dper[part] + ' / ' + dtotals[part];
      row.querySelector('.bk-bar i').style.width = (dtotals[part] ? dper[part] / dtotals[part] * 100 : 0) + '%';
    });
  }

  // Cover: tick the chapters already read, count them, and turn "Start reading" into "Continue reading"
  var readCount = document.getElementById('bk-readcount');
  if (readCount) {
    var read = loadRead(), n = 0;
    var links = Array.prototype.slice.call(document.querySelectorAll('.bk-toc a[data-slug]'));
    links.forEach(function (a) {
      if (read.indexOf(a.dataset.slug) === -1) return;
      a.parentNode.classList.add('read');
      if (a.dataset.count) n++;   // only the numbered chapters are counted
    });
    readCount.textContent = n + ' / ' + readCount.dataset.total + ' ' + readCount.dataset.label;

    // "Start reading" while everything is at zero. Once something has started, "Continue reading" resumes where
    // the reader stopped: the last chapter opened if it is unfinished, otherwise the next unread chapter after it.
    var start = document.getElementById('bk-start'), last = null;
    try { last = localStorage.getItem(LAST); } catch (e) {}
    if (start && (read.length > 0 || last || load().length > 0)) {
      var unread = function (a) { return read.indexOf(a.dataset.slug) === -1; };
      var at = -1;
      links.forEach(function (a, i) { if (a.dataset.slug === last) at = i; });
      var target = null;
      if (at !== -1 && unread(links[at])) target = links[at];
      if (!target) target = links.slice(at + 1).filter(unread)[0] || links.filter(unread)[0] || links[at] || links[0];
      start.href = target.href;
      start.textContent = start.dataset.resume;
    }
  }

  // Cover title typewriter, same behaviour as the home page hero: one word per part, in the part color
  var tw = document.getElementById('bk-tw');
  if (tw && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var words = tw.dataset.words.split('|');
    var colors = ['#00c896', '#8b5cf6', '#f5a623'];
    var wi = 0, ci = words[0].length, del = true;
    var tick = function () {
      var word = words[wi], color = colors[wi % colors.length];
      tw.style.color = color;
      if (!del) {
        ci++;
        if (ci === word.length) del = true;
      } else {
        ci--;
        if (ci === 0) { del = false; wi = (wi + 1) % words.length; }
      }
      tw.innerHTML = word.slice(0, ci) + '<span class="tw-cursor" style="background:' + color + '"></span>';
      setTimeout(tick, (!del || ci < word.length) ? (del ? 40 : 75) : 2200);
    };
    setTimeout(tick, 2200);
  }

  // Phone menu
  var menuBtn = document.getElementById('bk-menu-btn'), menu = document.getElementById('bk-menu');
  if (menuBtn && menu) {
    var setMenu = function (open) { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    menuBtn.addEventListener('click', function () { setMenu(menu.hidden); });
    menu.addEventListener('click', function (e) { if (e.target.tagName === 'A') setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }

  // Offline: the whole book is cached, it must open even when the venue wifi is saturated
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/book/sw.js', { scope: '/book/' }).catch(function () {});
  }
})();
