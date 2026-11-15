// Scenarios: a short list of chosen battles, each with a card that says what happens in it and what to watch for.
//
// A battle is fully decided by its settings and seed (see the replay notes in main.js), so a scenario is nothing but a setup.
// The numbers on each card are NOT typed into the sentences: they sit in `expect`, the sentences are built from them, and
// `node tests/app/scenarios.test.mjs` fights every listed battle and fails if one no longer matches its card. So when the
// battle code changes, the card cannot go on promising something the battle no longer does: the test says which card to redo.
//
// This file has two parts: the list and its checking (no page needed: the node test loads it), and the page itself (ScenarioPage).

// Every scenario: mission 'hold', the vehicle's own crew trained with stress on and fighting by itself (no player orders), armour option off, daylight,
// the vehicle's fate on (src/battle/fate.js, as on every battle the page fights) and friendly support as the force brings it.
const S = (biome, map, force, skill, waves, seed) => ({ biome, map, force, skill, waves, seed });
const n2 = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const NM = { kornet: 'Kornet', saclos: 'Konkurs', sal: 'laser-homing missile', fpv: 'FPV drone', fpv_fiber: 'fibre-optic FPV drone', rpg: 'RPG', ke: 'tank round' };
const clock = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const w = n => (n >= 0 && n < n2.length ? n2[n] : String(n)), W = n => w(n).charAt(0).toUpperCase() + w(n).slice(1), pl = (n, one, many) => (n === 1 ? one : many || one + 's');

