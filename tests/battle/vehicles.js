// node tests/battle/vehicles.js [battles per setting, default 40] [--quick]
// Enemy vehicles, transport and the enemy commander (src/battle/enemyveh.js, src/battle/enemycdr.js).
//   0. The gunner's table: what each of the M1's rounds does to each vehicle from each side (straight from the armour figures).
//   1. Each new force at two crew levels: what each vehicle type fired, how it was killed (by what, from which side, on which plate),
//      what the 30 mm stripped off the M1, what the commander ordered and how often his picture was wrong, step time.
//   2. Transport: the same teams on the same seeds with and without their trucks: how far they moved and how many missiles they got away.
//   3. The commander: the same force with and without him.
//   4. The M1 with both defences, Trophy only, HKOI only and neither, on the same seeds.
//   5. The same battle twice gives the same battle; no number anywhere is NaN.
// Everything printed is what the model does with its stated assumptions. Nothing here is tuned.
const { HK, Battle, EnemyVeh, EnemyCdr } = require('./load.js');
const args = process.argv.slice(2), N = +(args.find(a => /^\d+$/.test(a)) || 40), QUICK = args.includes('--quick');
const cfg = HK.defaultConfig(), lookup = HK.meetLookup(cfg);
const BIOMES = ['farmland', 'desert', 'town', 'forest'], MISSIONS = ['hold', 'hold', 'advance', 'hunt'];
let fail = 0; const bad = (...a) => { fail++; console.log('FAIL', ...a); };
const finite = (o, where, depth) => { if (typeof o === 'number') { if (!Number.isFinite(o)) throw new Error('not a finite number at ' + where); } else if (o && typeof o === 'object' && (depth || 0) < 8) for (const k in o) finite(o[k], where + '.' + k, (depth || 0) + 1); };
const pc = (x, n) => (n ? Math.round(100 * x / n) : 0) + '%', avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, tally = (o, k, n) => { o[k] = (o[k] || 0) + (n == null ? 1 : n); };
const show = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
const side = a => a < 20 ? 'front' : a > 160 ? 'rear' : a < 70 ? 'front quarter' : a > 110 ? 'rear quarter' : 'side';

function setup(kind) { const c = JSON.parse(JSON.stringify(cfg)); if (kind === 'trophy' || kind === 'neither') c.hkoi_enabled = false; if (kind === 'hkoi' || kind === 'neither') c.aps.enabled = false; return { cfg: c, lookup: c.hkoi_enabled ? (kind === 'both' ? lookup : HK.meetLookup(c)) : {} }; }
const SETUPS = { both: setup('both'), trophy: setup('trophy'), hkoi: setup('hkoi'), neither: setup('neither') };
const optFor = (i, skill, force, commander, su) => Object.assign({ biome: BIOMES[i % 4], mapSeed: 3 + (i % 5) * 2, seed: 500 + i, skill, mission: MISSIONS[i % 4], waves: 1, force, commander }, SETUPS[su || 'both']);

function fight(opt, maxT, timing) {
  const b = new Battle.Battle(opt); let n = 0, worst = 0, total = 0;
  while (b.t < maxT && b.tank.alive && !b.over && n < 100000) {
    const t0 = timing ? process.hrtime.bigint() : 0n; b.step(); n++;
    if (timing) { const ms = Number(process.hrtime.bigint() - t0) / 1e6; total += ms; if (ms > worst) worst = ms; }
    if (n % 50 === 0) { finite(b.vehicles(), 'vehicles'); finite(b.commander(), 'commander'); }
  }
  finite(b.vehicles(), 'vehicles'); finite(b.commander(), 'commander'); finite(b.commanderAt(b.t / 2), 'commanderAt'); finite(b.vehReport(), 'vehReport'); finite(b.cdrReport(), 'cdrReport'); finite(b.summary(), 'summary');
  for (const u of b.units) { finite([u.e, u.n], 'unit'); b.intentOf(u); }
  return { b, n, worst, total, result: !b.tank.alive ? 'lost' : b.over ? b.over.result : 'time' };
}

