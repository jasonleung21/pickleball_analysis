/*
 * Video sources behind one small interface, so the charting UI doesn't care
 * where the footage comes from:
 *
 *   getTime() → seconds | null    seek(t)    play()    pause()    paused()
 *   setRate(r)    destroy()
 */
(function (root) {
  'use strict';

  function filePlayer(container, file) {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.src = url;
    v.controls = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.className = 'video-el';
    container.appendChild(v);
    return Promise.resolve({
      kind: 'file',
      label: file.name,
      getTime: () => v.currentTime,
      seek: (t) => { v.currentTime = Math.max(0, t); },
      play: () => v.play().catch(() => {}),
      pause: () => v.pause(),
      paused: () => v.paused,
      setRate: (r) => { v.playbackRate = r; },
      duration: () => v.duration || null,
      destroy: () => { v.pause(); v.remove(); URL.revokeObjectURL(url); },
    });
  }

  /* Accepts a full YouTube URL or a bare 11-character id. Returns { id, start } or null. */
  function parseYouTube(input) {
    const s = String(input || '').trim();
    if (/^[\w-]{11}$/.test(s)) return { id: s, start: 0 };
    let u;
    try { u = new URL(s.startsWith('http') ? s : 'https://' + s); } catch (e) { return null; }
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1, 12);
    else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (u.searchParams.get('v')) id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
        if (m) id = m[1];
      }
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    const t = u.searchParams.get('t') || u.searchParams.get('start') || '0';
    let start = 0;
    const hms = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (hms) start = (+hms[1] || 0) * 3600 + (+hms[2] || 0) * 60 + (+hms[3] || 0);
    return { id, start };
  }

  let ytReady = null;
  function loadYouTubeApi() {
    if (ytReady) return ytReady;
    ytReady = new Promise((resolve, reject) => {
      if (root.YT && root.YT.Player) return resolve(root.YT);
      const timer = setTimeout(() => {
        ytReady = null;
        reject(new Error('YouTube did not load. Check your connection, or open the app from a web address (http://…) rather than as a file.'));
      }, 12000);
      const prev = root.onYouTubeIframeAPIReady;
      root.onYouTubeIframeAPIReady = function () {
        clearTimeout(timer);
        if (typeof prev === 'function') prev();
        resolve(root.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { clearTimeout(timer); ytReady = null; reject(new Error('YouTube could not be reached from this page.')); };
      document.head.appendChild(s);
    });
    return ytReady;
  }

  function youTubePlayer(container, id, start, onLateError) {
    return loadYouTubeApi().then((YT) => new Promise((resolve, reject) => {
      let ready = false;
      const holder = document.createElement('div');
      holder.className = 'video-el';
      container.appendChild(holder);
      let rate = 1;
      const p = new YT.Player(holder, {
        videoId: id,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(start || 0) },
        events: {
          onReady: () => { ready = true; resolve({
            kind: 'youtube',
            label: 'YouTube · ' + id,
            getTime: () => (typeof p.getCurrentTime === 'function' ? p.getCurrentTime() : null),
            seek: (t) => p.seekTo(Math.max(0, t), true),
            play: () => p.playVideo(),
            pause: () => p.pauseVideo(),
            paused: () => p.getPlayerState() !== YT.PlayerState.PLAYING,
            setRate: (r) => { rate = r; p.setPlaybackRate(r); },
            duration: () => p.getDuration() || null,
            destroy: () => { try { p.destroy(); } catch (e) { /* already gone */ } const el = container.querySelector('.video-el'); if (el) el.remove(); },
            rate: () => rate,
          }); },
          onError: (e) => {
            const msgs = {
              2: 'That YouTube link looks wrong.',
              5: 'This video can’t play in an embedded player.',
              100: 'That video was removed or is private.',
              101: 'The owner doesn’t allow this video to be embedded.',
              150: 'The owner doesn’t allow this video to be embedded.',
              153: 'YouTube refused the embed. Open the app from a web address (http://…) rather than as a file.',
            };
            const err = new Error(msgs[e.data] || 'YouTube error ' + e.data);
            if (ready) { if (onLateError) onLateError(err); } else reject(err);
          },
        },
      });
    }));
  }

  const api = { filePlayer, youTubePlayer, parseYouTube };
  root.PBA = root.PBA || {};
  root.PBA.video = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
