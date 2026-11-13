/* Danyel OZ: shared Lyrics button for the song panels (Listen Now, Featured Singles, release shelves).
   Reads the public Song Database tabs:
     release_tracks  which songs (ISRC) are on a release (UPC), in order
     tracks          one row per song, with its published lyrics
   A Lyrics button appears only when the release has at least one song with lyrics that is already out.
   Clicking it swaps the panel's content for the lyrics (with a Back button), so it never opens a new tab.

   Use:  <script src="https://dcvizcayno.github.io/danyeloz-embeds/lyrics.js"></script>
         OZLyrics.attach({ row: songRow, buttonHost: actionsElement, panel: panelElement, theme: 'light' | 'dark' });
   songRow is the Sheet1 row (needs song_upc, or song_isrc for a single). */
(function () {
  'use strict';
  if (window.OZLyrics) return;

  var SHEET_ID = '1WD98RYgWPURqwtczPYEblCOOPFutAIO1jf42oSfbzPw';
  var BASE = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=';
  var LABEL = 'Lyrics', BACK = '← Back', MAX_CHARS = 45000;

  function parseCSV(t) {
    var rows = [], row = [], cur = '', inq = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (inq) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inq = false; else cur += c; }
      else if (c === '"') inq = true; else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    var head = (rows.shift() || []).map(function (h) { return h.trim().toLowerCase(); });
    return rows.map(function (r) { var o = {}; head.forEach(function (h, k) { o[h] = r[k] || ''; }); return o; });
  }
  function get(name) {
    return fetch(BASE + name).then(function (r) { return r.ok ? r.text() : ''; }).then(parseCSV).catch(function () { return []; });
  }
  function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date()); }
  function isrcOf(v) { return String(v || '').replace(/[\s-]/g, '').toUpperCase(); }
  function upcOf(v) { return String(v || '').replace(/\D/g, ''); }

  var data = null;
  function load() {
    if (data) return data;
    data = Promise.all([get('tracks'), get('release_tracks')]).then(function (res) {
      var now = today(), songs = {}, onRelease = {};
      res[0].forEach(function (t) {
        var isrc = isrcOf(t.isrc), text = String(t.lyrics || '').slice(0, MAX_CHARS);
        var out = /^\d{4}-\d{2}-\d{2}$/.test(String(t.first_release).trim()) && String(t.first_release).trim() <= now;
        if (isrc && text.trim() && out) songs[isrc] = { title: String(t.track_title || '').trim(), lyrics: text };
      });
      res[1].forEach(function (r) {
        var u = upcOf(r.upc); if (!u) return;
        (onRelease[u] = onRelease[u] || []).push({ isrc: isrcOf(r.isrc), n: (Number(r.disc) || 1) * 1000 + (Number(r.track_number) || 0),
          title: String(r.track_title || '').trim() });
      });
      return { songs: songs, onRelease: onRelease };
    });
    return data;
  }

  /* The songs with lyrics on this release, in track order. */
  function forRow(d, row) {
    var upc = upcOf(row.song_upc), list = [];
    if (upc && d.onRelease[upc]) {
      d.onRelease[upc].slice().sort(function (a, b) { return a.n - b.n; }).forEach(function (r) {
        var s = d.songs[r.isrc]; if (s) list.push({ title: r.title || s.title, lyrics: s.lyrics, no: r.n % 1000 });
      });
      list.total = d.onRelease[upc].length;
    }
    if (!list.length) {
      var s = d.songs[isrcOf(row.song_isrc || row.song_ISRC)];
      if (s) list.push({ title: row.song_title || s.title, lyrics: s.lyrics });
    }
    return list;
  }

  var styled = false;
  function addStyles() {
    if (styled) return; styled = true;
    var css = '[data-ozl-hide]{display:none!important}' +
      '.ozl-btn{display:inline-flex;align-items:center;gap:7px;background:none;border:1px solid currentColor;padding:8px 13px;cursor:pointer;' +
      'font:500 13px Oswald,"Arial Narrow",sans-serif;letter-spacing:2.5px;text-transform:uppercase;color:inherit}' +
      '.ozl-btn:hover,.ozl-btn:focus-visible{background:#e3122a;border-color:#e3122a;color:#fff;outline:none}' +
      '.ozl-btn svg{width:14px;height:14px;fill:currentColor}' +
      '.ozl-view{font-family:"Open Sans",Arial,sans-serif}' +
      '.ozl-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}' +
      '.ozl-back{background:none;border:0;border-bottom:2px solid #e3122a;padding:0 0 3px;cursor:pointer;font:500 13px Oswald,"Arial Narrow",sans-serif;letter-spacing:2.5px;text-transform:uppercase;color:inherit}' +
      '.ozl-back:hover,.ozl-back:focus-visible{color:#e3122a;outline:none}' +
      '.ozl-kick{font:500 11.5px Oswald,"Arial Narrow",sans-serif;letter-spacing:3px;text-transform:uppercase;color:#fff;background:#e3122a;padding:4px 10px}' +
      '.ozl-title{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:30px;line-height:1.05;letter-spacing:1px;text-transform:uppercase;margin:0 0 12px;overflow-wrap:anywhere}' +
      '.ozl-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}' +
      '.ozl-chip{background:none;border:1px solid currentColor;opacity:.7;padding:5px 10px;cursor:pointer;font:500 12px Oswald,"Arial Narrow",sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:inherit}' +
      '.ozl-chip[aria-pressed="true"]{opacity:1;background:#e3122a;border-color:#e3122a;color:#fff}' +
      '.ozl-text{font-size:15.5px;line-height:1.75}' +
      '.ozl-text p{margin:0 0 16px}' +
      '.ozl-sec{display:block;font:500 11.5px Oswald,"Arial Narrow",sans-serif;letter-spacing:2.5px;text-transform:uppercase;color:#e3122a;margin:4px 0 2px}' +
      '.ozl-dark .ozl-text{color:#e4e4e7}.ozl-light .ozl-text{color:#222}' +
      '.ozl-foot{font-size:12px;opacity:.6;margin:8px 0 0}' +
      '.ozl-steps{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin:4px 0 0}.ozl-step{opacity:1}.ozl-count{margin:-6px 0 14px}' +
      '@media (max-width:480px){.ozl-title{font-size:24px}.ozl-text{font-size:14.5px}}';
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* Lyrics text: a line like [Chorus] becomes a small red label; blank lines split verses. */
  function lyricsBlock(text) {
    var box = el('div', 'ozl-text');
    String(text).replace(/\r\n?/g, '\n').split(/\n\s*\n/).forEach(function (verse) {
      if (!verse.trim()) return;
      var p = el('p'), first = true;
      verse.split('\n').forEach(function (line) {
        var t = line.trim();
        if (/^\[[^\]]{1,40}\]$/.test(t)) { p.appendChild(el('span', 'ozl-sec', t.slice(1, -1))); first = true; return; }
        if (!first) p.appendChild(el('br'));
        p.appendChild(document.createTextNode(line)); first = false;
      });
      box.appendChild(p);
    });
    return box;
  }

  function open(opts, list) {
    var panel = opts.panel, hidden = [];
    var keep = opts.keep || [];
    Array.prototype.forEach.call(panel.children, function (c) { if (keep.indexOf(c) < 0 && !c.hasAttribute('data-ozl-hide')) { hidden.push(c); c.setAttribute('data-ozl-hide', ''); } });
    var view = el('div', 'ozl-view ' + (opts.theme === 'dark' ? 'ozl-dark' : 'ozl-light'));
    view.setAttribute('role', 'region'); view.setAttribute('aria-label', 'Lyrics');
    var top = el('div', 'ozl-top'), back = el('button', 'ozl-back', BACK); back.type = 'button';
    top.appendChild(back); top.appendChild(el('span', 'ozl-kick', LABEL));
    view.appendChild(top);
    var title = el('h3', 'ozl-title'), body = el('div'), steps = el('div', 'ozl-steps');
    var multi = list.length > 1;
    function label(s) { return (multi && s.no ? s.no + '. ' : '') + s.title; }
    function show(i, focus) {
      title.textContent = label(list[i]);
      body.textContent = ''; body.appendChild(lyricsBlock(list[i].lyrics));
      Array.prototype.forEach.call(chips.children, function (c, k) { c.setAttribute('aria-pressed', String(k === i)); });
      steps.textContent = '';
      if (multi) {
        if (i > 0) steps.appendChild(step('← ' + label(list[i - 1]), i - 1));
        if (i < list.length - 1) steps.appendChild(step('Next: ' + label(list[i + 1]) + ' →', i + 1));
      }
      if (focus) { try { title.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {} }
    }
    function step(text, i) { var b = el('button', 'ozl-chip ozl-step', text); b.type = 'button'; b.addEventListener('click', function () { show(i, true); }); return b; }
    var chips = el('div', 'ozl-chips');
    if (multi) {
      list.forEach(function (s, i) { var c = el('button', 'ozl-chip', label(s)); c.type = 'button'; c.addEventListener('click', function () { show(i); }); chips.appendChild(c); });
      view.appendChild(chips);
      if (list.total > list.length) view.appendChild(el('p', 'ozl-foot ozl-count', 'Lyrics for ' + list.length + ' of ' + list.total + ' songs so far.'));
    }
    view.appendChild(title);
    view.appendChild(body);
    view.appendChild(steps);
    view.appendChild(el('p', 'ozl-foot', 'Lyrics by Danyel OZ'));
    function close() {
      document.removeEventListener('keydown', onKey);
      view.remove(); hidden.forEach(function (c) { c.removeAttribute('data-ozl-hide'); });
      if (opts.button && opts.button.isConnected) opts.button.focus();
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    back.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    panel.appendChild(view);
    show(0);
    try { view.scrollIntoView({ block: 'nearest' }); panel.scrollTop = 0; } catch (e) {}
    back.focus();
    return close;
  }

  /* Adds the button (only if this release has lyrics). Returns a promise of true/false. */
  function attach(opts) {
    if (!opts || !opts.row || !opts.buttonHost || !opts.panel) return Promise.resolve(false);
    return load().then(function (d) {
      var list = forRow(d, opts.row);
      if (!list.length || !opts.buttonHost.isConnected) return false;
      addStyles();
      var b = el('button', 'ozl-btn'); b.type = 'button';
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h10v2H4zm14-2.5V13h2v6.5a2.5 2.5 0 1 1-2-2.45z"/></svg>';
      b.appendChild(document.createTextNode(opts.label || LABEL));
      b.setAttribute('aria-label', 'Read the lyrics of ' + (opts.row.song_title || 'this song'));
      opts.button = b;
      b.addEventListener('click', function () { open(opts, list); });
      if (opts.before && opts.before.parentNode === opts.buttonHost) opts.buttonHost.insertBefore(b, opts.before);
      else opts.buttonHost.appendChild(b);
      return true;
    });
  }

  window.OZLyrics = { attach: attach, load: load };
})();
