// Three screens that sit beside the battle itself:
//   the debrief  (after a battle: a score out of 100, what stopped what, the story threat by threat),
//   the ladder   (ten raids of rising difficulty, best score kept per browser),
//   the numbers  (the same battles fought many times, unseen, under four setups of the defences: what HKOI adds and why hits got through).
// The counting is done by src/battle/ladder.js and src/battle/study.js; this file only shows it.

const CSS = `
  .pg-score { display: flex; gap: 18px; align-items: baseline; flex-wrap: wrap; margin: 4px 0 10px; }
  .pg-score b { font-size: 46px; line-height: 1; color: var(--accent); font-weight: 800; } .pg-score span { color: var(--dim); }
  .pg-parts { display: flex; gap: 6px 18px; flex-wrap: wrap; font: 12px var(--mono); color: var(--dim); margin-bottom: 8px; } .pg-parts b { color: var(--fg); font-weight: 600; }
  .pg-saved { border-left: 3px solid var(--accent); padding: 6px 10px; margin: 10px 0; background: rgba(57, 217, 138, .07); font-size: 13px; }
  .pg-tbl { border-collapse: collapse; width: 100%; font: 12px/1.5 var(--mono); } .pg-tbl th { text-align: left; color: var(--dim); font-weight: 500; padding: 2px 10px 4px 0; border-bottom: 1px solid var(--line); white-space: nowrap; }
  .pg-tbl td { padding: 2px 10px 2px 0; vertical-align: top; } .pg-tbl td.n { text-align: right; font-variant-numeric: tabular-nums; } .pg-tbl tr.hit td { color: var(--bad); } .pg-tbl tr.hk td:last-child { color: var(--accent); }
  .pg-scroll { max-height: 34vh; overflow: auto; margin-top: 6px; } .pg-wide { width: min(1040px, 100%); }
  .pg-rungs { display: grid; gap: 8px; } .pg-rung { display: grid; grid-template-columns: 34px 1fr auto auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
  .pg-rung i { font-style: normal; font: 700 18px var(--mono); color: var(--dim); } .pg-rung small { display: block; color: var(--dim); } .pg-rung .best { font: 12px var(--mono); color: var(--dim); min-width: 84px; text-align: right; }
  .pg-bar { height: 6px; background: rgba(255, 255, 255, .08); border-radius: 3px; overflow: hidden; margin: 8px 0; } .pg-bar div { height: 100%; width: 0; background: var(--accent); }
  .pg-note { color: var(--dim); font-size: 12px; margin: 8px 0; } .pg-take { font-size: 14px; margin: 12px 0 4px; } .pg-h { font: 11px/1 var(--mono); color: var(--dim); letter-spacing: .1em; text-transform: uppercase; margin: 16px 0 6px; }
  @media (max-width: 640px) { .pg-rung { grid-template-columns: 28px 1fr; } .pg-rung .best { text-align: left; } }
`;
const ENDED = { hkoi: 'Blinded or shot down by HKOI', trophy: 'Stopped by Trophy', hit: 'HIT THE VEHICLE', gunner_jitter: 'Enemy gunner missed', terrain_mask: 'Lost behind cover', counter_fire: 'Gunner driven off by machine-gun fire', suppressed_aim: 'Aim shaken by machine-gun fire', unguided_miss: 'Missed on its own', crew_smoke: 'Lost in crew smoke' };
const THREAT = { kornet: 'Kornet', saclos: 'Konkurs', rpg: 'RPG', sal: 'Laser-homing missile', fpv: 'FPV drone', fpv_fiber: 'Fibre FPV drone' };
const RESULT = { lost: 'Vehicle destroyed', won: 'Enemy beaten off', objective: 'Objective reached', withdrawn: 'Broke contact', time: 'Time ran out' };
const clock = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'), pc = x => Math.round(100 * x) + '%';

