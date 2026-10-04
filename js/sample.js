/*
 * A generated example match so the app opens with something to look at.
 * Deterministic (seeded) so the sample is the same every time.
 */
(function (root) {
  'use strict';

  const engine = (typeof module === 'object' && module.exports)
    ? require('./engine.js')
    : root.PBA.engine;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rand, weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let x = rand() * total;
    for (const k of Object.keys(weights)) {
      x -= weights[k];
      if (x <= 0) return k;
    }
    return Object.keys(weights)[0];
  }

  // Team A drops a little better than team B — gives the stats something to show.
  const DROP_LAND = {
    A: { kitchen: 58, short: 24, net: 12, out: 6 },
    B: { kitchen: 44, short: 32, net: 16, out: 8 },
  };

  function create(seed) {
    const rand = rng(seed || 60);
    const match = {
      id: 'sample',
      sample: true,
      title: 'Sample match',
      date: '2026-10-04',
      settings: Object.assign({}, engine.DEFAULT_SETTINGS),
      teams: {
        A: { name: 'Blue', players: ['Alex', 'Ben'] },
        B: { name: 'Orange', players: ['Chris', 'Dana'] },
      },
      gameStarts: [],
      video: { source: 'none' },
      rallies: [],
    };

    for (let guard = 0; guard < 400; guard++) {
      const rep = engine.replay(match);
      if (rep.matchOver) break;
      // Stop partway through the deciding game so the sample can be charted onward.
      if (rep.current.game === 2 && rep.current.rallyInGame >= 33) break;
      const cur = rep.current;
      const S = cur.serving;
      const R = cur.receiving;
      const partner = (ref) => ref[0] + (1 - Number(ref[1]));
      const anyOf = (t) => t + (rand() < 0.5 ? 0 : 1);
      const d = {};
      let winner;

      if (rand() < 0.04) {
        Object.assign(d, { ending: 'ue', shot: 'serve', by: cur.server, miss: pick(rand, { net: 5, long: 3, wide: 2 }), shots: 1 });
        winner = R;
      } else if (rand() < 0.05) {
        Object.assign(d, { ending: 'ue', shot: 'return', by: cur.receiver, miss: pick(rand, { net: 5, long: 4, wide: 2 }), shots: 2 });
        winner = S;
      } else {
        d.third = pick(rand, { drop: 62, drive: 32, lob: 6 });
        if (d.third === 'drop') d.thirdLand = pick(rand, DROP_LAND[S]);
        else if (d.third === 'drive') d.thirdLand = pick(rand, { deep: 74, net: 12, out: 14 });
        else d.thirdLand = pick(rand, { deep: 60, short: 22, out: 18 });

        if (d.thirdLand === 'net' || d.thirdLand === 'out') {
          const by = rand() < 0.5 ? cur.server : partner(cur.server);
          Object.assign(d, { ending: 'ue', shot: 'third', by, miss: d.thirdLand === 'net' ? 'net' : 'long', shots: 3 });
          winner = R;
        } else {
          let pServe = S === 'A' ? 0.47 : 0.43;
          if (d.thirdLand === 'kitchen') pServe += 0.08;
          if (d.thirdLand === 'short') pServe -= 0.14;
          winner = rand() < pServe ? S : R;
          const loser = engine.other(winner);
          d.ending = pick(rand, { winner: 30, ue: 50, fe: 20 });
          d.by = d.ending === 'winner' ? anyOf(winner) : anyOf(loser);
          d.shot = pick(rand, { dink: 34, volley: 24, drive: 14, drop: 10, lob: 5, overhead: 8, atp: 2, other: 3 });
          if (d.ending !== 'winner') d.miss = pick(rand, { net: 56, long: 24, wide: 15, nvz: 5 });
          d.shots = 4 + Math.floor(-Math.log(1 - rand()) * 6);
        }
      }

      // No video in the sample, so no timestamps.
      match.rallies.push({ id: 's' + match.rallies.length, winner, t0: null, t1: null, d });
    }
    return match;
  }

  const api = { create };
  root.PBA = root.PBA || {};
  root.PBA.sample = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
