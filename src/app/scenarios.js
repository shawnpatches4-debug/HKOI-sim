// Scenarios: a short list of chosen battles, each with a card that says what happens in it and what to watch for.
//
// A battle is fully decided by its settings and seed (see the replay notes in main.js), so a scenario is nothing but a setup.
// The numbers on each card are NOT typed into the sentences: they sit in `expect`, the sentences are built from them, and
// `node tests/app/scenarios.test.mjs` fights every listed battle and fails if one no longer matches its card. So when the
// battle code changes, the card cannot go on promising something the battle no longer does: the test says which card to redo.
//
// This file has two parts: the list and its checking (no page needed: the node test loads it), and the page itself (ScenarioPage).

// Every scenario: mission 'hold', the vehicle's own crew trained with stress on and fighting by itself (no player orders), armour option off, daylight.
const S = (biome, map, force, skill, waves, seed) => ({ biome, map, force, skill, waves, seed });
const n2 = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
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
  { key: 'runsout', group: 'Where it runs out', name: 'Where it runs out', setup: S('desert', 6, 'heavy', 'trained', 3, 2),
    expect: { alive: true, fired: 38, hits: 4, obsLeft: 0, trophyLeft: 1, panicked: 4, result: 'withdrawn' },
    lines: x => [`The same kind of enemy on open desert: ${x.fired} threats.`,
      `The obscurant magazine empties, Trophy is down to ${w(x.trophyLeft)} ${pl(x.trophyLeft, 'shot')} and ${w(x.hits)} hits land. The vehicle survives and breaks contact with all four crew in panic.`],
    watch: 'the magazines counting down in the defences box, and the first hit.' },
  { key: 'armour', group: 'HKOI at work', name: 'Armoured counter-attack', setup: S('farmland', 7, 'armoured_counter', 'veteran', 1, 1),
    expect: { alive: true, hits: 0, vehLost: 4, trophy: 3, cut: 1, maxSecs: 240, result: 'won' },
    lines: x => [`A veteran T-90M, two T-72B3, two BMP-2 and a Konkurs team move on the position.`,
      `The main gun destroys ${w(x.vehLost)} vehicles in under four minutes. Trophy stops ${w(x.trophy)} missiles and the cloud ${w(x.cut)}.`],
    watch: 'the gunner\'s sight (key 3): he picks an aim point and a round for each target.' },
  { key: 'laststand', group: 'Where it runs out', name: 'Last stand', setup: S('farmland', 4, 'heavy', 'veteran', 5, 4),
    expect: { alive: true, fired: 41, hits: 9, dirs: 7, trophyLeft: 0, heLeft: 0, down: 1, wounded: 1, mins: 28, wave: 3, droneHits: 6, result: 'withdrawn' },
    lines: x => [`Veterans. Five groups were planned and the vehicle breaks contact during the ${['', 'first', 'second', 'third', 'fourth', 'fifth'][x.wave]}: ${x.fired} threats from ${w(x.dirs)} of the eight points of the compass in ${x.mins} minutes.`,
      `Trophy fires its last shot on both sides, the airburst magazine empties and ${w(x.hits)} hits land. One crewman is down and one wounded, and the vehicle still drives out.`],
    watch: x => `the drones: ${w(x.droneHits)} of the ${w(x.hits)} hits are FPV drones, most of them near the end when the airburst rounds are gone.` },
  { key: 'laststand2', group: 'Where it runs out', name: 'Last stand in the desert', setup: S('desert', 12, 'heavy', 'veteran', 5, 3),
    expect: { alive: true, fired: 30, hits: 6, trophyLeft: 1, cut: 8, airburst: 10, panicked: 4, down: 0, wounded: 0, mins: 11, result: 'withdrawn' },
    lines: x => [`Veterans on open ground with long sight lines: ${x.fired} threats in about ${w(x.mins)} minutes.`,
      `HKOI blinds ${w(x.cut)} and shoots down ${w(x.airburst)}, but ${w(x.hits)} hits land and Trophy is down to ${w(x.trophyLeft)} ${pl(x.trophyLeft, 'shot')} when the vehicle breaks contact.`],
    watch: 'the crew: nobody is hurt, and all four are in panic at the end.' },
  { key: 'alone', group: 'Crew under fire', name: 'Commander alone', setup: S('town', 10, 'heavy', 'veteran', 1, 4),
    expect: { alive: true, hits: 3, down: 3, cdr: 'ok', result: 'won' },
    lines: x => [`A veteran prepared defence at the edge of a town. ${W(x.hits)} hits get through.`,
      `Gunner, loader and driver are all out of action by the end. The commander fights on alone until the enemy breaks contact.`],
    watch: 'the crew panel and the inside views after each hit.' },
  { key: 'open', group: 'Crew under fire', name: 'Thirteen in ninety seconds', setup: S('town', 6, 'sprawling_defence', 'trained', 1, 2),
    expect: { alive: true, fired: 13, hits: 4, trophy: 6, trophyLeft: 1, wounded: 2, down: 0, maxSecs: 95, result: 'withdrawn' },
    lines: x => [`Nine teams and a BMP-2 under one commander open fire together: ${x.fired} missiles and rockets in a minute and a half.`,
      `Trophy stops ${w(x.trophy)} and is nearly empty. ${W(x.hits)} hits land, gunner and driver are wounded, and the vehicle pulls out.`],
    watch: 'how little time HKOI gets when everything is fired at once from close in.' },
  { key: 'expert', group: 'Crew under fire', name: 'Expert defence', setup: S('desert', 3, 'sprawling_defence', 'expert', 1, 1),
    expect: { alive: true, fired: 14, hits: 4, trophy: 7, trophyLeft: 0, wounded: 1, down: 0, panicked: 4, maxSecs: 90, result: 'withdrawn' },
    lines: x => [`The same defence with expert crews, on open desert: ${x.fired} threats in under a minute and a half.`,
      `Trophy fires all eight shots and stops ${w(x.trophy)}. ${W(x.hits)} hits land, the gunner is wounded and the whole crew is in panic as the vehicle withdraws.`],
    watch: 'Trophy\'s shot counter: eight shots do not last long against a salvo.' },
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
  for (const e of B.events || []) if (e.type === 'veh_lost') vehLost++;
  const st = Object.values(who);
  return { alive: !!s.alive, result: B.over ? B.over.result : s.teamsLeft === 0 ? 'won' : null, secs: Math.round(s.t), mins: Math.round(s.t / 60), fired: s.fired, hits: s.hits,
    cut: by.hkoi_cut || 0, airburst: by.hkoi_he || 0, trophy: by.aps || 0, trophyLeft: s.apsL + s.apsR, obsLeft: s.obs, heLeft: s.he, dirs: dirs.size,
    down: st.filter(m => m.status === 'down').length, wounded: st.filter(m => m.status === 'wounded').length, panicked: st.filter(m => m.state === 'panicked').length,
    cdr: who.cdr ? who.cdr.status : 'ok', maxHeBursts: maxHe, vehLost, droneHits, wave: s.wave };
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
