// Portraits of the four crewmen: the supplied crew models, head and shoulders, with expressions made by moving the bones of
// their faces. What each face shows comes from the battle's own crew model (stress, state, wounds, freezing) and from what
// has just happened (a blast close by, a hit, his own voice on the intercom).
//
// THERE IS NO COMMANDER MODEL: the commander is the gunner's model again, made unmistakable: a lighter skin tone, a plain olive
// helmet with the goggles taken off it, and his name (the numbers are in LOOK below, for the seated figure to match).
// The loader's dark glasses are taken off so that his eyes and brows can be read.
//
// How a face is moved. All three models share one skeleton. Every face bone hangs off "Bip01 Head", so an expression is a
// set of small shifts of those bones measured in the head's own directions (up, forward, outward from the nose, in
// millimetres), plus turns of the jaw, the eyes and the head. The directions and the signs of the turns are measured from
// the model when it is loaded (where the eyes sit, which way the chin goes when the jaw turns), not assumed.
// Every channel is eased by a critically damped spring stepped exactly, so the motion is the same at any frame rate; the
// targets are functions of battle time, so a replay shows the same faces.
//
// Cost: one small extra drawing surface (4 x 160 x 200), four figures of about 12,000 points each, drawn 12 times a second
// while a battle runs and the faces are on screen, 5 times a second when all four men are steady, and not at all when the
// crew panel is folded, the battle is paused or nothing shows them. The time of the last drawing is kept in `ms`.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel } from '../render/units.js';
import { hitList } from '../render/interior_fx.js';
import { CTX, insideState, fateOf } from '../render/interior_events.js';
import { woundsOf, lookOf, describe } from '../render/interior_gore.js';
import { moodOf } from '../render/interior_crewfig.js';

export const ROLES = ['cdr', 'gnr', 'ldr', 'drv'];
const MODEL = { cdr: 'crew_gunner', gnr: 'crew_gunner', ldr: 'crew_loader', drv: 'crew_driver' };
const W = 160, H = 200;
const CROP = { x: 0.15, y: 0.07, w: 0.7, h: 0.7 };   // the part of each drawn picture shown in the crew panel (head, helmet rim to collar)
import { SHIFT, TURN, LOOK, STATES, Springs, hash, sat, faceRig, faceTarget, facePose } from './face_table.js';
export { SHIFT, TURN, LOOK };
const key = n => String(n).replace(/[^A-Za-z0-9]/g, '');
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// A copy of a mesh without some of its separate pieces (pieces = parts that share no corner with the rest, such as a pair of
// glasses modelled on to a head). drop(piece) is asked for each piece, given its box { min, max } in the mesh's own space
// (metres; x across, y negative towards the face, z up).
function without(geo, drop) {
  const P = geo.attributes.position, I = geo.index; if (!I) return geo;
  const key = new Map(), id = new Int32Array(P.count), par = [];
  for (let v = 0; v < P.count; v++) { const k = P.getX(v).toFixed(4) + ',' + P.getY(v).toFixed(4) + ',' + P.getZ(v).toFixed(4); let n = key.get(k); if (n == null) { n = par.length; key.set(k, n); par.push(n); } id[v] = n; }
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < I.count; t += 3) { const a = find(id[I.getX(t)]), b = find(id[I.getX(t + 1)]), c = find(id[I.getX(t + 2)]); par[b] = a; par[c] = a; }
  const box = new Map();
  for (let v = 0; v < P.count; v++) { const r = find(id[v]); let b = box.get(r); if (!b) { b = { n: 0, min: new THREE.Vector3(9, 9, 9), max: new THREE.Vector3(-9, -9, -9) }; box.set(r, b); } b.n++; _v.fromBufferAttribute(P, v); b.min.min(_v); b.max.max(_v); }
  let biggest = null; for (const b of box.values()) if (!biggest || b.n > biggest.n) biggest = b;
  const gone = new Set(); for (const [r, b] of box) if (b !== biggest && drop(b)) gone.add(r);
  if (!gone.size) return geo;
  const keep = []; for (let t = 0; t < I.count; t += 3) if (!gone.has(find(id[I.getX(t)]))) keep.push(I.getX(t), I.getX(t + 1), I.getX(t + 2));
  const out = geo.clone(); out.setIndex(keep); return out;
}

