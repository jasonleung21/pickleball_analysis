# Pickleball Match Charter

Chart a pickleball match from video and turn it into stats.

- **Keeps the official score** for every rally: side-out (`0-0-2`) or rally scoring, doubles or singles, games to 11/15/21, best of 1/3/5. It tracks who serves, server 1/2, who stands on which side and who receives.
- **Broadcast-style scorebug over the video.** When you scrub back, it shows the score *at that moment*, the same way YouTube match breakdowns do.
- **Optional rally tags:** how the rally ended (winner / unforced / forced error), who hit the last shot, which shot, where the miss went, the 3rd shot type (drop / drive / lob) and where it landed (kitchen / short / deep / net / out), and rally length.
- **Stats:** score flow per game, won-on-serve / won-on-return %, serve-in and return-in %, 3rd-shot mix, **3rd-shot drop kitchen landing rate** and **short rate**, errors by shot, per-player numbers, rally length.
- Works with a **local video file**, a **YouTube link**, or **no video** (courtside scoring on a phone).
- No install, no account, no server. Data stays in your browser. Export as JSON (to back up or move) or CSV (one row per rally, for Excel or Sheets).

The app opens on a generated sample match (example data) so you can look around. Press **Start your own match** to begin.

## Run it

It's a static site: open `index.html` in a browser.

YouTube embeds need the page served over `http(s)://`, not opened as a file:

```bash
npx serve .              # or: python3 -m http.server 8080
```

To use it on your phone, turn on **GitHub Pages** for this repo (Settings → Pages → Deploy from branch → `main` / root). The app is then at `https://<user>.github.io/pickleball_analysis/`.

## Charting a match

1. **Match tab:** name the teams and players, then pick format, scoring, game length and best-of. Under *Who starts each game*, set who serves first and which player starts in the right-hand court. The court diagram on the Chart tab should match the video.
2. **Chart tab:** open the video (file or YouTube link) and press play.
3. When a rally ends, press the team that won it (**1** / **2**). Use **F** for a serve fault and **R** for a return error. Both log the rally, the winner and the error in one key.
4. Add tags to the rally you just logged in the details panel. Tags are optional; the score only needs the winner.
5. Press **S** when the serve is hit if you want rally replays to start at the serve. Otherwise a replay starts where the previous rally ended.
6. Made a mistake? **U** undoes the last rally. Click any row in the log to fix who won it or change its tags; the score after it is recalculated.

| Key | Action |
| --- | --- |
| `1` / `2` | Team 1 / team 2 won the rally |
| `F` | Serve fault (receiving team wins, error tagged on the server) |
| `R` | Return error (serving team wins, error tagged on the receiver) |
| `U` or `Ctrl/⌘+Z` | Undo last rally |
| `S` | Mark the serve (start of the rally) |
| `Space` | Play / pause |
| `←` `→` | Back / forward 5 s (`Shift` = 1 s) |
| `[` `]` | Previous / next rally in the details panel |
| `Esc` | Leave a text box so the keys work again |

## Scoring rules implemented

- **Side-out doubles:** the game starts at `0-0-2` with only one server. Only the serving team scores. After a point, the server and partner swap sides. When server 1 loses a rally, the partner serves; when server 2 loses, it's a side out, and the player in the right-hand court serves first.
- **Rally scoring doubles** (MLP style): every rally scores. When the receiving team wins, it scores and takes the serve; whoever stands on the side matching their score (even → right) serves. The serving team switches sides when it wins a point.
- **Singles:** serve from the right when the server's score is even, the left when odd.
- Win by 2 (configurable). Teams switch ends at 6 (8 in games to 15, 11 in games to 21) in the deciding game.
- The provisional "freeze" rule in USA Pickleball rally scoring is **not** implemented yet.

Rallies are stored as an ordered list of *who won*. Everything else (score, server, positions, game results) is recalculated by replaying that list. That's why undo, delete and "who won rally 14" edits are always consistent.

## Project layout

```
index.html        page shell
css/app.css       styles (light and dark)
js/engine.js      scoring engine: replays rallies → score, server, positions, games
js/config.js      what can be tagged on a rally (drives the details panel and CSV)
js/stats.js       metrics computed from a match
js/video.js       local file / YouTube player behind one interface
js/sample.js      generated sample match
js/app.js         UI
tests/            node:test unit tests for the engine and stats
METRICS.md        metric definitions and ideas for what to add next
```

## Tests

```bash
npm test          # = node --test tests/*.test.js  (Node 18+)
```

## Adding a metric

1. Add the tag to `CHART_GROUPS` in `js/config.js`. The details panel and CSV pick it up automatically.
2. Compute it in `js/stats.js` and show it in `renderStats()` in `js/app.js`.
3. Add a test in `tests/stats.test.js`.

See [METRICS.md](METRICS.md) for current definitions and candidates.
