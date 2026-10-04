const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../js/stats.js');
const sample = require('../js/sample.js');

const m = (rallies, settings) => ({ settings: settings || {}, rallies });

test('serve and return in % count untagged rallies as in', () => {
  const s = stats.compute(m([
    { winner: 'B', d: { ending: 'ue', shot: 'serve' } }, // A0 serve fault at 0-0-2 → side out
    { winner: 'B', d: { ending: 'ue', shot: 'return' } }, // B serving, A returns into the net
    { winner: 'B' },
    { winner: 'B' },
  ]));
  assert.deepEqual([s.rates.A.serveIn.n, s.rates.A.serveIn.of], [0, 1]);
  assert.deepEqual([s.rates.B.serveIn.n, s.rates.B.serveIn.of], [3, 3]);
  assert.deepEqual([s.rates.A.returnIn.n, s.rates.A.returnIn.of], [2, 3]);
  assert.equal(s.players.find((p) => p.ref === 'A0').serveFaults, 1);
  assert.equal(s.players.find((p) => p.ref === 'A0').returnErrors, 1); // B0 served to A0 (right court)
});

test('3rd shot drop kitchen landing rate', () => {
  const s = stats.compute(m([
    { winner: 'A', d: { third: 'drop', thirdLand: 'kitchen' } },
    { winner: 'A', d: { third: 'drop', thirdLand: 'short' } },
    { winner: 'A', d: { third: 'drop', thirdLand: 'kitchen' } },
    { winner: 'A', d: { third: 'drive' } },
    { winner: 'A', d: { third: 'drop' } }, // landing not tagged → excluded from landing rate
  ]));
  assert.equal(s.teams.A.drops, 4);
  assert.deepEqual([s.rates.A.dropKitchen.n, s.rates.A.dropKitchen.of], [2, 3]);
  assert.deepEqual([s.rates.A.dropShort.n, s.rates.A.dropShort.of], [1, 3]);
  assert.deepEqual([s.rates.A.thirdDrop.n, s.rates.A.thirdDrop.of], [4, 5]);
});

test('errors are attributed to the player who hit them, or inferred from the winner', () => {
  const s = stats.compute(m([
    { winner: 'A', d: { ending: 'ue', by: 'B1', shot: 'dink', miss: 'net' } },
    { winner: 'A', d: { ending: 'winner', shot: 'volley' } },
  ]));
  assert.equal(s.teams.B.ue, 1);
  assert.equal(s.teams.A.winners, 1);
  assert.equal(s.players.find((p) => p.ref === 'B1').ue, 1);
  assert.deepEqual(s.errorsByShot.dink, { A: 0, B: 1 });
  assert.deepEqual(s.errorsByMiss.net, { A: 0, B: 1 });
});

test('won on serve / won on return and longest run', () => {
  const s = stats.compute(m('AAABAB'.split('').map((w) => ({ winner: w }))));
  // A serves first: A, A, A (3 points), B (side out at 0-0-2), A (B server 1 loses), B (B server 2 wins)
  assert.equal(s.teams.A.served, 4);
  assert.equal(s.teams.A.servedWon, 3);
  assert.equal(s.teams.B.servedWon, 1);
  assert.equal(s.teams.A.longestRun, 3);
});

test('game filter limits stats to one game', () => {
  const rallies = 'A'.repeat(11).split('').concat('B'.repeat(5).split('')).map((w) => ({ winner: w }));
  const all = stats.compute(m(rallies));
  const g2 = stats.compute(m(rallies), { game: 1 });
  assert.equal(all.rallies, 16);
  assert.equal(g2.rallies, 5);
  assert.equal(g2.teams.B.points, 5); // B serves first in game 2 and wins all five rallies
});

test('sample match stops partway through game 3', () => {
  const s = sample.create();
  const st = stats.compute(s);
  assert.equal(st.rep.matchOver, false);
  assert.equal(st.rep.games.length, 3);
  assert.deepEqual([st.rep.gamesWon.A, st.rep.gamesWon.B], [1, 1]);
  assert.equal(st.rep.current.call, '7-6-2');
  assert.ok(st.teams.A.drops > 0);
});
