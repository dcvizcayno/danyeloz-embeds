# Danyel OZ: handoff summary

_Last updated: November 9, 2026_

## What's built

### 1. danyeloz.info redesign (live)
Every top page now matches the mockups and is published: Released, Behind the Scenes, Connect, Live, Store and About, plus a site-wide footer.

- **Widgets** are small web pages embedded in Google Sites as `<iframe>` code embeds. They read the Song Database, so new songs show up automatically.
- **Bandcamp plays in place**, with full songs and no new tabs. Cover art uses `song_arts` first, then falls back to Apple artwork found by `song_id`.
- **Site rule:** no new tabs. Internal links are native Sites buttons, and only outside sites open in a new tab.
- **Footer:** LISTEN EVERYWHERE pills (Spotify, Apple Music, YouTube Music, Bandcamp) and **+6 more**, which opens in place to show Amazon Music, Deezer, YouTube, Pandora, Audiomack and Boomplay.

### 2. X post agent (live and approved; first real post pending)
- **Daily draft at 7:07 PM Manila.** It picks a song with a `bandcamp_embed` (50 songs) and drafts a post linking to the song's Bandcamp page.
- **Approval:** each draft is a GitHub Issue. Tick **Post** and it goes to X. Tick **Revise** for a new version; comment a note first to steer it.
- **Weekly report every Monday at 9:23 AM.** It pulls views, likes, replies, reposts and link clicks, then leans toward the approaches that work.
- **Signed in as @danyeloz1554.** The key check passed using the X app in **Default Project (Pay Per Use)**.
- **Cost:** about $0.20 per post with a link, from Default Project credits.

## Where it lives

| What | Where |
|---|---|
| Website | Google Sites, https://www.danyeloz.info |
| Song Database (single source of truth) | Google Sheet `1WD98RYgWPURqwtczPYEblCOOPFutAIO1jf42oSfbzPw` |
| Widgets and the X agent | GitHub **dcvizcayno/danyeloz-embeds** (public), served at https://dcvizcayno.github.io/danyeloz-embeds/ |
| Widget list | `README.md` and `index.html` in that repo |
| X agent code and setup | `x-agent/` (`agent.py`, `config.json`, `README.md`) |
| X workflows | `.github/workflows/`: `x-draft.yml`, `x-approve.yml`, `x-metrics.yml`, `x-check.yml` |
| X post log and learning | `data/x-posts.json`, `x-agent/playbook.json` |
| X dashboard | https://dcvizcayno.github.io/danyeloz-embeds/x-dashboard.html |
| X keys | GitHub Secrets in danyeloz-embeds: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` |
| Apps Script (Song Database data-entry app) | Private repo **dcvizcayno/DanyelOZ-Official-Website** |

### Key widgets by page
- **Released:** `explore-releases.html`, `release-shelf.html?type=Single|EP|Album|Holiday`
- **Behind the Scenes:** `tiny-desk.html`, `in-progress.html`
- **Connect:** `follow-along.html`, plus the Cognito contact form embed
- **Live:** `acoustic-takes.html` (songs with "Acoustic" genre), plus the Songkick widget
- **Store:** `available-now.html`, `coming-soon.html`
- **About:** `know-me.html`, `support.html`
- **Footer:** `footer.html`

## Pending

1. **First real X post.** Open Issue #2 ("NOTE TO SELF"), tick **Revise** to clear the old test-mode banner, then tick **Post**.
2. **Store waitlist link.** `coming-soon.html` has an empty `WAITLIST=''`. When the Cognito "Merch waitlist" form is ready, send its public link; it's converted to the `/f/` address and pushed.
3. **Move the X agent to a private repo.** Recommended target: **DanyelOZ-Official-Website** (already private). Move `x-agent/`, `data/x-posts.json`, `x-dashboard.html` and the four `x-*.yml` workflows, then re-add the 4 X secrets there. Widgets stay in the public danyeloz-embeds repo, since free GitHub Pages needs a public repo.
4. **Regenerate the keys of the app in the Ads project** (DanyelOZ_Official_Websites). They were pasted in chat. They're unused, so regenerating is safe.
5. **Shorts inventory, then automation.** Some Shorts are only on TikTok, others only on YouTube.
   - Build a "Shorts" tab: song_title, TikTok link, YouTube link, location of the original file.
   - Backfill gaps by hand using the original files, not TikTok downloads with the watermark.
   - Automate afterwards with the same Post or Revise approval. YouTube and TikTok APIs only post publicly after an app audit, so apply early.
   - Open question: where do the original Short video files live (Mac, Google Drive, or only on the platforms)?
6. **Song Database gaps.** `song_description` 38 of 215, `bandcamp_embed` 50, `song_arts` 53. Twelve of the 50 X-eligible songs have no description, so their posts read generic.
7. **Optional:** add `ANTHROPIC_API_KEY` as a GitHub secret so Claude writes X posts in Danyel OZ's voice instead of templates.

## Notes and rules to keep
- **Ask before anything permanent:** publishing, moving pages, changing URLs. Daniel does the Sites swaps and publishing himself.
- **No new tabs** on the site. In-place players and native buttons.
- **song_arts first** for cover art, especially for new songs.
- **Writing voice:** simple and honest, show don't tell, light humor, **no em dashes**.
- **Google Sites editing tips:** duplicate a page as "X v2" to work on it. Swap embed code with the pencil on code embeds. Paste text through the clipboard, because typing "·" fails. Check focus before pressing Backspace, since it can delete whole sections.
- **Commits** go out as Danyel OZ <daniel.vizcayno@gmail.com>.