// ---------------------------------------------------------------- 0. the gunner's table
console.log('0. THE GUNNER\'S TABLE. M1 halted, target halted and fully in view, calm crew. For each round: where the gunner aims, the chance the');
console.log('   round lands on the vehicle at all, and the chance it goes through the plate aimed at (armour figures are open-source ESTIMATES).');
{
  const R2 = EnemyVeh.ROUNDS;
  for (const kind of ['t90', 't72', 'bmp2']) for (const asp of [[0, 'front'], [45, 'front quarter'], [90, 'side'], [180, 'rear']]) {
    const cells = [];
    for (const R of [1000, 2000, 3000]) for (const rk of ['ap', 'mp']) {
      const rd = R2[rk], s = EnemyVeh.sigmaMrad(rd, R) * R / 1000, tab = EnemyVeh.aimTable(kind, rd, R, s, asp[0], asp[0], false), a = tab.seen[0];
      finite([tab.pVeh, a.pz, a.pThrough, a.prot], 'aimTable');
      cells.push(`${R / 1000} km ${rd.name}: ${a.z.label} (${Math.round(a.prot)} mm) hit ${pc(tab.pVeh, 1)} through ${pc(a.pThrough, 1)}`);
    }
    console.log(`   ${EnemyVeh.KINDS[kind].name.padEnd(7)} ${asp[1].padEnd(13)} ${cells.join(' | ')}`);
  }
  // can the multi-purpose round get through anything on the front of a tank?
  for (const kind of ['t72', 't90']) { const zs = EnemyVeh.ZONES[kind].filter(z => z.A[0] > 0), f = rk => zs.map(z => `${z.label} ${Math.round(EnemyVeh.protection(z, R2[rk]))}`).join(', ');
    console.log(`   ${EnemyVeh.KINDS[kind].name} from the front, mm against sabot (about ${R2.ap.pen(2000)} at 2 km): ${f('ap')}`);
    console.log(`   ${EnemyVeh.KINDS[kind].name} from the front, mm against multi-purpose (about ${R2.mp.pen(2000)}): ${f('mp')}`); }
}

// ---------------------------------------------------------------- 1. each force, two crew levels
{ // for comparison: step time of a battle with no vehicle and no commander (the force the other battle tests use)
  let n = 0, total = 0, worst = 0; for (let i = 0; i < Math.min(N, 12); i++) { const f = fight(optFor(i, 'trained', [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 2 }, { type: 'rpg', n: 1 }], false), 600, true); n += f.n; total += f.total; worst = Math.max(worst, f.worst); }
  console.log(`\n   For comparison, a force WITHOUT vehicles or commander (2 Kornet, 2 Konkurs, 1 RPG): step time mean ${(total / n).toFixed(3)} ms, worst ${worst.toFixed(1)} ms over ${n} steps (the worst steps are the engine resolving a volley).`); }