export const SCENARIOS = [
  { key: 'ambush', group: 'HKOI at work', name: 'Missile ambush', setup: S('town', 6, 'ambush', 'trained', 3, 2),
    expect: { alive: true, fired: 21, hits: 0, cut: 12, trophy: 3, mins: 12, result: 'won' },
    lines: x => [`Kornet and Konkurs teams with RPGs, three groups one after another: ${x.fired} missiles and rockets in about ${w(x.mins)} minutes.`,
      `HKOI's cloud cuts the guidance of ${w(x.cut)}, Trophy stops ${w(x.trophy)}, the rest miss. No hits.`],
    watch: 'the first volley, five seconds in: four missiles in the air at once and the cloud going up between a launcher and its missile.' },
  { key: 'drones', group: 'HKOI at work', name: 'Drone hunt', setup: S('farmland', 6, 'drones', 'trained', 1, 1),
    expect: { alive: true, fired: 15, hits: 0, airburst: 14, cut: 1, trophy: 0, maxHeBursts: 3, result: 'won' },
    lines: x => [`Three drone crews send FPV drones at the vehicle one after another, with one Kornet team in support.`,
      `HKOI shoots down all ${w(x.airburst)} drones that reach it with airburst rounds and blinds the Kornet. Trophy never has to fire.`],
    watch: x => `the fibre-optic drone that takes ${w(x.maxHeBursts)} bursts to bring down.` },
  { key: 'layers', group: 'HKOI at work', name: 'Layered defence', setup: S('town', 3, 'heavy', 'trained', 3, 2),
    expect: { alive: true, fired: 32, hits: 0, cut: 9, airburst: 10, trophy: 6, obsLeft: 0, trophyLeft: 2, result: 'withdrawn' },
    lines: x => [`A prepared defence: Kornets, Konkurs, a laser designator, drones and RPGs. ${x.fired} threats in three groups.`,
      `${W(x.cut)} blinded, ${w(x.airburst)} shot down, ${w(x.trophy)} taken by Trophy, the rest miss: no hits. The vehicle pulls out with its obscurant rounds gone and ${w(x.trophyLeft)} Trophy ${pl(x.trophyLeft, 'shot')} left.`],
    watch: 'cloud, airburst and Trophy all working on the same volley.' },
  // the tank's end is drawn and acted on since fate.js (15 Nov): the four cards below were redone then from the battles as they now go
  { key: 'stuck', group: 'Where it runs out', name: 'Stuck in the open', setup: S('desert', 6, 'heavy', 'trained', 3, 2),
    expect: { alive: false, end: 'knocked_out', stuckSecs: 8, stuckBy: 'saclos', lostSecs: 460, lostBy: 'saclos', fired: 19, hits: 2, cut: 6, airburst: 4, trophy: 4, bailed: 4 },
    lines: x => [`A prepared defence on open desert. ${W(x.stuckSecs)} seconds in, a ${NM[x.stuckBy]} hits the engine compartment: the transmission is destroyed and the vehicle can no longer move.`,
      `It fights on where it stands for ${w(Math.round((x.lostSecs - x.stuckSecs) / 60))} minutes: HKOI blinds ${w(x.cut)} and shoots down ${w(x.airburst)}, Trophy stops ${w(x.trophy)}. Then a ${NM[x.lostBy]} knocks it out and all ${w(x.bailed)} crew get out.`],
    watch: 'the first ten seconds: one missile gets through while Trophy on that side is reloading, and the vehicle never moves again.' },
  { key: 'armour', group: 'HKOI at work', name: 'Armoured counter-attack', setup: S('farmland', 7, 'armoured_counter', 'veteran', 1, 1),
    expect: { alive: true, hits: 0, vehLost: 4, trophy: 3, cut: 1, maxSecs: 240, result: 'won' },
    lines: x => [`A veteran T-90M, two T-72B3, two BMP-2 and a Konkurs team move on the position.`,
      `The main gun destroys ${w(x.vehLost)} vehicles in under four minutes. Trophy stops ${w(x.trophy)} missiles and the cloud ${w(x.cut)}.`],
    watch: 'the gunner\'s sight (key 3): he picks an aim point and a round for each target.' },
  { key: 'laststand', group: 'Where it runs out', name: 'Last stand', setup: S('farmland', 4, 'heavy', 'veteran', 5, 4),
    expect: { alive: false, end: 'catastrophic', fired: 23, hits: 3, cut: 4, airburst: 12, trophy: 3, heLeft: 14, stuckSecs: 605, stuckBy: 'fpv', lostSecs: 754, lostBy: 'kornet', wave: 2, mins: 13 },
    lines: x => [`Veterans, five groups planned. The vehicle holds through the first and into the ${['', 'first', 'second', 'third', 'fourth', 'fifth'][x.wave]}: ${x.fired} threats in ${x.mins} minutes. HKOI blinds ${w(x.cut)} and shoots down ${w(x.airburst)}, Trophy stops ${w(x.trophy)}.`,
      `At ${clock(x.stuckSecs)} an ${NM[x.stuckBy]} wrecks the engine and it can no longer move. At ${clock(x.lostSecs)} a ${NM[x.lostBy]} reaches the hull ammunition: the vehicle is destroyed with its crew.`],
    watch: x => `the airburst rounds counting down in the defences box: ${w(x.heLeft)} of 150 are left at the end.` },
  { key: 'laststand2', group: 'Where it runs out', name: 'Last stand in the desert', setup: S('desert', 12, 'heavy', 'veteran', 5, 3),
    expect: { alive: false, end: 'knocked_out', fired: 36, hits: 9, cut: 11, airburst: 10, trophy: 6, trophyLeft: 0, stuckSecs: 16, stuckBy: 'kornet', lostSecs: 1041, lostBy: 'saclos', bailed: 4, down: 0, wounded: 0 },
    lines: x => [`Veterans on open ground with long sight lines. ${W(x.stuckSecs)} seconds in, a ${NM[x.stuckBy]} destroys the transmission: the vehicle fights the rest of the battle where it stands.`,
      `For ${w(Math.round((x.lostSecs - x.stuckSecs) / 60))} minutes HKOI blinds ${w(x.cut)} and shoots down ${w(x.airburst)}, Trophy stops ${w(x.trophy)} and runs dry, and ${w(x.hits)} hits land. The last, a ${NM[x.lostBy]}, knocks it out; all ${w(x.bailed)} crew get out unhurt.`],
    watch: 'how long a vehicle that cannot move holds out while HKOI and Trophy are still working.' },
  { key: 'alone', group: 'Crew under fire', name: 'Commander alone', setup: S('town', 10, 'heavy', 'veteran', 1, 4),
    expect: { alive: true, hits: 3, down: 3, cdr: 'ok', result: 'won' },
    lines: x => [`A veteran prepared defence at the edge of a town. ${W(x.hits)} hits get through.`,
      `Gunner, loader and driver are all out of action by the end. The commander fights on alone until the enemy breaks contact.`],
    watch: 'the crew panel and the inside views after each hit.' },
  { key: 'open', group: 'Crew under fire', name: 'Fourteen in a minute', setup: S('town', 6, 'sprawling_defence', 'trained', 1, 2),
    expect: { alive: false, end: 'knocked_out', fired: 14, hits: 6, cut: 1, trophy: 5, lostSecs: 59, lostBy: 'saclos', bailed: 4, maxSecs: 65 },
    lines: x => [`Nine teams and a BMP-2 under one commander open fire together from close in: ${x.fired} missiles and rockets in about a minute.`,
      `Trophy stops ${w(x.trophy)}, HKOI blinds ${w(x.cut)}, and ${w(x.hits)} hits land. ${W(x.lostSecs)} seconds in, a ${NM[x.lostBy]} into the engine compartment knocks the vehicle out; all ${w(x.bailed)} crew get out.`],
    watch: 'how little time HKOI gets when everything is fired at once from close in.' },
  { key: 'expert', group: 'Crew under fire', name: 'Expert defence', setup: S('desert', 3, 'sprawling_defence', 'expert', 1, 1),
    expect: { alive: false, end: 'catastrophic', fired: 18, hits: 7, trophy: 7, trophyLeft: 0, stuckSecs: 61, stuckBy: 'saclos', lostSecs: 170, lostBy: 'saclos' },
    lines: x => [`The same defence with expert crews, on open desert: ${x.fired} threats in under three minutes.`,
      `Trophy fires all eight shots and stops ${w(x.trophy)}. A ${NM[x.stuckBy]} stops the vehicle ${x.stuckSecs} seconds in; at ${clock(x.lostSecs)} another reaches the hull ammunition and the vehicle is destroyed with its crew.`],
    watch: 'Trophy\'s shot counter: eight shots do not last long against a salvo.' },
  // friendly support and the bomber drone (src/battle/support.js), found by a seed search on 15 Nov and checked like the rest
  { key: 'platoon', group: 'Support and bombers', name: 'Platoon in the defence', setup: S('desert', 12, 'platoon_defence', 'trained', 3, 2),
    expect: { alive: true, result: 'won', wing: 'ok', fired: 15, hits: 0, wingFired: 1, wingHits: 0, wingKills: 7, assistKills: 1, firstAssist: 263, cut: 6, trophy: 5 },
    lines: x => [`You and a wingman, both with HKOI and Trophy, hold open desert against three groups: ${x.fired} threats come at your vehicle, ${w(x.wingFired)} at his.`,
      `No hits on either. HKOI blinds ${w(x.cut)} and Trophy stops ${w(x.trophy)}; the wingman destroys ${w(x.wingKills)} enemy teams, and once his HKOI shoots down a Konkurs that was flying at you.`],
    watch: x => `the wingman's weapon station at ${clock(x.firstAssist)}, firing across at a missile that is not aimed at him.` },
  { key: 'bombers', group: 'Support and bombers', name: 'Bomber drones', setup: S('desert', 3, 'bombers', 'trained', 1, 2),
    expect: { alive: true, result: 'won', bombers: 3, bombersDown: 2, firstDownBursts: 4, firstDownR: 440, bombs: 2, bombHits: 1, end: 'mobility_kill', stuckBy: 'fpv', hits: 0 },
    lines: x => [`Two bomber drone crews, a Konkurs team and an RPG team. The tank's guns deal with the teams; the bombers come later, ${w(x.bombers)} sorties in all.`,
      `HKOI shoots down ${w(x.bombersDown)}; the other settles over the vehicle and drops ${w(x.bombs)} bombs; one hits the engine deck: the engine is destroyed, a mobility kill. Trophy does not engage falling bombs.`],
    watch: x => `the first bomber: HKOI needs ${w(x.firstDownBursts)} bursts to bring it down, the last at ${x.firstDownR} m.` },
];

