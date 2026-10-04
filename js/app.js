/*
 * UI: wires the scoring engine, stats and video sources to the page.
 * State lives in `app`; every change goes through commit(), which replays the
 * match, saves it to browser storage and re-renders.
 */
(function () {
  'use strict';

  const { engine, stats, config, video, sample } = window.PBA;
  // Set by hosts that block YouTube embeds and file downloads (e.g. a sandboxed preview).
  const LIMITED = window.PBA_LIMITED === true;

  // ---------------------------------------------------------------- helpers
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
  const today = () => new Date().toISOString().slice(0, 10);
  const teamClass = (t) => (t === 'A' ? 'team-a' : 'team-b');

  function fmtTime(t) {
    if (t == null || isNaN(t)) return '--:--';
    t = Math.max(0, t);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }
  const fmtClock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '–');
  const pct = (r) => (r && r.pct != null ? Math.round(r.pct * 100) + '%' : '–');

  // ---------------------------------------------------------------- storage
  const KEY = 'pickleball-charter.v1';
  const store = {
    read() {
      try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    write(data) {
      try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
    },
  };

  // ---------------------------------------------------------------- state
  const app = {
    matches: {},
    currentId: null,
    rep: null,
    view: 'chart',
    selected: null,
    mark: null,
    player: null,
    statsGame: 'all',
    overlay: true,
    bugKey: '',
    confirm: null,     // id of a match waiting for delete confirmation
    copyText: null,    // fallback text when the clipboard is refused
  };
  const M = () => app.matches[app.currentId];

  function blankMatch() {
    const now = new Date().toISOString();
    return {
      id: uid(),
      title: '',
      date: today(),
      location: '',
      settings: Object.assign({}, engine.DEFAULT_SETTINGS),
      teams: {
        A: { name: 'Team A', players: ['Player 1', 'Player 2'] },
        B: { name: 'Team B', players: ['Player 3', 'Player 4'] },
      },
      gameStarts: [],
      video: { source: 'none' },
      rallies: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  const teamName = (t, m) => {
    m = m || M();
    return ((m.teams[t] && m.teams[t].name) || '').trim() || (t === 'A' ? 'Team A' : 'Team B');
  };
  const playerName = (ref, m) => {
    m = m || M();
    if (!ref) return '';
    const p = m.teams[ref[0]].players[Number(ref[1])];
    return (p || '').trim() || teamName(ref[0], m) + ' ' + (Number(ref[1]) + 1);
  };
  const matchLabel = (m) => (m.title || '').trim() || teamName('A', m) + ' vs ' + teamName('B', m);
  const doubles = () => app.rep.settings.format === 'doubles';
  const onCourt = () => (doubles() ? ['A0', 'A1', 'B0', 'B1'] : ['A0', 'B0']);

  // ---------------------------------------------------------------- commit / save
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    $('#saveState').textContent = 'Saving…';
    saveTimer = setTimeout(() => {
      const ok = store.write({ currentId: app.currentId, matches: app.matches });
      $('#saveState').textContent = ok ? 'Saved in this browser' : 'Not saved — browser storage is blocked. Export to keep your work.';
    }, 300);
  }

  function commit(opts) {
    opts = opts || {};
    const m = M();
    m.updatedAt = new Date().toISOString();
    app.rep = engine.replay(m);
    if (app.selected != null && app.selected >= m.rallies.length) app.selected = m.rallies.length ? m.rallies.length - 1 : null;
    scheduleSave();
    render(opts);
  }

  // ---------------------------------------------------------------- rendering
  function render(opts) {
    opts = opts || {};
    const m = M();
    $('#matchTitle').textContent = matchLabel(m);
    $('#sampleBanner').hidden = !m.sample;
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === app.view)));
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + app.view; });

    if (app.view === 'chart') {
      renderCallCard();
      renderButtons();
      if (!opts.skipDetails) renderDetails();
      renderLog();
      renderBoard();
      renderBug(true);
      renderMark();
    } else if (app.view === 'stats') {
      renderStats();
    } else if (app.view === 'setup' && !opts.skipSetup) {
      renderSetup();
    }
  }

  // ----- call card + court diagram
  function renderCallCard() {
    const m = M();
    const rep = app.rep;
    const st = rep.current;
    const s = rep.settings;
    const gamesTxt = s.bestOf > 1 ? `Games ${rep.gamesWon.A}–${rep.gamesWon.B}` : '';
    let who;
    let note = '';
    if (rep.matchOver) {
      who = `<strong>${esc(teamName(rep.matchWinner))}</strong> won the match ${rep.gamesWon[rep.matchWinner]}–${rep.gamesWon[engine.other(rep.matchWinner)]}.`;
      note = 'Match over. Rallies can still be tagged; to log more, raise “Best of” in the Match tab.';
    } else {
      const serverNum = s.format === 'doubles' && s.scoring === 'sideout' ? ` (server ${st.serverNum})` : '';
      who = `<strong>${esc(playerName(st.server))}</strong>${serverNum} serves from the ${st.serverSide === 'R' ? 'right' : 'left'} to <strong>${esc(playerName(st.receiver))}</strong>`;
      const last = rep.results[rep.results.length - 1];
      if (st.rallyInGame === 0 && st.game > 0) {
        note = `Game ${st.game + 1}: ${esc(teamName(st.serving))} serves first. Change who serves first or who starts on the right in the Match tab.`;
      } else if (st.rallyInGame === 0 && m.rallies.length === 0) {
        note = 'Check the court below matches the players’ real positions before the first serve. Change it in the Match tab.';
      } else if (last && last.switchEnds) {
        note = 'Switch ends.';
      }
    }
    $('#callCard').innerHTML = `
      <div class="call-top">
        <div>
          <div class="call-label">Game ${st.game + 1} · Score call</div>
          <div class="call-big">${rep.matchOver ? 'Final' : esc(st.call)}</div>
        </div>
        <div class="call-games">${gamesTxt}</div>
      </div>
      <p class="call-who">${who}</p>
      ${courtSvg(st, rep.matchOver)}
      ${note ? `<div class="call-note">${note}</div>` : ''}`;
  }

  function courtSvg(st, over) {
    // 44 × 20 ft court, 10 units per foot, landscape: team A left, team B right.
    // Facing the net, A's right court is the bottom-left; B's right court is the top-right.
    const spots = {
      A: { R: [85, 160], L: [85, 60] },
      B: { R: [375, 60], L: [375, 160] },
    };
    let players = '';
    ['A', 'B'].forEach((t) => {
      ['R', 'L'].forEach((side) => {
        const idx = st.positions[t][side];
        if (idx == null) return;
        const ref = t + idx;
        const [x, y] = spots[t][side];
        const name = playerName(ref);
        const short = name.length > 12 ? name.slice(0, 11) + '…' : name;
        const w = Math.max(64, short.length * 8.4 + 26);
        const isServer = !over && ref === st.server;
        const isReceiver = !over && ref === st.receiver;
        players += `<g>
          <rect class="pill ${teamClass(t)}${isReceiver ? ' receiver' : ''}" x="${x - w / 2}" y="${y - 15}" width="${w}" height="30" rx="15"/>
          <text x="${x + (isServer ? 7 : 0)}" y="${y + 5}" text-anchor="middle">${esc(short)}</text>
          ${isServer ? `<circle class="ball" cx="${x - w / 2 + 14}" cy="${y}" r="7"/>` : ''}
        </g>`;
      });
    });
    return `<svg class="court" viewBox="0 0 460 220" role="img" aria-label="Court positions">
      <rect class="surface" x="10" y="10" width="440" height="200" rx="2"/>
      <rect class="nvz" x="160" y="10" width="140" height="200"/>
      <rect class="ln" x="10" y="10" width="440" height="200"/>
      <line class="ln" x1="160" y1="10" x2="160" y2="210"/>
      <line class="ln" x1="300" y1="10" x2="300" y2="210"/>
      <line class="ln" x1="10" y1="110" x2="160" y2="110"/>
      <line class="ln" x1="300" y1="110" x2="450" y2="110"/>
      <line class="net" x1="230" y1="4" x2="230" y2="216"/>
      <text class="court-tag" x="230" y="114" text-anchor="middle">KITCHEN</text>
      ${players}
    </svg>`;
  }

  function renderButtons() {
    const rep = app.rep;
    const over = rep.matchOver;
    $('#winA .win-name').textContent = teamName('A');
    $('#winB .win-name').textContent = teamName('B');
    ['#winA', '#winB', '#faultBtn', '#returnErrBtn'].forEach((id) => { $(id).disabled = over; });
    $('#undoBtn').disabled = M().rallies.length === 0;
  }

  // ----- details panel
  function renderDetails() {
    const m = M();
    const box = $('#details');
    const i = app.selected;
    if (i == null || !m.rallies[i]) {
      box.innerHTML = `<div class="details-head"><h2>Rally details</h2></div>
        <p class="details-sub">Log a rally, then tag how it ended and the 3rd shot here. Tags are optional; the score only needs who won.</p>`;
      return;
    }
    const r = m.rallies[i];
    const res = app.rep.results[i];
    const d = r.d || (r.d = {});
    const sub = res.ignored
      ? 'Logged after the match ended, so it doesn’t count.'
      : `Game ${res.game + 1} · ${esc(res.before.call)} · ${esc(playerName(res.server))} serving${typeof r.t1 === 'number' ? ' · ' + fmtTime(r.t1) : ''}`;

    let html = `<div class="details-head">
        <h2>Rally ${i + 1}</h2>
        <div class="row-actions">
          <button class="btn btn-icon" data-nav="-1" type="button" aria-label="Previous rally" ${i === 0 ? 'disabled' : ''}>‹</button>
          <button class="btn btn-icon" data-nav="1" type="button" aria-label="Next rally" ${i === m.rallies.length - 1 ? 'disabled' : ''}>›</button>
        </div>
      </div>
      <p class="details-sub">${sub}</p>
      <div class="field"><span class="field-label">Won by</span><div class="chips">
        ${['A', 'B'].map((t) => `<button class="chip" type="button" data-winner="${t}" aria-pressed="${r.winner === t}"><span class="dot ${teamClass(t)}"></span>${esc(teamName(t))}</button>`).join('')}
      </div></div>`;

    config.CHART_GROUPS.forEach((g) => {
      const fields = g.fields.filter((f) => !f.when || f.when(d));
      html += `<div class="field-group"><h3>${esc(g.title)}</h3>`;
      fields.forEach((f) => { html += fieldHtml(f, d); });
      html += '</div>';
    });

    // Consistency check: an error by a player means the other team won the rally.
    if (d.by && d.ending) {
      const byTeam = d.by[0];
      const expected = d.ending === 'winner' ? byTeam : engine.other(byTeam);
      if (expected !== r.winner) {
        html += `<div class="warn">${esc(playerName(d.by))}’s ${esc(config.optionLabel('ending', d.ending).toLowerCase())} means ${esc(teamName(expected))} won this rally.
          <button class="btn" type="button" data-fixwinner="${expected}">Set winner to ${esc(teamName(expected))}</button></div>`;
      }
    }

    html += `<div class="details-foot">
      ${app.player && (typeof r.t0 === 'number' || typeof r.t1 === 'number') ? '<button class="btn" type="button" data-replay="1">▶ Watch this rally</button>' : '<span></span>'}
      <button class="btn btn-quiet btn-danger" type="button" data-delete="1">Delete rally</button>
    </div>`;
    box.innerHTML = html;
  }

  function fieldHtml(f, d) {
    const label = `<span class="field-label">${esc(f.label)}</span>`;
    if (f.type === 'player') {
      return `<div class="field">${label}<div class="chips">${onCourt().map((ref) => `
        <button class="chip" type="button" data-field="${f.key}" data-value="${ref}" aria-pressed="${d[f.key] === ref}">
          <span class="dot ${teamClass(ref[0])}"></span>${esc(playerName(ref))}</button>`).join('')}</div></div>`;
    }
    if (f.type === 'count') {
      return `<div class="field">${label}<div class="count">
        <button class="btn btn-icon" type="button" data-step="-1" data-field="${f.key}" aria-label="One fewer">−</button>
        <input type="number" min="1" max="200" id="f-${f.key}" data-input="${f.key}" value="${d[f.key] || ''}" aria-label="${esc(f.label)}">
        <button class="btn btn-icon" type="button" data-step="1" data-field="${f.key}" aria-label="One more">+</button>
      </div></div>`;
    }
    if (f.type === 'text') {
      return `<div class="field">${label}<input type="text" id="f-${f.key}" data-input="${f.key}" value="${esc(d[f.key] || '')}" placeholder="Anything worth remembering"></div>`;
    }
    return `<div class="field">${label}<div class="chips">${f.options.map((o) => `
      <button class="chip" type="button" data-field="${f.key}" data-value="${o.v}" aria-pressed="${d[f.key] === o.v}">${esc(o.label)}</button>`).join('')}</div></div>`;
  }

  function tagSummary(d) {
    if (!d) return '';
    const parts = [];
    if (d.ending) {
      let s = { winner: 'Winner', ue: 'UE', fe: 'FE' }[d.ending];
      if (d.by) s += ' · ' + playerName(d.by);
      if (d.shot) s += ' · ' + config.optionLabel('shot', d.shot);
      if (d.miss) s += ' · ' + config.optionLabel('miss', d.miss);
      parts.push(s);
    } else if (d.shot) {
      parts.push(config.optionLabel('shot', d.shot));
    }
    if (d.third) parts.push('3rd: ' + config.optionLabel('third', d.third) + (d.thirdLand ? ' → ' + config.optionLabel('thirdLand', d.thirdLand) : ''));
    else if (d.thirdLand) parts.push('3rd → ' + config.optionLabel('thirdLand', d.thirdLand));
    if (d.shots) parts.push(d.shots + (Number(d.shots) === 1 ? ' shot' : ' shots'));
    if (d.note) parts.push('“' + d.note + '”');
    return parts.join('  |  ');
  }

  // ----- rally log
  function renderLog() {
    const m = M();
    const rep = app.rep;
    const tbody = $('#logTable tbody');
    $('#logCount').textContent = m.rallies.length ? `${m.rallies.length} logged` : '';
    if (!m.rallies.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="log-empty">No rallies yet. When a rally ends, press the team that won it.</td></tr>';
      return;
    }
    const gameByIndex = {};
    rep.games.forEach((g) => { gameByIndex[g.firstRally] = g; });
    let html = '';
    rep.results.forEach((res, i) => {
      const r = m.rallies[i];
      const g = gameByIndex[i];
      if (g && !res.ignored) {
        const sum = g.done ? ` · ${teamName(g.winner)} ${g.score[g.winner]}–${g.score[engine.other(g.winner)]}` : ' · in progress';
        html += `<tr class="game-row"><td colspan="7">Game ${g.index + 1}${esc(sum)}</td></tr>`;
      }
      const time = typeof r.t1 === 'number' ? fmtTime(r.t1) : fmtClock(r.at);
      if (res.ignored) {
        html += `<tr data-i="${i}" class="${i === app.selected ? 'selected' : ''}"><td>${i + 1}</td><td class="mono">${time}</td><td colspan="4" class="muted">After the match ended — not counted</td><td></td></tr>`;
        return;
      }
      const badge = res.pointTo ? '<span class="pt point">Point</span>' : res.sideOut ? '<span class="pt">Side out</span>' : res.secondServer ? '<span class="pt">2nd server</span>' : '';
      const canPlay = app.player && (typeof r.t0 === 'number' || typeof r.t1 === 'number');
      html += `<tr data-i="${i}" class="${i === app.selected ? 'selected' : ''}">
        <td>${i + 1}</td>
        <td class="mono">${time}</td>
        <td class="mono">${esc(res.before.call)}</td>
        <td>${esc(playerName(res.server))}</td>
        <td><span class="won"><span class="dot ${teamClass(res.winner)}"></span>${esc(teamName(res.winner))}</span>${badge}</td>
        <td class="tags">${esc(tagSummary(r.d))}</td>
        <td>${canPlay ? `<button class="play" type="button" data-play="${i}" aria-label="Watch rally ${i + 1}">▶</button>` : ''}</td>
      </tr>`;
    });
    tbody.innerHTML = html;
  }

  function scrollLogTo(i) {
    const row = $(`#logTable tr[data-i="${i}"]`);
    const wrap = $('.log-wrap');
    if (!row || !wrap) return;
    const top = row.offsetTop - wrap.clientHeight / 2;
    wrap.scrollTop = Math.max(0, top);
  }

  // ----- stage: board (no video) and scorebug overlay
  function renderBoard() {
    const m = M();
    const board = $('#board');
    board.hidden = !!app.player;
    if (app.player) return;
    const rep = app.rep;
    const st = rep.current;
    const note = !m.rallies.length && (!m.video || m.video.source === 'none')
      ? (LIMITED
        ? 'Open a match video file below. With no video, tap who won each rally as you watch from the court.'
        : 'Open a match video or paste a YouTube link below. With no video, tap who won each rally as you watch from the court.')
      : '';
    const serverLine = rep.matchOver
      ? `${esc(teamName(rep.matchWinner))} won the match`
      : `${esc(teamName(st.serving))} serving · ${esc(playerName(st.server))}`;
    const games = rep.settings.bestOf > 1;
    const team = (t) => `<span><i class="dot ${teamClass(t)}"></i>${esc(teamName(t))} <b>${st.score[t]}</b>${games ? `<small>G${rep.gamesWon[t]}</small>` : ''}</span>`;
    board.innerHTML = `<div class="board-inner">
      <div class="board-call">${rep.matchOver ? 'Final' : esc(st.call)}</div>
      <div class="board-sub">${serverLine}</div>
      <div class="board-teams">${team('A')}${team('B')}</div>
      ${note ? `<div class="board-note">${note}</div>` : ''}
    </div>`;
  }

  function renderBug(force) {
    const bug = $('#scorebug');
    // Without video the board already shows the score, so the overlay is only for footage.
    if (!app.overlay || !app.player) { bug.hidden = true; app.bugKey = ''; return; }
    bug.hidden = false;
    const m = M();
    const rep = app.rep;
    let view = null;
    if (app.player) {
      const t = app.player.getTime();
      view = engine.stateAtTime(m, rep, t);
    }
    let state;
    let games;
    let replaying = false;
    let final = false;
    if (view) {
      state = view.state;
      games = view.gamesWon;
      const lastCounted = rep.results.filter((r) => !r.ignored).length - 1;
      replaying = view.rallyIndex < lastCounted;
      final = rep.matchOver && view.rallyIndex >= lastCounted;
    } else {
      state = rep.current;
      games = rep.gamesWon;
      final = rep.matchOver;
    }
    const key = JSON.stringify([state.call, state.serving, state.game, games, replaying, final, teamName('A'), teamName('B'), rep.settings]);
    if (!force && key === app.bugKey) return;
    app.bugKey = key;

    const s = rep.settings;
    const showNum = s.format === 'doubles' && s.scoring === 'sideout';
    const showGames = s.bestOf > 1;
    const row = (t) => `<div class="bug-row ${teamClass(t)}">
        <span class="bug-stripe"></span>
        <span class="bug-serve">${!final && state.serving === t ? `<span><i></i>${showNum ? `<b>${state.serverNum}</b>` : ''}</span>` : ''}</span>
        <span class="bug-name">${esc(teamName(t))}</span>
        <span class="bug-games">${showGames ? games[t] : ''}</span>
        <span class="bug-pts">${state.score[t]}</span>
      </div>`;
    bug.innerHTML = `<div class="bug-head">
        <span>${final ? 'Final' : 'Game ' + (state.game + 1)} ${replaying ? '<span class="bug-tag">Replay</span>' : ''}</span>
        <span class="bug-call">${final ? '' : esc(state.call)}</span>
      </div>${row('A')}${row('B')}`;
  }

  function renderMark() {
    const btn = $('#markBtn');
    btn.disabled = !app.player;
    if (app.mark != null) {
      btn.classList.add('is-on');
      btn.innerHTML = `Serve at ${fmtTime(app.mark)} <kbd>S</kbd>`;
    } else {
      btn.classList.remove('is-on');
      btn.innerHTML = 'Mark serve <kbd>S</kbd>';
    }
  }

  let calloutTimer = null;
  function callout(text) {
    const el = $('#callout');
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => { el.hidden = true; }, 1900);
  }

  // ---------------------------------------------------------------- toast
  let toastTimer = null;
  function toast(msg, action) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    el.hidden = false;
    if (action) $('button', el).onclick = () => { el.hidden = true; action.run(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2600);
  }

  // ---------------------------------------------------------------- rally actions
  function logRally(winner, d) {
    const m = M();
    if (app.rep.matchOver) { toast('The match is over. Raise “Best of” in the Match tab to keep going.'); return; }
    const t = app.player ? app.player.getTime() : null;
    const r = {
      id: uid(),
      winner,
      t0: app.mark != null && t != null && app.mark <= t ? app.mark : null,
      t1: typeof t === 'number' ? Math.round(t * 100) / 100 : null,
      at: new Date().toISOString(),
      d: d || {},
    };
    m.rallies.push(r);
    app.mark = null;
    app.selected = m.rallies.length - 1;
    commit();
    scrollLogTo(app.selected);

    const res = app.rep.results[app.selected];
    if (app.rep.matchOver && res.gameOver) callout(`${teamName(res.gameWinner)} win the match`);
    else if (res.gameOver) callout(`Game ${res.game + 1} · ${teamName(res.gameWinner)} ${res.after.score[res.gameWinner]}–${res.after.score[engine.other(res.gameWinner)]}`);
    else if (res.switchEnds) callout(`Switch ends · ${res.after.call}`);
    else if (res.pointTo) callout(`Point ${teamName(res.pointTo)} · ${res.after.call}`);
    else if (res.sideOut) callout(`Side out · ${res.after.call}`);
    else if (res.secondServer) callout(`Second server · ${res.after.call}`);
  }

  function serveFault() {
    if (app.rep.matchOver) return logRally();
    const st = app.rep.current;
    logRally(st.receiving, { ending: 'ue', shot: 'serve', by: st.server, shots: 1 });
  }

  function returnError() {
    if (app.rep.matchOver) return logRally();
    const st = app.rep.current;
    logRally(st.serving, { ending: 'ue', shot: 'return', by: st.receiver, shots: 2 });
  }

  function removeRally(i, verb) {
    const m = M();
    const [r] = m.rallies.splice(i, 1);
    if (!r) return;
    app.selected = m.rallies.length ? Math.min(i, m.rallies.length - 1) : null;
    commit();
    toast(`${verb} rally ${i + 1}`, {
      label: 'Restore',
      run: () => { m.rallies.splice(i, 0, r); app.selected = i; commit(); },
    });
  }

  function undo() {
    const m = M();
    if (!m.rallies.length) return;
    removeRally(m.rallies.length - 1, 'Undid');
  }

  function rallyStart(i) {
    const m = M();
    const r = m.rallies[i];
    if (typeof r.t0 === 'number') return r.t0;
    for (let j = i - 1; j >= 0; j--) if (typeof m.rallies[j].t1 === 'number') return Math.max(m.rallies[j].t1, r.t1 - 25);
    return typeof r.t1 === 'number' ? Math.max(0, r.t1 - 10) : null;
  }

  function watchRally(i) {
    const t = rallyStart(i);
    if (!app.player || t == null) return;
    app.player.seek(Math.max(0, t - 1));
    app.player.play();
  }

  // ---------------------------------------------------------------- video
  function status(msg, isError) {
    const el = $('#sourceStatus');
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
  }

  function destroyPlayer() {
    if (app.player) { try { app.player.destroy(); } catch (e) { /* ignore */ } }
    app.player = null;
    $('#videoHost').innerHTML = '';
  }

  async function useFile(file) {
    destroyPlayer();
    app.player = await video.filePlayer($('#videoHost'), file);
    M().video = { source: 'file', fileName: file.name };
    status(`Playing ${file.name}. The video stays on this device.`);
    applyRate();
    commit();
  }

  async function useYouTube(input, quiet) {
    const parsed = video.parseYouTube(input);
    if (!parsed) { status('That doesn’t look like a YouTube link. Try one like https://youtu.be/abc123XYZ00.', true); return; }
    destroyPlayer();
    status('Loading YouTube…');
    try {
      app.player = await video.youTubePlayer($('#videoHost'), parsed.id, parsed.start, (err) => status(err.message, true));
      M().video = { source: 'youtube', youtubeId: parsed.id, start: parsed.start };
      status(quiet ? '' : 'YouTube loaded. Press play, then log each rally as it ends.');
      applyRate();
    } catch (err) {
      destroyPlayer();
      M().video = { source: 'youtube', youtubeId: parsed.id, start: parsed.start };
      status(err.message, true);
    }
    commit();
  }

  function useNoVideo() {
    destroyPlayer();
    M().video = { source: 'none' };
    status('Courtside mode: tap who won each rally. Times are recorded from the clock.');
    commit();
  }

  function applyRate() {
    if (app.player) app.player.setRate(parseFloat($('#rateSel').value) || 1);
  }

  function updatePlayIcon() {
    const paused = !app.player || app.player.paused();
    $('#playIcon').setAttribute('d', paused ? 'M8 5l11 7-11 7z' : 'M7 5h4v14H7zM13 5h4v14h-4z');
  }

  // Polls the player for the time label, play icon and the time-synced scorebug.
  setInterval(() => {
    if (!app.rep) return;
    if (app.player) {
      $('#timeLabel').textContent = fmtTime(app.player.getTime());
      updatePlayIcon();
      if (app.view === 'chart') renderBug(false);
    } else {
      $('#timeLabel').textContent = '--:--';
    }
  }, 250);

  // ---------------------------------------------------------------- stats
  const SHOT_ORDER = ['serve', 'return', 'third', 'dink', 'drop', 'drive', 'volley', 'lob', 'overhead', 'atp', 'other', 'untagged'];
  const vizQueue = [];

  function renderStats() {
    const m = M();
    const rep = app.rep;
    const s = stats.compute(m, { game: app.statsGame });
    const root = $('#statsRoot');
    vizQueue.length = 0;

    if (!m.rallies.length) {
      root.innerHTML = '<div class="panel"><h2>No rallies yet</h2><p class="panel-note">Stats appear here once you log rallies in the Chart tab.</p></div>';
      return;
    }

    const A = teamName('A');
    const B = teamName('B');
    let result;
    if (rep.matchOver) {
      const w = rep.matchWinner;
      result = `${esc(teamName(w))} def. ${esc(teamName(engine.other(w)))} ${rep.gamesWon[w]}–${rep.gamesWon[engine.other(w)]}`;
    } else {
      result = `${esc(A)} ${rep.gamesWon.A} – ${rep.gamesWon.B} ${esc(B)} · in progress`;
    }
    const gameLine = rep.games.map((g) => `${g.score.A}–${g.score.B}${g.done ? '' : '*'}`).join(', ');

    const filters = ['all'].concat(rep.games.map((g) => g.index));
    const filterHtml = filters.map((g) => `<button class="chip" type="button" data-statsgame="${g}" aria-pressed="${String(app.statsGame) === String(g)}">${g === 'all' ? 'All games' : 'Game ' + (g + 1)}</button>`).join('');

    const T = s.teams;
    const R = s.rates;
    const cmpRow = (label, a, b, hi) => {
      // hi: 'high' | 'low' | null — which side to bold
      const av = a.pct != null ? a.pct : a.v;
      const bv = b.pct != null ? b.pct : b.v;
      let lead = null;
      if (hi && av != null && bv != null && av !== bv) lead = (hi === 'high') === (av > bv) ? 'A' : 'B';
      const cell = (x, t) => `<td class="${lead === t ? 'lead' : ''}">${x.text}${x.of != null ? `<span class="of">${x.n}/${x.of}</span>` : ''}</td>`;
      return `<tr><th scope="row">${label}</th>${cell(a, 'A')}${cell(b, 'B')}</tr>`;
    };
    const num = (v) => ({ v, text: String(v) });
    const rt = (r) => ({ pct: r.pct, text: pct(r), n: r.n, of: r.of });

    const lenAvg = s.length.avg != null ? s.length.avg.toFixed(1) : '–';

    root.innerHTML = `
      <div class="stats-head">
        <div>
          <div class="result-line">${result}</div>
          <div class="result-games">${gameLine} · ${s.rallies} rallies${app.statsGame !== 'all' ? ' in this game' : ''} · ${s.tagged} tagged</div>
        </div>
        <div class="filter-row" role="group" aria-label="Filter by game">${filterHtml}</div>
      </div>

      <div class="panel">
        <div class="section-head"><h2>Score flow</h2></div>
        <div class="legend"><span><i class="swatch team-a"></i>${esc(A)}</span><span><i class="swatch team-b"></i>${esc(B)}</span></div>
        <div class="flows">${s.flow.map((f, k) => `<div><div class="flow-title"><span>Game ${f.game + 1}</span><span>${f.score.A}–${f.score.B}${f.done ? '' : ' (in progress)'}</span></div><div class="viz-slot" data-viz="flow-${k}"></div></div>`).join('')}</div>
      </div>

      <div class="stats-grid">
        <div class="panel">
          <h2>Team comparison</h2>
          <div class="cmp-scroll"><table class="cmp">
            <thead><tr><th></th><th style="text-align:right"><i class="swatch team-a"></i> ${esc(A)}</th><th style="text-align:right"><i class="swatch team-b"></i> ${esc(B)}</th></tr></thead>
            <tbody>
              ${cmpRow('Rallies won', num(T.A.won), num(T.B.won), 'high')}
              ${cmpRow('Points scored', num(T.A.points), num(T.B.points), 'high')}
              ${cmpRow('Won when serving', rt(R.A.wonOnServe), rt(R.B.wonOnServe), 'high')}
              ${cmpRow('Won when returning', rt(R.A.wonOnReturn), rt(R.B.wonOnReturn), 'high')}
              ${cmpRow('Serves in', rt(R.A.serveIn), rt(R.B.serveIn), 'high')}
              ${cmpRow('Returns in', rt(R.A.returnIn), rt(R.B.returnIn), 'high')}
              ${cmpRow('Winners', num(T.A.winners), num(T.B.winners), 'high')}
              ${cmpRow('Unforced errors', num(T.A.ue), num(T.B.ue), 'low')}
              ${cmpRow('Forced errors', num(T.A.fe), num(T.B.fe), 'low')}
              ${cmpRow('Longest scoring run', num(T.A.longestRun), num(T.B.longestRun), 'high')}
            </tbody>
          </table></div>
          <p class="panel-note">Untagged rallies count as a serve in and a return in. Small numbers show count / attempts.</p>
        </div>

        <div class="panel">
          <h2>3rd shot</h2>
          <div class="cmp-scroll"><table class="cmp">
            <thead><tr><th></th><th style="text-align:right"><i class="swatch team-a"></i> ${esc(A)}</th><th style="text-align:right"><i class="swatch team-b"></i> ${esc(B)}</th></tr></thead>
            <tbody>
              ${cmpRow('Drop', rt(R.A.thirdDrop), rt(R.B.thirdDrop), null)}
              ${cmpRow('Drive', rt(R.A.thirdDrive), rt(R.B.thirdDrive), null)}
              ${cmpRow('Lob', rt(R.A.thirdLob), rt(R.B.thirdLob), null)}
              ${cmpRow('Drops landing in the kitchen', rt(R.A.dropKitchen), rt(R.B.dropKitchen), 'high')}
              ${cmpRow('Drops landing short', rt(R.A.dropShort), rt(R.B.dropShort), 'low')}
              ${cmpRow('3rd shot errors', rt(R.A.thirdError), rt(R.B.thirdError), 'low')}
            </tbody>
          </table></div>
          <h3>Where the drops landed</h3>
          <div class="legend"><span><i class="swatch team-a"></i>${esc(A)}</span><span><i class="swatch team-b"></i>${esc(B)}</span></div>
          <div class="viz-slot" data-viz="drops"></div>
        </div>

        <div class="panel">
          <h2>Errors by shot</h2>
          <div class="legend"><span><i class="swatch team-a"></i>${esc(A)}</span><span><i class="swatch team-b"></i>${esc(B)}</span></div>
          <div class="viz-slot" data-viz="errors"></div>
          <p class="panel-note">Unforced and forced errors, by the last shot of the rally.</p>
        </div>

        <div class="panel span-2-of-3">
          <h2>Players</h2>
          <div class="cmp-scroll"><table class="cmp">
            <thead><tr><th>Player</th><th style="text-align:right">Serves in</th><th style="text-align:right">Returns in</th><th style="text-align:right">Winners</th><th style="text-align:right">UE</th><th style="text-align:right">FE</th></tr></thead>
            <tbody>${s.players.map((p) => `<tr>
              <th scope="row"><span class="won"><span class="dot ${teamClass(p.team)}"></span>${esc(playerName(p.ref))}</span></th>
              <td>${pct({ pct: p.serves ? (p.serves - p.serveFaults) / p.serves : null })}<span class="of">${p.serves - p.serveFaults}/${p.serves}</span></td>
              <td>${pct({ pct: p.returns ? (p.returns - p.returnErrors) / p.returns : null })}<span class="of">${p.returns - p.returnErrors}/${p.returns}</span></td>
              <td>${p.winners}</td><td>${p.ue}</td><td>${p.fe}</td></tr>`).join('')}</tbody>
          </table></div>
          <p class="panel-note">Winners and errors count only where “Last shot by” was tagged (serve faults and return errors fill it in automatically).</p>
        </div>

        <div class="panel span-2-of-2">
          <h2>Rally length</h2>
          <p class="panel-note">Average ${lenAvg} shots over ${s.length.n} rallies with a known length${s.length.max ? ` · longest ${s.length.max}` : ''}.</p>
          <div class="viz-slot" data-viz="length"></div>
        </div>
      </div>`;

    // Charts are drawn at the slot's real pixel width so text stays a readable size.
    s.flow.forEach((f, k) => vizQueue.push(['flow-' + k, (w) => flowSvg(f, w)]));
    const drops = ['kitchen', 'short', 'deep', 'net', 'out'].map((v) => ({
      label: config.optionLabel('thirdLand', v),
      A: T.A.dropLand[v],
      B: T.B.dropLand[v],
      ofA: T.A.dropLanded,
      ofB: T.B.dropLanded,
    }));
    vizQueue.push(['drops', (w) => hbarsSvg(drops, w, (c, t) => `${c[t]} of ${t === 'A' ? c.ofA : c.ofB} drops${(t === 'A' ? c.ofA : c.ofB) ? ' (' + Math.round(c[t] / (t === 'A' ? c.ofA : c.ofB) * 100) + '%)' : ''}`)]);
    const errs = SHOT_ORDER.filter((k) => s.errorsByShot[k]).map((k) => ({
      label: k === 'untagged' ? 'Not tagged' : config.optionLabel('shot', k),
      A: s.errorsByShot[k].A,
      B: s.errorsByShot[k].B,
    }));
    vizQueue.push(['errors', (w) => errs.length ? hbarsSvg(errs, w, (c, t) => `${c[t]} error${c[t] === 1 ? '' : 's'}`) : '<p class="panel-note">No errors tagged yet.</p>']);
    vizQueue.push(['length', (w) => s.length.n ? colsSvg(s.length.buckets, w) : '<p class="panel-note">Tag “Shots in rally” to see this.</p>']);
    drawViz();
  }

  function drawViz() {
    vizQueue.forEach(([key, fn]) => {
      const slot = $(`.viz-slot[data-viz="${key}"]`);
      if (!slot) return;
      const w = Math.max(240, Math.floor(slot.clientWidth));
      slot.innerHTML = fn(w);
    });
  }

  function flowSvg(f, W) {
    const H = 170;
    const pad = { l: 28, r: 30, t: 10, b: 24 };
    const n = f.points.length - 1;
    const target = app.rep.settings.pointsToWin;
    const maxY = Math.max(target, f.score.A, f.score.B);
    const x = (i) => pad.l + (n ? (i / n) * (W - pad.l - pad.r) : 0);
    const y = (v) => H - pad.b - (v / maxY) * (H - pad.t - pad.b);
    const step = (t) => {
      let d = `M${x(0)},${y(0)}`;
      for (let i = 1; i <= n; i++) {
        d += `H${x(i)}`;
        if (f.points[i][t] !== f.points[i - 1][t]) d += `V${y(f.points[i][t])}`;
      }
      return d;
    };
    let grid = '';
    const ticks = [];
    for (let v = 0; v <= maxY; v += maxY > 8 ? 5 : 2) ticks.push(v);
    if (target - ticks[ticks.length - 1] >= 3 && target <= maxY) ticks.push(target);
    ticks.forEach((v) => {
      grid += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-text" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    });
    const xticks = `<text class="axis-text" x="${x(0)}" y="${H - 6}" text-anchor="start">Start</text><text class="axis-text" x="${x(n)}" y="${H - 6}" text-anchor="end">Rally ${n}</text>`;
    const colW = n ? (W - pad.l - pad.r) / n : 0;
    let hits = '';
    for (let i = 1; i <= n; i++) {
      const p = f.points[i];
      const tip = `<strong>Rally ${i}</strong>${esc(teamName('A'))} ${p.A} – ${p.B} ${esc(teamName('B'))}${p.pointTo ? '<br>Point ' + esc(teamName(p.pointTo)) : ''}`;
      hits += `<rect class="hit" x="${x(i) - colW / 2}" y="${pad.t}" width="${Math.max(colW, 4)}" height="${H - pad.t - pad.b}" data-tip="${esc(tip)}" data-hx="${x(i)}"/>`;
    }
    const last = f.points[n];
    const endLabel = (t, cls) => {
      const yy = y(last[t]);
      const other = y(last[t === 'A' ? 'B' : 'A']);
      const nudge = Math.abs(yy - other) < 12 ? (last[t] >= last[t === 'A' ? 'B' : 'A'] ? -7 : 7) : 0;
      return `<circle class="${cls}" cx="${x(n)}" cy="${yy}" r="4.5"/><text class="val" x="${x(n) + 8}" y="${yy + 4 + nudge}">${last[t]}</text>`;
    };
    return `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score after each rally, game ${f.game + 1}">
      ${grid}${xticks}
      <line class="hover-line" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
      <path class="line-b" d="${step('B')}"/><path class="line-a" d="${step('A')}"/>
      ${endLabel('B', 'end-b')}${endLabel('A', 'end-a')}
      ${hits}
    </svg>`;
  }

  function hbarsSvg(cats, W, tipFn) {
    const labelW = Math.min(150, Math.max(90, W * 0.3));
    const barH = 10;
    const gap = 2;
    const rowH = barH * 2 + gap + 14;
    const H = cats.length * rowH + 4;
    const max = Math.max(1, ...cats.map((c) => Math.max(c.A, c.B)));
    const span = W - labelW - 36;
    const bar = (v, yy, cls) => {
      const w = (v / max) * span;
      if (w <= 0) return `<rect class="${cls}" x="${labelW}" y="${yy}" width="1.5" height="${barH}"/>`;
      // square at the baseline, 4px rounded at the data end
      const r = Math.min(4, w);
      return `<path class="${cls}" d="M${labelW},${yy}H${labelW + w - r}Q${labelW + w},${yy} ${labelW + w},${yy + r}V${yy + barH - r}Q${labelW + w},${yy + barH} ${labelW + w - r},${yy + barH}H${labelW}Z"/>`;
    };
    let out = '';
    cats.forEach((c, k) => {
      const y0 = k * rowH + 6;
      out += `<text class="cat" x="${labelW - 10}" y="${y0 + barH + 4}" text-anchor="end">${esc(c.label)}</text>`;
      ['A', 'B'].forEach((t, j) => {
        const yy = y0 + j * (barH + gap);
        const w = (c[t] / max) * span;
        out += bar(c[t], yy, t === 'A' ? 'bar-a' : 'bar-b');
        out += `<text class="val" x="${labelW + w + 6}" y="${yy + barH - 1}">${c[t]}</text>`;
        out += `<rect class="hit" x="0" y="${yy - 1}" width="${W}" height="${barH + 2}" data-tip="${esc(`<strong>${esc(teamName(t))} · ${esc(c.label)}</strong>${esc(tipFn(c, t))}`)}"/>`;
      });
    });
    return `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
      <line class="grid" x1="${labelW}" x2="${labelW}" y1="0" y2="${H}"/>${out}</svg>`;
  }

  function colsSvg(buckets, W) {
    const H = 160;
    const pad = { l: 8, r: 8, t: 18, b: 24 };
    const max = Math.max(1, ...buckets.map((b) => b.n));
    const band = (W - pad.l - pad.r) / buckets.length;
    const bw = Math.min(24, band * 0.6);
    let out = `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}"/>`;
    const total = buckets.reduce((a, b) => a + b.n, 0);
    buckets.forEach((b, k) => {
      const cx = pad.l + band * k + band / 2;
      const h = (b.n / max) * (H - pad.t - pad.b);
      const x0 = cx - bw / 2;
      const y0 = H - pad.b - h;
      const r = Math.min(4, h);
      if (h > 0) out += `<path class="bar-n" d="M${x0},${H - pad.b}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${H - pad.b}Z"/>`;
      out += `<text class="val" x="${cx}" y="${y0 - 5}" text-anchor="middle">${b.n}</text>`;
      out += `<text class="axis-text" x="${cx}" y="${H - 7}" text-anchor="middle">${b.label}</text>`;
      out += `<rect class="hit" x="${cx - band / 2}" y="${pad.t}" width="${band}" height="${H - pad.t}" data-tip="${esc(`<strong>${b.label} shots</strong>${b.n} rallies${total ? ' (' + Math.round(b.n / total * 100) + '%)' : ''}`)}"/>`;
    });
    return `<svg class="viz" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rally length distribution">${out}</svg>`;
  }

  // ---------------------------------------------------------------- setup view
  function renderSetup() {
    const m = M();
    const s = engine.normalizeSettings(m.settings);
    const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, label]) => `<button type="button" data-setting="${key}" data-value="${v}" aria-pressed="${String(s[key]) === String(v)}">${label}</button>`).join('')}</div>`;
    const teamCard = (t) => `<div class="team-card ${teamClass(t)}">
        <div class="form-row"><label for="team-${t}">Team ${t === 'A' ? '1 (blue)' : '2 (orange)'}</label>
          <input type="text" id="team-${t}" data-team="${t}" value="${esc(m.teams[t].name)}"></div>
        <div class="form-pair">
          ${(s.format === 'doubles' ? [0, 1] : [0]).map((k) => `<div class="form-row"><label for="p-${t}${k}">Player ${k + 1}</label>
            <input type="text" id="p-${t}${k}" data-player="${t}${k}" value="${esc(m.teams[t].players[k] || '')}"></div>`).join('')}
        </div>
      </div>`;

    const games = [];
    for (let g = 0; g < s.bestOf; g++) games.push(g);
    const startRows = games.map((g) => {
      const cfg = engine.gameStartConfig(m, g);
      const sel = (team) => s.format === 'doubles'
        ? `<select data-start="${g}" data-right="${team}" aria-label="Game ${g + 1}: ${esc(teamName(team))} player starting on the right">${[0, 1].map((k) => `<option value="${k}" ${cfg.right[team] === k ? 'selected' : ''}>${esc(playerName(team + k))}</option>`).join('')}</select>`
        : '<span class="muted">–</span>';
      return `<tr><td>Game ${g + 1}</td>
        <td><select data-start="${g}" data-first="1" aria-label="Game ${g + 1}: serves first">${['A', 'B'].map((t) => `<option value="${t}" ${cfg.firstServer === t ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}</select></td>
        <td>${sel('A')}</td><td>${sel('B')}</td></tr>`;
    }).join('');

    const list = Object.values(app.matches).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const listHtml = list.map((x) => {
      const r = engine.replay(x);
      const score = r.games.map((g) => `${g.score.A}–${g.score.B}`).join(', ');
      const cur = x.id === app.currentId;
      const confirming = app.confirm === x.id;
      return `<div class="match-item${cur ? ' current' : ''}">
        <div><div class="mi-title">${esc(matchLabel(x))}${x.sample ? ' <span class="muted">(sample)</span>' : ''}</div>
          <div class="mi-sub">${esc(x.date || '')} · ${x.rallies.length} rallies${score ? ' · ' + esc(score) : ''}</div></div>
        <div class="row-actions">
          ${confirming
            ? `<span class="confirm">Delete for good? <button class="btn btn-danger" type="button" data-delmatch-yes="${x.id}">Delete</button><button class="btn" type="button" data-delmatch-no="1">Keep</button></span>`
            : `${cur ? '<span class="muted">Current</span>' : `<button class="btn" type="button" data-open="${x.id}">Open</button>`}
               <button class="btn btn-quiet btn-danger" type="button" data-delmatch="${x.id}">Delete</button>`}
        </div>
      </div>`;
    }).join('');

    $('#setupRoot').innerHTML = `
      <div class="panel">
        <h2>This match</h2>
        <div class="form-grid">
          <div class="form-row"><label for="m-title">Name</label><input type="text" id="m-title" data-meta="title" value="${esc(m.title || '')}" placeholder="${esc(teamName('A') + ' vs ' + teamName('B'))}"></div>
          <div class="form-pair">
            <div class="form-row"><label for="m-date">Date</label><input type="date" id="m-date" data-meta="date" value="${esc(m.date || '')}"></div>
            <div class="form-row"><label for="m-loc">Where</label><input type="text" id="m-loc" data-meta="location" value="${esc(m.location || '')}" placeholder="Club or event"></div>
          </div>
          <div class="form-row"><span class="form-label">Format</span>${seg('format', [['doubles', 'Doubles'], ['singles', 'Singles']])}</div>
          <div class="form-row"><span class="form-label">Scoring</span>${seg('scoring', [['sideout', 'Side-out (traditional)'], ['rally', 'Rally scoring']])}</div>
          <div class="form-row"><span class="form-label">Game to</span>${seg('pointsToWin', [[11, '11'], [15, '15'], [21, '21']])}</div>
          <div class="form-pair">
            <div class="form-row"><span class="form-label">Win by</span>${seg('winBy', [[2, '2'], [1, '1']])}</div>
            <div class="form-row"><span class="form-label">Best of</span>${seg('bestOf', [[1, '1'], [3, '3'], [5, '5']])}</div>
          </div>
          ${m.rallies.length ? '<p class="hint">Changing these rescores every rally already logged.</p>' : ''}
        </div>
      </div>

      <div class="panel">
        <h2>Teams</h2>
        ${teamCard('A')}
        ${teamCard('B')}
        <h3>Who starts each game</h3>
        <div class="cmp-scroll"><table class="starts">
          <thead><tr><th></th><th>Serves first</th><th>${esc(teamName('A'))} on the right</th><th>${esc(teamName('B'))} on the right</th></tr></thead>
          <tbody>${startRows}</tbody>
        </table></div>
        <p class="hint">The player starting on the right court serves first for their team. Fix these if the court diagram doesn’t match the video; the score is recalculated.</p>
      </div>

      <div class="setup-stack">
      <div class="panel">
        <h2>Saved matches</h2>
        <div class="row-actions">
          <button class="btn btn-primary" type="button" id="newMatchBtn">New match</button>
          <label class="btn" for="importInput">Import JSON</label>
          <input type="file" id="importInput" accept="application/json,.json" class="visually-hidden">
        </div>
        <div class="match-list">${listHtml}</div>
        <p class="hint">Matches are saved in this browser only. Export to back them up or move them to another device.</p>
      </div>

      <div class="panel">
        <h2>Export</h2>
        <div class="row-actions">
          ${LIMITED ? '' : `<button class="btn" type="button" id="exportJson">Download JSON</button>
          <button class="btn" type="button" id="exportCsv">Download CSV</button>`}
          <button class="btn" type="button" data-copy="json">Copy JSON</button>
          <button class="btn" type="button" data-copy="csv">Copy CSV</button>
        </div>
        <p class="hint">JSON keeps everything and can be imported again. CSV has one row per rally for Excel or Google Sheets.${LIMITED ? ' Downloads are blocked on this page, so copy the text and paste it into a file or spreadsheet.' : ' If a download doesn’t start, use Copy.'}</p>
        ${app.copyText != null ? `<textarea id="copyFallback" rows="6" readonly aria-label="Text to copy">${esc(app.copyText)}</textarea><p class="hint">Copying was blocked here. Select the text above and copy it.</p>` : ''}
      </div>
      </div>`;
  }

  function renderSetupKeepFocus() {
    if (app.view !== 'setup') return;
    const active = document.activeElement;
    const id = active && active.id;
    const sel = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    renderSetup();
    const again = id && document.getElementById(id);
    if (again) {
      again.focus();
      if (sel && again.setSelectionRange) { try { again.setSelectionRange(sel[0], sel[1]); } catch (e) { /* date inputs */ } }
    }
  }

  // ---------------------------------------------------------------- export / import
  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(m) {
    const rep = engine.replay(m);
    const fields = config.FIELDS;
    const head = ['rally', 'game', 'rally_in_game', 'video_start_s', 'video_end_s', 'logged_at', 'serving_team', 'server', 'receiver', 'score_call', 'winner', 'result', 'score_' + teamName('A', m), 'score_' + teamName('B', m)]
      .concat(fields.map((f) => f.key));
    const lines = [head.map(csvCell).join(',')];
    rep.results.forEach((res, i) => {
      const r = m.rallies[i];
      const d = r.d || {};
      if (res.ignored) return;
      const result = res.gameOver ? 'game' : res.pointTo ? 'point' : res.sideOut ? 'side out' : res.secondServer ? 'second server' : '';
      const row = [i + 1, res.game + 1, res.rallyInGame, r.t0, r.t1, r.at, teamName(res.servingTeam, m), playerName(res.server, m), playerName(res.receiver, m), res.before.call, teamName(res.winner, m), result, res.after.score.A, res.after.score.B]
        .concat(fields.map((f) => {
          const v = d[f.key];
          if (v == null || v === '') return '';
          if (f.type === 'player') return playerName(v, m);
          if (f.options) return config.optionLabel(f.key, v);
          return v;
        }));
      lines.push(row.map(csvCell).join(','));
    });
    return lines.join('\n');
  }

  function fileSlug(m) {
    return (m.date || today()) + '-' + matchLabel(m).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function importMatch(text) {
    let m;
    try { m = JSON.parse(text); } catch (e) { toast('That file isn’t valid JSON.'); return; }
    if (!m || !Array.isArray(m.rallies) || !m.teams || !m.teams.A || !m.teams.B) {
      toast('That file isn’t a match exported from this app.');
      return;
    }
    if (!m.id || app.matches[m.id]) m.id = uid();
    m.settings = engine.normalizeSettings(m.settings);
    m.gameStarts = m.gameStarts || [];
    m.video = m.video || { source: 'none' };
    app.matches[m.id] = m;
    openMatch(m.id);
    toast('Imported ' + matchLabel(m));
  }

  function openMatch(id) {
    if (!app.matches[id]) return;
    app.currentId = id;
    app.selected = app.matches[id].rallies.length ? app.matches[id].rallies.length - 1 : null;
    app.mark = null;
    app.statsGame = 'all';
    app.confirm = null;
    destroyPlayer();
    status('');
    commit();
    restoreVideo();
  }

  function restoreVideo() {
    const v = M().video || {};
    if (v.source === 'youtube' && v.youtubeId && LIMITED) {
      status('This match uses a YouTube video, which can’t play on this page. Open it in the GitHub Pages version.');
    } else if (v.source === 'youtube' && v.youtubeId) {
      $('#ytInput').value = 'https://youtu.be/' + v.youtubeId;
      useYouTube(v.youtubeId, true);
    } else if (v.source === 'file' && v.fileName) {
      status(`Open ${v.fileName} again to keep charting against the video.`);
    }
  }

  // ---------------------------------------------------------------- events
  function setView(v) {
    app.view = v;
    try { history.replaceState(null, '', '#' + v); } catch (e) { /* sandboxed */ }
    render();
  }

  function bind() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    $('#bannerNew').addEventListener('click', newMatch);

    $('#winA').addEventListener('click', () => logRally('A'));
    $('#winB').addEventListener('click', () => logRally('B'));
    $('#faultBtn').addEventListener('click', serveFault);
    $('#returnErrBtn').addEventListener('click', returnError);
    $('#undoBtn').addEventListener('click', undo);

    $('#fileInput').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) useFile(f);
      e.target.value = '';
    });
    $('#ytForm').addEventListener('submit', (e) => { e.preventDefault(); useYouTube($('#ytInput').value); });
    $('#noVideoBtn').addEventListener('click', useNoVideo);
    $('#rateSel').addEventListener('change', applyRate);
    $('#playBtn').addEventListener('click', togglePlay);
    $$('[data-seek]').forEach((b) => b.addEventListener('click', () => seekBy(Number(b.dataset.seek))));
    $('#markBtn').addEventListener('click', markServe);
    $('#overlayToggle').addEventListener('change', (e) => { app.overlay = e.target.checked; renderBug(true); });

    // Details panel (delegated)
    $('#details').addEventListener('click', (e) => {
      const m = M();
      const i = app.selected;
      const r = m.rallies[i];
      const b = e.target.closest('button');
      if (!b || !r) return;
      const d = r.d || (r.d = {});
      if (b.dataset.nav) { selectRally(i + Number(b.dataset.nav)); return; }
      if (b.dataset.winner) { r.winner = b.dataset.winner; commit(); return; }
      if (b.dataset.fixwinner) { r.winner = b.dataset.fixwinner; commit(); return; }
      if (b.dataset.replay) { watchRally(i); return; }
      if (b.dataset.delete) { removeRally(i, 'Deleted'); return; }
      if (b.dataset.step) {
        const k = b.dataset.field;
        const v = Math.max(0, (parseInt(d[k], 10) || 0) + Number(b.dataset.step));
        if (v) d[k] = v; else delete d[k];
        commit();
        return;
      }
      if (b.dataset.field) {
        const k = b.dataset.field;
        if (d[k] === b.dataset.value) delete d[k]; else d[k] = b.dataset.value;
        // Drop tags that no longer apply (e.g. "Error went" after switching to Winner).
        config.FIELDS.forEach((f) => { if (f.when && !f.when(d)) delete d[f.key]; });
        commit();
      }
    });
    $('#details').addEventListener('input', (e) => {
      const k = e.target.dataset.input;
      const r = M().rallies[app.selected];
      if (!k || !r) return;
      const d = r.d || (r.d = {});
      const f = config.FIELDS.find((x) => x.key === k);
      let v = e.target.value;
      if (f && f.type === 'count') v = parseInt(v, 10) || '';
      if (v === '' || v == null) delete d[k]; else d[k] = v;
      commit({ skipDetails: true });
    });

    // Rally log (delegated)
    $('#logTable').addEventListener('click', (e) => {
      const play = e.target.closest('[data-play]');
      if (play) { e.stopPropagation(); const i = Number(play.dataset.play); selectRally(i); watchRally(i); return; }
      const tr = e.target.closest('tr[data-i]');
      if (tr) selectRally(Number(tr.dataset.i));
    });

    // Stats filter
    $('#statsRoot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-statsgame]');
      if (!b) return;
      app.statsGame = b.dataset.statsgame === 'all' ? 'all' : Number(b.dataset.statsgame);
      renderStats();
    });

    // Setup (delegated)
    const setup = $('#setupRoot');
    setup.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const m = M();
      if (b.dataset.setting) {
        const k = b.dataset.setting;
        const raw = b.dataset.value;
        m.settings = engine.normalizeSettings(Object.assign({}, m.settings, { [k]: /^\d+$/.test(raw) ? Number(raw) : raw }));
        commit();
        return;
      }
      if (b.id === 'newMatchBtn') { newMatch(); return; }
      if (b.dataset.open) { openMatch(b.dataset.open); return; }
      if (b.dataset.delmatch) { app.confirm = b.dataset.delmatch; renderSetup(); return; }
      if (b.dataset.delmatchNo) { app.confirm = null; renderSetup(); return; }
      if (b.dataset.delmatchYes) { deleteMatch(b.dataset.delmatchYes); return; }
      if (b.id === 'exportJson') { download(fileSlug(m) + '.json', JSON.stringify(m, null, 2), 'application/json'); toast('JSON download started'); return; }
      if (b.id === 'exportCsv') { download(fileSlug(m) + '.csv', toCSV(m), 'text/csv'); toast('CSV download started'); return; }
      if (b.dataset.copy) {
        const isCsv = b.dataset.copy === 'csv';
        const text = isCsv ? toCSV(m) : JSON.stringify(m, null, 2);
        const fallback = () => { app.copyText = text; renderSetup(); const ta = $('#copyFallback'); if (ta) { ta.focus(); ta.select(); } };
        try {
          navigator.clipboard.writeText(text).then(() => {
            app.copyText = null;
            toast(isCsv ? 'CSV copied. Paste it into a spreadsheet.' : 'JSON copied. Paste it into a .json file to import later.');
            renderSetup();
          }, fallback);
        } catch (err) { fallback(); }
      }
    });
    setup.addEventListener('input', (e) => {
      const el = e.target;
      const m = M();
      if (el.dataset.meta) { m[el.dataset.meta] = el.value; commit({ skipSetup: true }); return; }
      if (el.dataset.team) { m.teams[el.dataset.team].name = el.value; commit({ skipSetup: true }); return; }
      if (el.dataset.player) {
        const ref = el.dataset.player;
        m.teams[ref[0]].players[Number(ref[1])] = el.value;
        commit({ skipSetup: true });
      }
    });
    setup.addEventListener('change', (e) => {
      const el = e.target;
      const m = M();
      if (el.id === 'importInput') {
        const f = el.files && el.files[0];
        if (f) f.text().then(importMatch);
        el.value = '';
        return;
      }
      if (el.dataset.start != null) {
        const g = Number(el.dataset.start);
        m.gameStarts = m.gameStarts || [];
        const cfg = engine.gameStartConfig(m, g);
        const cur = m.gameStarts[g] || { firstServer: cfg.firstServer, right: { A: cfg.right.A, B: cfg.right.B } };
        if (el.dataset.first) cur.firstServer = el.value;
        if (el.dataset.right) cur.right = Object.assign({}, cfg.right, cur.right, { [el.dataset.right]: Number(el.value) });
        for (let k = 0; k < g; k++) if (!m.gameStarts[k]) m.gameStarts[k] = null;
        m.gameStarts[g] = cur;
        commit();
        return;
      }
      // Names show up elsewhere on this tab; redraw once focus has moved on, then put it back.
      if (el.dataset.team || el.dataset.player || el.dataset.meta) setTimeout(renderSetupKeepFocus, 0);
    });

    // Chart tooltips
    const tip = $('#tip');
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) return;
      tip.innerHTML = t.getAttribute('data-tip');
      tip.hidden = false;
      const svg = t.closest('svg');
      const line = svg && $('.hover-line', svg);
      if (line && t.dataset.hx) {
        line.setAttribute('x1', t.dataset.hx);
        line.setAttribute('x2', t.dataset.hx);
        line.setAttribute('visibility', 'visible');
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (tip.hidden) return;
      const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
      const y = Math.max(8, e.clientY - tip.offsetHeight - 12);
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    });
    document.addEventListener('mouseout', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) return;
      tip.hidden = true;
      const svg = t.closest('svg');
      const line = svg && $('.hover-line', svg);
      if (line) line.setAttribute('visibility', 'hidden');
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (app.view === 'stats') drawViz(); }, 150);
    });

    document.addEventListener('keydown', onKey);
  }

  function selectRally(i) {
    const m = M();
    if (i < 0 || i >= m.rallies.length) return;
    app.selected = i;
    renderDetails();
    $$('#logTable tr[data-i]').forEach((tr) => tr.classList.toggle('selected', Number(tr.dataset.i) === i));
    scrollLogTo(i);
  }

  function togglePlay() {
    if (!app.player) return;
    if (app.player.paused()) app.player.play(); else app.player.pause();
    setTimeout(updatePlayIcon, 60);
  }

  function seekBy(sec) {
    if (!app.player) return;
    app.player.seek((app.player.getTime() || 0) + sec);
  }

  function markServe() {
    if (!app.player) return;
    app.mark = app.player.getTime();
    renderMark();
  }

  function onKey(e) {
    if (e.key === 'Escape' && isTyping(e)) { e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && app.view === 'chart' && !isTyping(e)) { e.preventDefault(); undo(); }
      return;
    }
    if (isTyping(e) || app.view !== 'chart') return;
    const k = e.key;
    const handled = {
      '1': () => !app.rep.matchOver && logRally('A'),
      '2': () => !app.rep.matchOver && logRally('B'),
      f: () => !app.rep.matchOver && serveFault(),
      r: () => !app.rep.matchOver && returnError(),
      u: undo,
      s: markServe,
      ' ': togglePlay,
      ArrowLeft: () => seekBy(e.shiftKey ? -1 : -5),
      ArrowRight: () => seekBy(e.shiftKey ? 1 : 5),
      '[': () => selectRally((app.selected == null ? M().rallies.length : app.selected) - 1),
      ']': () => selectRally((app.selected == null ? -1 : app.selected) + 1),
    }[k.length === 1 ? k.toLowerCase() : k];
    if (handled) { e.preventDefault(); handled(); }
  }

  function isTyping(e) {
    const t = e.target;
    if (!t || !t.tagName) return false;
    if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return true;
    if (t.tagName === 'INPUT') return !['checkbox', 'radio', 'button', 'file'].includes(t.type);
    return false;
  }

  function newMatch() {
    const m = blankMatch();
    app.matches[m.id] = m;
    app.view = 'setup';
    openMatch(m.id);
    toast('New match created. Name the teams, then go to Chart.');
    const first = $('#team-A');
    if (first) { first.focus(); first.select(); }
  }

  function deleteMatch(id) {
    delete app.matches[id];
    app.confirm = null;
    if (!Object.keys(app.matches).length) {
      const m = blankMatch();
      app.matches[m.id] = m;
    }
    if (id === app.currentId || !app.matches[app.currentId]) {
      const next = Object.values(app.matches).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
      openMatch(next.id);
    } else {
      commit();
    }
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    const data = store.read();
    if (data && data.matches && Object.keys(data.matches).length) {
      app.matches = data.matches;
      app.currentId = app.matches[data.currentId] ? data.currentId : Object.keys(app.matches)[0];
    } else {
      const s = sample.create();
      app.matches = { [s.id]: s };
      app.currentId = s.id;
    }
    const hash = (location.hash || '').replace('#', '');
    if (['chart', 'stats', 'setup'].includes(hash)) app.view = hash;
    const m = M();
    app.selected = m.rallies.length ? m.rallies.length - 1 : null;
    if (LIMITED) $('#ytForm').hidden = true;
    bind();
    app.rep = engine.replay(m);
    render();
    scrollLogTo(app.selected);
    restoreVideo();
    $('#saveState').textContent = '';
  }

  boot();
})();
