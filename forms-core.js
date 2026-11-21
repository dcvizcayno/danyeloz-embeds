/* Danyel OZ forms core: shared by contact.html and the sync request panel (sync.html).
   Load with <script src="https://dcvizcayno.github.io/danyeloz-embeds/forms-core.js"></script>, then use window.OZForms.
   Reads data/forms.json (Google Forms formResponse URL and entry ids per form), validates it strictly and posts the
   answers to Google Forms with a no-cors POST. A missing or invalid config shows the email address instead.
   Every visitor value goes to the page only as text (createElement, textContent, setAttribute). The pure functions
   (validConfig, validate, encode, validAction, validEmail) need no DOM. Field lists match apps-script/FormsSetup.gs
   (FS_FORMS); change both together. */
(function () {
  var CONFIG_URL = 'https://dcvizcayno.github.io/danyeloz-embeds/data/forms.json';
  var PRIVACY_URL = 'https://www.danyeloz.info/about/privacy';
  var EMAIL = 'daniel.vizkaino@gmail.com';
  var MIN_FILL_MS = 3000;
  var HONEYPOT = 'website';
  var CONFIG_TIMEOUT_MS = 8000;
  var SUBMIT_TIMEOUT_MS = 15000;
  var DEFAULT_TURNAROUND = '3 business days';

  // Same rule as sync-core.js EMAIL_RE and the FormsSetup.gs Reply-To check (security N-1 / FR-02a).
  var EMAIL_RE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  var ACTION_RE = /^https:\/\/docs\.google\.com\/forms\/d\/e\/[A-Za-z0-9_-]{20,120}\/formResponse$/;
  var ENTRY_RE = /^entry\.[0-9]{4,12}$/;

  function field(key, label, type, required, max, extra) {
    var f = { key: key, label: label, type: type, required: required, max: max };
    extra = extra || {};
    if (extra.help) f.help = extra.help;
    if (extra.choices) { f.choices = extra.choices; f.control = extra.control; }
    return f;
  }
  var FIELDS = {
    contact: [
      field('first_name', 'First name', 'text', true, 60),
      field('last_name', 'Last name', 'text', true, 60),
      field('email', 'Email', 'email', true, 254),
      field('topic', 'What would you like to contact me about?', 'choice', true, 0, { control: 'radio', choices: [
        'Fan Contact', 'Music Collaborations', 'Beat Licensing & Instrumentals', 'Sync & Licensing',
        'Media & Business Inquiries', 'General Inquiries'] }),
      field('subject', 'Subject', 'text', true, 120),
      field('message', 'Message', 'long', true, 4000, { help: 'Tell me how I can help.' })
    ],
    sync: [
      field('name', 'Name', 'text', true, 120),
      field('email', 'Email', 'email', true, 254),
      field('company', 'Company or production', 'text', true, 120),
      field('songs', 'Song or songs', 'text', true, 500),
      field('project', 'Project', 'long', true, 1500, { help: 'Title and a short description of the scene or use.' }),
      field('media', 'Media type', 'choice', true, 0, { control: 'select', choices: [
        'Film', 'TV or streaming series', 'Advertising or commercial', 'Trailer or promo', 'Video game',
        'Online video or social media', 'Podcast', 'Corporate or event', 'Other'] }),
      field('territory', 'Territory', 'text', true, 120, { help: 'For example: Worldwide, or US only.' }),
      field('term', 'Term', 'text', true, 120, { help: 'For example: 1 year, or perpetual.' }),
      field('timeline', 'Timeline', 'text', true, 120, { help: 'When you need the license.' }),
      field('budget', 'Budget range', 'choice', false, 0, { control: 'select', choices: [
        'Under $500', '$500 to $2,000', '$2,000 to $10,000', 'Over $10,000', 'Not sure yet'] }),
      field('notes', 'Notes', 'long', false, 2000)
    ]
  };
  function deepFreeze(o) {
    Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
    return Object.freeze(o);
  }
  deepFreeze(FIELDS);

  var TEXT = {
    contact: { heading: 'Contact & Collaborations', intro: 'Tell me how I can help. I read every message.',
      button: 'Send message' },
    sync: { heading: '', intro: '', button: 'Send request' },
    loading: 'Loading the form…',
    sending: 'Sending…',
    fallback: 'The form is not available right now. Please email me at',
    failure: 'Your message could not be sent. Please email me at ' + EMAIL + '.',
    tooFast: 'Please take a moment to check your message, then press Send again.',
    privacy: 'I use what you send only to reply to you and handle your request.',
    required: 'Please fill this in.',
    email: 'Please enter a valid email address.',
    choose: 'Please choose one.'
  };
  function successText(key, turnaround) {
    if (key === 'sync') return 'Thank you. Your request is in. You get a quote within ' + turnaround + '.';
    return 'Thank you. Your message is on its way, and I will reply to the email you gave me.';
  }

  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }

  function validEmail(v) { v = str(v); return v.length <= 254 && EMAIL_RE.test(v); }

  // FR-04a: anchored regex plus a URL parse: https, host exactly docs.google.com, no user, password, port, query or hash.
  function validAction(a) {
    if (typeof a !== 'string' || a.length > 200 || !ACTION_RE.test(a) || typeof URL !== 'function') return false;
    var u;
    try { u = new URL(a); } catch (e) { return false; }
    return u.href === a && u.protocol === 'https:' && u.hostname === 'docs.google.com' && u.host === 'docs.google.com' &&
      !u.username && !u.password && !u.port && !u.search && !u.hash;
  }

  // Returns {action, fields} for one form, or null. Each form is checked on its own; extra keys are ignored.
  function validConfig(raw, key) {
    if (!isObj(raw) || raw.version !== 1 || !isObj(raw.forms) || !has(FIELDS, key) || !has(raw.forms, key)) return null;
    var form = raw.forms[key];
    if (!isObj(form) || !validAction(form.action) || !isObj(form.fields)) return null;
    var fields = {}, seen = {};
    for (var i = 0; i < FIELDS[key].length; i++) {
      var k = FIELDS[key][i].key;
      if (!has(form.fields, k)) return null;
      var id = form.fields[k];
      if (typeof id !== 'string' || !ENTRY_RE.test(id) || has(seen, id)) return null;
      seen[id] = true;
      fields[k] = id;
    }
    return { action: form.action, fields: fields };
  }

  // Returns {ok, errors}; errors maps field key to the message shown under it.
  function validate(key, values) {
    var errors = {}, ok = true;
    if (!has(FIELDS, key)) return { ok: false, errors: errors };
    values = isObj(values) ? values : {};
    FIELDS[key].forEach(function (f) {
      var v = has(values, f.key) ? str(values[f.key]) : '', msg = '';
      if (v === '') { if (f.required) msg = f.type === 'choice' ? TEXT.choose : TEXT.required; }
      else if (f.type === 'choice') { if (f.choices.indexOf(v) < 0) msg = TEXT.choose; }
      else if (v.length > f.max) msg = 'Please keep this under ' + f.max + ' characters.';
      else if (f.type === 'email' && !validEmail(v)) msg = TEXT.email;
      if (msg) { errors[f.key] = msg; ok = false; }
    });
    return { ok: ok, errors: errors };
  }

  // Only mapped entry ids are sent; empty optional fields and the honeypot never are.
  function encode(key, cfg, values) {
    var p = new URLSearchParams();
    if (!has(FIELDS, key) || !cfg || !isObj(cfg.fields)) return p;
    values = isObj(values) ? values : {};
    FIELDS[key].forEach(function (f) {
      var v = has(values, f.key) ? str(values[f.key]) : '';
      if (v !== '' && has(cfg.fields, f.key) && ENTRY_RE.test(cfg.fields[f.key])) p.append(cfg.fields[f.key], v);
    });
    return p;
  }

  function withTimeout(ms, run) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { if (ctl) ctl.abort(); reject(new Error('timeout')); }, ms);
    });
    return Promise.race([run(ctl ? ctl.signal : undefined), timeout]).then(
      function (v) { clearTimeout(timer); return v; },
      function (e) { clearTimeout(timer); throw e; });
  }

  // Promise of the parsed forms.json or null (any error). Fetched once per page.
  var configPromise = null;
  function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = Promise.resolve().then(function () {
      return withTimeout(CONFIG_TIMEOUT_MS, function (signal) {
        var init = { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' };
        if (signal) init.signal = signal;
        return fetch(CONFIG_URL, init).then(function (r) { return r && r.ok ? r.json() : null; });
      });
    }).then(function (j) { return isObj(j) ? j : null; }, function () { return null; });
    return configPromise;
  }

  // Resolves when the POST went out (the no-cors response is opaque), rejects on a refused action, error or timeout.
  function submit(action, params) {
    if (!validAction(action)) return Promise.reject(new Error('action refused'));
    return withTimeout(SUBMIT_TIMEOUT_MS, function (signal) {
      var init = { method: 'POST', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', body: params };
      if (signal) init.signal = signal;
      return fetch(action, init);
    }).then(function () { return true; });
  }

  // ---- DOM (browser only) ----
  var STYLE_ID = 'ozf-style';
  var CSS = [
    '.ozf{font-family:"Open Sans",Arial,sans-serif;color:#111;max-width:760px;margin:0 auto;box-sizing:border-box}',
    '.ozf *,.ozf *::before,.ozf *::after{box-sizing:border-box}',
    '.ozf-h{margin:0 0 8px;font-family:Anton,Impact,sans-serif;font-weight:400;font-size:34px;line-height:1.05;letter-spacing:.5px;text-transform:uppercase}',
    '.ozf-intro{margin:0 0 18px;font-size:16px;line-height:1.5}',
    '.ozf-f{margin:0 0 16px;padding:0;border:0;min-width:0}',
    '.ozf-l{display:block;margin:0 0 6px;padding:0;font-family:Oswald,"Arial Narrow",sans-serif;font-size:13px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:#111}',
    '.ozf-help{margin:0 0 6px;font-size:13px;color:#555}',
    '.ozf-in{display:block;width:100%;max-width:100%;padding:10px 12px;font-family:"Open Sans",Arial,sans-serif;font-size:16px;color:#111;background:#fff;border:1px solid #bbb;border-radius:0}',
    '.ozf-in:focus{outline:2px solid #e3122a;outline-offset:1px;border-color:#e3122a}',
    'textarea.ozf-in{min-height:140px;resize:vertical}',
    '.ozf-opt{display:flex;align-items:flex-start;gap:8px;margin:6px 0;font-size:16px;line-height:1.4}',
    '.ozf-opt input{margin:3px 0 0;accent-color:#e3122a}',
    '.ozf-in[aria-invalid="true"],.ozf-f[aria-invalid="true"]{border-color:#b0101f}',
    '.ozf-err{margin:6px 0 0;font-size:13px;color:#b0101f}',
    '.ozf-err:empty{display:none}',
    '.ozf-hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}',
    '.ozf-btn{display:inline-block;padding:12px 18px;font-family:Oswald,"Arial Narrow",sans-serif;font-size:13px;font-weight:500;letter-spacing:2.5px;' +
      'text-transform:uppercase;background:#e3122a;border:1px solid #e3122a;color:#fff;cursor:pointer;border-radius:0}',
    '.ozf-btn:hover,.ozf-btn:focus-visible{background:#b0101f;border-color:#b0101f;outline:2px solid #111;outline-offset:2px}',
    '.ozf-btn[disabled]{opacity:.6;cursor:default}',
    '.ozf-b2{background:#fff;color:#111;border-color:#111}',
    '.ozf-status{min-height:1.4em;margin:10px 0 0;font-size:14px;color:#b0101f}',
    '.ozf-ok{margin:0;padding:14px 16px;border-left:4px solid #e3122a;background:#fff5f6;font-size:16px;line-height:1.5}',
    '.ozf-mailrow{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:8px 0}',
    '.ozf-mail{font-weight:600;word-break:break-all;user-select:all}',
    '.ozf-privacy{margin:14px 0 0;font-size:13px;color:#555}',
    '.ozf-privacy a{color:#b0101f}',
    '@media (max-width:480px){.ozf-h{font-size:28px}.ozf-btn{width:100%}}'
  ].join('\n');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = el('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function selectText(node) {
    var sel = window.getSelection && window.getSelection();
    if (!sel || !document.createRange) return;
    var r = document.createRange();
    r.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  function clipboardAllowed() {
    try {
      var pp = document.permissionsPolicy || document.featurePolicy;
      return !pp || !pp.allowsFeature || pp.allowsFeature('clipboard-write');
    } catch (e) { return true; }
  }
  function privacyNote() {
    var p = el('p', 'ozf-privacy', TEXT.privacy + ' ');
    var a = el('a', null, 'Privacy policy');
    a.setAttribute('href', PRIVACY_URL);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    p.appendChild(a);
    return p;
  }
  function emailRow() {
    var wrap = el('div', 'ozf-fallback');
    wrap.appendChild(el('p', null, TEXT.fallback));
    var row = el('div', 'ozf-mailrow'), mail = el('span', 'ozf-mail', EMAIL), copy = el('button', 'ozf-btn ozf-b2 ozf-copy', 'Copy email');
    copy.type = 'button';
    row.appendChild(mail); row.appendChild(copy);
    wrap.appendChild(row);
    var status = el('p', 'ozf-status');
    status.setAttribute('aria-live', 'polite');
    wrap.appendChild(status);
    copy.addEventListener('click', function () {
      function manual() { selectText(mail); status.textContent = 'Press Ctrl+C (or Cmd+C) to copy.'; }
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText || !clipboardAllowed()) { manual(); return; }
        navigator.clipboard.writeText(EMAIL).then(function () { status.textContent = 'Email copied.'; }, manual);
      } catch (e) { manual(); }
    });
    return wrap;
  }

  var seq = 0;
  // Builds one control. Returns {box, get(), set(v), focus(), invalid(msg)}.
  function control(f, base) {
    var id = base + '-' + f.key, errId = id + '-err', helpId = id + '-help';
    var label = f.label + (f.required ? '' : ' (optional)');
    var box, inputs = [], err = el('p', 'ozf-err');
    err.id = errId;
    if (f.control === 'radio') {
      box = el('fieldset', 'ozf-f');
      box.setAttribute('role', 'radiogroup');
      box.setAttribute('aria-required', f.required ? 'true' : 'false');
      box.appendChild(el('legend', 'ozf-l', label));
      f.choices.forEach(function (c, i) {
        var lab = el('label', 'ozf-opt'), r = el('input');
        r.setAttribute('type', 'radio');
        r.setAttribute('name', id);
        r.setAttribute('value', c);
        r.id = id + '-' + i;
        if (f.required && i === 0) r.setAttribute('required', '');
        lab.appendChild(r);
        lab.appendChild(el('span', null, c));
        box.appendChild(lab);
        inputs.push(r);
      });
    } else {
      box = el('div', 'ozf-f');
      var l = el('label', 'ozf-l', label);
      l.setAttribute('for', id);
      box.appendChild(l);
      var input;
      if (f.type === 'long') input = el('textarea', 'ozf-in');
      else if (f.type === 'choice') {
        input = el('select', 'ozf-in');
        var first = el('option', null, 'Choose one');
        first.setAttribute('value', '');
        input.appendChild(first);
        f.choices.forEach(function (c) { var o = el('option', null, c); o.setAttribute('value', c); input.appendChild(o); });
      } else {
        input = el('input', 'ozf-in');
        input.setAttribute('type', f.type === 'email' ? 'email' : 'text');
        if (f.type === 'email') input.setAttribute('autocomplete', 'email');
      }
      input.id = id;
      input.setAttribute('name', f.key);
      if (f.max) input.setAttribute('maxlength', String(f.max));
      if (f.required) { input.setAttribute('required', ''); input.setAttribute('aria-required', 'true'); }
      inputs.push(input);
    }
    var help = null;
    if (f.help) { help = el('p', 'ozf-help', f.help); help.id = helpId; }
    if (f.control === 'radio') { if (help) box.insertBefore(help, box.children[1]); }
    else { if (help) box.appendChild(help); box.appendChild(inputs[0]); }
    box.appendChild(err);
    function describe(withErr) {
      var ids = [];
      if (help) ids.push(helpId);
      if (withErr) ids.push(errId);
      var target = f.control === 'radio' ? box : inputs[0];
      if (ids.length) target.setAttribute('aria-describedby', ids.join(' ')); else target.removeAttribute('aria-describedby');
    }
    describe(false);
    return {
      box: box,
      get: function () {
        if (f.control === 'radio') {
          for (var i = 0; i < inputs.length; i++) if (inputs[i].checked) return inputs[i].value;
          return '';
        }
        return inputs[0].value;
      },
      set: function (v) {
        v = str(v);
        if (f.type === 'choice') {
          if (f.choices.indexOf(v) < 0) return;
          if (f.control === 'radio') inputs.forEach(function (r) { r.checked = r.value === v; });
          else inputs[0].value = v;
        } else inputs[0].value = f.max ? v.slice(0, f.max) : v;
      },
      focus: function () { inputs[0].focus(); },
      invalid: function (msg) {
        err.textContent = msg || '';
        var target = f.control === 'radio' ? box : inputs[0];
        if (msg) target.setAttribute('aria-invalid', 'true'); else target.removeAttribute('aria-invalid');
        describe(!!msg);
      }
    };
  }

  // Draws the form for `key` into root. opts: prefill {fieldKey: value}, turnaround (sync), onUnavailable (called
  // instead of drawing the email fallback). Returns {node, destroy}.
  function render(root, key, opts) {
    opts = opts || {};
    ensureStyle();
    var node = el('div', 'ozf ozf-' + key), alive = true, base = 'ozf' + (++seq);
    var t = TEXT[key] || { heading: '', intro: '', button: 'Send' };
    if (t.heading) node.appendChild(el('h2', 'ozf-h', t.heading));
    if (t.intro) node.appendChild(el('p', 'ozf-intro', t.intro));
    var body = el('div', 'ozf-body');
    body.appendChild(el('p', 'ozf-loading', TEXT.loading));
    node.appendChild(body);
    if (root) root.appendChild(node);
    var handle = { node: node, destroy: function () { alive = false; if (node.parentNode) node.parentNode.removeChild(node); } };

    function unavailable() {
      if (typeof opts.onUnavailable === 'function') { handle.destroy(); opts.onUnavailable(); return; }
      body.textContent = '';
      body.appendChild(emailRow());
    }
    function draw(cfg) {
      var form = el('form', 'ozf-form'), controls = {}, sent = false, sending = false;
      form.setAttribute('novalidate', '');
      FIELDS[key].forEach(function (f) {
        var c = control(f, base);
        controls[f.key] = c;
        form.appendChild(c.box);
      });
      var prefill = isObj(opts.prefill) ? opts.prefill : {};
      Object.keys(prefill).forEach(function (k) { if (has(controls, k)) controls[k].set(prefill[k]); });
      var hp = el('div', 'ozf-hp');
      hp.setAttribute('aria-hidden', 'true');
      hp.setAttribute('style', 'position:absolute;left:-10000px');
      var hpl = el('label', null, 'Leave this empty'), hpi = el('input');
      hpi.id = base + '-' + HONEYPOT;
      hpl.setAttribute('for', hpi.id);
      hpi.setAttribute('type', 'text');
      hpi.setAttribute('name', HONEYPOT);
      hpi.setAttribute('tabindex', '-1');
      hpi.setAttribute('autocomplete', 'off');
      hp.appendChild(hpl); hp.appendChild(hpi);
      form.appendChild(hp);
      var btn = el('button', 'ozf-btn ozf-send', t.button);
      btn.type = 'submit';
      form.appendChild(btn);
      var status = el('p', 'ozf-status');
      status.setAttribute('aria-live', 'polite');
      form.appendChild(status);
      var turnaround = str(opts.turnaround) || DEFAULT_TURNAROUND;
      function done() {
        sent = true;
        var ok = el('p', 'ozf-ok', successText(key, turnaround));
        ok.setAttribute('role', 'status');
        ok.tabIndex = -1;
        body.textContent = '';
        body.appendChild(ok);
        ok.focus();
      }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!alive || sent || sending) return;
        status.textContent = '';
        var values = {};
        Object.keys(controls).forEach(function (k) { values[k] = controls[k].get(); });
        var res = validate(key, values), first = null;
        FIELDS[key].forEach(function (f) {
          controls[f.key].invalid(res.errors[f.key]);
          if (res.errors[f.key] && !first) first = controls[f.key];
        });
        if (!res.ok) { first.focus(); return; }
        if (hpi.value !== '') { done(); return; }
        if (Date.now() - shownAt < MIN_FILL_MS) { status.textContent = TEXT.tooFast; return; }
        sending = true;
        btn.disabled = true;
        btn.textContent = TEXT.sending;
        submit(cfg.action, encode(key, cfg, values)).then(function () {
          sending = false;
          if (alive) done();
        }, function () {
          sending = false;
          if (!alive) return;
          btn.disabled = false;
          btn.textContent = t.button;
          status.textContent = TEXT.failure;
        });
      });
      body.textContent = '';
      body.appendChild(form);
      var shownAt = Date.now();
    }

    loadConfig().then(function (raw) {
      if (!alive) return;
      var cfg = validConfig(raw, key);
      if (cfg) draw(cfg); else unavailable();
      if (alive) node.appendChild(privacyNote());
    });
    return handle;
  }

  window.OZForms = {
    CONFIG_URL: CONFIG_URL, PRIVACY_URL: PRIVACY_URL, EMAIL: EMAIL, MIN_FILL_MS: MIN_FILL_MS, HONEYPOT: HONEYPOT,
    FIELDS: FIELDS, EMAIL_RE: EMAIL_RE, ACTION_RE: ACTION_RE,
    validEmail: validEmail, validAction: validAction, validConfig: validConfig, loadConfig: loadConfig,
    validate: validate, encode: encode, submit: submit, render: render
  };
})();
