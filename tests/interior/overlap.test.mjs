// Clean-interior check, no browser. Every solid piece of the interior (box, cylinder, ball: taken as its bounding box, turned as built)
// is tested against every piece of every OTHER assembly for overlap deeper than a small tolerance, with the moving parts at home and at
// the ends of their travel, and the turret turned all the way round over the hull. Then every seat's eye point (with the head as far
// as it can sway, and the commander's head from his displays up into the cupola) is tested for anything closer than the near distance.
// Contacts that are meant (a mount touching what it is bolted to) are listed in ALLOW with the reason. Prints offenders; exit code 1 if any.
const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? (s => ({ width: String(s).length * 14 })) : k === 'createLinearGradient' ? (() => ({ addColorStop() {} })) : k === 'createImageData' ? ((w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })) : (typeof k === 'string' ? (() => {}) : undefined), set: () => true });
const el = () => ({ width: 0, height: 0, getContext: () => ctx, style: {}, addEventListener() {} });
globalThis.document = { createElement: el, body: { appendChild() {} }, getElementById: () => el() };
const THREE = await import('three');
const { Interior } = await import('./render/interior.js');
const { SEATS, DIM } = await import('./render/interior_build.js');
const { ALLOW } = await import('./allow.mjs');
const TOL = 0.004, EYE_CLEAR = 0.075;   // metres: overlap deeper than 4 mm is an offence; nothing solid within 7.5 cm of an eye (the interior's near distance is 3 cm)

const I = new Interior(null, {}, null); I._build();
const root = new THREE.Group(), hullTurn = new THREE.Group(); root.add(I.tur); root.add(hullTurn); hullTurn.add(I.hul);   // the hull turned under the turret is the same as the turret turned over the hull
I.tur.rotation.set(0, 0, 0); I.hul.rotation.set(0, 0, 0);
const _v = new THREE.Vector3();
function obb(r) { const m = new THREE.Matrix4(); const base = r.g === 'tur' ? I.tur : I.hul; base.updateWorldMatrix(true, false); if (r.node) { r.node.updateWorldMatrix(true, false); m.copy(r.node.matrixWorld); } else m.copy(base.matrixWorld); m.multiply(r.m);
  const e = m.elements, ax = [new THREE.Vector3(e[0], e[1], e[2]), new THREE.Vector3(e[4], e[5], e[6]), new THREE.Vector3(e[8], e[9], e[10])], h = [r.h.x, r.h.y, r.h.z].map((v, i) => v * ax[i].length()); ax.forEach(a => a.normalize());
  return { c: r.c.clone().applyMatrix4(m), ax, h, rad: Math.hypot(h[0], h[1], h[2]) }; }
// how deep two turned boxes overlap (0 if they do not): the smallest overlap over the fifteen separating directions
function depth(A, B) { const d = _v.copy(B.c).sub(A.c); if (d.length() > A.rad + B.rad) return 0; let best = 1e9; const axes = [...A.ax, ...B.ax]; for (const a of A.ax) for (const b of B.ax) { const c = new THREE.Vector3().crossVectors(a, b); if (c.lengthSq() > 1e-8) axes.push(c.normalize()); }
  for (const L of axes) { const ra = A.h[0] * Math.abs(A.ax[0].dot(L)) + A.h[1] * Math.abs(A.ax[1].dot(L)) + A.h[2] * Math.abs(A.ax[2].dot(L)), rb = B.h[0] * Math.abs(B.ax[0].dot(L)) + B.h[1] * Math.abs(B.ax[1].dot(L)) + B.h[2] * Math.abs(B.ax[2].dot(L)), o = ra + rb - Math.abs(d.dot(L)); if (o <= 0) return 0; if (o < best) best = o; }
  return best; }
function pointDist(B, p) { const d = _v.copy(p).sub(B.c); let s = 0; for (let i = 0; i < 3; i++) { const t = Math.abs(d.dot(B.ax[i])) - B.h[i]; if (t > 0) s += t * t; } return Math.sqrt(s); }
const short = t => t.replace(/@.*/, ''), allowed = (a, b) => ALLOW.find(x => (short(a).startsWith(x[0]) && short(b).startsWith(x[1])) || (short(a).startsWith(x[1]) && short(b).startsWith(x[0])));
const found = new Map(), usedAllow = new Set();
function sweep(label, pick) {
  const list = I.audit.filter(r => r.bucket !== 'shell' || r.h.x * r.h.y * r.h.z > 0).map(r => ({ r, o: obb(r) }));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i], b = list[j]; if (a.r.tag === b.r.tag) continue; if (pick && !pick(a.r, b.r)) continue; const d = depth(a.o, b.o); if (d <= TOL) continue;
    const al = allowed(a.r.tag, b.r.tag); if (al) { usedAllow.add(al); continue; } const key = [a.r.tag, b.r.tag].sort().join('  x  '); const prev = found.get(key); if (!prev || d > prev.d) found.set(key, { d, label, at: a.o.c.clone().add(b.o.c).multiplyScalar(0.5).toArray().map(v => +v.toFixed(2)) }); } }