// the commander's own skin tone: the head picture's colours lifted and tinted in the material itself (LOOK.cdrSkinLift, LOOK.cdrSkin)
function lighten(mat) {
  mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n  diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(${LOOK.cdrSkinLift.toFixed(3)})) * vec3(${LOOK.cdrSkin.map(v => v.toFixed(3)).join(', ')});`); };
  mat.customProgramCacheKey = () => 'cdr-skin'; mat.needsUpdate = true;
}

export class Faces {
  constructor(assetBase) {
    this.base = assetBase; this.ok = false; this.failed = false; this.asked = false; this.ms = 0; this.draws = 0;
    this.men = {}; this.out = {}; this.small = {};   // per role: the rigged figure; the picture in the panel; the small picture in the compact row
    for (const r of ROLES) { this.out[r] = null; this.small[r] = null; }
    this.acc = 0; this.tLast = null; this.hold = null;   // hold: a pose forced by a test or a picture session ({ role: { channel: value } })
    this.note = {};      // per role: when he was wounded, when he went down (battle time)
  }
  attach(role, canvas, small) { if (small) this.small[role] = canvas; else this.out[role] = canvas; }

  // ---- loading and measuring
  async load() {
    if (this.asked || !this.base) return; this.asked = true;
    try {
      const R = this.gl = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });   /* the same graphics card as the battle: 'low-power' could put this on a second, built-in chip and stall every frame */
      R.setPixelRatio(1); R.setSize(W * 4, H, false); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05; R.setScissorTest(true);
      this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x111815);
      const src = {}; for (const n of new Set(Object.values(MODEL))) src[n] = await loadModel(this.base + 'crew/' + n + '.json');
      if (Object.values(src).some(x => !x)) throw new Error('a crew model is missing');
      ROLES.forEach((r, i) => { this.men[r] = this.rig(cloneSkinned(src[MODEL[r]]), r, i); });
      // lit like the turret: a warm lamp above and in front, cool light off the displays from below and the side, little else
      const F = this.men.cdr.F, U = this.men.cdr.U, L = this.men.cdr.L;
      this.hemi = new THREE.HemisphereLight(0xc8d6cc, 0x2a322d, 1.25); this.scene.add(this.hemi);
      const lamp = this.lamp = new THREE.DirectionalLight(0xffe2bd, 3.4); lamp.position.copy(F).multiplyScalar(1).addScaledVector(U, 1.3).addScaledVector(L, 0.7); this.scene.add(lamp);
      const glow = new THREE.DirectionalLight(0xc2dcd0, 0.7); glow.position.copy(F).multiplyScalar(0.6).addScaledVector(U, -0.8).addScaledVector(L, -1); this.scene.add(glow);
      const red = this.red = new THREE.DirectionalLight(0xff2a1c, 0); red.position.copy(F).multiplyScalar(0.8).addScaledVector(U, 0.9).addScaledVector(L, -0.9); this.scene.add(red);   /* the emergency lamp, lit for a while after a hit */
      this.ok = true;
    } catch (e) { this.failed = true; console.warn('crew portraits not available:', e && e.message); }
  }
  // set one figure up: arms down, own materials for the head, the face bones found and measured, a camera on his face
  rig(fig, role, i) {
    const g = new THREE.Group(); g.add(fig); g.position.set(i * 4, 0, 0); this.scene.add(g); g.updateMatrixWorld(true);
    const B = {}; fig.traverse(o => { if (o.isBone) B[key(o.name)] = o; });
    const head = B.Bip01Head, le = B.Bip01LEye, re = B.Bip01REye, pelvis = B.Bip01Pelvis || B.Bip01;
    if (!head || !le || !re) throw new Error('not the crew skeleton');
    const wp = b => b.getWorldPosition(new THREE.Vector3());
    const L = wp(le).sub(wp(re)).normalize(), U = wp(head).sub(wp(pelvis)).normalize(); U.addScaledVector(L, -U.dot(L)).normalize();
    const eyes = wp(le).add(wp(re)).multiplyScalar(0.5), F = new THREE.Vector3().crossVectors(L, U).normalize(); if (F.dot(_v.copy(eyes).sub(wp(head))) < 0) F.negate();
    const unit = wp(le).distanceTo(wp(re)) / 0.064;   /* the eyes are 64 mm apart in the file: anything else is the model's scale */
    // arms out of the picture: each upper arm is turned to hang down and a little forward
    for (const [s, k] of [['L', 1], ['R', -1]]) { const a = B['Bip01' + s + 'UpperArm'], c = B['Bip01' + s + 'Forearm']; if (!a || !c) continue;
      const cur = wp(c).sub(wp(a)).normalize(), want = new THREE.Vector3().copy(U).multiplyScalar(-1).addScaledVector(L, 0.22 * k).addScaledVector(F, 0.12).normalize();
      _q.setFromUnitVectors(cur, want); a.getWorldQuaternion(_q2); const pq = a.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); a.quaternion.copy(pq.multiply(_q.multiply(_q2))); a.updateMatrixWorld(true); }
    g.updateMatrixWorld(true);
    // a bone's rest place and turn, and the head's three directions written in its parent's own frame
    const take = b => { if (!b) return null; const pinv = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); _m.copy(b.parent.matrixWorld).decompose(_p, _q, _s);
      return { b, p: b.position.clone(), q: b.quaternion.clone(), u: U.clone().applyQuaternion(pinv), f: F.clone().applyQuaternion(pinv), l: L.clone().applyQuaternion(pinv), k: unit / (_s.x || 1) / 1000 }; };
    const shifts = {};   // channel -> [{ bone record, up, fwd, out (with the side's sign) }]
    const rec = {}; const get = n => rec[n] || (rec[n] = take(B['Bip01' + n]));
    for (const [ch, list] of Object.entries(SHIFT)) { shifts[ch] = []; for (const [name, up, fwd, out] of list) {
      if (name[0] === 'M' && get(name)) shifts[ch].push({ r: get(name), up, fwd, out: 0 });
      else for (const [s, sg] of [['R', -1], ['L', 1]]) if (get(s + name)) shifts[ch].push({ r: get(s + name), up, fwd, out: out * sg }); } }
    const neck = take(B.Bip01Neck), jaw = take(B.Bip01MJaw), hd = take(head), eyeL = take(le), eyeR = take(re), clav = [take(B.Bip01LClavicle), take(B.Bip01RClavicle)].filter(Boolean);
    // which way round the turns go: the chin must drop when the jaw opens, the face must drop when the head ducks
    const chin = B.Bip01MBottomLip ? wp(B.Bip01MBottomLip).sub(wp(B.Bip01MJaw)) : F.clone(), jawSign = _v.crossVectors(L, chin).dot(U) < 0 ? 1 : -1;
    const face = eyes.clone().sub(wp(head)), nodSign = _v.crossVectors(L, face.lengthSq() > 1e-8 ? face : F).dot(U) < 0 ? 1 : -1, yawSign = _v.crossVectors(U, F).dot(L) > 0 ? 1 : -1;
    // his own skin, so it can change colour and shine; the commander's lighter skin and olive helmet; goggles and dark glasses off
    const skin = [], base = [1, 1, 1];
    fig.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = false;
      const names = [].concat(o.material).map(m => m.name || '').join(' ');
      if (/head/i.test(names) && role === 'cdr') o.geometry = without(o.geometry, c => c.min.z > 1.73);                                  /* the goggles on the helmet's front and their strap */
      if (/head/i.test(names) && role === 'ldr') o.geometry = without(o.geometry, c => c.min.z > 1.655 && c.max.z < 1.705 && c.min.y < -0.12);   /* the dark glasses: frame and both lenses (the eyeballs sit behind -0.112) */
      const mats = [].concat(o.material).map(m => { const c = m.clone(); c.metalness = 0; c.roughness = Math.max(0.7, c.roughness || 0); if (/head/i.test(m.name)) { skin.push(c); if (role === 'cdr') lighten(c); } else if (role === 'cdr' && /helmet/i.test(m.name)) c.color.setRGB(...LOOK.cdrHelmet); return c; });
      o.material = Array.isArray(o.material) ? mats : mats[0]; });
    const cam = new THREE.PerspectiveCamera(27, W / H, 0.1, 6); cam.position.copy(eyes).addScaledVector(F, 0.7).addScaledVector(U, 0.0).addScaledVector(L, role === 'gnr' ? -0.07 : role === 'drv' ? 0.06 : 0.02); cam.up.copy(U); cam.lookAt(_v.copy(eyes).addScaledVector(U, -0.045)); cam.updateMatrixWorld(true);
    return { role, i, seed: i * 1.7 + 1, g, head, rec, shifts, neck, base, stress: 0, jaw, hd, eyeL, eyeR, clav, jawSign, nodSign, yawSign, skin, cam, U, F, L, sp: new Springs(), speak: 0 };
  }

  // ---- one frame. s: { on (any face is on screen), playing, battle, now, crew (battle.crewState()), speaking ('CDR' ...), graphic }
  update(dt, s) {
    CTX.speaking = s.speaking || null;   /* who is on the intercom: the men in their seats move their lips to it too */
    if (!s.on || !s.crew) { this.tLast = null; return; }
    if (!this.asked) this.load();
    if (!this.ok) return;
    const t = s.now, jumped = this.tLast == null || t < this.tLast - 0.01 || t > this.tLast + 3; this.acc += dt;
    const quiet = ROLES.every(r => s.crew.who[r].state === 'steady' && s.crew.who[r].status === 'ok') && !s.speaking;
    const vis = ROLES.filter(r => (this.out[r] && this.out[r].isConnected && this.out[r].offsetParent) || (this.small[r] && this.small[r].isConnected && this.small[r].offsetParent));
    if (!vis.length && !this.hold) return;   /* panel folded or hidden: nothing to draw */
    /* Cost control (measured: copying the portraits out of their own drawing surface cost about 90 ms a frame in this release, the
       whole battlefield about 17): ONE face is redrawn per refresh, in turn, at most 6 refreshes a second in a fight and 2 when all
       are steady; if a refresh still costs more than 6 ms on this machine the pace halves again (down to one face a second). */
    const cheap = this.draws > 8 && this.ms < 1.5;   /* a machine where a refresh costs almost nothing gets all four faces, smoothly */
    const gap = cheap ? (quiet ? 0.2 : 0.083) : (quiet ? 0.5 : 0.16) * (this.ms > 6 ? Math.min(6, this.ms / 6) : 1);
    if (!jumped && !this.hold && (!s.playing || this.acc < gap)) return;
    const step = jumped ? 0 : Math.max(0, Math.min(1, t - this.tLast)); this.acc = 0; this.tLast = t;
    const ev = this.ev = this.recent(s.battle, t), t0 = performance.now();
    // the same wounds, burns and moods as the men in their seats show (interior_gore.js, interior_events.js), from the same hit list
    let W = null, S = null; try { const hits = hitList(s.battle); S = insideState(hits, t, s.crew, fateOf(s.battle)); W = woundsOf(hits, s.battle); } catch (e) { W = null; S = null; } const X = this.X || (this.X = { look: null, mood: null, moodAge: 0, quality: null, lookAt: null, lookDown: 0 }); this.W = W;
    for (const r of ROLES) { const M = this.men[r], m = s.crew.who[r];
      const N = this.note[r] || (this.note[r] = {}), L = W ? lookOf(r, W, m, t, S) : null; M.look = L ? { ...L } : null; X.look = L; X.quality = s.crew.quality; X.mood = S ? moodOf(r, m, S, s.crew.quality, false) : null; X.moodAge = moodOf.age || 0; if (r === 'cdr' && W && this.men.gnr.look && this.men.gnr.look.down && t - this.men.gnr.look.downAt < 12 && m.status === 'ok' && m.state !== 'panicked') X.mood = 'shout';
      let T = faceTarget(M, m, t, ev, s.speaking && s.speaking.toLowerCase() === r, N, X); if (this.hold && this.hold[r]) T = Object.assign(T, this.hold[r]);
      if (jumped) M.sp.snap(T); else M.sp.step(T, step); facePose(M, M.sp.x); }
    this.turn = ((this.turn || 0) + 1) % ROLES.length;
    this.draw(s, jumped || this.hold || cheap ? null : vis.length ? [vis[this.turn % vis.length]] : []);
    this.ms += (performance.now() - t0 - this.ms) * 0.2; this.draws++;
  }
  // seconds since the last hit on the vehicle and since the last blast close to it (Trophy firing, a warhead bursting on the ground near by)
  recent(B, t) {
    const E = B.events || [], out = { hit: 99, near: 99 };
    for (let i = E.length - 1, n = 0; i >= 0 && n < 80; i--, n++) { const e = E[i]; if (e.type !== 'end' || e.t > t || t - e.t > 15) continue;
      if (e.how === 'hit') out.hit = Math.min(out.hit, t - e.t); else if (t - e.t > 3) continue; else if (e.how === 'aps_kill' || e.how === 'ground' || e.how === 'miss') out.near = Math.min(out.near, t - e.t); }
    return out;
  }
  draw(s, only) {   /* only: the roles to redraw this time (null: all four) */
    const R = this.gl, cv = R.domElement, doing = r => !only || only.includes(r);
    const alarm = sat(1 - (this.ev ? this.ev.hit : 99) / 14);   /* the red emergency lamp: on at a hit, fading over 14 s */
    ROLES.forEach((r, i) => { const m = s.crew.who[r], st = m.status === 'down' ? 0 : sat(((m.stress || 0) - 0.3) / 0.6);   /* the light on a face turns cooler and harder as his stress rises */
      this.lamp.color.setRGB(1, 0.89 + 0.06 * st, 0.74 + 0.26 * st); this.lamp.intensity = 3.4 + 1.6 * st; this.hemi.intensity = 1.25 - 0.6 * st - 0.35 * alarm; this.red.intensity = 2.6 * alarm;
      if (doing(r)) { R.setViewport(i * W, 0, W, H); R.setScissor(i * W, 0, W, H); R.render(this.scene, this.men[r].cam); } });
    ROLES.forEach((r, i) => {
      if (!doing(r)) return; const m = s.crew.who[r], M = this.men[r], big = this.out[r], sm = this.small[r];
      if (big && big.isConnected) { const x = big._x || (big._x = big.getContext('2d')); x.drawImage(cv, i * W + W * CROP.x, H * CROP.y, W * CROP.w, H * CROP.h, 0, 0, big.width, big.height); this.marks(x, big, M, m, s); }   /* the panel shows the face itself, close: the part of the picture that carries the expression */
      if (sm && sm.isConnected) { const x = sm._x || (sm._x = sm.getContext('2d')); x.drawImage(cv, i * W + W * 0.2, H * 0.1, W * 0.6, H * 0.62, 0, 0, sm.width, sm.height); if (m.status === 'down') { x.fillStyle = 'rgba(4,6,5,.55)'; x.fillRect(0, 0, sm.width, sm.height); } }
    });
  }
  // drawn over the picture: blood for a wounded or dead man (only with graphic effects on), and the dimming of a man out of action
  marks(x, cv, M, m, s) {
    const hurt = m.status === 'wounded', down = m.status === 'down', N = this.note[M.role] || {}, L = M.look, u0 = cv.height / 200 / CROP.h;
    if (L && s.graphic && (L.soot > 0.03 || L.burn > 0.03)) {   /* soot from a fire inside; burns: reddened, then blistered and blackened skin on the side the flash came from */
      x.save(); const sd = M.seed, side = L.worst && L.worst.side[0] > 0 ? -1 : 1;   /* the picture is a mirror: his right is on our left */
      if (L.soot > 0.03) { x.globalCompositeOperation = 'multiply'; for (let k = 0; k < 9; k++) { const gx = cv.width * (0.2 + 0.6 * hash(k, sd + 31)), gy = cv.height * (0.2 + 0.7 * hash(k, sd + 32)), rr = (14 + 26 * hash(k, sd + 33)) * u0, g = x.createRadialGradient(gx, gy, 0, gx, gy, rr), a = 0.5 * L.soot; g.addColorStop(0, `rgba(30,27,24,${a})`); g.addColorStop(1, 'rgba(30,27,24,0)'); x.fillStyle = g; x.fillRect(gx - rr, gy - rr, rr * 2, rr * 2); } }
      if (L.burn > 0.03) { x.globalCompositeOperation = 'source-over'; const cx = cv.width * (0.5 + 0.17 * side), cy = cv.height * 0.5; for (let k = 0; k < 16; k++) { const gx = cx + (hash(k, sd + 41) - 0.5) * 60 * u0, gy = cy + (hash(k, sd + 42) - 0.5) * 100 * u0, rr = (5 + 13 * hash(k, sd + 43)) * u0 * (0.5 + L.burn), black = hash(k, sd + 44) < L.burn * 0.8, g = x.createRadialGradient(gx, gy, 0, gx, gy, rr); g.addColorStop(0, black ? `rgba(16,10,8,${0.85 * Math.min(1, L.burn * 1.6)})` : `rgba(120,22,14,${0.6 * Math.min(1, L.burn * 2)})`); g.addColorStop(1, 'rgba(60,12,8,0)'); x.fillStyle = g; x.fillRect(gx - rr, gy - rr, rr * 2, rr * 2); } }
      x.restore(); }
    const faceWound = !L || L.head > 0 || (L.n === 0 && (hurt || down));   /* a wound on the face itself only when one is there (or when nothing is known of where) */
    if ((hurt || down) && s.graphic && !faceWound) {   /* hurt elsewhere: his own blood thrown up on the collar, jaw and cheek, more of it the worse the wound */
      x.save(); const sd = M.seed, u = u0, side = L.worst && L.worst.side[0] > 0 ? -1 : 1, nn = Math.round(8 + 26 * L.bleed); x.fillStyle = 'rgba(62,5,5,.78)';
      for (let k = 0; k < nn; k++) { const rr = (0.5 + hash(k, sd + 15) * hash(k, sd + 16) * 3) * u; x.beginPath(); x.ellipse(cv.width * (0.5 + side * 0.12) + (hash(k, sd + 11) - 0.5) * 95 * u, cv.height * (0.62 + 0.36 * hash(k, sd + 13) * hash(k, sd + 14)), rr, rr * (1 + hash(k, sd + 17)), hash(k, sd + 18) * 3, 0, 6.3); x.fill(); }
      x.restore(); }
    if ((hurt || down) && s.graphic && faceWound) {
      const age = Math.max(0, s.now - (N.w != null ? N.w : N.d != null ? N.d : s.now)), grow = sat(age / 9), sd = M.seed;
      _v.setFromMatrixPosition(M.head.matrixWorld).addScaledVector(M.U, 0.098).addScaledVector(M.F, 0.085).addScaledVector(M.L, (M.i % 2 ? 0.05 : -0.05)).project(M.cam);   /* on the cheekbone, below the helmet's rim */
      const px = ((_v.x + 1) / 2 - CROP.x) / CROP.w * cv.width, py = ((1 - _v.y) / 2 - CROP.y) / CROP.h * cv.height, u = cv.height / 200 / CROP.h;
      x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
      const side = M.i % 2 ? 1 : -1;
      x.fillStyle = 'rgba(38,3,3,.9)'; x.beginPath(); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, rr = (2.2 + 2.4 * hash(k, sd + 21)) * u; x.lineTo(px + Math.cos(a) * rr * 1.5, py + Math.sin(a) * rr); } x.closePath(); x.fill();   /* the wound: a dark ragged patch */
      for (let k = 0; k < 4; k++) {   /* runs: thin, uneven, each finding its own way down the cheek, thicker where it gathers */
        const len = (16 + 42 * hash(k, sd + 2)) * grow * u; if (len < 2 * u) continue; let cx = px + (hash(k, sd) - 0.5) * 7 * u, cy = py + 1.5 * u; const n = 7;
        for (let j = 0; j < n; j++) { const nx = cx + (hash(k * 13 + j, sd + 4) - 0.5 + side * 0.12) * 3.4 * u, ny = cy + len / n; x.strokeStyle = `rgba(${52 + 22 * hash(k, sd + 8)},4,4,${0.82 - 0.3 * j / n})`; x.lineWidth = (0.7 + 1.1 * hash(k * 7 + j, sd + 6) + (j === n - 1 ? 0.9 : 0)) * u; x.beginPath(); x.moveTo(cx, cy); x.lineTo(nx, ny); x.stroke(); cx = nx; cy = ny; }
      }
      x.fillStyle = 'rgba(46,4,4,.6)'; x.beginPath(); x.ellipse(px + side * 2 * u, py + 3 * u, 7 * u, 10 * u * (0.4 + 0.6 * grow), 0.2 * side, 0, 6.3); x.globalAlpha = 0.35; x.fill(); x.globalAlpha = 1;   /* the smear around it */
      x.fillStyle = 'rgba(60,5,5,.7)'; for (let k = 0; k < 12; k++) { const rr = (0.5 + hash(k, sd + 15) * hash(k, sd + 16) * 2.6) * u; x.beginPath(); x.ellipse(px + (hash(k, sd + 11) - 0.5 + side * 0.25) * 70 * u, py + (48 + hash(k, sd + 13) * 70) * u, rr, rr * (1 + hash(k, sd + 17)), hash(k, sd + 18) * 3, 0, 6.3); x.fill(); }   /* spatter on the collar and chest */
      x.restore();
    }
    if (down) { x.fillStyle = 'rgba(4,6,5,.3)'; x.fillRect(0, 0, cv.width, cv.height); }
  }
  // forget where the springs were (a new battle, a rewind)
  reset() { this.tLast = null; this.note = {}; this.acc = 0; }
}
