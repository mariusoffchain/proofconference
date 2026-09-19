// PROOF book. The checklist (chapter 04) keeps its state only in this browser (localStorage).
// No server, no tracking.
(function () {
  var KEY = 'proof-book-v1';
  var items = Array.prototype.slice.call(document.querySelectorAll('.bk-cl-item'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('.bk-cl-group'));

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function save(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) {}
  }

  function refresh() {
    var total = items.length, done = 0;
    groups.forEach(function (group) {
      var n = group.querySelectorAll('.bk-cl-item.done').length;
      done += n;
      var count = group.querySelector('.bk-count');
      if (count) count.textContent = n + ' / ' + group.querySelectorAll('.bk-cl-item').length;
      var seg = document.querySelector('.bk-bar .' + group.dataset.block);
      if (seg) seg.style.width = (n / total * 100) + '%';
    });
    var el = document.getElementById('bk-done');
    if (el) el.textContent = done + ' / ' + total;
    var all = document.getElementById('bk-alldone');
    if (all) all.hidden = done !== total;
  }

  var state = load();
  items.forEach(function (item) {
    var box = item.querySelector('input[type="checkbox"]');
    if (state.indexOf(item.dataset.id) !== -1) { box.checked = true; item.classList.add('done'); }
    box.addEventListener('change', function () {
      item.classList.toggle('done', box.checked);
      save(items.filter(function (i) { return i.classList.contains('done'); })
                .map(function (i) { return i.dataset.id; }));
      refresh();
    });
  });
  refresh();

  // Effort filter on the checklist: all / 1 (5 min) / 2 (1 hour) / 3 (weekend)
  var filters = Array.prototype.slice.call(document.querySelectorAll('.bk-filter'));
  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.dataset.filter;
      filters.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      items.forEach(function (item) { item.hidden = f !== 'all' && item.dataset.effort !== f; });
      groups.forEach(function (group) {
        group.hidden = !group.querySelector('.bk-cl-item:not([hidden])');
      });
    });
  });

  var reset = document.getElementById('bk-reset');
  if (reset) reset.addEventListener('click', function () {
    if (!window.confirm(reset.dataset.confirm)) return;
    items.forEach(function (item) {
      item.classList.remove('done');
      item.querySelector('input[type="checkbox"]').checked = false;
    });
    save([]);
    refresh();
  });

  // Title typewriter, same behaviour as the home page hero: one word per block, in the block color
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

  // Offline: the guide must open even when the venue wifi is saturated
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/book/sw.js', { scope: '/book/' }).catch(function () {});
  }
})();