// ctx: { el, store, deps: { HK, Battle, Study, Ladder }, scenario() -> { opts, text }, playRung(rung), back() }
export function initPages(ctx) {
  const { el, store, deps } = ctx, { Study, Ladder } = deps;
  document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
  const screen = (id, wide) => { const s = el('div', 'screen'); s.id = id; s.hidden = true; const c = el('div', 'card panel' + (wide ? ' pg-wide' : '')); s.append(c); document.body.append(s); return { s, c }; };
  const table = (head, rows, cls) => { const t = el('table', 'pg-tbl'), tr = el('tr'); head.forEach(h => tr.append(el('th', null, h))); t.append(tr); rows.forEach((r, i) => { const x = el('tr', cls ? cls(r, i) : null); r.forEach((v, j) => x.append(el('td', typeof v === 'number' || /^[\d.]+%?( |$)/.test(String(v)) && j > 0 ? 'n' : null, String(v)))); t.append(x); }); return t; };
  const row = (...kids) => { const r = el('div', 'row'); r.append(...kids); return r; }, btn = (text, fn, primary) => { const b = el('button', 'btn' + (primary ? ' primary' : ''), text); b.onclick = fn; return b; };

  // ---------------------------------------------------------------- debrief: fills a box on the result screen
  function debrief(battle, box, rungKey) {
    const d = Ladder.debrief(battle); box.textContent = '';
    const sc = el('div', 'pg-score'); sc.append(el('b', null, String(d.score)), el('span', null, `out of 100 · ${Ladder.grade(d.score)} · ${RESULT[d.result] || d.result} after ${clock(d.t)}`)); box.append(sc);
    const p = el('div', 'pg-parts'); for (const [k, name, max] of [['vehicle', 'Vehicle', 50], ['crew', 'Crew', 20], ['mission', 'Mission', 20], ['stores', 'Rounds left', 10]]) { const s = el('span'); s.append(`${name} `, el('b', null, `${d.parts[k]}/${max}`)); p.append(s); } box.append(p);
    box.append(el('div', 'pg-saved', d.saved));
    const tot = [['Missiles, rockets and drones at the vehicle', d.threats], ['Hits taken', d.hits], ['Stopped by HKOI', d.hkoiStopped], ['Stopped by Trophy', d.trophyStopped], ['Trophy shots left', `${d.trophyLeft} of 6`], ['Obscurant / HE rounds left', `${d.obsLeft} / ${d.heLeft}`], ['Crew hurt', d.crewDown], ['Enemy teams destroyed', `${d.destroyed} of ${d.teams}`], ['Enemy teams that pulled out', d.pulledOut]];
    if (d.waves > 1) tot.unshift(['Enemy groups faced', `${d.wave} of ${d.waves}`]);
    box.append(table(['', ''], tot));
    if (d.story.length) { box.append(el('div', 'pg-h', 'Threat by threat')); const sb = el('div', 'pg-scroll'); sb.append(table(['Launched', 'Weapon', 'From', 'Range', 'Ended', 'How'], d.story.map(x => [clock(x.t), THREAT[x.key] || x.key, x.from, x.R ? x.R + ' m' : '-', clock(x.tEnd), ENDED[x.ended] || String(x.ended).replace(/_/g, ' ')]), r => r[5] === ENDED.hit ? 'hit' : r[5] === ENDED.hkoi ? 'hk' : null)); box.append(sb); }
    if (rungKey) { const best = store.get('ladder', {}); if (!(best[rungKey] >= d.score)) { best[rungKey] = d.score; store.set('ladder', best); } }
    return d;
  }

  // ---------------------------------------------------------------- ladder
  const L = screen('ladder');
  function openLadder() {
    const c = L.c, best = store.get('ladder', {}); c.textContent = ''; c.append(el('h1', null, 'LADDER'), el('div', 'sub', 'Ten raids, easiest first, all open. The top rungs are meant to be nearly impossible: they show where HKOI and Trophy run out.'));
    const g = el('div', 'pg-rungs'); Ladder.RUNGS.forEach((r, i) => { const x = el('div', 'pg-rung'), t = el('div'); t.append(el('b', null, r.name), el('small', null, r.brief)); x.append(el('i', null, String(i + 1)), t, el('div', 'best', best[r.key] != null ? `best ${best[r.key]} · ${Ladder.grade(best[r.key])}` : 'not fought yet'), btn('Fight', () => { L.s.hidden = true; ctx.playRung(r); })); g.append(x); }); c.append(g);
    const total = Ladder.RUNGS.reduce((n, r) => n + (best[r.key] || 0), 0); c.append(row(btn('Back', () => { L.s.hidden = true; ctx.back(); }, true), el('div', 'note', `Ladder total ${total} of 1000. Scores are kept in this browser.`)));
    L.s.hidden = false;
  }

  // ---------------------------------------------------------------- run the numbers
  const N = screen('numbers', true); let running = false, stop = false;
  function openNumbers() {
    const c = N.c, sc = ctx.scenario(); c.textContent = '';
    c.append(el('h1', null, 'RUN THE NUMBERS'), el('div', 'sub', `${sc.text}. The same battles are fought again and again, unseen, with four setups of the vehicle's defences.`));
    let n = 25; const pick = el('div', 'seg'), status = el('div', 'pg-note', 'Each battle takes about a second, so 25 per setup is a minute or two. More battles give a narrower range.'), bar = el('div', 'pg-bar'), fill = el('div'), out = el('div'); bar.append(fill);
    const sizes = [10, 25, 50, 100], draw = () => { pick.textContent = ''; for (const k of sizes) { const b = el('button', 'btn' + (k === n ? ' on' : ''), `${k} battles each`); b.onclick = () => { if (!running) { n = k; draw(); } }; pick.append(b); } }; draw();
    const go = btn('Run', async () => {
      if (running) { stop = true; return; } running = true; stop = false; go.textContent = 'Stop'; out.textContent = ''; const rows = {}, lookups = {}, t0 = performance.now(); for (const st of Study.SETUPS) rows[st.key] = [];
      const total = n * Study.SETUPS.length; let done = 0;
      try { for (let seed = 1; seed <= n && !stop; seed++) for (const st of Study.SETUPS) { if (stop) break; rows[st.key].push(Study.one({ HK: deps.HK, Battle: deps.Battle }, sc.opts, st, seed, lookups)); done++; fill.style.width = (100 * done / total).toFixed(1) + '%'; status.textContent = `Battle ${done} of ${total} · ${Math.round((performance.now() - t0) / 1000)} s`; await new Promise(r => setTimeout(r, 0)); } }
      catch (e) { status.textContent = 'The run stopped on an error: ' + (e && e.message); }
      running = false; go.textContent = 'Run again'; const res = {}; for (const st of Study.SETUPS) res[st.key] = Study.summarise(rows[st.key], st); if (res.both.n) results(out, res, sc);
    }, true);
    c.append(row(pick), bar, status, out, row(go, btn('Back', () => { if (running) stop = true; N.s.hidden = true; ctx.back(); })));
    N.s.hidden = false;
  }
  function results(out, res, sc) {
    out.textContent = ''; const S = Study.SETUPS, both = res.both, aps = res.aps;
    // the plain-words reading, honest about small batches
    const apart = both.range[0] > aps.range[1] ? 'The ranges do not overlap, so this batch shows a real difference.' : both.range[1] < aps.range[0] ? 'Trophy alone did better here, and the ranges do not overlap.' : 'The ranges overlap, so this batch is too small to say the difference is real: run more battles.';
    out.append(el('div', 'pg-take', `With HKOI and Trophy the vehicle survived ${both.survived} of ${both.n} battles (${pc(both.survival)}); with Trophy alone ${aps.survived} of ${aps.n} (${pc(aps.survival)}). ${apart}`));
    out.append(el('div', 'pg-h', 'The four setups'));
    out.append(table(['Setup', 'Vehicle survives', 'Likely range', 'Hits per battle', 'Crew hurt', 'Threats per battle', 'Teams destroyed', 'Mean length'], S.map(st => { const r = res[st.key]; return [st.name, pc(r.survival), `${pc(r.range[0])} to ${pc(r.range[1])}`, r.hitsPerBattle.toFixed(2), r.crewPerBattle.toFixed(2), r.threatsPerBattle.toFixed(1), r.destroyedPerBattle.toFixed(1), clock(r.meanT)]; })));
    out.append(el('div', 'pg-h', 'What ended each threat, per 100 fired at the vehicle'));
    out.append(table(['Setup'].concat(Study.BUCKETS.map(b => b[1])), S.map(st => { const r = res[st.key]; return [st.name].concat(Study.BUCKETS.map(([k]) => r.threats ? Math.round(100 * (r.chain[k] || 0) / r.threats) : 0)); })));
    out.append(el('div', 'pg-h', 'Why the hits got through'));
    out.append(table(['Setup', 'Reasons, most common first'], S.map(st => [st.name, Object.entries(res[st.key].why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join('; ') || 'no hits'])));
    out.append(el('div', 'pg-h', 'By weapon, with HKOI and Trophy'));
    out.append(table(['Weapon', 'Fired', 'Stopped by HKOI', 'Stopped by Trophy', 'Hit the vehicle'], Object.entries(both.byType).sort((a, b) => b[1].n - a[1].n).map(([k, t]) => [THREAT[k] || k, t.n, pc((t.hkoi || 0) / t.n), pc((t.trophy || 0) / t.n), pc((t.hit || 0) / t.n)])));
    out.append(el('div', 'pg-note', 'Every figure comes from the same engine that decides the battles you watch. The inputs are assumptions, not test results: enemy gunner steadiness by crew level, cloud payload of 40 g a round, Trophy at 90% when cued, and the rest listed in the engine\'s settings.'));
    const txt = [`HKOI Battlefield, run the numbers: ${sc.text}, ${both.n} battles per setup.`].concat(S.map(st => { const r = res[st.key]; return `${st.name}: vehicle survives ${pc(r.survival)} (${pc(r.range[0])} to ${pc(r.range[1])}), ${r.hitsPerBattle.toFixed(2)} hits per battle.`; })).join('\n');
    const cp = btn('Copy summary', () => { if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => { cp.textContent = 'Copied'; }).catch(() => { cp.textContent = 'Select the text below'; ta.hidden = false; ta.select(); }); else { ta.hidden = false; ta.select(); } }), ta = el('textarea'); ta.value = txt; ta.hidden = true; ta.readOnly = true; ta.style.cssText = 'width:100%;height:90px;margin-top:8px;background:rgba(255,255,255,.06);color:inherit;border:1px solid var(--line);border-radius:6px;font:11px var(--mono)';
    out.append(row(cp), ta);
  }
  return { debrief, openLadder, openNumbers, closeAll() { L.s.hidden = true; N.s.hidden = true; stop = true; } };
}
