#!/usr/bin/env python3
"""Danyel OZ X post agent. Bandcamp first: any song with a bandcamp_embed qualifies.

Commands:
  draft            pick a song, write a post, open an approval issue
  handle           react to a ticked box on an approval issue (Post / Revise)
  metrics          pull numbers for logged posts, update the playbook, open a weekly report
  release          automatic release posts at 1 AM Manila: "coming soon" 7 days ahead, "out now" on the day

Runs in GitHub Actions. Standard library only.
Without X keys it runs in test mode: everything works except the real post.
"""
import base64, csv, hashlib, hmac, io, json, os, random, re, sys, time, urllib.parse, urllib.request
from datetime import date, datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = json.load(open(os.path.join(ROOT, 'x-agent', 'config.json')))
LOG_PATH = os.path.join(ROOT, 'data', 'x-posts.json')
PLAYBOOK_PATH = os.path.join(ROOT, 'x-agent', 'playbook.json')
REPO = os.environ.get('GITHUB_REPOSITORY', 'dcvizcayno/danyeloz-embeds')
OWNER = REPO.split('/')[0]
GH_TOKEN = os.environ.get('GITHUB_TOKEN', '')
MANILA = timezone(timedelta(hours=8))

X_KEYS = {k: os.environ.get(k, '') for k in ('X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET')}
TEST_MODE = not all(X_KEYS.values())
ANTHROPIC_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

MARK_START, MARK_END = '<!-- post:start -->', '<!-- post:end -->'


# ---------- small helpers ----------
def http(method, url, data=None, headers=None):
    body = None
    headers = dict(headers or {})
    if data is not None:
        body = json.dumps(data).encode()
        headers.setdefault('Content-Type', 'application/json')
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt.strip().startswith(('{', '[')) else txt)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt


def gh(method, path, data=None):
    code, res = http(method, 'https://api.github.com' + path, data, {
        'Authorization': 'Bearer ' + GH_TOKEN,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'})
    if code >= 300:
        raise SystemExit(f'GitHub {method} {path} failed {code}: {res}')
    return res


def load(path, default):
    try:
        return json.load(open(path))
    except Exception:
        return default


def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(obj, open(path, 'w'), indent=2, ensure_ascii=False)
    open(path, 'a').write('\n')


# ---------- songs ----------
def sheet_rows():
    if os.environ.get('SONGS_CSV'):
        text = open(os.environ['SONGS_CSV'], encoding='utf-8').read()
    else:
        _, text = http('GET', CONFIG['song_csv'])
    return list(csv.DictReader(io.StringIO(text)))


def bandcamp_url(code):
    m = re.search(r'href="(https://[^"]*bandcamp\.com/[^"]+)"', code or '')
    return m.group(1) if m else ''


def songs():
    out = []
    for r in sheet_rows():
        yt = (r.get('yt_video_link') or '').strip()
        bc = (r.get('bandcamp_embed') or '').strip()
        if not bc or (CONFIG.get('require_youtube') and not yt):
            continue
        bc_url = bandcamp_url(bc) or CONFIG['bandcamp_home']
        title = (r.get('song_title') or '').strip()
        if not title:
            continue
        out.append({
            'title': title,
            'genre': (r.get('song_genre') or '').strip(),
            'type': (r.get('release_type') or '').strip(),
            'date': (r.get('release_date') or '').strip(),
            'description': (r.get('song_description') or '').strip(),
            'youtube': re.sub(r'[?&](si|feature|pp)=[^&]*', '', yt).replace('&', '?', 1) if 'youtu.be' in yt else yt.split('&')[0],
            'bandcamp': bc_url,
        })
    return out


def pick_song(all_songs, log):
    """Every eligible song gets a turn before any song repeats."""
    posted = [p['song'] for p in log if p.get('status') == 'posted' and p.get('kind') != 'release']
    cycle = len(posted) % max(1, len(all_songs))
    recent = set(posted[-cycle:]) if cycle else set()
    fresh = [s for s in all_songs if s['title'] not in recent] or all_songs
    return random.choice(fresh)


# ---------- learning (simple explore / exploit) ----------
def choose(playbook, dim):
    """Pick an option for one dimension. Mostly the best scorer, sometimes a new try."""
    opts = CONFIG['experiments'][dim]
    stats = playbook.get(dim, {})
    tried = {o: stats.get(o, {}) for o in opts}
    untested = [o for o, s in tried.items() if s.get('n', 0) < CONFIG['min_samples']]
    if untested:
        return random.choice(untested)
    if random.random() < CONFIG['explore_rate']:
        return random.choice(opts)
    return max(opts, key=lambda o: tried[o].get('score', 0))


def score(m):
    """Engagement per 1,000 impressions, with replies and reposts weighted higher."""
    imp = max(1, m.get('impression_count', 0))
    eng = (m.get('like_count', 0) + 2 * m.get('reply_count', 0) + 3 * m.get('retweet_count', 0)
           + 2 * m.get('quote_count', 0) + 2 * m.get('url_link_clicks', 0) + m.get('bookmark_count', 0))
    return round(1000 * eng / imp, 2)


# ---------- writing ----------
def first_sentences(text, limit=150):
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'^.{0,80}?\s-\s', '', text)  # drop "Title - A Song About..." headers
    parts = re.split(r'(?<=[.!?])\s+', text)
    out = ''
    for p in parts:
        if len(out) + len(p) + 1 > limit:
            break
        out = (out + ' ' + p).strip()
    return out


TEMPLATES = {
    # Fallback only (used when no ANTHROPIC_API_KEY). Claims nothing that might not be true.
    'question': [
        'Ever held on to something long after it was over? "{title}" lives in that space.',
        'What do you do with the words you never said? "{title}" sits right there with them.',
        'Some feelings stay longer than the people who caused them. Ever met one? "{title}"',
    ],
    'story': ['{line}\n\n"{title}"', '"{title}" is for a moment like this: {line_lower}'],
    'invite': [
        'Put your headphones on for this one. "{title}" by Danyel OZ.',
        'Late night, quiet room, "{title}". That is how this one wants to be heard.',
        'If today feels heavy, "{title}" might sit with you for a bit.',
    ],
    'behind': [
        '{genre_cap} {type_lower}, one voice, one feeling: "{title}".',
        'From the Danyel OZ catalog: "{title}", {type_lower}, {genre_lower}. Press play and tell me what it felt like.',
    ],
}


def site_footer():
    """'Want more? Check my Official Site' plus the site link, so new fans find the home page."""
    line, url = CONFIG.get('site_line', '').strip(), CONFIG.get('site_url', '').strip()
    return f'\n\n{line} {url}' if line and url.startswith('https://') else ''


def post_budget():
    # X counts every link as 23 characters. Song link: newline + 23. Footer: blank line + words + space + 23.
    line = CONFIG.get('site_line', '').strip()
    return 280 - 24 - ((len(line) + 3 + 23) if site_footer() else 0)


def finish(text, url):
    budget = post_budget()
    text = text.strip()
    if len(text) > budget:
        text = text[:budget - 1].rsplit(' ', 1)[0] + '…'
    return text + '\n' + url + site_footer()


def write_post(song, hook, link, note=''):
    url = song['youtube'] if (link == 'youtube' and song['youtube']) else song['bandcamp']
    budget = post_budget()
    if ANTHROPIC_KEY:
        text = write_with_claude(song, hook, link, note, budget)
        if text:
            return finish(text, url)
    tpl = random.choice(TEMPLATES[hook] if hook in TEMPLATES else TEMPLATES['invite'])
    for limit in (150, 110, 70):  # shorten the story line before cutting the post
        line = first_sentences(song['description'], limit) or f'A {(song["genre"] or "Danyel OZ").split("/")[0].lower()} song for the quiet moments.'
        text = tpl.format(title=song['title'], line=line, line_lower=line if re.match(r"I\b", line) else line[:1].lower() + line[1:],
                          type_lower=(song['type'] or 'single').lower(),
                          genre_cap=(song['genre'] or 'A').split('/')[0], genre_lower=(song['genre'] or 'music').lower())
        if len(text) <= budget:
            break
    return finish(text, url)


def write_with_claude(song, hook, link, note, budget):
    rules = '\n'.join('- ' + r for r in CONFIG['voice_rules'])
    hooks = {'question': 'open with a simple, honest question',
             'story': 'show one small moment or image from the song\'s story',
             'invite': 'invite the listener into a specific moment to hear it',
             'behind': 'share one true, small detail about making it'}
    prompt = f"""Write one X post for musician Danyel OZ promoting his song.
Song: "{song['title']}" ({song['genre']}, {song['type']}, released {song['date']})
About the song: {song['description'][:1500]}
Approach: {hooks.get(hook, hooks['invite'])}.
The {'YouTube video' if link == 'youtube' else 'Bandcamp page'} link is added after your text, so do not include any link.
Voice rules:
{rules}
Hard limit: {budget} characters. Output only the post text."""
    if note:
        prompt += f'\nDaniel asked for this revision: {note}'
    code, res = http('POST', 'https://api.anthropic.com/v1/messages', {
        'model': CONFIG['claude_model'], 'max_tokens': 400,
        'messages': [{'role': 'user', 'content': prompt}]},
        {'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01'})
    if code >= 300:
        print('Claude writer failed, using templates:', code, res)
        return ''
    text = ''.join(b.get('text', '') for b in res.get('content', [])).strip().strip('"')
    text = text.replace('—', ',').replace('–', '-')  # no em dashes
    return text[:budget]


# ---------- X ----------
def oauth_header(method, url, params=None):
    k = X_KEYS
    oauth = {'oauth_consumer_key': k['X_API_KEY'], 'oauth_nonce': hashlib.md5(os.urandom(16)).hexdigest(),
             'oauth_signature_method': 'HMAC-SHA1', 'oauth_timestamp': str(int(time.time())),
             'oauth_token': k['X_ACCESS_TOKEN'], 'oauth_version': '1.0'}
    allp = {**oauth, **(params or {})}
    q = lambda s: urllib.parse.quote(str(s), safe='~')
    base = '&'.join([method.upper(), q(url), q('&'.join(f'{q(a)}={q(b)}' for a, b in sorted(allp.items())))])
    key = q(k['X_API_SECRET']) + '&' + q(k['X_ACCESS_SECRET'])
    oauth['oauth_signature'] = base64.b64encode(hmac.new(key.encode(), base.encode(), hashlib.sha1).digest()).decode()
    return 'OAuth ' + ', '.join(f'{q(a)}="{q(b)}"' for a, b in sorted(oauth.items()))


def x_post(text):
    if TEST_MODE:
        return {'id': 'test-' + str(int(time.time())), 'test': True}
    url = 'https://api.x.com/2/tweets'
    code, res = http('POST', url, {'text': text}, {'Authorization': oauth_header('POST', url)})
    if code >= 300:
        raise SystemExit(f'X post failed {code}: {res}')
    return {'id': res['data']['id']}


def x_metrics(ids):
    if TEST_MODE or not ids:
        return {}
    out = {}
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        params = {'ids': ','.join(chunk), 'tweet.fields': 'public_metrics,non_public_metrics,created_at'}
        url = 'https://api.x.com/2/tweets'
        full = url + '?' + urllib.parse.urlencode(params)
        code, res = http('GET', full, headers={'Authorization': oauth_header('GET', url, params)})
        if code >= 300:
            # non_public_metrics only exist for 30 days; retry with public numbers only
            params['tweet.fields'] = 'public_metrics,created_at'
            full = url + '?' + urllib.parse.urlencode(params)
            code, res = http('GET', full, headers={'Authorization': oauth_header('GET', url, params)})
        for t in (res.get('data') or []) if isinstance(res, dict) else []:
            m = dict(t.get('public_metrics', {}))
            m.update(t.get('non_public_metrics', {}))
            out[t['id']] = m
    return out


# ---------- approval issue ----------
def issue_body(d):
    meta = json.dumps({k: d[k] for k in ('song', 'hook', 'link', 'version')})
    mode = '\n> 🧪 **Test mode:** X keys are not set yet, so ticking Post logs it without posting.\n' if TEST_MODE else ''
    return f"""**Song:** {d['song']}  ·  **Approach:** {d['hook']}  ·  **Link:** {d['link']}  ·  **Version:** {d['version']}
{mode}
### Draft post
{MARK_START}
{d['text']}
{MARK_END}

You can edit the draft text above directly before ticking Post.

### Your call (tick one)
- [ ] Post
- [ ] Revise

Want a specific change? Comment your note first (for example "shorter" or "mention the bridge"), then tick Revise.

<!-- meta:{meta} -->
"""


def parse_issue(body):
    meta = json.loads(re.search(r'<!-- meta:(\{.*?\}) -->', body).group(1))
    text = body.split(MARK_START, 1)[1].split(MARK_END, 1)[0].strip()
    ticked = lambda label: re.search(r'- \[[xX]\] ' + label + r'\b', body) is not None
    return meta, text, ticked('Post'), ticked('Revise')


def cmd_draft():
    log = load(LOG_PATH, [])
    playbook = load(PLAYBOOK_PATH, {})
    open_drafts = gh('GET', f'/repos/{REPO}/issues?labels=x-draft&state=open')
    if open_drafts and not os.environ.get('FORCE'):
        print('A draft is already waiting for you; not opening another.')
        return
    pool = songs()
    if not pool:
        raise SystemExit('No songs with a bandcamp_embed.')
    song = pick_song(pool, log)
    hook, link = choose(playbook, 'hook'), choose(playbook, 'link')
    if link == 'youtube' and not song['youtube']:
        link = 'bandcamp'
    d = {'song': song['title'], 'hook': hook, 'link': link, 'version': 1, 'text': write_post(song, hook, link)}
    issue = gh('POST', f'/repos/{REPO}/issues', {
        'title': f'X draft: {song["title"]}', 'body': issue_body(d),
        'labels': ['x-draft'], 'assignees': [OWNER]})
    print('Opened', issue['html_url'])


def cmd_handle():
    event = json.load(open(os.environ['GITHUB_EVENT_PATH']))
    issue = event['issue']
    if 'x-draft' not in [l['name'] for l in issue.get('labels', [])] or issue['state'] != 'open':
        return
    sender = event.get('sender', {}).get('login', '')
    if sender.lower() != OWNER.lower():
        print('Ignoring change by', sender)
        return
    meta, text, post, revise = parse_issue(issue['body'] or '')
    num = issue['number']
    if post:
        res = x_post(text)
        now = datetime.now(MANILA)
        log = load(LOG_PATH, [])
        log.append({'id': res['id'], 'song': meta['song'], 'hook': meta['hook'], 'link': meta['link'],
                    'text': text, 'posted_at': now.isoformat(timespec='minutes'), 'hour': now.hour,
                    'weekday': now.strftime('%a'), 'revisions': meta['version'] - 1,
                    'status': 'posted', 'test': bool(res.get('test')), 'metrics': {}, 'score': None})
        save(LOG_PATH, log)
        link = '' if res.get('test') else f'\n\nhttps://x.com/i/web/status/{res["id"]}'
        msg = ('🧪 Test mode: logged as posted, nothing went to X.' if res.get('test') else '✅ Posted to X.') + link
        gh('POST', f'/repos/{REPO}/issues/{num}/comments', {'body': msg})
        gh('PATCH', f'/repos/{REPO}/issues/{num}', {'state': 'closed', 'labels': ['x-posted']})
        print('POSTED')  # tells the workflow to commit the log
    elif revise:
        comments = gh('GET', f'/repos/{REPO}/issues/{num}/comments')
        notes = [c['body'] for c in comments if c['user']['login'].lower() == OWNER.lower()]
        note = notes[-1] if notes else ''
        song = next((s for s in songs() if s['title'] == meta['song']), None)
        if not song:
            raise SystemExit('Song no longer eligible: ' + meta['song'])
        hook = meta['hook'] if note else random.choice(CONFIG['experiments']['hook'])
        d = {**meta, 'hook': hook, 'version': meta['version'] + 1, 'text': write_post(song, hook, meta['link'], note)}
        gh('PATCH', f'/repos/{REPO}/issues/{num}', {'body': issue_body(d)})
        gh('POST', f'/repos/{REPO}/issues/{num}/comments',
           {'body': f'✏️ Version {d["version"]} is ready above' + (f' (using your note: "{note[:120]}")' if note else '') + '.'})


def cmd_metrics():
    log = load(LOG_PATH, [])
    live = [p for p in log if p.get('status') == 'posted' and not p.get('test')]
    fresh = x_metrics([p['id'] for p in live])
    for p in live:
        if p['id'] in fresh:
            p['metrics'] = fresh[p['id']]
            p['score'] = score(p['metrics'])
    save(LOG_PATH, log)
    # Release posts get numbers too, but stay out of the playbook: their time and wording are fixed.
    scored = [p for p in live if p.get('score') is not None and p.get('kind') != 'release']
    playbook = {}
    for dim, key in (('hook', 'hook'), ('link', 'link'), ('hour', 'hour'), ('weekday', 'weekday')):
        groups = {}
        for p in scored:
            groups.setdefault(str(p[key]), []).append(p['score'])
        playbook[dim] = {k: {'n': len(v), 'score': round(sum(v) / len(v), 2)} for k, v in groups.items()}
    playbook['updated'] = datetime.now(MANILA).isoformat(timespec='minutes')
    save(PLAYBOOK_PATH, playbook)

    week_ago = datetime.now(MANILA) - timedelta(days=7)
    this_week = [p for p in scored if datetime.fromisoformat(p['posted_at']) >= week_ago]
    best = max(scored, key=lambda p: p['score'], default=None)
    lines = [f'**Posts this week:** {len(this_week)}  ·  **All posts scored:** {len(scored)}']
    if TEST_MODE:
        lines.append('\n🧪 Test mode: no X keys yet, so there are no real numbers to read.')
    for p in sorted(this_week, key=lambda p: -p['score']):
        m = p['metrics']
        lines.append(f"- **{p['song']}** ({p['hook']}, {p['link']}): {m.get('impression_count', 0)} views, "
                     f"{m.get('like_count', 0)} likes, {m.get('reply_count', 0)} replies, "
                     f"{m.get('retweet_count', 0)} reposts, {m.get('url_link_clicks', 0)} link clicks · score {p['score']}")
    if best:
        lines.append(f"\n**Best so far:** {best['song']} ({best['hook']}, {best['link']}), score {best['score']}")
    for dim in ('hook', 'link'):
        ranked = sorted(playbook[dim].items(), key=lambda kv: -kv[1]['score'])
        if ranked:
            lines.append(f"**{dim.capitalize()} ranking:** " + ', '.join(f"{k} {v['score']} (n={v['n']})" for k, v in ranked))
    if len(scored) < 12:
        lines.append('\nStill early. The agent keeps trying every approach until each has a few posts behind it.')
    lines.append('\nDashboard: https://dcvizcayno.github.io/danyeloz-embeds/x-dashboard.html')
    gh('POST', f'/repos/{REPO}/issues', {
        'title': 'X weekly report: ' + datetime.now(MANILA).strftime('%b %d, %Y'),
        'body': '\n'.join(lines), 'labels': ['x-report'], 'assignees': [OWNER]})


def cmd_check():
    """Confirm the X keys work without posting anything."""
    lines = ['**X key check**']
    for k, v in X_KEYS.items():
        lines.append(f'- `{k}`: ' + ('found' if v else '**missing**'))
    if TEST_MODE:
        lines.append('\nStill in test mode: add the missing secret(s) and run the check again.')
    else:
        url = 'https://api.x.com/2/users/me'
        code, res = http('GET', url, headers={'Authorization': oauth_header('GET', url)})
        if code == 200:
            lines.append(f"\n✅ Signed in to X as **@{res['data']['username']}**. Test mode is off: ticking Post now posts for real.")
        else:
            hint = {401: 'The keys do not match each other. Regenerate the Access Token and Secret after the Consumer Keys and update the secrets.',
                    402: 'X says the account needs credits. Add some in the X Developer Console.',
                    403: 'X refused. Check the app is in a Project and has Read and write permission.'}.get(code, '')
            lines.append(f'\n❌ X answered {code}: `{json.dumps(res)[:300]}`\n\n{hint}')
    body = '\n'.join(lines)
    print(body)
    drafts = gh('GET', f'/repos/{REPO}/issues?labels=x-draft&state=open')
    if drafts:
        gh('POST', f"/repos/{REPO}/issues/{drafts[0]['number']}/comments", {'body': body})
    else:
        gh('POST', f'/repos/{REPO}/issues', {'title': 'X key check', 'body': body, 'assignees': [OWNER]})


# ---------- release posts (automatic, no approval) ----------
SOON_DAYS = 7

RELEASE_TEMPLATES = {
    # Fallback only (used when no ANTHROPIC_API_KEY). Built from the song's own story line.
    'soon': ['{line}\n\n"{title}" comes out {when}. Pre-order it on Bandcamp. #NewMusic',
             '"{title}" comes out {when}.\n\n{line}\n\nPre-order on Bandcamp. #NewMusic'],
    'soon_bare': ['New song {when}: "{title}". Pre-order it on Bandcamp. #NewMusic'],
    'out': ['"{title}" is out today.\n\n{line} #NewMusic',
            'Today is the day. "{title}" is out now.\n\n{line} #NewMusic'],
    'out_bare': ['"{title}" is out today. Headphones on. #NewMusic'],
}


def today_manila():
    return date.fromisoformat(os.environ['TODAY']) if os.environ.get('TODAY') else datetime.now(MANILA).date()


def when_text(left):
    return 'tomorrow' if left == 1 else 'in a week' if left == 7 else f'in {left} days'


def write_release(song, stage, left, url):
    budget = post_budget()
    if ANTHROPIC_KEY:
        text = write_release_with_claude(song, stage, left, budget)
        if text:
            return finish(text, url)
    pick = random.random()
    for limit in (140, 100, 60):  # shorten the story line before cutting the post
        line = first_sentences(song['description'], limit)
        key = stage if line else stage + '_bare'
        options = RELEASE_TEMPLATES[key]
        text = options[int(pick * len(options))].format(title=song['title'], line=line, when=when_text(left))
        if len(text) <= budget:
            break
    return finish(text, url)


def write_release_with_claude(song, stage, left, budget):
    rules = '\n'.join('- ' + r for r in CONFIG['voice_rules'])
    moment = (f'announce that the song comes out {when_text(left)} and that it can be pre-ordered on Bandcamp'
              if stage == 'soon' else 'announce that the song is out today')
    prompt = f"""Write one X post for musician Danyel OZ. The goal: {moment}.
Song: "{song['title']}" ({song['genre']}, {song['type']}, release date {song['date']})
About the song: {song['description'][:1500]}
The Bandcamp link is added after your text, so do not include any link.
Voice rules:
{rules}
Hard limit: {budget} characters. Output only the post text."""
    code, res = http('POST', 'https://api.anthropic.com/v1/messages', {
        'model': CONFIG['claude_model'], 'max_tokens': 400,
        'messages': [{'role': 'user', 'content': prompt}]},
        {'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01'})
    if code >= 300:
        print('Claude writer failed, using templates:', code, res)
        return ''
    text = ''.join(b.get('text', '') for b in res.get('content', [])).strip().strip('"')
    return text.replace('\u2014', ',').replace('\u2013', '-')[:budget]


def release_done(log):
    """Which (song, stage) posts already went out: from the log, and from the notice Issues as a second check."""
    done = {(p.get('song'), p.get('release')) for p in log if p.get('kind') == 'release' and p.get('status') == 'posted'}
    if GH_TOKEN:
        for it in gh('GET', f'/repos/{REPO}/issues?labels=x-release&state=all&per_page=100'):
            m = re.search(r'<!-- release:(\{.*?\}) -->', it.get('body') or '')
            if m:
                k = json.loads(m.group(1))
                done.add((k.get('song'), k.get('stage')))
    return done


def cmd_release():
    """Runs every night at 1 AM Manila. Posts at most one release post per night, without approval:
    'out' when a song's release date is today, otherwise 'soon' when a song is 1 to 7 days away.
    Each song gets each post once. A missed night is not made up later, so nothing says "out today" on the wrong day."""
    log = load(LOG_PATH, [])
    today = today_manila()
    done = release_done(log)
    due = []
    for r in sheet_rows():
        title = (r.get('song_title') or '').strip()
        m = re.match(r'(\d{4}-\d{2}-\d{2})', (r.get('release_date') or '').strip())
        if not title or not m:
            continue
        left = (date.fromisoformat(m.group(1)) - today).days
        stage = 'out' if left == 0 else 'soon' if 1 <= left <= SOON_DAYS else ''
        if stage and (title, stage) not in done:
            due.append((0 if stage == 'out' else 1, abs(left), title, stage, left, r))
    if not due:
        print('No release post due today.')
        return
    due.sort(key=lambda x: x[:3])
    _, _, title, stage, left, r = due[0]
    url = bandcamp_url(r.get('bandcamp_embed'))
    if not url:
        msg = (f'"{title}" comes out {r.get("release_date")}, but its row has no Bandcamp code, so the '
               f'{"coming soon" if stage == "soon" else "out now"} post was skipped. Add the code in the admin app '
               'and it goes out at the next 1 AM run.')
        print(msg)
        if GH_TOKEN and not os.environ.get('DRY_RUN'):
            open_ = gh('GET', f'/repos/{REPO}/issues?labels=x-release-skipped&state=open')
            if not any(title in (i.get('title') or '') for i in open_):
                gh('POST', f'/repos/{REPO}/issues', {'title': f'Release post skipped: {title}', 'body': msg,
                                                      'labels': ['x-release-skipped'], 'assignees': [OWNER]})
        return
    song = {'title': title, 'genre': (r.get('song_genre') or '').strip(), 'type': (r.get('release_type') or '').strip(),
            'date': (r.get('release_date') or '').strip(), 'description': (r.get('song_description') or '').strip()}
    text = write_release(song, stage, left, url)
    if os.environ.get('DRY_RUN'):
        print(f'DRY RUN ({stage}, {left} days):\n{text}')
        return
    res = x_post(text)
    now = datetime.now(MANILA)
    log.append({'id': res['id'], 'song': title, 'hook': 'release-' + stage, 'link': 'bandcamp', 'kind': 'release',
                'release': stage, 'text': text, 'posted_at': now.isoformat(timespec='minutes'), 'hour': now.hour,
                'weekday': now.strftime('%a'), 'revisions': 0, 'status': 'posted', 'test': bool(res.get('test')),
                'metrics': {}, 'score': None})
    save(LOG_PATH, log)
    link = '' if res.get('test') else f'\n\nhttps://x.com/i/web/status/{res["id"]}'
    label = 'coming soon' if stage == 'soon' else 'out now'
    if GH_TOKEN:
        meta = json.dumps({'song': title, 'stage': stage})
        it = gh('POST', f'/repos/{REPO}/issues', {
            'title': f'Posted to X: {title} ({label})',
            'body': ('🧪 Test mode: logged, nothing went to X.' if res.get('test') else '✅ Posted automatically at 1 AM Manila.')
                    + link + f'\n\n> {text}\n\n<!-- release:{meta} -->',
            'labels': ['x-release'], 'assignees': [OWNER]})
        gh('PATCH', f'/repos/{REPO}/issues/{it["number"]}', {'state': 'closed'})
    print('POSTED')


if __name__ == '__main__':
    {'draft': cmd_draft, 'handle': cmd_handle, 'metrics': cmd_metrics, 'check': cmd_check,
     'release': cmd_release}[sys.argv[1]]()