// Fight a battle to its end the way the page's replay does (runQuiet in main.js): until the vehicle is lost, the battle is over,
// or no enemy team is left with nothing in the air.
export function runToEnd(B) {
  let n = 0;
  while (B.t < 1800 - 1e-6 && n++ < 20000) { if (!B.tank.alive || B.over || (n % 20 === 0 && B.summary().teamsLeft === 0 && !B._volleyActive())) break; B.step(); }
  if (B._pending) B.step();
  return B;
}
// What a finished battle did, in the words the cards use.
export function facts(B) {
  const s = B.summary(), by = s.by || {}, cs = B.crewState ? B.crewState() : null, who = cs && cs.who ? cs.who : {}, dirs = new Set();
  let maxHe = 0, vehLost = 0, droneHits = 0;
  for (const v of B.volleys) for (const th of v.rec.threats) {
    dirs.add(Math.round((((th.brg % 360) + 360) % 360) / 45) % 8);
    if (th.viz.end && th.viz.end.type === 'hit' && /^fpv/.test(th.key)) droneHits++;
    const nb = v.rec.bursts.filter(b => b.idx === th.idx && b.kind !== 'obs' && b.rounds && b.rounds.length).length; if (nb > maxHe) maxHe = nb;
  }
  // fate (src/battle/fate.js, on in every battle the page fights) and friendly support (src/battle/support.js): the wingman, bomber drones
  const bShots = {}; let firstDown = null, stuck = null, stuckBy = null, firstAssist = null, assistKills = 0, bailed = 0, bombers = 0, bombersDown = 0, bombs = 0, bombHits = 0, wingKills = 0, assists = 0;
  for (const e of B.events || []) { if ((e.type === 'team_lost' || e.type === 'veh_lost') && /^wing/.test(e.by || '')) wingKills++; if (e.wing) continue; if (e.type === 'veh_lost') vehLost++;
    if (e.type === 'tank_fate' && e.kind === 'mobility_kill' && stuck == null) { stuck = e.t; stuckBy = e.by; } if (e.type === 'bail_out') bailed++;
    if (e.type === 'bomber_launch') bombers++; if (e.type === 'bomber_down') bombersDown++; if (e.type === 'bomb_drop') bombs++; if (e.type === 'bomb_hit' && e.target !== 'wing') bombHits++;
    if (e.type === 'bomber_hkoi') { (bShots[e.id] = bShots[e.id] || []).push(e); if (e.kill && firstDown == null) firstDown = e.id; }
    if (e.type === 'assist') { assists++; if (e.kill) { assistKills++; if (firstAssist == null) firstAssist = e.t; } } }
  const G = B.wing, F = B.tank.fate;
  const st = Object.values(who);
  return { alive: !!s.alive, result: B.over ? B.over.result : s.teamsLeft === 0 ? 'won' : null, secs: Math.round(s.t), mins: Math.round(s.t / 60), fired: s.fired, hits: s.hits,
    cut: by.hkoi_cut || 0, airburst: by.hkoi_he || 0, trophy: by.aps || 0, trophyLeft: s.apsL + s.apsR, obsLeft: s.obs, heLeft: s.he, dirs: dirs.size,
    down: st.filter(m => m.status === 'down').length, wounded: st.filter(m => m.status === 'wounded').length, panicked: st.filter(m => m.state === 'panicked').length,
    cdr: who.cdr ? who.cdr.status : 'ok', maxHeBursts: maxHe, vehLost, droneHits, wave: s.wave, wingKills,
    end: F ? F.kind : 'ok', stuckSecs: stuck == null ? null : Math.round(stuck), stuckBy, lostSecs: !s.alive && F && F.t != null ? Math.round(F.t) : null, lostBy: !s.alive && F ? F.by : null, bailed,
    firstDownBursts: firstDown == null ? null : bShots[firstDown].length, firstDownR: firstDown == null ? null : Math.round(bShots[firstDown][bShots[firstDown].length - 1].R / 10) * 10,
    assistKills, firstAssist: firstAssist == null ? null : Math.floor(firstAssist), wingFired: G ? G.volleys.reduce((k, v) => k + v.rec.threats.length, 0) : null, bombers, bombersDown, bombs, bombHits, assists,
    wing: G ? (G.alive ? 'ok' : (G.fate && G.fate.kind) || 'lost') : null, wingHits: G ? G.volleys.reduce((k, v) => k + v.rec.threats.filter(th => th.viz.end && th.viz.end.type === 'hit').length, 0) : null };
}
// Where a battle's facts differ from a scenario's card: [] when the card is true.
export function mismatches(sc, f) { const out = []; for (const k of Object.keys(sc.expect)) if (k === 'maxSecs') { if (f.secs > sc.expect[k]) out.push(`the card says it is over within ${sc.expect[k]} s, the battle takes ${f.secs} s`); } else if (f[k] !== sc.expect[k]) out.push(`${k}: the card says ${sc.expect[k]}, the battle gives ${f[k]}`); return out; }
export const cardText = sc => ({ lines: sc.lines(sc.expect), watch: 'Watch for ' + (typeof sc.watch === 'function' ? sc.watch(sc.expect) : sc.watch) });

