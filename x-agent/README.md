# Danyel OZ X post agent

Picks a song from the Song Database (only songs with both `bandcamp_embed` and `yt_video_link`), drafts an X post, and waits for your OK.

## How it works

1. **Every day at 7:07 PM Manila** (`x-draft.yml`) the agent opens a GitHub Issue titled "X draft: Song name" and assigns it to you. GitHub emails you and pings the GitHub mobile app. It won't open a new draft while one is still waiting.
2. **You decide** on the issue:
   - Tick **Post** and it goes to X. The issue closes with a link to the live post.
   - Tick **Revise** and you get a new version in the same issue. Comment a note first ("shorter", "mention the acoustic guitar") and it follows the note.
   - You can also edit the draft text in the issue yourself, then tick Post.
3. **Every Monday at 9:23 AM** (`x-metrics.yml`) it pulls views, likes, replies, reposts and link clicks, updates `playbook.json`, and opens a weekly report issue.
4. **It learns.** Every approach (question, story, invite, behind) and link type (YouTube, Bandcamp) gets tried at least 3 times. After that it mostly uses the winners and still experiments 20% of the time.

Every song gets a turn before any song repeats. Only you (the repo owner) can approve. Ticks from anyone else are ignored.

Dashboard: https://dcvizcayno.github.io/danyeloz-embeds/x-dashboard.html

## Setup (once you have the X developer account)

In the X Developer Console:
1. Create a Project and an App. Buy a little credit (each post with a link costs about $0.20).
2. In **User authentication settings**, set app permissions to **Read and write**.
3. Under **Keys and tokens**, copy the **API Key and Secret**, then generate the **Access Token and Secret** (after setting Read and write).

In GitHub, under repo **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
|---|---|
| `X_API_KEY` | API Key |
| `X_API_SECRET` | API Key Secret |
| `X_ACCESS_TOKEN` | Access Token |
| `X_ACCESS_SECRET` | Access Token Secret |
| `ANTHROPIC_API_KEY` | Optional. With it, Claude writes each post in your voice. Without it, the agent uses built-in templates. |

Until all four X secrets exist, the agent runs in **test mode**: drafts, revisions and the log all work, but nothing is sent to X.

## Try it now

**Actions → X draft → Run workflow** opens a draft right away.

## Tuning

`config.json` holds the voice rules, the approaches, how often it experiments, and the Claude model. To change the time of day, edit the `cron` line in `.github/workflows/x-draft.yml` (it's in UTC, so 11:07 UTC = 7:07 PM Manila).
