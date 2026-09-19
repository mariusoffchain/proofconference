// PROOF book: nothing is stored, nothing is sent. No server, no tracking.
(function () {
  var items = Array.prototype.slice.call(document.querySelectorAll('.bk-item'));
  var blocks = Array.prototype.slice.call(document.querySelectorAll('.bk-block'));

  // The first version of this page kept a checklist in localStorage: clean it up
  try { localStorage.removeItem('proof-book-v1'); } catch (e) {}

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
