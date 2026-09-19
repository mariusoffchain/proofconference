// PROOF book: checklist state lives only in this browser (localStorage). No server, no tracking.
(function () {
  var KEY = 'proof-book-v1';
  var items = Array.prototype.slice.call(document.querySelectorAll('.bk-item'));
  var blocks = Array.prototype.slice.call(document.querySelectorAll('.bk-block'));

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function save(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) {}
  }

  function refresh() {
    var total = items.length, done = 0;
    blocks.forEach(function (block) {
      var list = block.querySelectorAll('.bk-item');
      var n = block.querySelectorAll('.bk-item.done').length;
      done += n;
      var count = block.querySelector('.bk-count');
      if (count) count.textContent = n + ' / ' + list.length;
      var seg = document.querySelector('.bk-bar .' + block.dataset.block);
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
      var ids = items.filter(function (i) { return i.classList.contains('done'); })
                     .map(function (i) { return i.dataset.id; });
      save(ids);
      refresh();
    });
  });
  refresh();

  // Effort filter: all / 1 (5 min) / 2 (1 hour) / 3 (weekend)
  var filters = Array.prototype.slice.call(document.querySelectorAll('.bk-filter'));
  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.dataset.filter;
      filters.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      items.forEach(function (item) { item.hidden = f !== 'all' && item.dataset.effort !== f; });
      blocks.forEach(function (block) {
        block.hidden = !block.querySelector('.bk-item:not([hidden])');
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

  // Offline: the guide must open even when the venue wifi is saturated
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/book/sw.js', { scope: '/book/' }).catch(function () {});
  }
})();
