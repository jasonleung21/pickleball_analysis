const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../js/engine.js');

const match = (settings, winners, extra) => Object.assign({
  settings,
  rallies: winners.split('').map((w) => ({ winner: w })),
}, extra || {});

test('doubles side-out starts at 0-0-2 with the right-court player serving', () => {
  const rep = engine.replay(match({}, ''));
  assert.equal(rep.current.call, '0-0-2');
  assert.equal(rep.current.server, 'A0');
  assert.equal(rep.current.serverSide, 'R');
  assert.equal(rep.current.receiver, 'B0'); // right court serves to right court
});

test('doubles side-out: first fault at 0-0-2 is a side out', () => {
  const rep = engine.replay(match({}, 'B'));
  assert.equal(rep.current.call, '0-0-1');
  assert.equal(rep.current.serving, 'B');
  assert.equal(rep.current.server, 'B0');
  assert.equal(rep.results[0].sideOut, true);
  assert.equal(rep.results[0].pointTo, null);
});

test('doubles side-out: serving team scores and the server switches sides', () => {
  const rep = engine.replay(match({}, 'A'));
  assert.equal(rep.current.call, '1-0-2');
  assert.equal(rep.current.server, 'A0');
  assert.equal(rep.current.serverSide, 'L');
  assert.equal(rep.current.positions.A.R, 1); // partner now on the right
  assert.equal(rep.current.receiver, 'B1'); // left court serves to left court
});

test('doubles side-out: server 1 → server 2 → side out', () => {
  // A loses serve immediately (0-0-2), B scores twice, then loses twice.
  const rep = engine.replay(match({}, 'BBBAA'));
  const calls = rep.results.map((r) => r.after.call);
  assert.deepEqual(calls, ['0-0-1', '1-0-1', '2-0-1', '2-0-2', '0-2-1']);
  // B0 started on the right and served first; after two points B0 is back on the right.
  assert.equal(rep.results[3].after.server, 'B1');
  assert.equal(rep.current.serving, 'A');
  // A's players never moved (they never scored), so A0 is still on the right and serves first.
  assert.equal(rep.current.server, 'A0');
});

test('starting server is on the right whenever their team score is even', () => {
  const winners = 'BBABBABAABBAAABBBA';
  const rep = engine.replay(match({}, winners));
  rep.results.forEach((r) => {
    const st = r.after;
    if (st.serving === 'A') {
      const rightPlayer = st.positions.A.R;
      assert.equal(rightPlayer === 0, st.score.A % 2 === 0, `A positions at ${st.call}`);
    }
  });
});

test('game ends at 11 win by 2 and next game starts with the other team serving', () => {
  const rep = engine.replay(match({ bestOf: 3 }, 'A'.repeat(11)));
  assert.equal(rep.games[0].done, true);
  assert.equal(rep.games[0].winner, 'A');
  assert.deepEqual(rep.games[0].score, { A: 11, B: 0 });
  assert.equal(rep.current.game, 1);
  assert.equal(rep.current.serving, 'B');
  assert.equal(rep.current.call, '0-0-2');
  assert.equal(rep.gamesWon.A, 1);
});

test('win by 2 is enforced', () => {
  // Rally scoring makes the arithmetic easy: 10-10, then A, B, A, A → 13-11.
  const rep = engine.replay(match({ scoring: 'rally', bestOf: 1 }, 'AB'.repeat(10) + 'ABAA'));
  assert.equal(rep.matchOver, true);
  assert.equal(rep.matchWinner, 'A');
  assert.deepEqual(rep.games[0].score, { A: 13, B: 11 });
  const gameOverAt = rep.results.findIndex((r) => r.gameOver);
  assert.equal(gameOverAt, 23);
});

test('rallies after the match is over are ignored', () => {
  const rep = engine.replay(match({ bestOf: 1, scoring: 'rally' }, 'A'.repeat(13)));
  assert.equal(rep.matchOver, true);
  assert.equal(rep.results[11].ignored, true);
  assert.equal(rep.results[12].ignored, true);
});

test('best of 3 needs two games', () => {
  const g = 'A'.repeat(11);
  // Game 2: B serves first (0-0-2). B wins 11 straight.
  const rep = engine.replay(match({ bestOf: 3 }, g + 'B'.repeat(11) + 'A'.repeat(11)));
  assert.equal(rep.games.length, 3);
  assert.equal(rep.games[1].winner, 'B');
  assert.equal(rep.matchOver, true);
  assert.equal(rep.matchWinner, 'A');
});

test('rally scoring doubles: every rally scores, server picked by score parity', () => {
  const rep = engine.replay(match({ scoring: 'rally' }, 'BAB'));
  assert.equal(rep.results[0].after.call, '1-0');
  assert.equal(rep.results[0].after.serving, 'B');
  // B has 1 (odd) → left-court player serves. B0 started right and did not move.
  assert.equal(rep.results[0].after.server, 'B1');
  assert.equal(rep.results[1].after.serving, 'A');
  assert.equal(rep.results[1].after.call, '1-1');
  // A has 1 (odd), A never moved → A1 (left) serves.
  assert.equal(rep.results[1].after.server, 'A1');
  assert.equal(rep.current.call, '2-1');
});

test('singles side-out: server side follows the server score', () => {
  const rep = engine.replay(match({ format: 'singles' }, 'AAB'));
  assert.equal(rep.results[0].before.call, '0-0');
  assert.equal(rep.results[0].before.serverSide, 'R');
  assert.equal(rep.results[0].after.serverSide, 'L');
  assert.equal(rep.results[1].after.serverSide, 'R');
  assert.equal(rep.current.call, '0-2');
  assert.equal(rep.current.serving, 'B');
});

test('switch ends at 6 in the deciding game only', () => {
  const rep1 = engine.replay(match({ bestOf: 3 }, 'A'.repeat(6)));
  assert.ok(!rep1.results.some((r) => r.switchEnds));
  const rep = engine.replay(match({ bestOf: 1 }, 'A'.repeat(7)));
  const flagged = rep.results.filter((r) => r.switchEnds);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].after.score.A, 6);
});

test('game start config can set first server and who starts on the right', () => {
  const m = match({}, '', { gameStarts: [{ firstServer: 'B', right: { A: 1, B: 1 } }] });
  const rep = engine.replay(m);
  assert.equal(rep.current.server, 'B1');
  assert.equal(rep.current.receiver, 'A1');
});

test('stateAtTime follows video timestamps', () => {
  const m = {
    settings: {},
    rallies: [
      { winner: 'A', t1: 10 },
      { winner: 'A', t1: 20 },
      { winner: 'B', t1: 30 },
    ],
  };
  const rep = engine.replay(m);
  assert.equal(engine.stateAtTime(m, rep, 5).state.call, '0-0-2');
  assert.equal(engine.stateAtTime(m, rep, 15).state.call, '1-0-2');
  assert.equal(engine.stateAtTime(m, rep, 25).state.call, '2-0-2');
  assert.equal(engine.stateAtTime(m, rep, 31).state.call, '0-2-1');
});

test('stateAtTime counts untimed rallies as before the next timed one', () => {
  const m = {
    settings: {},
    rallies: [
      { winner: 'A' },          // logged courtside, no time
      { winner: 'A' },
      { winner: 'B', t1: 30 },  // first rally logged against the video
    ],
  };
  const rep = engine.replay(m);
  assert.equal(engine.stateAtTime(m, rep, 5).state.call, '2-0-2');
  assert.equal(engine.stateAtTime(m, rep, 31).state.call, '0-2-1');
});
