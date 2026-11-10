# Danyel OZ embeds

Live widgets for [danyeloz.info](https://www.danyeloz.info/home), served with GitHub Pages and
embedded in Google Sites with **Insert → Embed → By URL** (choose "Whole page").

Edit a page here, commit, and the website updates by itself (GitHub Pages can take up to about 10 minutes to refresh).
Each page has a **Settings** block at the top of its script.

| Page | Section |
|---|---|
| `player.html` | Listen Now: player card |
| `song-info.html` | Listen Now: song details |
| `upcoming-player.html` | Upcoming Release: player card |
| `upcoming-details.html` | Upcoming Release: song details |
| `featured-videos.html` | Featured Videos |
| `explore-music.html` | Explore the Music |
| `music-highlights.html` | Music Highlights (music_highlights tab) |
| `explore-releases.html` | Released page: Explore Releases panel with All, Albums, Singles, EPs, Holiday tabs (Sheet1) |
| `tiny-desk.html` | Behind the Scenes: My Tiny Desk card (photo in `images/`, YouTube link in Settings) |
| `in-progress.html` | Behind the Scenes: In Progress (coming next, upcoming singles/album, 1000 Songs, release calendar) |
| `letter.html` | Connect: Write Me a Letter card (button opens the Cognito form) |
| `follow-along.html` | Connect: Follow Along social links |
| `acoustic-takes.html` | Live: Acoustic Takes (song_genre contains Acoustic; plays YouTube or Bandcamp in place) |
| `coming-soon.html` | Store: merch waitlist (Cognito form in Settings) and Production Vault card |
| `available-now.html` | Store: Bandcamp releases (bandcamp_embed), listen and buy in place |
| `know-me.html` | About: profile card (photo in `images/`, Releases counted from the sheet) and story |
| `support.html` | About: Fuel the journey (Patreon, Buy Me a Coffee, Ko-fi, PayPal) |
| `release-shelf.html` | Released page: swipeable shelf, `?type=Single`, `EP` or `Album` (Sheet1) |
| `featured-singles.html` | Singles page: the 10 Featured Singles (featured_singles tab), details left and Bandcamp player right; `?layout=list`, `?n=3` |
| `explore-themes.html` | Singles page: Explore by Theme (themes tab + song_theme_1/2), small player, Read more, Share; `?theme=Heartbreak` |
| `albums.html` | Albums page: Coming next banner on top, Now spinning, collections, sleeves in each album's color (albums + album_collections tabs); `?only=next` shows just the banner (latest album when nothing is coming) |

Data comes from the public Song Database sheet and the Apple Music catalog. Nothing secret lives here.
The data entry app lives in the private repo `DanyelOZ-Official-Website`.
- `footer.html`: site footer. LISTEN EVERYWHERE pills (4 shown, the rest behind +N more) and the copyright line.
- `x-dashboard.html`: X post performance. The agent itself lives in `x-agent/` (see its README).
