/*
 * Match statistics — pure functions over a match. See METRICS.md for definitions.
 *
 * Tags are optional, so every rate is computed over the rallies where the
 * information exists, and each rate carries its numerator and denominator.
 */
(function (root) {
  'use strict';

  const engine = (typeof module === 'object' && module.exports)
    ? require('./engine.js')
    : root.PBA.engine;

  const isError = (d) => d.ending === 'ue' || d.ending === 'fe';
  const teamOf = (ref) => (ref ? ref[0] : null);

  function rate(n, of) {
    return { n, of, pct: of > 0 ? n / of : null };
  }

  /* Which team hit the last shot: the tagged player, otherwise inferred from who won. */
  function lastShotTeam(d, res) {
    if (d.by) return teamOf(d.by);
    if (d.ending === 'winner') return res.winner;
    if (isError(d)) return engine.other(res.winner);
    return null;
  }

  function lastShotPlayer(d, res) {
    if (d.by) return d.by;
    if (d.shot === 'serve' && isError(d)) return res.server;
    if (d.shot === 'return') return d.ending === 'winner' || isError(d) ? res.receiver : null;
    return null;
  }

  const isServeFault = (d, res) => d.shot === 'serve' && isError(d) && lastShotTeam(d, res) === res.servingTeam;
  const isReturnError = (d, res) => d.shot === 'return' && isError(d) && lastShotTeam(d, res) === res.receivingTeam;
  const isThirdError = (d, res) =>
    d.thirdLand === 'net' || d.thirdLand === 'out' ||
    (d.shot === 'third' && isError(d) && lastShotTeam(d, res) === res.servingTeam);

  function rallyLength(d) {
    const n = parseInt(d.shots, 10);
    if (n > 0) return n;
    if (d.shot === 'serve') return 1;
    if (d.shot === 'return') return 2;
    if (d.shot === 'third') return 3;
    return null;
  }

  const LENGTH_BUCKETS = [
    { label: '1–2', min: 1, max: 2 },
    { label: '3–5', min: 3, max: 5 },
    { label: '6–10', min: 6, max: 10 },
    { label: '11–20', min: 11, max: 20 },
    { label: '21+', min: 21, max: Infinity },
  ];

  function emptyTeam() {
    return {
      rallies: 0, won: 0, points: 0,
      served: 0, servedWon: 0, returned: 0, returnedWon: 0,
      serveFaults: 0, returnsHit: 0, returnErrors: 0,
      winners: 0, ue: 0, fe: 0,
      thirdChances: 0, third: { drop: 0, drive: 0, lob: 0 }, thirdTagged: 0,
      drops: 0, dropLanded: 0, dropKitchen: 0, dropShort: 0, thirdErrors: 0,
      dropLand: { kitchen: 0, short: 0, deep: 0, net: 0, out: 0 },
      longestRun: 0,
    };
  }

  function emptyPlayer(ref) {
    return { ref, team: ref[0], serves: 0, serveFaults: 0, returns: 0, returnErrors: 0, winners: 0, ue: 0, fe: 0 };
  }

  function compute(match, opts) {
    const rep = engine.replay(match);
    const game = opts && opts.game != null && opts.game !== 'all' ? Number(opts.game) : 'all';
    const doubles = rep.settings.format === 'doubles';
    const refs = doubles ? ['A0', 'A1', 'B0', 'B1'] : ['A0', 'B0'];

    const rows = rep.results
      .filter((r) => !r.ignored && (game === 'all' || r.game === game))
      .map((res) => ({ res, d: (match.rallies[res.index] && match.rallies[res.index].d) || {} }));

    const teams = { A: emptyTeam(), B: emptyTeam() };
    const players = {};
    refs.forEach((ref) => { players[ref] = emptyPlayer(ref); });
    const errorsByShot = {};
    const errorsByMiss = {};
    const lengths = [];
    let tagged = 0;
    let run = { team: null, n: 0, game: null };

    rows.forEach(({ res, d }) => {
      const S = res.servingTeam;
      const R = res.receivingTeam;
      const W = res.winner;
      if (Object.keys(d).some((k) => d[k] !== '' && d[k] != null)) tagged += 1;

      ['A', 'B'].forEach((t) => { teams[t].rallies += 1; });
      teams[W].won += 1;
      if (res.pointTo) teams[res.pointTo].points += 1;

      teams[S].served += 1;
      if (W === S) teams[S].servedWon += 1;
      teams[R].returned += 1;
      if (W === R) teams[R].returnedWon += 1;

      // Serve & return. Untagged rallies count as a serve in and a return in.
      const serveFault = isServeFault(d, res);
      if (players[res.server]) players[res.server].serves += 1;
      if (serveFault) {
        teams[S].serveFaults += 1;
        if (players[res.server]) players[res.server].serveFaults += 1;
      } else {
        teams[R].returnsHit += 1;
        if (players[res.receiver]) players[res.receiver].returns += 1;
      }
      const returnError = !serveFault && isReturnError(d, res);
      if (returnError) {
        teams[R].returnErrors += 1;
        if (players[res.receiver]) players[res.receiver].returnErrors += 1;
      }

      // 3rd shot: only exists when serve and return were both in.
      if (!serveFault && !returnError) {
        const T = teams[S];
        T.thirdChances += 1;
        if (d.third && T.third[d.third] != null) {
          T.third[d.third] += 1;
          T.thirdTagged += 1;
        }
        if (d.third === 'drop') {
          T.drops += 1;
          if (d.thirdLand) {
            T.dropLanded += 1;
            if (T.dropLand[d.thirdLand] != null) T.dropLand[d.thirdLand] += 1;
            if (d.thirdLand === 'kitchen') T.dropKitchen += 1;
            if (d.thirdLand === 'short') T.dropShort += 1;
          }
        }
        if (isThirdError(d, res)) T.thirdErrors += 1;
      }

      // Rally endings
      if (d.ending) {
        const team = lastShotTeam(d, res);
        const who = lastShotPlayer(d, res);
        if (team) {
          if (d.ending === 'winner') teams[team].winners += 1;
          if (d.ending === 'ue') teams[team].ue += 1;
          if (d.ending === 'fe') teams[team].fe += 1;
        }
        if (who && players[who]) {
          if (d.ending === 'winner') players[who].winners += 1;
          if (d.ending === 'ue') players[who].ue += 1;
          if (d.ending === 'fe') players[who].fe += 1;
        }
        if (isError(d) && team) {
          const shot = d.shot || 'untagged';
          errorsByShot[shot] = errorsByShot[shot] || { A: 0, B: 0 };
          errorsByShot[shot][team] += 1;
          if (d.miss) {
            errorsByMiss[d.miss] = errorsByMiss[d.miss] || { A: 0, B: 0 };
            errorsByMiss[d.miss][team] += 1;
          }
        }
      }

      const len = rallyLength(d);
      if (len) lengths.push(len);

      // Scoring runs (consecutive points by one team within a game)
      if (res.game !== run.game) run = { team: null, n: 0, game: res.game };
      if (res.pointTo) {
        if (run.team === res.pointTo) run.n += 1;
        else run = { team: res.pointTo, n: 1, game: res.game };
        teams[run.team].longestRun = Math.max(teams[run.team].longestRun, run.n);
      }
    });

    const derived = {};
    ['A', 'B'].forEach((t) => {
      const T = teams[t];
      derived[t] = {
        wonOnServe: rate(T.servedWon, T.served),
        wonOnReturn: rate(T.returnedWon, T.returned),
        serveIn: rate(T.served - T.serveFaults, T.served),
        returnIn: rate(T.returnsHit - T.returnErrors, T.returnsHit),
        thirdDrop: rate(T.third.drop, T.thirdTagged),
        thirdDrive: rate(T.third.drive, T.thirdTagged),
        thirdLob: rate(T.third.lob, T.thirdTagged),
        dropKitchen: rate(T.dropKitchen, T.dropLanded),
        dropShort: rate(T.dropShort, T.dropLanded),
        thirdError: rate(T.thirdErrors, T.thirdChances),
      };
    });

    const buckets = LENGTH_BUCKETS.map((b) => ({
      label: b.label,
      n: lengths.filter((x) => x >= b.min && x <= b.max).length,
    }));

    // Score flow: the score after every rally that changed it, per game.
    const flow = rep.games
      .filter((g) => game === 'all' || g.index === game)
      .map((g) => {
        const points = [{ rally: 0, A: 0, B: 0 }];
        rep.results.forEach((res) => {
          if (res.ignored || res.game !== g.index) return;
          points.push({ rally: res.rallyInGame, A: res.after.score.A, B: res.after.score.B, pointTo: res.pointTo });
        });
        return { game: g.index, winner: g.winner, done: g.done, score: g.score, points };
      });

    return {
      rep,
      game,
      rallies: rows.length,
      tagged,
      teams,
      rates: derived,
      players: refs.map((ref) => players[ref]),
      errorsByShot,
      errorsByMiss,
      length: {
        n: lengths.length,
        avg: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null,
        max: lengths.length ? Math.max.apply(null, lengths) : null,
        buckets,
      },
      flow,
    };
  }

  const api = { compute, rallyLength, isServeFault, isReturnError, LENGTH_BUCKETS };
  root.PBA = root.PBA || {};
  root.PBA.stats = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