const FORCES = EnemyVeh.FORCES, LEVELS = QUICK ? ['trained'] : ['trained', 'expert'];
const stepAll = { n: 0, total: 0, worst: 0 };
console.log(`\n1. EACH FORCE, ${N} battles per row (four kinds of ground; missions hold, hold, advance, hunt; one wave; up to 600 s), HKOI and Trophy on.`);
for (const key of Object.keys(FORCES)) for (const skill of LEVELS) {
  const F = FORCES[key], A = { res: {}, kinds: {}, strips: {}, bursts: 0, burstsOn: 0, gun: { ap: 0, mp: 0 }, gunHits: 0, m2v: 0, cdr: null, steps: 0, total: 0, worst: 0, lines: [], rides: [], teamKills: 0, hitsOnM1: 0, fired: 0 };
  for (let i = 0; i < N; i++) {
    let f; try { f = fight(optFor(i, skill, F.force, F.commander), 600, true); } catch (e) { bad(key, skill, 'battle', i, e.message); continue; }
    const b = f.b, R = b.vehReport(), s = b.summary(); tally(A.res, f.result); A.steps += f.n; A.total += f.total; A.worst = Math.max(A.worst, f.worst); A.hitsOnM1 += s.hits; A.fired += s.fired; A.teamKills += s.killedByTank + s.killedByMg;
    if (!R.on) { bad(key, 'vehicle module not active'); continue; }
    A.bursts += R.stat.bursts30; A.burstsOn += R.stat.bursts30On; A.gun.ap += R.stat.gunShots.ap; A.gun.mp += R.stat.gunShots.mp; A.gunHits += R.stat.gunHits; A.m2v += R.stat.m2AtVeh; for (const k in R.stat.strips) tally(A.strips, k, R.stat.strips[k]); for (const r of R.stat.rides) A.rides.push(r);
    for (const v of R.vehicles) { const K = A.kinds[v.kind] || (A.kinds[v.kind] = { n: 0, gun: 0, gunHit: 0, msl: 0, bursts: 0, firedAny: 0, lost: 0, by: {}, from: {}, zone: {}, how: {}, crippled: 0, moved: 0, located: 0, noPen: 0, hits: 0 });
      K.n++; K.gun += v.gun; K.gunHit += v.gunHit; K.msl += v.msl; K.bursts += v.bursts; if (v.gun + v.msl + v.bursts > 0) K.firedAny++; K.moved += v.moved; if (v.known) K.located++;
      for (const h of v.hits) { K.hits++; if (!h.through) K.noPen++; }
      if (v.killed) { K.lost++; tally(K.by, v.killed.by); tally(K.from, side(v.killed.aspect)); tally(K.zone, v.killed.zone); tally(K.how, v.killed.how); } else if (!v.mobile || !v.canFire && v.kind !== 'uaz') K.crippled++; }
    const C = b.cdrReport(); if (C.on) { if (!A.cdr) A.cdr = { battles: 0, orders: 0, wrong: 0, byKind: {}, wrongByKind: {}, reviews: 0, reviewsWrong: 0, reviewsStale: 0, offSum: 0, ageSum: 0, strikes: 0, strikesTimedOut: 0, lost: 0, lostWhy: {}, reports: 0, heard: 0 }; A.cdr.battles++; for (const k of ['orders', 'wrong', 'reviews', 'reviewsWrong', 'reviewsStale', 'offSum', 'ageSum', 'strikes', 'strikesTimedOut', 'lost', 'reports', 'heard']) A.cdr[k] += C[k]; for (const k in C.byKind) tally(A.cdr.byKind, k, C.byKind[k]); for (const k in C.wrongByKind) tally(A.cdr.wrongByKind, k, C.wrongByKind[k]); for (const k in C.lostWhy) tally(A.cdr.lostWhy, k, C.lostWhy[k]); }
    if (A.lines.length < 3) { const l = b.log.find(q => /^Gunner aims at/.test(q.text) && /through|no penetration/.test(q.text) && !A.lines.some(x => x.slice(0, 30) === q.text.slice(0, 30))); if (l) A.lines.push(`      "${l.text}" [${l.why}]`); }
    if (A.lines.length < 5) { const l = b.log.find(q => /HE IS WRONG/.test(q.why || '')); if (l && !A.lines.some(x => /WRONG/.test(x))) A.lines.push(`      "${l.text}" [${l.why}]`); }
  }
  stepAll.n += A.steps; stepAll.total += A.total; stepAll.worst = Math.max(stepAll.worst, A.worst);
  console.log(`\n   ${F.name.toUpperCase()}, ${skill} crews. Result: ${show(A.res)}. M1 lost ${A.res.lost || 0} of ${N}. Missiles and tank rounds through the engine ${A.fired}, hits on the M1 ${A.hitsOnM1}; enemy teams knocked out ${A.teamKills}.`);
  for (const k in A.kinds) { const K = A.kinds[k], nm = EnemyVeh.KINDS[k].name;
    console.log(`     ${nm.padEnd(7)} x${K.n}: fired in ${pc(K.firedAny, K.n)} of cases` + (k === 'bmp2' ? ` (Konkurs ${K.msl}, 30 mm bursts ${K.bursts})` : k === 'uaz' ? '' : ` (main gun rounds ${K.gun}, of which on target ${K.gunHit})`) + `; located by the M1 ${pc(K.located, K.n)}; drove ${Math.round(K.moved / K.n)} m on average.`);
    console.log(`             lost ${K.lost} (${pc(K.lost, K.n)}): ${show(K.how)}; by ${show(K.by)}; from the ${show(K.from)}; plate ${show(K.zone)}. Crippled but not lost ${K.crippled}. 120 mm hits ${K.hits}, of which no penetration ${K.noPen}.`); }
  console.log(`     M1 main gun at vehicles: sabot ${A.gun.ap}, multi-purpose ${A.gun.mp}, hits ${A.gunHits} (${pc(A.gunHits, A.gun.ap + A.gun.mp)}); .50 bursts at trucks ${A.m2v}.`);
  if (A.bursts) console.log(`     30 mm on the M1: ${A.bursts} bursts, ${A.burstsOn} on target (${pc(A.burstsOn, A.bursts)}); stripped or wounded: ${show(A.strips)}.`);
  if (A.rides.length) console.log(`     Rides completed: ${A.rides.length} (${(A.rides.length / N).toFixed(2)} a battle), mean ${Math.round(avg(A.rides.map(r => r.m)))} m in ${Math.round(avg(A.rides.map(r => r.s)))} s, longest ${Math.max(...A.rides.map(r => r.m))} m; ordered by the commander ${A.rides.filter(r => r.ordered).length}.`);
  else if (A.kinds.uaz) console.log('     Rides completed: none.');
  if (A.cdr) { const C = A.cdr; console.log(`     Commander: ${C.orders} orders in ${C.battles} battles (${show(C.byKind)}); ${C.reports} sightings reported to him, ${C.heard} gun reports heard.`);
    console.log(`             his picture at each review: off by ${Math.round(C.offSum / Math.max(1, C.reviews))} m on average, ${Math.round(C.ageSum / Math.max(1, C.reviews))} s old; more than 150 m wrong at ${pc(C.reviewsWrong, C.reviews)} of ${C.reviews} reviews; stale (over 60 s) at ${pc(C.reviewsStale, C.reviews)}.`);
    console.log(`             orders given on a wrong picture: ${C.wrong} of ${C.orders} (${pc(C.wrong, C.orders)}): ${show(C.wrongByKind)}. Strikes ${C.strikes} (timed out ${C.strikesTimedOut}). Commander lost in ${C.lost} of ${C.battles} battles (${show(C.lostWhy)}).`); }
  console.log(`     Step time: mean ${(A.total / Math.max(1, A.steps)).toFixed(3)} ms, worst ${A.worst.toFixed(1)} ms over ${A.steps} steps.`);
  for (const l of A.lines) console.log(l);
}

