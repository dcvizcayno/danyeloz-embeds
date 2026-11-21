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
  // Request link: contact_url (D-10 hosts) first, else mailto for a valid email with only an encoded subject.
  function contactHref(s, title) {
    s = s || {};
    var url = contactUrl(s.contact_url); if (url) return url;
    var email = str(s.contact_email);
    if (!validEmail(email)) return '';
    return 'mailto:' + email + '?subject=' + encodeURIComponent('License request: ' + str(title));
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

  window.OZSync = {
    SHEET_ID: SHEET_ID, BASE: BASE, MOODS: MOODS, GENRES: GENRES, VOCALS: VOCALS, KEYS: KEYS, BADGES: BADGES, TEMPOS: TEMPOS,
    DEFAULTS: DEFAULTS, LINK_HOSTS: LINK_HOSTS, IMAGE_HOSTS: IMAGE_HOSTS, CONTACT_HOSTS: CONTACT_HOSTS, EMAIL_RE: EMAIL_RE, NEED: NEED,
    el: el, norm: norm, parseCsv: parseCsv, hasHeads: hasHeads, tabUrl: tabUrl, fetchTab: fetchTab,
    today: today, released: released, flag: flag, inList: inList, moodList: moodList, bpmOf: bpmOf, tempoOf: tempoOf,
    safeUrl: safeUrl, safeLink: safeLink, coverUrl: coverUrl, validEmail: validEmail, contactUrl: contactUrl, contactHref: contactHref,
    settings: settings, rightsText: rightsText, processText: processText,
    song: song, songs: songs, complete: complete, filter: filter, pickOneSheet: pickOneSheet, load: load
  };
})();
