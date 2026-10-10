// Replays (home pages and book): a talk with data-video plays in place, and nothing loads before the click.
// MP4 (Blossom) plays in the native player: the browser takes the first source it can read (720p HEVC, else 480p H.264).
// YouTube plays in youtube-nocookie. Without JavaScript the button and the thumbnail stay plain links to the file.
// Markup: book-drafts/site/build_site.py (replay_item), content: book-drafts/site/content.json.
document.querySelectorAll('.rp-item[data-video]').forEach(li => {
  const d = li.dataset, title = li.querySelector('.rp-title');
  const yt = d.video.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  const mp4 = /\.mp4(?:[?#]|$)/i.test(d.video);
  if (!yt && !mp4) return;
  const label = title ? title.textContent : 'Video';
  const play = e => {
    e.preventDefault();
    if (li.classList.contains('rp-playing')) return;
    const box = document.createElement('div');
    box.className = 'rp-embed';
    if (mp4) {
      const v = document.createElement('video');
      v.controls = true; v.playsInline = true; v.preload = 'auto';
      const thumb = li.querySelector('.rp-thumb img');
      if (thumb) v.poster = thumb.src;
      v.setAttribute('aria-label', label);
      [[d.video, d.videoType], [d.videoSd, d.videoSdType]].forEach(([src, type]) => {
        if (!src) return;
        const s = document.createElement('source');
        s.src = src; if (type) s.type = type;
        v.appendChild(s);
      });
      box.appendChild(v);
      li.appendChild(box);
      li.classList.add('rp-playing');
      v.focus();
      v.play().catch(() => {});
    } else {
      const f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + yt[1] + '?autoplay=1&rel=0';
      f.title = label;
      f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true;
      box.appendChild(f);
      li.appendChild(box);
      li.classList.add('rp-playing');
      f.focus();
    }
  };
  li.querySelectorAll('.rp-play, .rp-thumb').forEach(a => a.addEventListener('click', play));
});

// Recap: the after-party video tile plays in place, at the same spot, only after a click
document.querySelectorAll('.rc-video-play').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  const box = a.parentElement, img = a.querySelector('img');
  const v = document.createElement('video');
  v.src = a.href; v.controls = true; v.playsInline = true; v.preload = 'auto';
  if (img) v.poster = img.src;
  v.setAttribute('aria-label', a.textContent.trim());
  a.replaceWith(v);
  box.classList.add('rc-playing');
  v.focus();
  v.play().catch(() => {});
}));