// ---------------------------------------------------------------- 2. transport: with and without the trucks
if (!QUICK) {
  console.log(`\n2. TRANSPORT. The same missile teams on the same seeds, with their trucks and on foot (${N} battles each; no commander, so only the teams' own judgement moves them).`);
  for (const [name, withR] of [['2 Kornet teams', [{ type: 'kornet', n: 2, ride: 'uaz' }, { type: 'rpg', n: 1 }]], ['2 Kornet + 2 Konkurs teams', [{ type: 'kornet', n: 2, ride: 'uaz' }, { type: 'saclos', n: 2, ride: 'uaz' }]]]) for (const mission of ['hold', 'advance']) {
    const row = {};
    for (const mode of ['truck', 'foot']) {
      const force = withR.map(f => mode === 'truck' ? f : { type: f.type, n: f.n }), A = { shots: 0, moved: [], rides: 0, rideM: [], lost: 0, m1: 0, teams: 0, firstShot: [] };
      for (let i = 0; i < N; i++) {
        const o = optFor(i, 'trained', force, false); o.mission = mission; let f; try { f = fight(o, 600, false); } catch (e) { bad('transport', mode, i, e.message); continue; }
        const b = f.b; if (f.result === 'lost') A.m1++;
        for (const u of b.units) { if (u.spec.key !== 'kornet' && u.spec.key !== 'saclos') continue; A.teams++; A.shots += u.fired; if (!u.alive) A.lost++; }
        for (const r of b.vehReport().stat ? b.vehReport().stat.rides : []) { A.rides++; A.rideM.push(r.m); }
        for (const e of b.events || []) if (e.type === 'move') A.moved.push(1);
      }
      row[mode] = A;
    }
    const t = row.truck, f = row.foot;
    console.log(`   ${name}, ${mission}: missiles launched ${t.shots} with trucks against ${f.shots} on foot (${(t.shots / t.teams).toFixed(2)} against ${(f.shots / f.teams).toFixed(2)} a team); teams lost ${t.lost} against ${f.lost} of ${t.teams}; M1 lost ${t.m1} against ${f.m1} of ${N}; rides completed ${t.rides}${t.rides ? `, mean ${Math.round(avg(t.rideM))} m, longest ${Math.max(...t.rideM)} m` : ''}; moves started ${t.moved.length} against ${f.moved.length}.`);
  }

  // ---------------------------------------------------------------- 3. the commander: with and without
  console.log(`\n3. THE COMMANDER. The same force on the same seeds with and without him (${N} battles each, trained and expert crews).`);
  for (const key of ['sprawling_defence', 'mech_ambush']) for (const skill of ['trained', 'expert']) {
    const row = {};
    for (const mode of ['with', 'without']) { const A = { m1: 0, fired: 0, hits: 0, kills: 0, t: [], res: {} };
      for (let i = 0; i < N; i++) { let f; try { f = fight(optFor(i, skill, FORCES[key].force, mode === 'with' ? 'auto' : false), 600, false); } catch (e) { bad('commander', mode, i, e.message); continue; } const s = f.b.summary(); if (f.result === 'lost') A.m1++; tally(A.res, f.result); A.fired += s.fired; A.hits += s.hits; A.kills += s.killedByTank + s.killedByMg; A.t.push(f.b.t); }
      row[mode] = A; }
    const w = row.with, o = row.without;
    console.log(`   ${FORCES[key].name}, ${skill}: M1 lost ${w.m1} with him against ${o.m1} without (of ${N}); launched ${w.fired} against ${o.fired}; hits on the M1 ${w.hits} against ${o.hits}; teams knocked out ${w.kills} against ${o.kills}; battle length ${Math.round(avg(w.t))} s against ${Math.round(avg(o.t))} s; results ${show(w.res)} | ${show(o.res)}.`);
  }

  // ---------------------------------------------------------------- 4. the M1's defences on these forces
  console.log(`\n4. THE M1'S DEFENCES on the new forces, same seeds (${N} battles per cell; a margin of about +-${Math.round(100 * 1.96 * Math.sqrt(0.25 / N))} points: small gaps mean nothing). Share of battles in which the M1 was lost:`);
  for (const key of Object.keys(FORCES)) for (const skill of LEVELS) {
    const cells = [];
    for (const su of ['both', 'trophy', 'hkoi', 'neither']) { let lost = 0, ke = 0; for (let i = 0; i < N; i++) { let f; try { f = fight(optFor(i, skill, FORCES[key].force, FORCES[key].commander, su), 600, false); } catch (e) { bad('defences', su, i, e.message); continue; } if (f.result === 'lost') { lost++; const v = f.b.volleys[f.b.volleys.length - 1]; if (v && v.rec.threats.some(th => th.key === 'ke' && th.viz.end && th.viz.end.killing)) ke++; } }
      cells.push(`${su === 'both' ? 'HKOI + Trophy' : su === 'trophy' ? 'Trophy only' : su === 'hkoi' ? 'HKOI only' : 'neither'} ${pc(lost, N)}${ke ? ` (${ke} to a tank round)` : ''}`); }
    console.log(`   ${FORCES[key].name.padEnd(24)} ${skill.padEnd(8)} ${cells.join(' | ')}`);
  }
}

