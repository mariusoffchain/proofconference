// Keep the current site open when following another domain or subdomain.
(() => {
  function update(link) {
    if (!link.matches('a[href]')) return;
    try {
      const url = new URL(link.getAttribute('href'), document.baseURI);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== location.hostname) {
        link.target = '_blank';
        link.relList.add('noopener');
      }
    } catch { /* Leave non-URL links untouched. */ }
  }
  function scan(root) {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) update(root);
    root.querySelectorAll('a[href]').forEach(update);
  }
  scan(document);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') update(record.target);
      else record.addedNodes.forEach(scan);
    }
  }).observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['href']});
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (link) update(link);
  }, true);
})();
