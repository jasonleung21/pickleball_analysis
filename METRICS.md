# Metrics

What the charter records, how each stat is calculated, and candidates for what to add next.

## What gets recorded per rally

| Field | Values | Where it comes from |
| --- | --- | --- |
| `winner` | team A / B | **Required.** The only thing scoring needs. |
| `t0`, `t1` | video seconds | Serve mark (`S`) and the moment the rally was logged |
| `ending` | winner · unforced error · forced error | tag |
| `by` | player | tag (filled in by the Serve fault / Return error buttons) |
| `shot` | serve · return · 3rd shot · dink · drop/reset · drive · volley · lob · overhead · ATP/Erne · other | tag |
| `miss` | net · out long · out wide · kitchen fault | tag (only for errors) |
| `third` | drop · drive · lob | tag |
| `thirdLand` | kitchen · short (transition zone) · deep · net · out | tag |
| `shots` | number | tag (inferred as 1 / 2 / 3 when the rally ended on the serve / return / 3rd shot) |
| `note` | text | tag |

These are derived from the replay, not tagged: serving team, server, receiver, score call, point / side out / second server, game and match result.

## Current stats

Rates show as `%` with `count / attempts` next to them, so a 100% from 2 attempts doesn't look like a 100% from 40.

| Stat | Definition |
| --- | --- |
| Rallies won | Rallies the team won, on serve or on return |
| Points scored | Points on the scoreboard (in side-out scoring only the serving team scores) |
| Won when serving | Rallies won ÷ rallies the team served |
| Won when returning | Rallies won ÷ rallies the team received. This is the side-out battle. |
| Serves in | 1 − serve faults ÷ serves. **Untagged rallies count as a serve in.** |
| Returns in | 1 − return errors ÷ returns faced (rallies where the serve was in) |
| Winners / UE / FE | Rallies ending with that tag, credited to the `by` player. If `by` is empty, credited to the team implied by who won. |
| Longest scoring run | Most consecutive points by one team within a game |
| 3rd shot mix | Drop / drive / lob ÷ rallies with the 3rd shot type tagged |
| **Drops landing in the kitchen** | 3rd-shot drops tagged *kitchen* ÷ drops with a landing tagged |
| **Drops landing short** | 3rd-shot drops tagged *short (transition zone)* ÷ drops with a landing tagged |
| 3rd shot errors | 3rd shots tagged *net/out*, or rallies ending on a 3rd-shot error by the serving team, ÷ rallies where serve and return were both in |
| Errors by shot | UE + FE counted by the last shot of the rally, per team |
| Rally length | Average, longest and distribution (1–2, 3–5, 6–10, 11–20, 21+) |
| Score flow | Score after every rally, per game |

Every stat can be filtered to a single game.

## Candidates for next

Grouped by how much extra tagging they need. The more taps per rally, the slower a match is to chart, so it's worth choosing deliberately.

**No extra tagging**
- Points won per server and per serving turn (how many points each service turn produced)
- Side-out efficiency: service turns ended in one rally vs. in two
- Momentum: longest stretch without scoring, comebacks from a deficit

**One more tag per rally**
- Return depth (deep / mid / short) and whether the returner reached the kitchen line
- Serve depth or target (deep / short, to the backhand / forehand)
- 5th shot: type and landing, like the 3rd shot
- Kitchen arrival: did the serving team reach the kitchen line by the 5th shot?
- Speed-ups: who sped up first, and whether that team won the rally

**Shot-by-shot charting** (biggest change, slowest to chart)
- Log every shot: player, shot type, landing zone. This allows a kitchen landing rate for **all** drops and dinks, dink-rally length, error location heat maps, and per-player shot quality.
- A middle ground is charting every shot only for chosen rallies, or only for one player.

## Adding one

1. `js/config.js`: add the field or option to `CHART_GROUPS`
2. `js/stats.js`: count it in `compute()` and expose a rate
3. `js/app.js`: show it in `renderStats()`
4. `tests/stats.test.js`: add a case