// ---------------------------------------------------------------- 5. the same battle twice
{
  const dig = b => JSON.stringify([b.summary(), b.log.length, (b.events || []).length, b.vehicles(), b.vehReport(), b.cdrReport()]);
  let same = 0, n = 0;
  for (const key of Object.keys(FORCES)) for (let i = 0; i < 3; i++) { n++; const a = fight(optFor(i, 'expert', FORCES[key].force, FORCES[key].commander), 400, false).b, b = fight(optFor(i, 'expert', FORCES[key].force, FORCES[key].commander), 400, false).b; if (dig(a) === dig(b)) same++; else bad('not deterministic', key, i); }
  console.log(`\n5. Same settings, same battle: ${same} of ${n}. Step time over part 1: mean ${(stepAll.total / Math.max(1, stepAll.n)).toFixed(3)} ms, worst ${stepAll.worst.toFixed(1)} ms (${stepAll.n} steps). No NaN found in vehicles(), commander(), commanderAt(), the reports or the summary.`);
  // a force with no vehicle and no commander must leave the modules idle
  const plain = fight(optFor(1, 'trained', [{ type: 'kornet', n: 2 }, { type: 'saclos', n: 1 }], false), 200, false).b;
  if (plain.vehicles().length || plain.commander() !== null || plain.vehReport().on) bad('modules active in a battle that did not ask for them');
}
void EnemyCdr;
console.log(fail ? 'FAILED' : 'VEHICLE TESTS PASS'); process.exit(fail ? 1 : 0);