const P = I.part, home = {}; for (const k in P) home[k] = { p: P[k].position.clone(), q: P[k].quaternion.clone() };
const reset = () => { for (const k in P) { P[k].position.copy(home[k].p); P[k].quaternion.copy(home[k].q); } };
const noRound = (a, b) => !/part:round/.test(a.tag + b.tag);   /* the round exists only during a reload: it is tested in its own places below */
sweep('everything at rest', noRound);
reset(); P.breech.position.z += 0.3; sweep('breech at full recoil', (a, b) => /breech|block/.test(a.tag + b.tag) && noRound(a, b));
reset(); P.door.position.x += 0.96; sweep('ready-rack door open', (a, b) => /door/.test(a.tag + b.tag));
reset(); P.block.position.y = -0.2; sweep('breech block open', (a, b) => /block/.test(a.tag + b.tag) && noRound(a, b));
reset(); P.hatch.rotation.x = 1.45; sweep('loader hatch open', (a, b) => /hatch/.test(a.tag + b.tag));
if (P.cupHatch) for (const s of [1, 2]) { reset(); I.setCupolaHatch ? I.setCupolaHatch(s, true) : 0; sweep('commander hatch state ' + s, (a, b) => /cupHatch/.test(a.tag + b.tag)); }
reset(); P.block.position.y = -0.2; P.round.position.set(0, DIM.GY, 0.25); sweep('round on the loading tray, breech open', (a, b) => /part:round/.test(a.tag + b.tag));
{ const p = I.rackSlot(-1, 17); P.door.position.x += 0.96; P.round.position.set(p[0], p[1], p[2] - 0.3); sweep('round drawn from its rack tube, door open', (a, b) => /part:round/.test(a.tag + b.tag)); }
reset(); for (let yaw = 0; yaw < 360; yaw += 7.5) { hullTurn.rotation.y = yaw * Math.PI / 180; sweep('turret turned ' + yaw + ' degrees over the hull', (a, b) => a.g !== b.g); } hullTurn.rotation.y = 0;
// the hull's fittings must stay outside the circle the basket sweeps (radius 1.0 m): measured in plan from the turret axis
const ringBad = []; { const p = new THREE.Vector3(); for (const r of I.audit) { if (r.g !== 'hul' || r.tag !== 'hull-tub' || r.h.y < 0.02) continue; const o = obb(r); p.set(0, o.c.y, 0); const d = pointDist(o, p); if (d < 1.02) ringBad.push(`HULL FITTING INSIDE THE BASKET'S CIRCLE  ${r.tag} piece near ${o.c.toArray().map(v => +v.toFixed(2))}: ${(d * 100).toFixed(0)} cm from the turret axis`); } }
// nothing fixed to the turret may sit in the ring of space the hull's race ring and roof edge occupy as the turret turns
// (between 1.05 and 1.15 m from the axis, from 12 cm below the ring plane to 2 cm above it)
{ const p = new THREE.Vector3(), seen = new Set(); for (const r of I.audit) { if (r.g !== 'tur' || r.bucket === 'shell') continue; const o = obb(r); let hit = false;
    for (let i = -2; i <= 2 && !hit; i++) for (let j = -2; j <= 2 && !hit; j++) for (let k = -2; k <= 2 && !hit; k++) { p.copy(o.c).addScaledVector(o.ax[0], o.h[0] * i / 2).addScaledVector(o.ax[1], o.h[1] * j / 2).addScaledVector(o.ax[2], o.h[2] * k / 2); const rad = Math.hypot(p.x, p.z); if (rad > 1.05 && rad < 1.15 && p.y > DIM.HR - 0.12 && p.y < DIM.HR + 0.02) hit = true; }
    if (hit && !seen.has(r.tag)) { seen.add(r.tag); ringBad.push(`TURRET PART IN THE HULL RING'S SPACE  ${r.tag} near ${o.c.toArray().map(v => +v.toFixed(2))}`); } } }
for (const x of ringBad) console.log(x);
// eyes
const eyeBad = []; reset(); const all = I.audit.map(r => ({ r, o: obb(r) }));
for (const [key, S] of Object.entries(SEATS)) { const ups = S.up ? [0, 0.25, 0.5, 0.75, 1] : [0];
  for (const up of ups) for (const dx of [-0.04, 0, 0.04]) for (const dz of [-0.06, 0, 0.06]) { const p = new THREE.Vector3(S.eye[0] + dx, S.eye[1] + (S.up || 0) * up, S.eye[2] + dz); (S.g === 'tur' ? I.tur : I.hul).localToWorld(p);
    for (const a of all) { if (a.r.g !== S.g) continue; const d = pointDist(a.o, p); if (d < EYE_CLEAR) eyeBad.push(`${key} (head ${dx},${dz}, raised ${up}): ${a.r.tag} is ${(d * 100).toFixed(1)} cm from the eye`); } } }
const off = [...found.entries()].sort((a, b) => b[1].d - a[1].d);
for (const [k, v] of off) console.log(`OVERLAP ${(v.d * 100).toFixed(1)} cm  ${k}   near ${v.at}   (${v.label})`);
for (const e of [...new Set(eyeBad.map(x => x.replace(/ \(head[^)]*\)/, '').replace(/ is .*/, '')))]) console.log('EYE TOO CLOSE  ' + e + '   e.g. ' + eyeBad.find(x => x.replace(/ \(head[^)]*\)/, '').startsWith(e.split(':')[0]) && x.includes(e.split(': ')[1])));
for (const a of ALLOW) if (!usedAllow.has(a)) console.log('note: allowed contact no longer occurs: ' + a[0] + ' x ' + a[1]);
console.log(`solid pieces ${I.audit.length}, assemblies ${new Set(I.audit.map(r => r.tag)).size}, overlaps beyond ${TOL * 1000} mm: ${off.length}, eye clearances under ${EYE_CLEAR * 100} cm: ${eyeBad.length}, allowed contacts in use: ${usedAllow.size} of ${ALLOW.length}`);
const dirty = off.length || eyeBad.length || ringBad.length;
console.log(dirty ? 'INTERIOR NOT CLEAN' : 'INTERIOR CLEAN');
process.exit(dirty ? 1 : 0);
