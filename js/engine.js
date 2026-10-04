/*
 * Scoring engine — pure functions, no DOM.
 *
 * A match is stored as settings + an ordered list of rallies (who won each one).
 * Everything else — score, who serves, server number, player positions, game and
 * match results — is derived by replaying the rallies from the start. That makes
 * undo, delete and "edit who won rally 14" trivially correct.
 *
 * Supported formats:
 *   doubles / singles  ×  side-out scoring (traditional) / rally scoring
 */
(function (root) {
  'use strict';

  const DEFAULT_SETTINGS = {
    format: 'doubles',   // 'doubles' | 'singles'
    scoring: 'sideout',  // 'sideout' | 'rally'
    pointsToWin: 11,
    winBy: 2,
    bestOf: 3,           // 1 | 3 | 5
    firstServer: 'A',    // team that serves first in game 1
  };

  const other = (t) => (t === 'A' ? 'B' : 'A');

  function normalizeSettings(s) {
    const out = Object.assign({}, DEFAULT_SETTINGS, s || {});
    out.pointsToWin = Math.max(1, parseInt(out.pointsToWin, 10) || 11);
    out.winBy = Math.max(1, parseInt(out.winBy, 10) || 2);
    out.bestOf = Math.max(1, parseInt(out.bestOf, 10) || 1);
    if (out.bestOf % 2 === 0) out.bestOf += 1;
    if (out.format !== 'singles') out.format = 'doubles';
    if (out.scoring !== 'rally') out.scoring = 'sideout';
    if (out.firstServer !== 'B') out.firstServer = 'A';
    return out;
  }

  /*
   * Who serves first and who stands on the right-hand court at the start of a game.
   * `right[T]` is the index (0/1) of the team-T player starting in the right court.
   * Game 1 uses the match settings; later games alternate the first serving team
   * unless the user set them explicitly in match.gameStarts[i].
   */
  function gameStartConfig(match, gameIndex) {
    const s = normalizeSettings(match.settings);
    const starts = match.gameStarts || [];
    const saved = starts[gameIndex] || {};
    const first = starts[0] || {};
    const defFirst = gameIndex % 2 === 0 ? s.firstServer : other(s.firstServer);
    const pick = (t) => {
      if (saved.right && (saved.right[t] === 0 || saved.right[t] === 1)) return saved.right[t];
      if (first.right && (first.right[t] === 0 || first.right[t] === 1)) return first.right[t];
      return 0;
    };
    return {
      firstServer: saved.firstServer === 'A' || saved.firstServer === 'B' ? saved.firstServer : defFirst,
      right: { A: pick('A'), B: pick('B') },
    };
  }

  function newGame(match, s, gameIndex) {
    const cfg = gameStartConfig(match, gameIndex);
    const doubles = s.format === 'doubles';
    return {
      game: gameIndex,
      score: { A: 0, B: 0 },
      serving: cfg.firstServer,
      // Side-out doubles starts at "0-0-2": the first serving team gets one server only.
      serverNum: doubles && s.scoring === 'sideout' ? 2 : 1,
      serverIdx: doubles ? cfg.right[cfg.firstServer] : 0,
      right: { A: cfg.right.A, B: cfg.right.B },
      rallyInGame: 0,
      endsSwitched: false,
    };
  }

  /* Public, self-describing view of a game state. */
  function describe(st, s) {
    const doubles = s.format === 'doubles';
    const serving = st.serving;
    const receiving = other(serving);
    let serverSide;
    if (doubles) serverSide = st.right[serving] === st.serverIdx ? 'R' : 'L';
    else serverSide = st.score[serving] % 2 === 0 ? 'R' : 'L';
    // Serves go diagonally: right court serves to the receiver's right court.
    let receiverIdx = 0;
    if (doubles) receiverIdx = serverSide === 'R' ? st.right[receiving] : 1 - st.right[receiving];

    const positions = { A: {}, B: {} };
    ['A', 'B'].forEach((t) => {
      if (doubles) {
        positions[t].R = st.right[t];
        positions[t].L = 1 - st.right[t];
      } else {
        // Singles: each player stands on the side matching the server's score parity.
        const side = serverSide;
        positions[t][side] = 0;
      }
    });

    const call = s.scoring === 'sideout' && doubles
      ? `${st.score[serving]}-${st.score[receiving]}-${st.serverNum}`
      : `${st.score[serving]}-${st.score[receiving]}`;

    return {
      game: st.game,
      score: { A: st.score.A, B: st.score.B },
      serving,
      receiving,
      serverNum: st.serverNum,
      serverIdx: st.serverIdx,
      server: serving + st.serverIdx,          // player ref, e.g. "A0"
      serverSide,
      receiverIdx,
      receiver: receiving + receiverIdx,       // player ref, e.g. "B1"
      positions,
      call,
      rallyInGame: st.rallyInGame,
    };
  }

  /* Mutates st. Returns facts about what the rally did. */
  function applyRally(st, winner, s, isFinalGame) {
    const doubles = s.format === 'doubles';
    const serving = st.serving;
    let pointTo = null;
    let sideOut = false;
    let secondServer = false;

    if (s.scoring === 'sideout') {
      if (winner === serving) {
        st.score[serving] += 1;
        pointTo = serving;
        if (doubles) st.right[serving] = 1 - st.right[serving]; // server and partner swap sides
      } else if (doubles && st.serverNum === 1) {
        st.serverNum = 2;
        st.serverIdx = 1 - st.serverIdx; // partner serves from where they stand
        secondServer = true;
      } else {
        st.serving = other(serving);
        st.serverNum = 1;
        st.serverIdx = doubles ? st.right[st.serving] : 0; // right-court player serves first
        sideOut = true;
      }
    } else {
      st.score[winner] += 1;
      pointTo = winner;
      if (winner === serving) {
        if (doubles) st.right[serving] = 1 - st.right[serving];
      } else {
        st.serving = winner;
        sideOut = true;
        if (doubles) {
          // Rally scoring: even score → right-court player serves, odd → left-court player.
          const even = st.score[winner] % 2 === 0;
          st.serverIdx = even ? st.right[winner] : 1 - st.right[winner];
        } else {
          st.serverIdx = 0;
        }
      }
    }
    st.rallyInGame += 1;

    let gameOver = false;
    if (pointTo) {
      const lead = st.score[pointTo] - st.score[other(pointTo)];
      gameOver = st.score[pointTo] >= s.pointsToWin && lead >= s.winBy;
    }

    // Change ends in the deciding game when the first team reaches half the target (6 of 11).
    let switchEnds = false;
    if (isFinalGame && !st.endsSwitched && !gameOver && pointTo) {
      const half = Math.ceil(s.pointsToWin / 2);
      if (st.score[pointTo] === half) {
        st.endsSwitched = true;
        switchEnds = true;
      }
    }

    return { pointTo, sideOut, secondServer, gameOver, gameWinner: gameOver ? pointTo : null, switchEnds };
  }

  /*
   * Replay all rallies. Returns:
   *   results[i]  — per rally: state before/after, server, receiver, what happened
   *   games       — finished (and current) games with scores
   *   current     — the live state (who serves next, the call, positions)
   */
  function replay(match) {
    const s = normalizeSettings(match.settings);
    const need = Math.floor(s.bestOf / 2) + 1;
    const gamesWon = { A: 0, B: 0 };
    const games = [];
    const results = [];
    const rallies = match.rallies || [];
    let st = newGame(match, s, 0);
    let gameFirstRally = 0;
    let matchOver = false;
    let matchWinner = null;

    for (let i = 0; i < rallies.length; i++) {
      const r = rallies[i];
      if (matchOver || (r.winner !== 'A' && r.winner !== 'B')) {
        results.push({ index: i, ignored: true });
        continue;
      }
      const before = describe(st, s);
      const isFinalGame = st.game === s.bestOf - 1;
      const fx = applyRally(st, r.winner, s, isFinalGame);
      const after = describe(st, s);
      results.push(Object.assign({
        index: i,
        game: before.game,
        rallyInGame: before.rallyInGame + 1,
        winner: r.winner,
        servingTeam: before.serving,
        receivingTeam: before.receiving,
        server: before.server,
        receiver: before.receiver,
        before,
        after,
      }, fx));

      if (fx.gameOver) {
        gamesWon[fx.gameWinner] += 1;
        games.push({
          index: st.game,
          score: { A: st.score.A, B: st.score.B },
          winner: fx.gameWinner,
          firstRally: gameFirstRally,
          lastRally: i,
          done: true,
        });
        if (gamesWon[fx.gameWinner] >= need) {
          matchOver = true;
          matchWinner = fx.gameWinner;
        } else {
          st = newGame(match, s, st.game + 1);
          gameFirstRally = i + 1;
        }
      }
    }

    if (!matchOver) {
      games.push({
        index: st.game,
        score: { A: st.score.A, B: st.score.B },
        winner: null,
        firstRally: gameFirstRally,
        lastRally: rallies.length - 1,
        done: false,
      });
    }

    return {
      settings: s,
      results,
      games,
      gamesWon,
      current: describe(st, s),
      matchOver,
      matchWinner,
    };
  }

  /*
   * State to display at a given video time: after the last rally that ended at or before t.
   * Rallies logged without a time (courtside, or before a video was loaded) count as
   * happening just before the next timed rally.
   */
  function stateAtTime(match, rep, t) {
    const rallies = match.rallies || [];
    if (t == null || !rallies.some((r) => typeof r.t1 === 'number')) return null;
    let last = -1;
    let effective = -Infinity;
    for (let i = 0; i < rallies.length; i++) {
      const r = rallies[i];
      if (typeof r.t1 === 'number') effective = r.t1;
      if (effective <= t + 0.05 && !rep.results[i].ignored) last = i;
    }
    if (last === -1) {
      const s = rep.settings;
      return { state: describe(newGame(match, s, 0), s), gamesWon: { A: 0, B: 0 }, rallyIndex: -1 };
    }
    const res = rep.results[last];
    const gamesWon = { A: 0, B: 0 };
    rep.games.forEach((g) => { if (g.done && g.lastRally <= last) gamesWon[g.winner] += 1; });
    let state = res.after;
    // If that rally ended a game, show the start of the next game (unless the match is over).
    if (res.gameOver) {
      const next = rep.results.find((x, j) => j > last && !x.ignored);
      if (next) state = next.before;
    }
    return { state, gamesWon, rallyIndex: last, gameJustEnded: res.gameOver ? res : null };
  }

  const api = {
    DEFAULT_SETTINGS,
    normalizeSettings,
    gameStartConfig,
    replay,
    stateAtTime,
    other,
  };

  root.PBA = root.PBA || {};
  root.PBA.engine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
