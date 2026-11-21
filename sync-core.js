/* Danyel OZ sync core: shared by sync.html (catalogue) and sync-one-sheet.html.
   Load with <script src="https://dcvizcayno.github.io/danyeloz-embeds/sync-core.js"></script>, then use window.OZSync.
   Reads the public tabs `tracks`, `Sheet1` and `sync_settings` by header name. Each tab is used only if its header row
   has the columns it needs (gviz returns Sheet1 for a missing tab). Sheet text goes to the page only as text
   (OZSync.el sets textContent), and every href/src goes through OZSync.safeUrl. */
(function () {
  var SHEET_ID = '1WD98RYgWPURqwtczPYEblCOOPFutAIO1jf42oSfbzPw';
  var BASE = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv';
  var TIME_ZONE = 'Asia/Singapore';

  // Same lists as apps-script/Sync.gs (SY_MOODS, SY_GENRES, SY_VOCALS, SY_KEYS). Change both together.
  var MOODS = ['Happy', 'Uplifting', 'Hopeful', 'Euphoric', 'Empowering', 'Romantic', 'Sexy', 'Smooth', 'Laid Back',
    'Dreamy', 'Peaceful', 'Sentimental', 'Nostalgic', 'Sad', 'Dark', 'Mysterious', 'Suspense', 'Restless', 'Epic', 'Quirky'];
  var GENRES = ['Pop', 'Alt-Pop', 'Indie Pop', 'R&B', 'Alternative R&B', 'Soul', 'Acoustic', 'Singer-Songwriter',
    'Folk Pop', 'Latin Pop', 'Electropop', 'Ballad'];
  var VOCALS = ['Solo vocal', 'Duet', 'Instrumental only', 'Mixed'];
  var KEYS = ['C major', 'C minor', 'C# major', 'C# minor', 'D major', 'D minor', 'Eb major', 'Eb minor', 'E major',
    'E minor', 'F major', 'F minor', 'F# major', 'F# minor', 'G major', 'G minor', 'Ab major', 'Ab minor', 'A major',
    'A minor', 'Bb major', 'Bb minor', 'B major', 'B minor'];
  var BADGES = [['instrumental', 'Instrumental'], ['clean', 'Clean'], ['stems', 'Stems'], ['cut60', '60 s'], ['cut30', '30 s']];
  var TEMPOS = ['Any', 'Slow', 'Medium', 'Fast'];

  var DEFAULTS = { rights_holder: 'Danyel OZ, LLC', rights_line: '', one_stop: 'TRUE', pro_name: '',
    contact_email: 'daniel.vizkaino@gmail.com', contact_url: '', turnaround: '3 business days', process_note: '' };

  var LINK_HOSTS = ['open.spotify.com', 'music.apple.com', '*.bandcamp.com', 'youtube.com', 'www.youtube.com',
    'music.youtube.com', 'www.danyeloz.info', 'dcvizcayno.github.io'];
  var IMAGE_HOSTS = ['drive.google.com', 'lh3.googleusercontent.com', 'f4.bcbits.com', 'is1-ssl.mzstatic.com',
    'is2-ssl.mzstatic.com', 'is3-ssl.mzstatic.com', 'is4-ssl.mzstatic.com', 'is5-ssl.mzstatic.com', 'i.scdn.co'];
  var CONTACT_HOSTS = ['www.danyeloz.info', 'docs.google.com', 'forms.gle', 'www.cognitoforms.com'];
  var EMAIL_RE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  var NEED = { tracks: ['isrc', 'sync_bpm'], Sheet1: ['song_upc'], sync_settings: ['rights_holder', 'contact_email'] };

  /* ---------- text and CSV ---------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function str(v) { return String(v == null ? '' : v).trim(); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim(); }
  function parseCsv(t) {
    t = String(t || '');
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
    return { head: head, rows: rows.filter(function (r) { return r.some(function (v) { return v.trim(); }); }).map(function (r) {
      var o = {}; head.forEach(function (h, k) { o[h] = (r[k] || '').trim(); }); return o; }) };
  }
  function hasHeads(table, heads) {
    return !!(table && table.head) && heads.every(function (h) { return table.head.indexOf(h) >= 0; });
  }
  function tabUrl(name) { return name === 'Sheet1' ? BASE + '&gid=0' : BASE + '&sheet=' + encodeURIComponent(name); }
  // Resolves to {head, rows, ok}. ok is false (and rows empty) when the fetch fails or the header check fails.
  function fetchTab(name, heads) {
    heads = heads || NEED[name] || [];
    var empty = { head: [], rows: [], ok: false };
    return fetch(tabUrl(name)).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      var tab = parseCsv(t);
      return hasHeads(tab, heads) && heads.length ? { head: tab.head, rows: tab.rows, ok: true } : empty;
    }).catch(function () { return empty; });
  }

  /* ---------- values ---------- */
  function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date()); }
  function isoDate(v) { var m = str(v).match(/^\d{4}-\d{2}-\d{2}$/); return m ? m[0] : ''; }
  function released(row, now) { var d = isoDate(row && row.first_release); return !!d && d <= (now || today()); }
  function flag(v) { return /^(true|yes|1|x)$/i.test(str(v)); }
  function inList(v, list) { v = str(v); return list.indexOf(v) >= 0 ? v : ''; }
  function moodList(v) {
    var out = [];
    str(v).split(',').forEach(function (m) { m = inList(m, MOODS); if (m && out.indexOf(m) < 0 && out.length < 3) out.push(m); });
    return out;
  }
  function bpmOf(v) { v = str(v); if (!/^\d{2,3}$/.test(v)) return null; var n = Number(v); return n >= 40 && n <= 220 ? n : null; }
  function tempoOf(bpm) { return bpm == null ? '' : bpm < 90 ? 'Slow' : bpm <= 120 ? 'Medium' : 'Fast'; }
  function digits(v) { return str(v).replace(/\D/g, ''); }
  function isrcOf(v) { return str(v).replace(/[\s-]/g, '').toUpperCase(); }

  /* ---------- links ---------- */
  function hostOk(host, list) {
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (h.indexOf('*.') === 0) {
        var suffix = h.slice(1), label = host.slice(0, host.length - suffix.length);
        if (host.length > suffix.length && host.slice(-suffix.length) === suffix && /^[a-z0-9-]+$/.test(label)) return true;
      } else if (host === h) return true;
    }
    return false;
  }
  // The one gate for every href and src: https, no credentials or port, hostname in the list. Returns '' otherwise.
  function safeUrl(u, list) {
    var p;
    try { p = new URL(String(u == null ? '' : u)); } catch (e) { return ''; }
    if (p.protocol !== 'https:' || p.username || p.password || p.port) return '';
    if (!hostOk(p.hostname.toLowerCase(), list || LINK_HOSTS)) return '';
    return p.href;
  }
  function safeLink(u) { return safeUrl(u, LINK_HOSTS); }
  // Cover rule from albums.html imageUrl (Drive file links become thumbnails), limited to the image hosts.
  function coverUrl(u) {
    var ok = safeUrl(str(u), IMAGE_HOSTS); if (!ok) return '';
    var p = new URL(ok);
    if (p.hostname !== 'drive.google.com') return ok;
    var m = p.pathname.match(/\/d\/([\w-]+)/) || ok.match(/[?&]id=([\w-]+)/);
    return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1000' : '';
  }
  function bandcampPage(code) {
    var m = String(code || '').match(/href\s*=\s*["'](https:\/\/[a-z0-9-]+\.bandcamp\.com\/[^"'\s<>]+)["']/i);
    return m ? safeLink(m[1]) : (/^https:\/\//i.test(str(code)) ? safeLink(str(code)) : '');
  }
  function validEmail(e) { e = str(e); return e.length <= 254 && EMAIL_RE.test(e); }
  function contactUrl(u) {
    var ok = safeUrl(str(u), CONTACT_HOSTS); if (!ok) return '';
    var p = new URL(ok);
    // Dot segments are refused on the raw text (new URL would quietly resolve them), same rule as Sync.gs syContactUrl_.
    var raw = str(u).replace(/[\t\n\r]/g, '').replace(/\\/g, '/').replace(/^[a-z]+:\/\/[^\/?#]*/i, '').split(/[?#]/)[0];
    if (/%2e/i.test(raw) || /(^|\/)\.\.?(\/|$)/.test(raw)) return '';
    return p.hostname === 'docs.google.com' && p.pathname.indexOf('/forms/') !== 0 ? '' : ok;
  }
  // Mailto for a valid email with only an encoded subject. '' when the email is not valid.
  function mailtoHref(s, title) {
    var email = str((s || {}).contact_email);
    if (!validEmail(email)) return '';
    return 'mailto:' + email + '?subject=' + encodeURIComponent('License request: ' + str(title));
  }
  // Request link: contact_url (D-10 hosts) first, else the mailto above.
  function contactHref(s, title) {
    s = s || {};
    return contactUrl(s.contact_url) || mailtoHref(s, title);
  }

  /* ---------- settings and wording ---------- */
  // tab: result of fetchTab('sync_settings'). Missing or Sheet1-shaped tab gives the defaults. First data row only.
  function settings(tab) {
    var row = hasHeads(tab, NEED.sync_settings) && tab.rows.length ? tab.rows[0] : null, s = {};
    Object.keys(DEFAULTS).forEach(function (k) { s[k] = row ? str(row[k]) : DEFAULTS[k]; });
    if (!s.rights_holder) s.rights_holder = DEFAULTS.rights_holder;
    if (!s.turnaround) s.turnaround = DEFAULTS.turnaround;
    if (!validEmail(s.contact_email)) s.contact_email = DEFAULTS.contact_email;
    s.contact_url = contactUrl(s.contact_url);
    s.one_stop = flag(s.one_stop);
    s.from_sheet = !!row;
    return s;
  }
  function rightsText(s) {
    s = s || settings(null);
    var holder = str(s.rights_holder) || DEFAULTS.rights_holder, line = str(s.rights_line), pro = str(s.pro_name);
    var oneStop = typeof s.one_stop === 'boolean' ? s.one_stop : flag(s.one_stop);
    var main = line || (oneStop
      ? 'One-stop clearance. ' + holder + ' owns 100% of the master recordings and 100% of the publishing, so one agreement clears both sides.'
      : holder + ' owns 100% of the master recordings and 100% of the publishing.');
    return main + ' ' + (pro ? 'Songs are registered with ' + pro + '.' : 'Songs are registered with a performing rights organization.');
  }
  function processText(s) {
    s = s || settings(null);
    var t = 'To license a song, send a request with the song, your project, the media, the territory and the term. ' +
      'You get a quote within ' + (str(s.turnaround) || DEFAULTS.turnaround) + '. ' +
      'We sign a simple license, and the files are delivered after signing: WAV plus instrumental, clean, stems or cutdowns where available.';
    var note = str(s.process_note);
    return note ? t + ' ' + note : t;
  }

  /* ---------- songs ---------- */
  function song(t, art, now) {
    art = art || {};
    var s = {
      isrc: isrcOf(t.isrc), title: str(t.track_title), artist: str(t.artist) || 'Danyel OZ', duration: str(t.duration),
      explicit: flag(t.explicit), language: str(t.language), release: isoDate(t.first_release), released: released(t, now),
      bpm: bpmOf(t.sync_bpm), key: inList(t.sync_key, KEYS), moods: moodList(t.sync_moods),
      genre: inList(t.sync_genre, GENRES), genre2: inList(t.sync_genre_2, GENRES), vocal: inList(t.sync_vocal, VOCALS),
      writers: str(t.sync_writers), producers: str(t.sync_producers),
      instrumental: flag(t.sync_instrumental), clean: flag(t.sync_clean), stems: flag(t.sync_stems),
      cut60: flag(t.sync_cut60), cut30: flag(t.sync_cut30), featured: flag(t.sync_featured),
      cover: coverUrl(art.song_arts),
      links: { spotify: safeLink(art.spotify_link), apple: safeLink(art.appl_music_link),
        youtube: safeLink(art.yt_video_link), bandcamp: bandcampPage(art.bandcamp_embed) }
    };
    if (s.genre2 === s.genre) s.genre2 = '';
    s.tempo = tempoOf(s.bpm);
    s.listen = s.links.spotify || s.links.apple || s.links.youtube || s.links.bandcamp || '';
    s.badges = BADGES.filter(function (b) { return s[b[0]]; }).map(function (b) { return b[1]; });
    s.complete = complete(s);
    return s;
  }
  function complete(s) { return !!(s.bpm != null && s.key && s.moods.length && s.genre && s.vocal && s.writers); }
  function newest(a, b) { return a.release < b.release ? 1 : a.release > b.release ? -1 : a.title.localeCompare(b.title); }
  // Released songs from `tracks`, joined to Sheet1 by first_upc = song_upc (else ISRC = song_isrc), newest first.
  function songs(tracksTab, sheet1Tab, now) {
    if (!hasHeads(tracksTab, NEED.tracks)) return [];
    var byUpc = {}, byIsrc = {};
    (hasHeads(sheet1Tab, NEED.Sheet1) ? sheet1Tab.rows : []).forEach(function (r) {
      var u = digits(r.song_upc), i = isrcOf(r.song_isrc);
      if (u && !byUpc[u]) byUpc[u] = r;
      if (i && !byIsrc[i]) byIsrc[i] = r;
    });
    now = now || today();
    return tracksTab.rows.filter(function (t) { return str(t.track_title) && released(t, now); }).map(function (t) {
      return song(t, byUpc[digits(t.first_upc)] || byIsrc[isrcOf(t.isrc)], now);
    }).sort(newest);
  }
  // f: {q, mood, genre, vocal, tempo, key, language, has: ['instrumental', ...]}. Unknown list values are ignored.
  function filter(list, f) {
    f = f || {};
    var q = norm(String(f.q || '').slice(0, 100)), mood = inList(f.mood, MOODS), genre = inList(f.genre, GENRES),
      vocal = inList(f.vocal, VOCALS), key = inList(f.key, KEYS), tempo = inList(f.tempo, TEMPOS), lang = norm(f.language),
      has = (f.has || []).filter(function (h) { return BADGES.some(function (b) { return b[0] === h; }); });
    return list.filter(function (s) {
      if (q && norm([s.title, s.writers, s.producers, s.genre, s.genre2, s.vocal, s.key, s.moods.join(' ')].join(' ')).indexOf(q) < 0) return false;
      if (mood && s.moods.indexOf(mood) < 0) return false;
      if (genre && s.genre !== genre && s.genre2 !== genre) return false;
      if (vocal && s.vocal !== vocal) return false;
      if (key && s.key !== key) return false;
      if (tempo && tempo !== 'Any' && s.tempo !== tempo) return false;
      if (lang && norm(s.language) !== lang) return false;
      return has.every(function (h) { return s[h]; });
    });
  }
  // Released featured songs, newest first, max 10; under 8, top up with the newest released complete songs.
  function pickOneSheet(list) {
    var rel = list.filter(function (s) { return s.released; }).slice().sort(newest);
    var out = rel.filter(function (s) { return s.featured; }).slice(0, 10);
    rel.forEach(function (s) { if (out.length < 8 && s.complete && out.indexOf(s) < 0) out.push(s); });
    return out;
  }
  // Fetches the three tabs. ok is false when `tracks` lacks the sync columns (show the fallback message).
  function load() {
    return Promise.all([fetchTab('tracks'), fetchTab('Sheet1'), fetchTab('sync_settings')]).then(function (r) {
      return { ok: r[0].ok, songs: songs(r[0], r[1]), settings: settings(r[2]) };
    });
  }

  /* ---------- request panel and one-sheet (shared by both pages; text-only DOM) ---------- */
  // Google Sites shows embeds in a sandboxed frame: mailto and top navigation do nothing there, links can only open
  // a new tab. So "Request a license" opens an in-page panel, and the one-sheet can be drawn inside the catalogue.
  var CATALOGUE_URL = 'https://dcvizcayno.github.io/danyeloz-embeds/sync.html';
  var ONE_SHEET_URL = 'https://dcvizcayno.github.io/danyeloz-embeds/sync-one-sheet.html';
  var GENERAL_SUBJECT = 'Danyel OZ catalogue';
  var INCLUDE = ['The song', 'Your project (title and a short description)', 'The media (film, TV, ad, game, online video)',
    'The territory', 'The term', 'Your timeline'];
  var OS_DESC = 'Singer-songwriter from Manila · Alt-pop, R&B, acoustic · English, Spanish, French';
  var OS_BIO = 'Danyel OZ is an independent singer-songwriter from Manila who writes and releases alt-pop, R&B and acoustic songs. ' +
    'Most songs are in English, with some in Spanish and French. A new song comes out about every two weeks.';
  var OS_FALLBACK = 'The song list is not available right now. Email for the current catalogue.';
  var CSS = [
    '.ozr-back{position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(10,5,6,.55);z-index:2147483000}',
    '.ozr{position:absolute;z-index:2147483001;left:50%;transform:translateX(-50%);width:min(560px,calc(100% - 24px));background:#fff;color:#111;' +
      'border-top:4px solid #e3122a;box-shadow:0 24px 60px -20px rgba(0,0,0,.6);padding:22px 22px 18px;font-family:"Open Sans",Arial,sans-serif;' +
      'font-size:15px;line-height:1.55;text-align:left;box-sizing:border-box;overflow-wrap:anywhere}',
    '.ozr *{box-sizing:border-box}',
    '.ozr-h{margin:0 0 10px;font-family:Anton,Impact,sans-serif;font-weight:400;font-size:28px;line-height:1.05;letter-spacing:.5px;text-transform:uppercase;outline:none}',
    '.ozr p{margin:0 0 10px}',
    '.ozr-song{font-weight:600}',
    '.ozr-fbox{margin:6px 0 18px;padding:0 0 16px;border-bottom:1px solid #ece7e7}',
    '.ozr-fh{margin:0 0 10px;font-family:Oswald,"Arial Narrow",sans-serif;font-weight:500;font-size:14px;letter-spacing:2.5px;text-transform:uppercase}',
    '.ozr-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 8px}',
    '.ozr-mail{display:inline-block;font-weight:600;font-size:17px;padding:6px 10px;background:#faf6f6;border:1px solid #ece7e7;user-select:all;-webkit-user-select:all}',
    '.ozr-status{min-height:1.4em;font-size:13px;color:#b0101f}',
    '.ozr ul{margin:4px 0 12px;padding-left:20px}',
    '.ozr-acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}',
    '.ozr-b{display:inline-block;padding:10px 14px;font-family:Oswald,"Arial Narrow",sans-serif;font-size:12px;font-weight:500;letter-spacing:2.5px;' +
      'text-transform:uppercase;border:1px solid #111;background:#fff;color:#111;text-decoration:none;cursor:pointer;border-radius:0}',
    '.ozr-b.solid{background:#e3122a;border-color:#e3122a;color:#fff}',
    '.ozr-b:hover,.ozr-b:focus-visible{background:#111;border-color:#111;color:#fff;outline:2px solid #e3122a;outline-offset:2px}',
    '#os{--red:#e3122a;--deep:#b0101f;font-family:"Open Sans",Arial,sans-serif;color:#111;max-width:1040px;margin:0 auto}',
    '#os *{box-sizing:border-box}',
    '#os a{color:inherit}',
    '#os .os-top{background:#0a0506;color:#fff;padding:32px 32px 26px;border-bottom:4px solid var(--red)}',
    '#os .os-name{margin:0;font-family:Anton,Impact,sans-serif;font-weight:400;font-size:60px;line-height:.95;letter-spacing:1px;text-transform:uppercase}',
    '#os .os-desc{margin:10px 0 0;font-family:Oswald,"Arial Narrow",sans-serif;font-size:15px;font-weight:400;letter-spacing:2.5px;text-transform:uppercase;color:#ffe8ea}',
    '#os .os-body{padding:22px 28px 8px}',
    '#os .os-rights{margin:0 0 14px;padding:12px 16px;border-left:4px solid var(--red);background:#faf6f6;font-size:15px;line-height:1.55;font-weight:600}',
    '#os .os-contact{margin:0 0 14px;font-size:14px;line-height:1.6}',
    '#os .os-contact b{font-family:Oswald,"Arial Narrow",sans-serif;font-weight:500;letter-spacing:2px;text-transform:uppercase;font-size:12px;color:var(--deep);margin-right:6px}',
    '#os .os-contact a,#os .os-contact span{overflow-wrap:anywhere}',
    '#os .os-req{margin-left:6px;padding:3px 9px;font-family:Oswald,"Arial Narrow",sans-serif;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;' +
      'border:1px solid #111;background:#fff;color:#111;cursor:pointer;border-radius:0}',
    '#os .os-req:hover,#os .os-req:focus-visible{background:var(--red);border-color:var(--red);color:#fff;outline:none}',
    '#os .os-bio{margin:0 0 18px;font-size:14px;line-height:1.65;color:#333;max-width:760px}',
    '#os .os-h{margin:0 0 8px;font-family:Oswald,"Arial Narrow",sans-serif;font-weight:500;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:var(--deep)}',
    '#os .os-table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.35}',
    '#os .os-table th{text-align:left;font-family:Oswald,"Arial Narrow",sans-serif;font-weight:500;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;border-bottom:2px solid #111;padding:6px 6px}',
    '#os .os-table td{border-bottom:1px solid #ece7e7;padding:7px 6px;vertical-align:top;overflow-wrap:anywhere}',
    '#os .os-table td.t{font-weight:600}',
    '#os .os-table .sm{display:block;font-size:11px;color:#666}',
    '#os .os-table a{text-decoration:none;border-bottom:1px solid var(--red)}',
    '#os .os-msg{font-size:15px;color:#555;padding:16px 0}',
    '#os .os-foot{margin:16px 0 0;padding:12px 0 0;border-top:1px solid #ece7e7;font-size:13px;line-height:1.55;color:#333}',
    '#os .os-hint{padding:0 28px 24px;font-size:12px;color:#777}',
    '@media screen and (max-width:680px){',
    '#os .os-top{padding:24px 18px 20px}#os .os-name{font-size:42px}#os .os-body{padding:18px 14px 6px}#os .os-hint{padding:0 14px 18px}',
    '#os .os-table,#os .os-table tbody,#os .os-table tr,#os .os-table td{display:block;width:100%}',
    '#os .os-table thead{display:none}',
    '#os .os-table tr{border-bottom:1px solid #ddd;padding:8px 0}',
    '#os .os-table td{border:0;padding:2px 0}',
    '#os .os-table td.t{font-size:15px}',
    '#os .os-table td[data-l]:not(.t)::before{content:attr(data-l) ": ";font-family:Oswald,"Arial Narrow",sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--deep)}',
    '#os .os-table .sm{display:inline;margin-left:6px}',
    '}',
    '@media print{',
    '.ozr,.ozr-back,.os-screen{display:none!important}',
    '#os{max-width:none;color:#000}',
    '#os *{color:#000!important;background:transparent!important;box-shadow:none!important}',
    '#os .os-top{padding:0 0 6pt;border-bottom:1.5pt solid #000}',
    '#os .os-name{font-size:26pt}',
    '#os .os-desc{margin-top:4pt;font-size:9pt;letter-spacing:1.5pt}',
    '#os .os-body{padding:8pt 0 0}',
    '#os .os-rights{margin:0 0 7pt;padding:0 0 0 7pt;border-left:2pt solid #000;font-size:9.5pt;line-height:1.4}',
    '#os .os-contact{margin:0 0 6pt;font-size:9pt;line-height:1.45}',
    '#os .os-contact b{font-size:8pt}',
    '#os .os-bio{margin:0 0 8pt;font-size:9pt;line-height:1.45;max-width:none}',
    '#os .os-h{font-size:8.5pt;margin-bottom:3pt}',
    '#os .os-table{font-size:8pt;line-height:1.25}',
    '#os .os-table th{font-size:7pt;padding:2pt 3pt;border-bottom:1pt solid #000}',
    '#os .os-table td{padding:3pt 3pt;border-bottom:.5pt solid #999}',
    '#os .os-table td.t{width:30%}',
    '#os .os-table .sm{font-size:7pt}',
    '#os .os-table a{border-bottom:0;text-decoration:underline}',
    '#os .os-table tr{break-inside:avoid}',
    '#os .os-foot{margin-top:7pt;padding-top:5pt;border-top:.5pt solid #000;font-size:8.5pt;line-height:1.4}',
    '#os .os-hint{display:none}',
    '}'
  ].join('\n');

  function ensureStyle() {
    if (document.getElementById('ozsync-style')) return;
    var s = document.createElement('style');
    s.id = 'ozsync-style';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  // True only when this page is the top window (not framed). A cross-origin parent can throw: treat that as framed.
  function isTop() { try { return window.top === window; } catch (e) { return false; } }
  // New-tab link through the URL gates. Returns a span when href is empty.
  function newTabLink(href, cls, text) {
    if (!href) return el('span', cls, text);
    var a = el('a', cls, text);
    a.setAttribute('href', href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    return a;
  }
  function selectText(node) {
    var sel = window.getSelection && window.getSelection();
    if (!sel || !document.createRange) return;
    var r = document.createRange();
    r.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // An embed without allow="clipboard-write" blocks writeText (and Chrome logs a violation), so ask the policy first.
  function clipboardAllowed() {
    try {
      var pp = document.permissionsPolicy || document.featurePolicy;
      return !pp || !pp.allowsFeature || pp.allowsFeature('clipboard-write');
    } catch (e) { return true; }
  }
  var panelSeq = 0, openPanel = null;
  // Keyboard stops kept inside the open panel. The form's honeypot input has tabindex -1 and stays out.
  var TAB_STOPS = 'a[href], button, input:not([tabindex="-1"]), select, textarea';
  // True when a form field in the panel holds something the visitor entered (the prefilled song does not count).
  function typed(box, songTitle) {
    return Array.prototype.slice.call(box.querySelectorAll('input:not([tabindex="-1"]), select, textarea')).some(function (n) {
      var v = str(n.value);
      return n.name === 'songs' ? v !== str(songTitle) : v !== '';
    });
  }
  // Builds the request panel (not attached). songTitle '' means a general catalogue request.
  function requestPanel(s, songTitle) {
    s = s || settings(null);
    var email = validEmail(s.contact_email) ? str(s.contact_email) : DEFAULTS.contact_email;
    var song = str(songTitle), id = 'ozr-title-' + (++panelSeq);
    var box = el('div', 'ozr');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', id);
    var h = el('h2', 'ozr-h', 'Request a license');
    h.id = id; h.tabIndex = -1;
    box.appendChild(h);
    if (song) box.appendChild(el('p', 'ozr-song', 'Song: ' + song));
    // With forms-core.js loaded (sync.html), the inline request form comes first and email becomes the fallback row.
    var Forms = window.OZForms && typeof window.OZForms.render === 'function' ? window.OZForms : null;
    var fbox = Forms ? el('div', 'ozr-fbox') : null;
    if (fbox) { fbox.appendChild(el('h3', 'ozr-fh', 'Sync license request')); box.appendChild(fbox); }
    var intro = el('p', null, fbox ? 'Prefer email? Send your request to:' : 'Send your request by email to:');
    box.appendChild(intro);
    var row = el('div', 'ozr-row'), mail = el('span', 'ozr-mail', email), copy = el('button', 'ozr-b ozr-copy', 'Copy email');
    copy.type = 'button';
    row.appendChild(mail); row.appendChild(copy);
    box.appendChild(row);
    var status = el('p', 'ozr-status');
    status.setAttribute('aria-live', 'polite');
    box.appendChild(status);
    copy.addEventListener('click', function () {
      function manual() { selectText(mail); status.textContent = 'Press Ctrl+C (or Cmd+C) to copy.'; }
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText || !clipboardAllowed()) { manual(); return; }
        navigator.clipboard.writeText(email).then(function () { status.textContent = 'Email copied.'; }, manual);
      } catch (e) { manual(); }
    });
    var inc = el('p', null, 'Include in your request:');
    box.appendChild(inc);
    var ul = el('ul');
    INCLUDE.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    box.appendChild(ul);
    var turn = str(s.turnaround) || DEFAULTS.turnaround;
    box.appendChild(el('p', 'ozr-turn', 'You get a quote within ' + turn + '.'));
    if (fbox) {
      // The form asks for what the checklist lists. Missing or invalid forms config: back to today's email-only panel.
      inc.hidden = true; ul.hidden = true;
      box.ozrForm = Forms.render(fbox, 'sync', { prefill: { songs: song }, turnaround: turn, onUnavailable: function () {
        if (fbox.parentNode) fbox.parentNode.removeChild(fbox);
        intro.textContent = 'Send your request by email to:';
        inc.hidden = false; ul.hidden = false;
        box.ozrForm = null;
        if (box.ozrPlace) box.ozrPlace();
      } });
    }
    var acts = el('div', 'ozr-acts'), form = contactUrl(s.contact_url);
    if (form) acts.appendChild(newTabLink(form, 'ozr-b solid ozr-form', 'Fill out the request form'));
    var mt = mailtoHref({ contact_email: email }, song || GENERAL_SUBJECT);
    if (mt) acts.appendChild(newTabLink(mt, form ? 'ozr-b ozr-mailto' : 'ozr-b solid ozr-mailto', 'Open in your email app'));
    var close = el('button', 'ozr-b ozr-close', 'Close');
    close.type = 'button';
    acts.appendChild(close);
    box.appendChild(acts);
    return box;
  }
  // Opens the panel next to `opener` (the clicked button). Escape, Close or the backdrop (unless a field has typed text)
  // close it; focus returns to opener.
  function openRequest(s, songTitle, opener) {
    if (openPanel) openPanel.close(true);
    ensureStyle();
    var back = el('div', 'ozr-back'), box = requestPanel(s, songTitle);
    var prev = opener || document.activeElement, de = document.documentElement;
    var docH = Math.max(de.scrollHeight, document.body.scrollHeight);
    document.body.appendChild(back);
    document.body.appendChild(box);
    // Place it beside the opener: in a tall, non-scrolling embed the viewport middle can be far from the reader.
    var y = window.pageYOffset || 0, vh0 = window.innerHeight, mid = y + (vh0 || 0) / 2;
    if (opener && opener.getBoundingClientRect) { var r = opener.getBoundingClientRect(); mid = y + r.top + r.height / 2; }
    function place() {
      var h = box.offsetHeight, vh = vh0 || h, top = mid - h / 2;
      if (h + 24 <= vh) top = Math.min(Math.max(top, y + 12), y + vh - h - 12);
      top = Math.max(Math.min(top, docH - h - 12), 12);
      box.style.top = Math.round(top) + 'px';
    }
    place();
    // Without a forms config the panel shrinks to the email-only one: place it again so it sits where it does today.
    box.ozrPlace = place;
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); api.close(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.slice.call(box.querySelectorAll(TAB_STOPS)).filter(function (n) { return !n.disabled && n.offsetParent !== null; }),
        a = document.activeElement, i = f.indexOf(a);
      if (!f.length) return;
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    }
    var api = { node: box, close: function (quiet) {
      if (openPanel !== api) return;
      openPanel = null;
      document.removeEventListener('keydown', onKey, true);
      if (box.ozrForm) { box.ozrForm.destroy(); box.ozrForm = null; }
      [back, box].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      if (!quiet && prev && prev.focus && de.contains(prev)) prev.focus();
    } };
    box.querySelector('.ozr-close').addEventListener('click', function () { api.close(); });
    // A stray click beside the panel must not throw away a half-filled form; Close and Escape still close it.
    back.addEventListener('click', function () { if (!typed(box, songTitle)) api.close(); });
    document.addEventListener('keydown', onKey, true);
    openPanel = api;
    box.querySelector('.ozr-h').focus();
    return api;
  }

  function osCell(label, text, cls, small) {
    var td = el('td', cls || '', text);
    td.setAttribute('data-l', label);
    if (small) td.appendChild(el('span', 'sm', small));
    return td;
  }
  function osTable(rows) {
    var tb = el('table', 'os-table'), head = el('thead'), hr = el('tr'), body = el('tbody');
    ['Title', 'Time', 'Mood', 'Genre', 'BPM', 'Key', 'Vocal', 'Explicit', 'Available', 'Listen'].forEach(function (h) { hr.appendChild(el('th', '', h)); });
    head.appendChild(hr); tb.appendChild(head); tb.appendChild(body);
    rows.forEach(function (s) {
      var tr = el('tr');
      tr.appendChild(osCell('Title', s.title, 't'));
      tr.appendChild(osCell('Time', s.duration));
      tr.appendChild(osCell('Mood', s.moods.slice(0, 2).join(', ')));
      tr.appendChild(osCell('Genre', s.genre + (s.genre2 ? ' / ' + s.genre2 : '')));
      tr.appendChild(osCell('BPM', s.bpm == null ? '' : String(s.bpm)));
      tr.appendChild(osCell('Key', s.key));
      tr.appendChild(osCell('Vocal', s.vocal, '', s.language));
      tr.appendChild(osCell('Explicit', s.explicit ? 'Yes' : 'No'));
      tr.appendChild(osCell('Available', s.badges.join(', ')));
      var td = osCell('Listen', ''), href = safeLink(s.listen);
      if (href) td.appendChild(newTabLink(href, '', 'Listen'));
      tr.appendChild(td);
      body.appendChild(tr);
    });
    return tb;
  }
  // Draws the one-sheet into `root` (the element with id "os"). data: result of load().
  // opts.catalogue: 'link' (same-tab link, top-level page only) or 'text' (plain URL, framed). opts.hint: print hint.
  function renderOneSheet(root, data, opts) {
    data = data || {}; opts = opts || {};
    ensureStyle();
    var st = data.settings || settings(null);
    var email = validEmail(st.contact_email) ? str(st.contact_email) : DEFAULTS.contact_email;
    var turn = str(st.turnaround) || DEFAULTS.turnaround;
    while (root.firstChild) root.removeChild(root.firstChild);
    var top = el('header', 'os-top');
    top.appendChild(el('h1', 'os-name', 'Danyel OZ'));
    top.appendChild(el('p', 'os-desc', OS_DESC));
    root.appendChild(top);

    var body = el('div', 'os-body');
    body.appendChild(el('p', 'os-rights', rightsText(st)));
    var c = el('p', 'os-contact');
    c.appendChild(el('b', '', 'Licensing'));
    c.appendChild(el('span', 'os-mail', email));
    c.appendChild(document.createTextNode('. Reply within ' + turn + '.'));
    var req = el('button', 'os-req os-screen', 'Request a license');
    req.type = 'button';
    req.addEventListener('click', function () { openRequest(st, '', req); });
    c.appendChild(req);
    c.appendChild(el('br'));
    var cat = safeLink(CATALOGUE_URL);
    if (opts.catalogue === 'link') {
      c.appendChild(el('b', '', 'Catalogue'));
      var a = el('a', 'os-cat', cat.replace(/^https:\/\//, ''));
      a.setAttribute('href', cat);
      c.appendChild(a);
    } else c.appendChild(el('span', 'os-cat', 'Licensing catalogue: ' + cat));
    body.appendChild(c);

    body.appendChild(el('p', 'os-bio', OS_BIO));
    body.appendChild(el('h2', 'os-h', 'Songs for sync'));
    var rows = data.ok ? pickOneSheet(data.songs || []) : [];
    if (rows.length) body.appendChild(osTable(rows));
    else body.appendChild(el('p', 'os-msg', OS_FALLBACK));
    body.appendChild(el('p', 'os-foot', 'Files on request: WAV, instrumental, clean, stems and 60 s or 30 s cutdowns where available. ' +
      'Send the song, your project, the media, the territory and the term, and you get a quote within ' + turn + '.'));
    root.appendChild(body);
    if (opts.hint) root.appendChild(el('p', 'os-hint', 'To save this page as a PDF, use your browser’s Print and choose Save as PDF.'));
  }

  window.OZSync = {
    SHEET_ID: SHEET_ID, BASE: BASE, MOODS: MOODS, GENRES: GENRES, VOCALS: VOCALS, KEYS: KEYS, BADGES: BADGES, TEMPOS: TEMPOS,
    DEFAULTS: DEFAULTS, LINK_HOSTS: LINK_HOSTS, IMAGE_HOSTS: IMAGE_HOSTS, CONTACT_HOSTS: CONTACT_HOSTS, EMAIL_RE: EMAIL_RE, NEED: NEED,
    el: el, norm: norm, parseCsv: parseCsv, hasHeads: hasHeads, tabUrl: tabUrl, fetchTab: fetchTab,
    today: today, released: released, flag: flag, inList: inList, moodList: moodList, bpmOf: bpmOf, tempoOf: tempoOf,
    safeUrl: safeUrl, safeLink: safeLink, coverUrl: coverUrl, validEmail: validEmail, contactUrl: contactUrl, contactHref: contactHref,
    mailtoHref: mailtoHref, settings: settings, rightsText: rightsText, processText: processText,
    song: song, songs: songs, complete: complete, filter: filter, pickOneSheet: pickOneSheet, load: load,
    CATALOGUE_URL: CATALOGUE_URL, ONE_SHEET_URL: ONE_SHEET_URL, INCLUDE: INCLUDE, isTop: isTop,
    requestPanel: requestPanel, openRequest: openRequest, renderOneSheet: renderOneSheet
  };
})();