// ------------------------------------------------------------------------------------------------------------------------------
// The page: a title-screen screen of cards. app: { el, names: { biome, force, skill }, play(setup), replay(setup), back() }
const CSS = `
  #scen .card { width: min(1500px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; padding: 20px 24px; }
  #scen h1 { font-size: clamp(22px, 3vw, 34px); } #scen .sub { margin-bottom: 12px; }
  .sc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); gap: 10px; }
  .sc-h { grid-column: 1 / -1; font: 600 11px/1 var(--mono); color: var(--accent); letter-spacing: .14em; text-transform: uppercase; margin: 8px 0 0; padding-top: 9px; border-top: 1px solid var(--line); }
  .sc-h:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
  .sc-card { display: flex; flex-direction: column; gap: 6px; border: 1px solid rgba(255, 255, 255, .12); border-radius: 8px; padding: 12px 14px; background: rgba(255, 255, 255, .03); }
  .sc-card:hover { border-color: var(--line); }
  .sc-card b { font-size: 17px; letter-spacing: .03em; } .sc-card p { margin: 0; font-size: 13.5px; line-height: 1.42; }
  .sc-card .sc-watch { color: var(--warn); font-size: 13px; line-height: 1.4; } .sc-card .sc-meta { font: 11px/1.4 var(--mono); color: var(--dim); }
  .sc-card .row { margin-top: auto; padding-top: 4px; display: flex; gap: 8px; flex-wrap: wrap; } .sc-card .btn { padding: 6px 12px; }
  .sc-card .btn.go { border-color: var(--accent); color: var(--accent); }
  #scen .sc-foot { display: flex; gap: 14px; align-items: center; margin-top: 14px; flex-wrap: wrap; } #scen .sc-foot span { color: var(--dim); font-size: 12.5px; flex: 1; min-width: 240px; }
`;
const WAVES = { 1: 'one ambush', 3: 'three waves', 5: 'five waves' };

export class ScenarioPage {
  constructor(app) {
    this.app = app; const el = app.el;
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
    this.s = el('div', 'screen'); this.s.id = 'scen'; this.s.hidden = true; this.c = el('div', 'card panel'); this.s.append(this.c); document.body.append(this.s);
    window.addEventListener('keydown', e => { if (e.code === 'Escape' && !this.s.hidden) { this.close(); this.app.back(); } });
  }
  get isOpen() { return !this.s.hidden; }
  open() {
    const { el, names } = this.app, c = this.c; c.textContent = '';
    c.append(el('h1', null, 'SCENARIOS'), el('div', 'sub', 'Battles picked to show one thing each. Every one plays out the same way each time, so what a card says is what you will see. Play it yourself, or sit back and watch it as a replay with the time bar.'));
    const g = el('div', 'sc-grid'); let group = null;
    for (const sc of SCENARIOS) {
      if (sc.group !== group) { group = sc.group; g.append(el('div', 'sc-h', group)); }
      const t = cardText(sc), x = el('div', 'sc-card'), u = sc.setup, row = el('div', 'row');
      const live = el('button', 'btn go', 'Play it'), rp = el('button', 'btn', 'Watch the replay');
      live.title = 'Start this battle as a live battle'; rp.title = 'Watch this battle as a replay: time bar, jump from event to event, every enemy team shown';
      live.onclick = () => { this.close(); this.app.play(u); }; rp.onclick = () => { this.close(); this.app.replay(u); };
      row.append(live, rp);
      x.append(el('b', null, sc.name), el('p', null, t.lines[0]), el('p', null, t.lines[1]), el('div', 'sc-watch', t.watch),
        el('div', 'sc-meta', `${names.biome(u.biome)} · map ${u.map} · ${names.force(u.force)} · ${names.skill(u.skill)} enemy · ${WAVES[u.waves] || u.waves + ' waves'}`), row);
      x.dataset.key = sc.key; g.append(x);
    }
    c.append(g);
    const foot = el('div', 'sc-foot'), back = el('button', 'btn primary', 'Back'); back.onclick = () => { this.close(); this.app.back(); };
    foot.append(back, el('span', null, 'Each scenario sets the battle up for you (your own crew trained and fighting by itself, crew stress on, daylight) and replaces the setup on the title screen. A scenario is one battle: for what happens over thousands, use Run the numbers.'));
    c.append(foot); this.s.hidden = false; this.s.scrollTop = 0; c.scrollTop = 0;
  }
  close() { this.s.hidden = true; }
}
