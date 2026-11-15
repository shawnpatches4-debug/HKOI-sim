// The four crewmen in their seats: the crew MODELS of the owner's original simulator (assets/crew/crew_gunner.json, crew_loader.json,
// crew_driver.json; there is no commander model, so the commander is the gunner's model with a khaki uniform and a lighter helmet so
// that he can be told apart), animated fresh. The old page's pose-to-pose animation is not used.
//
// How they move: the method built for the enemy teams (figure.js). Each frame a man has a pose he is aiming for (which way each limb
// points, how far his trunk leans, where his head is turned); every joint CHASES that on a damped spring worked out exactly, so it
// eases off, never overshoots, arrives gently, and comes out the same at any frame rate. Then his hands are put exactly on their
// controls (two-bone reach), with a grip that itself eases on and off, so hands stay on a moving T-bar or handle and never pop.
// What he is aiming for comes from the battle: its crew model (steady, strained, shaken, panicked; wounded; down), the load cycle,
// an impact about to land or just landed. All of it runs on the battle clock.
//
// 1.0 (15 Nov 2026): the men show what happened to them and what they feel.
//   Wounds: where the damage report's hit landed on each man (interior_gore.js), painted on his uniform and skin where it is (a dark
//     wound, blood soaking outward and down from it, flash burns, charring, soot), a limb the jet touched gone at the joint.
//   Dying and being hurt: thrown along the line of the hit, a convulsion, then one of several ways of lying (over the controls,
//     against the wall, slid off the seat, head back), still for the rest of the battle; a man out of action but alive breathes,
//     and for a while tries to get up; a wounded man clutches the wound with the nearer hand and works with the other.
//   Feeling: the face panel's expressions on these faces (app/face_table.js), breathing and trembling hands by stress, flinching
//     away from where a hit struck and then looking at it, looking at a hurt crewmate, the commander's hand on the gunner's shoulder,
//     relief after the fight, praying or cursing in green crews, set faces in old hands, lips moving when his line is on the intercom.
// Every one of these is a function of the battle clock and of the battle's own records (the hit list, the crew model); none of it is
// decided here by chance alone and none of it changes what happens.
//
// The models are loaded only through loadModel in units.js. Until they arrive, or if they are missing, the seats are empty.
// A fault in here must never stop the interior: update() catches its own errors.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { makeRig, solve, fk, reachQ, chaseJoint, chase, stiff, Y_POSING, NJ, J, Wp } from './figure.js';
import { RIG as RIGN } from './figure.js';
import { CTX, felt, detail } from './interior_events.js';
import { woundsOf, lookOf, MAN, PART_BONE } from './interior_gore.js';
import { faceRig, faceTarget, facePose, Springs, LOOK as FLOOK } from '../app/face_table.js';

const hsh = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// this skeleton's joint names in the plain names figure.js works with (other names pass through, so the enemy figures are not disturbed)
const NAME = { Pelvis: 'Hips', Spine: 'Spine', Spine1: 'Spine1', Spine2: 'Spine2', Neck: 'Neck', Head: 'Head' };
for (const [s, S] of [['L', 'Left'], ['R', 'Right']]) Object.assign(NAME, { [s + '_Clavicle']: S + 'Shoulder', [s + '_UpperArm']: S + 'Arm', [s + '_Forearm']: S + 'ForeArm', [s + '_Hand']: S + 'Hand', [s + '_Thigh']: S + 'UpLeg', [s + '_Calf']: S + 'Leg', [s + '_Foot']: S + 'Foot', [s + '_Toe0']: S + 'ToeBase' });
export const crewBoneName = n => { if (/^Bip01/.test(n)) { const k = n.replace(/^Bip01[_ ]?/, '').replace(/ /g, '_'); return NAME[k] || n; } return n.replace(/^mixamorig:?/, ''); };
const FILE = { gnr: 'gunner', cdr: 'gunner', ldr: 'loader', drv: 'driver' }, HULL = { drv: true };
// which way each man faces in the interior's frame (degrees, 0 = along the gun), and his resting pose: limb directions in his own
// frame [his left, up, forward], and how far his trunk leans forward (tip, radians; negative = lying back)
const SEATED = { tip: 0.06, thigh: [0.13, -0.08, 1], shin: [0, -1, 0.12], foot: [0, -0.25, 1], upper: [0.28, -0.85, 0.4], fore: [-0.08, -0.25, 1] };
const BASE = {
  gnr: { face: 0, ...SEATED, tip: 0.2, upper: [0.22, -0.7, 0.68], fore: [-0.12, 0.05, 1] },
  cdr: { face: 0, ...SEATED, thigh: [0.14, -0.3, 1], shin: [0, -1, 0.05] },
  ldr: { face: 50, ...SEATED },
  drv: { face: 0, ...SEATED, tip: -0.9, thigh: [0.14, 0.75, 0.75], shin: [0, -0.82, 0.58], foot: [0, 0.4, 1], upper: [0.2, -0.3, 0.95], fore: [-0.1, 0.35, 1] },
};
// where each man looks, and for how long, when nothing else has his attention: [seconds, look (radians, + = to his left), nod (+ = down), what]
const GAZE = {
  gnr: [[5, 0, 0.08, 'sight'], [1.6, -0.55, 0.42, 'computer'], [4, 0, 0.1, 'sight'], [1.2, 0.1, 0.5, 'panel']],
  cdr: [[3.2, 0.05, 0.42, 'display'], [2.6, -0.95, 0.32, 'HKOI panel'], [2.2, 0.5, -0.12, 'ports'], [2.2, -0.45, -0.12, 'ports'], [1.8, 0, -0.1, 'ports']],
  ldr: [[4, 0.1, 0.2, 'breech'], [2.5, -0.6, 0.05, 'radios'], [2.2, 0.65, -0.25, 'periscope']],
  drv: [[6, 0, -0.1, 'vision blocks'], [1.6, -0.5, 0.2, 'display'], [4, 0.12, -0.1, 'vision blocks'], [1.3, 0.5, 0.22, 'master panel']],
};
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3(), _e = new THREE.Euler();

function bloodTexture() {   /* blotches for a blood-soaked uniform: repeats over the figure */
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); let s = 17; const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; x.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) { const r = 3 + R() * (i < 8 ? 26 : 9); x.fillStyle = `rgba(${96 + R() * 40 | 0},${R() * 10 | 0},${R() * 8 | 0},${0.6 + R() * 0.4})`; for (const [ox, oy] of [[0, 0], [128, 0], [0, 128], [-128, 0], [0, -128]]) { x.beginPath(); x.ellipse((i * 37 % 128) + ox, (i * 61 % 128) + oy, r, r * 0.7, i, 0, 7); x.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// The crew material (interior_parts.js cabMaterial, skinned) with wounds added: up to 8 places on the man, given in the mesh's own
// rest-pose coordinates, each a wound (dark core, blood soaking outward and running down), a flash burn or a stump; plus charring
// and soot over all of him. Done by adding to the material's own program text; if that text ever changes so that the places to
// add are not found, the material is left as it is (wounds then show only as the old overall stain).
const NW = 8;
function woundable(mat) {
  const vs = mat.vertexShader, fs = mat.fragmentShader, a1 = 'attribute float aArm;', a2 = 'vO = transformed;', a3 = 'alb = mix(alb, bt.rgb * 0.42, bt.a * uBloodAmt); }';
  if (!vs || !fs || !vs.includes(a1) || !vs.includes(a2) || !fs.includes(a3)) return false;
  mat.vertexShader = vs.replace(a1, a1 + ' varying vec3 vBind;').replace(a2, a2 + ' vBind = position;');
  mat.fragmentShader = `uniform vec4 uW[${NW}]; uniform vec4 uWk[${NW}]; uniform vec3 uWUp; uniform float uBurn; uniform float uSoot; varying vec3 vBind;\n` + fs.replace(a3, a3 + `
      { float n1 = texture2D(uBloodT, vUv * 4.0).a; float n2 = texture2D(uBloodT, vUv * 9.0 + 0.37).a;
        for (int i = 0; i < ${NW}; i++) { float R = uW[i].w; if (R <= 0.0) continue; vec3 dv = vBind - uW[i].xyz; float hgt = dot(dv, uWUp); if (hgt < 0.0) dv -= uWUp * hgt * 0.5; float d = length(dv); float k = uWk[i].x;
          if (k > 1.5 && k < 2.5) { float b = smoothstep(R, R * 0.3, d + (n1 - 0.5) * R * 0.8) * uWk[i].z; alb = mix(alb, mix(vec3(0.34, 0.07, 0.05), vec3(0.03, 0.022, 0.018), n2), b); }
          else { float soak = smoothstep(R, R * 0.45, d + (n1 - 0.5) * R * 0.5); alb = mix(alb, vec3(0.21, 0.012, 0.012) * (0.55 + 0.45 * n2), soak * 0.95);
            float c = uWk[i].y; float core = smoothstep(c, c * 0.5, d + (n2 - 0.5) * c * 0.6); alb = mix(alb, k > 0.5 ? vec3(0.03, 0.008, 0.008) : vec3(0.075, 0.004, 0.004), core); } }
        alb = mix(alb, vec3(0.022, 0.018, 0.015) + vec3(0.5, 0.09, 0.0) * step(0.93, n2) * step(0.5, uBurn), uBurn * smoothstep(0.1, 0.75, n1 * 0.6 + uBurn * 0.75));
        alb *= 1.0 - uSoot * (0.3 + 0.45 * n2); }`);
  const U = mat.uniforms; U.uW = { value: Array.from({ length: NW }, () => new THREE.Vector4(0, 0, 0, 0)) }; U.uWk = { value: Array.from({ length: NW }, () => new THREE.Vector4(0, 0, 0, 0)) }; U.uWUp = { value: new THREE.Vector3(0, 0, 1) }; U.uBurn = { value: 0 }; U.uSoot = { value: 0 };
  mat.needsUpdate = true; return true;
}
// what each kind of wound looks like on the body: [core radius, how far the blood soaks at the end, seconds to soak that far]
const WOUND = { frag: [0.022, 0.1, 50], trauma: [0.085, 0.3, 14], sever: [0.06, 0.2, 10], burn: [0, 0.2, 1] };
const PART_UP = { head: 0.07, chest: 0.06, belly: 0.03 }, PART_R = { head: 0.085, chest: 0.13, belly: 0.12, armL: 0.05, armR: 0.05, foreL: 0.04, foreR: 0.04, thighL: 0.075, thighR: 0.075, shinL: 0.05, shinR: 0.05 };
const CHILD = { LeftArm: 'LeftForeArm', RightArm: 'RightForeArm', LeftForeArm: 'LeftHand', RightForeArm: 'RightHand', LeftUpLeg: 'LeftLeg', RightUpLeg: 'RightLeg', LeftLeg: 'LeftFoot', RightLeg: 'RightFoot' };
const SEVER_AT = { foreL: 'LeftForeArm', foreR: 'RightForeArm', shinL: 'LeftLeg', shinR: 'RightLeg' };
// ways of lying, in the man's own terms: tip (forward lean), roll (per unit of side), nod, look (per unit of side), where the head goes [to the side, up, forward] (m), limbs
const LIE = {
  over: { tip: 0.95, roll: 0.1, nod: 0.75, look: 0.35, head: [0.02, -0.2, 0.14], upper: [0.16, -0.9, 0.42], fore: [0.05, -1, 0.25] },
  side: { tip: 0.15, roll: 0.55, nod: 0.45, look: -0.55, head: [0.26, -0.24, 0], upper: [0.2, -1, 0.1], fore: [0.1, -0.9, 0.4] },
  slid: { tip: -0.35, roll: 0.3, nod: -0.2, look: -0.3, head: [0.1, -0.42, 0.1], upper: [0.55, -0.7, 0.2], fore: [0.3, -0.9, 0.3], thigh: [0.36, -0.2, 1], shin: [0.05, -0.75, 0.65] },
  back: { tip: -0.3, roll: 0.15, nod: -0.5, look: -0.25, head: [0, -0.12, -0.1], upper: [0.22, -1, 0.05], fore: [0.1, -1, 0.2] },
  lie: { tip: 0.08, roll: 0.25, nod: 0.4, look: -0.5, head: [0.05, -0.04, 0], upper: [0.25, -0.6, 0.4], fore: [0.1, -0.9, 0.3] },   /* the driver, already lying back: his head rolls to one side */
};
const RANK = { trauma: 4, sever: 3, frag: 2, burn: 1 }, byRank = (a, b) => RANK[b.kind] + b.sev - RANK[a.kind] - a.sev;
const ROLE_I = { cdr: 0, gnr: 1, ldr: 2, drv: 3 }, STRESS_OF = { steady: 0.12, strained: 0.4, shaken: 0.62, panicked: 0.92 };
const _k = new THREE.Quaternion(), _k2 = new THREE.Quaternion(), _ax = new THREE.Vector3(), _own = new THREE.Vector3(), _hov = [[0, 0, 0], [0, 0, 0]], _bp = new THREE.Vector3(), _mi = new THREE.Matrix4(), _ev = { hit: 99, near: 99 }, _fx = { look: null, mood: null, moodAge: 0, quality: null, lookAt: null, lookDown: 0 }, _mm = { state: 'steady', status: 'ok', stress: 0, busy: null };

// What a man is moved to do beyond his drill, and for how long he has been at it: relief when it is over, prayer or cursing while it
// goes on (green and trained crews), the commander shouting when he has to take the gun. All from the crew model and the hit list.
export function moodOf(role, who, S, quality, brace) {
  if (!who || !S || who.status !== 'ok') return null; const st = who.state, vet = quality === 'veteran' || quality === 'expert', q = S.quiet;
  if (S.lastAnyAge < 90 && q >= 16 && q < (vet ? 19.5 : 30) && !S.fire && !brace && (st === 'steady' || st === 'strained')) { moodOf.age = q - 16; return 'relief'; }
  if (st === 'shaken' && !vet && (S.fire || brace || q < 7)) { moodOf.age = q; if (quality === 'green') return role === 'ldr' || role === 'drv' ? 'pray' : role === 'gnr' ? 'curse' : null; return role === 'gnr' && q < 5 ? 'curse' : null; }
  return null;
}

export class CrewFigures {
  // cab: (opts) => a material of the interior (opts.skinned for these figures); groups { tur, hul }; base: the asset folder.
  // given (tests only): { gunner, loader, driver } ready-made figures to use instead of loading the files
  constructor(cab, groups, base, given) {
    this.G = groups; this.cab = cab; this.men = {}; this.ready = false; this.failed = false; this.tris = 0; this.blood = null; this.err = 0; this.lastT = null; this.measure = null;
    if (given) { this._all(given); return; }
    if (!base || typeof fetch === 'undefined' || typeof location === 'undefined') { this.failed = true; return; }
    import('./units.js').then(U => Promise.all(['gunner', 'loader', 'driver'].map(k => U.loadModel(base + 'crew/crew_' + k + '.json')))).then(([g, l, d]) => {
      if (!g || !l || !d) { this.failed = true; return; } this.blood = bloodTexture(); this._all({ gunner: cloneSkinned(g), loader: cloneSkinned(l), driver: cloneSkinned(d), gunner2: cloneSkinned(g) });
    }).catch(e => { this.failed = true; console.warn('crew figures not shown:', e && e.message); });
  }
  _all(src) { for (const r of ['gnr', 'cdr', 'ldr', 'drv']) { const m = this._make(r === 'cdr' ? (src.gunner2 || src.gunner_cdr) : src[FILE[r]], r); if (!m) { this.failed = true; return; } this.men[r] = m; } this.ready = true; }
  _make(fig, role) {
    if (!fig) return null; const mats = [], g = new THREE.Group(); let tris = 0; fig.position.set(0, 0, 0); fig.rotation.set(0, 0, 0); fig.updateMatrixWorld(true);
    const rig = makeRig(fig, crewBoneName); if (!rig) { console.warn('crew figure: the skeleton is not the one expected'); return null; }
    fig.traverse(o => { if (!o.isMesh) return; o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; const n = (o.material && o.material.name) || ''; if (/knife|pistol/.test(n)) { o.visible = false; return; }
      if (o.isSkinnedMesh && o.skeleton && !o.geometry.attributes.aArm) { const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, bn = o.skeleton.bones.map(b => (/UpperArm|Forearm|Hand|Finger/i.test(b.name) ? 1 : 0)), a = new Float32Array(si.count); for (let i = 0; i < si.count; i++) { let w = 0; for (let k = 0; k < 4; k++) w += bn[si.getComponent(i, k)] * sw.getComponent(i, k); a[i] = w; } o.geometry.setAttribute('aArm', new THREE.BufferAttribute(a, 1)); }   /* how much of each point belongs to an arm: from his own eyes a man sees only his arms */
      // tank crew, not infantry: plain coveralls instead of camouflage and a dark crew helmet; the commander in khaki with a lighter helmet
      const cdr = role === 'cdr', tint = /_body$/.test(n) ? (cdr ? [0.74, 0.66, 0.48] : [0.6, 0.63, 0.48]) : /_helmet$/.test(n) ? (cdr ? [0.5, 0.46, 0.33] : [0.28, 0.29, 0.25]) : /_equipment$/.test(n) ? [0.56, 0.53, 0.42] : [1, 1, 1];
      if (this.cab) { const mat = this.cab({ skinned: true, map: o.material ? o.material.map : null, tint, blood: this.blood }); mat.userData.tint0 = tint; mat.userData.headGear = /_head$|_helmet$/.test(n); if (/_head$|_body$/.test(n)) mat.uniforms.uSleeve.value.set(...(cdr ? [0.74 * 0.62, 0.66 * 0.62, 0.48 * 0.62] : [0.6 * 0.62, 0.63 * 0.62, 0.48 * 0.62])); if (/_body$/.test(n)) mat.uniforms.uSleeveSkin.value = 1;   /* bare forearms painted on the uniform's own picture (skin-coloured points of the arms) get the sleeve too */ mat.userData.skin = /_head$/.test(n);
        if (o.isSkinnedMesh && o.skeleton && woundable(mat)) {   /* where each joint is in this mesh's own rest-pose coordinates, and which way is up, right and forward there: wounds are placed in those */
          const sk = o.skeleton, inv = _mi.copy(o.bindMatrix).invert(), bp = rig.bones.map(b => { const k = sk.bones.indexOf(b); return k < 0 ? null : new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[k]).invert()).applyMatrix4(inv); });
          if (bp.every(Boolean)) { const up = bp[J.Head].clone().sub(bp[J.Hips]).normalize(), right = bp[J.RightArm].clone().sub(bp[J.LeftArm]).normalize(), fwd = new THREE.Vector3().crossVectors(right, up).normalize(); if (fwd.dot(bp[J.LeftToeBase].clone().sub(bp[J.LeftFoot])) < 0) fwd.negate(); mat.userData.bp = bp; mat.userData.ax = { up, right, fwd }; mat.uniforms.uWUp.value.copy(up); } }
        o.material = mat; mats.push(mat); }
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    const B = BASE[role]; g.userData.crew = true; g.add(fig); g.rotation.y = Math.PI - B.face * Math.PI / 180; g.visible = false; this.G[HULL[role] ? 'hul' : 'tur'].add(g); this.tris += tris;
    const Q = () => Array.from({ length: NJ }, () => new THREE.Quaternion()), D = Array.from({ length: NJ }, () => null);
    for (const n of ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']) D[J[n]] = [0, -1, 0];
    const sp = () => ({ x: 0, v: 0, g: 0 });
    let face = null; try { face = faceRig(fig); } catch (e) { face = null; } if (face) { face.sp = new Springs(); face.seed = ROLE_I[role] * 1.7 + 1; face.i = ROLE_I[role]; face.role = role; face.N = { w: null, d: null }; }
    return { g, fig, rig, mats, role, D, face, sh: [0, 0, 0], shOk: false, wKey: '', skinKey: -1, gone: {}, hx: [0, 0, 0], soft: [false, false], jw: null, jwOk: false, ph: 0, X: { tip: 0, roll: 0, yaw: 0, twist: 0, look: 0, nod: 0 }, goal: Q(), prev: Q(), cur: Q(), draw: Q(), vel: Array.from({ length: NJ }, () => new THREE.Vector3()), fresh: true,
      head: [sp(), sp(), sp()], grip: [sp(), sp()], hand: [[sp(), sp(), sp()], [sp(), sp(), sp()]], lvl: -1, head0: fig.getObjectByProperty('isBone', true) && rig.bones[J.Head], handErr: [0, 0], speedJump: 0 };
  }

  // (snap: head and hands go straight to their points, without the springs: the viewer's own figure, whose head is the camera)
  // men: { gnr: { on, head [x,y,z], hands [[x,y,z],[x,y,z]] (left, right; in the interior's frame), state, status, frozen, brace, flinch, bodyOnly, blood, load, rise }, ... }
  // t = battle time, dt = battle seconds since the last call (0 while paused)
  // What happened to each man and how he is bearing up is read from the interior's shared record (interior_events.js CTX: the hit
  // list's state S, the crew model's state) and from the wounds worked out from the hit list (interior_gore.js).
  update(men, t, dt) {
    if (!this.ready) return;
    try {
      dt = this.lastT == null ? 0 : t - this.lastT;   /* the battle's own clock: the same whether it is played, stepped or replayed */
      const jump = this.lastT == null || dt < -1e-6 || dt > 2; this.lastT = t; if (jump) dt = 0;   /* a new battle, a rewind or a long skip: settle at once instead of chasing across the gap */
      const S = this.S = CTX.S && CTX.S.hits ? CTX.S : null, crew = CTX.crew && CTX.crew.on ? CTX.crew : null, W = this.W = S ? woundsOf(S.hits, CTX.battle) : null; this.who = crew ? crew.who : null; this.quality = crew ? crew.quality : 'trained'; let viewer = null;
      for (const role of ['gnr', 'cdr', 'ldr', 'drv']) { const r = this.men[role]; r.M = men[role]; r.L = W ? lookOf(role, W, this.who ? this.who[role] : null, t, S) : null; r.W = W ? W[role] : null; if (men[role] && men[role].on && men[role].bodyOnly) viewer = role; }
      CTX.viewer = viewer;
      for (const role of ['gnr', 'cdr', 'ldr', 'drv']) { const r = this.men[role], M = men[role], on = !!(M && M.on); if (r.g.visible !== on) r.g.visible = on; if (!on) { r.fresh = true; r.jwOk = false; continue; } this._man(r, M, t, dt, jump); }
    } catch (e) { if (this.err++ < 3) console.warn('crew figure fault:', e && e.message); }
  }
  _man(r, M, t, dt, jump) {
    const role = r.role, B = BASE[role], D = r.D, X = r.X, sd = [1, -1], S = this.S, L = r.L, W = r.W, who = this.who ? this.who[role] : null, q = this.quality, vet = q === 'veteran' || q === 'expert';
    const down = M.status === 'down' || !!(L && L.down), dead = !!(L && L.dead), hurt = !down && (M.status === 'wounded' || !!(L && L.hurt)), me = !!(M.bodyOnly || M.snap);
    const frozen = !down && !!M.frozen, panic = !down && !frozen && M.state === 'panicked', shaken = !down && M.state === 'shaken', strained = !down && M.state === 'strained';
    const stress = down ? 0 : who ? who.stress || 0 : STRESS_OF[M.state] || 0.1, seed = role.charCodeAt(0) + role.charCodeAt(1), set = (n, v, k) => { const d = D[J[n]]; d[0] = v[0] * k; d[1] = v[1]; d[2] = v[2]; };
    const faceDeg = M.face != null ? M.face : B.face, fa = faceDeg * Math.PI / 180, cf = Math.cos(fa), sf = Math.sin(fa), eye = MAN[role].eye, turret = MAN[role].frame === 'tur';
    // ---- the blow he felt most in the last few seconds: how hard, how long ago, and where it struck as he sees it [to his left, up, ahead]
    let ff = 0, fAge = 99, dl = 0, du = 0, df = 0;
    if (S) for (let i = S.hits.length - 1; i >= 0; i--) { const h = S.hits[i], age = t - h.T; if (age < 0) continue; if (age > 6) break; const f = felt(h, eye, MAN[role].frame); if (f * Math.exp(-age) <= ff * Math.exp(-fAge)) continue; ff = f; fAge = age; dl = du = df = 0;
      const x = h.minor ? null : detail(h); if (x && x.pIn && ((x.frame === 'tur') === turret)) { const vx = x.pIn[0] - eye[0], vy = x.pIn[1] - eye[1], vz = x.pIn[2] - eye[2], l = Math.hypot(vx, vy, vz) || 1; dl = -(vx * cf + vz * sf) / l; du = vy / l; df = (vx * sf - vz * cf) / l; } }
    // ---- what he is aiming for
    for (let i = 0; i < 2; i++) { const Sd = i ? 'Right' : 'Left', k = sd[i]; set(Sd + 'UpLeg', B.thigh, k); set(Sd + 'Leg', B.shin, k); set(Sd + 'Foot', B.foot, k); set(Sd + 'Arm', B.upper, k); set(Sd + 'ForeArm', B.fore, k); }
    // attention: where his head is turned (it moves from one thing to the next on its spring, never snapping)
    let look = 0, nod = 0; { const G = GAZE[role], per = strained ? 0.6 : shaken ? 0.45 : 1; let tot = 0; for (const a of G) tot += a[0] * per; let u = ((t + seed * 1.7) % tot + tot) % tot, i = 0; while (u >= G[i][0] * per) { u -= G[i][0] * per; i++; } look = G[i][1]; nod = G[i][2]; }
    let tip = B.tip, roll = 0.018 * Math.sin(t * 0.31 + seed), twist = 0, gripL = 1, gripR = 1, hx = 0, hy = 0, hz = 0, cl0 = -1, cl1 = -1, slow = 1, pTip = 0, pRoll = 0, pArm = 0, pLeg = 0; _hov[0][0] = _hov[1][0] = NaN;
    // breathing: deeper and faster with stress (its phase is carried forward, so a change of pace never makes a jump); none for the dead
    if (dt > 0) r.ph = (r.ph || 0) + dt * (down ? 3.1 : 1.45 + 3.4 * stress); const breath = dead ? 0 : Math.sin((r.ph || 0) + seed) * (down ? 0.014 : 0.012 + 0.03 * stress); tip += breath;
    const tremble = dead || frozen ? 0 : Math.max(0, stress - 0.45) * (vet ? 0.004 : 0.011) + (hurt ? 0.004 : 0);   /* hands shaking on the controls, metres */
    if (strained) tip += 0.05; if (shaken) { tip += vet ? 0.03 : 0.11; look += (hsh(Math.floor(t * 6), seed) - 0.5) * (vet ? 0.03 : 0.1); nod += vet ? 0.02 : 0.08; }
    if (role === 'ldr' && M.load >= 0.05 && M.load < 0.86 && !(M.up > 0.01)) { look = M.load < 0.4 ? -1.0 : 0.25; nod = 0.25; twist = M.load < 0.4 ? -0.55 : 0.2; tip += 0.12; }      /* at the rack, then at the breech */
    if (role === 'cdr' && M.rise > 0.02) { nod = -0.05; look *= 0.6; }
    if (role === 'ldr' && M.up > 0.01) { const u = M.up, k1 = Math.min(1, u / 0.1), k2 = Math.max(0, Math.min(1, (u - 0.45) / 0.25)); nod = -0.7 * k1 * (1 - k2) + 0.06 * k2; look = (M.aim || 0) * k2; twist = -0.25 * k1 * (1 - k2); tip = 0.06 + 0.1 * k1 * (1 - k2) + (M.firing ? 0.03 * Math.sin(t * 70) : 0); }   /* looks up at his hatch, works it, climbs; then level behind his gun, shaken by its recoil */
    const calm = vet ? 0.55 : 1, onset = fAge < 0.09 ? fAge / 0.09 : 1, br = Math.max(M.brace || 0, 0) * calm, fl = (M.flinch || 0) * calm * onset;   /* onset: a blow takes a moment to move a man (and a step in what he aims for would be seen a frame apart at different frame rates) */ tip += 0.2 * br + 0.42 * fl; nod += 0.28 * br + 0.45 * fl; if (br > 0.5) look *= 0.3;   /* bracing for a hit about to land; thrown by one that has */
    const seated = !(M.up > 0.01) && !(M.rise > 0.1);
    // a blow: away from where it struck, then a look at the place
    if (ff > 0.1 && !down && seated) { if (fAge < 0.5) { const k = ff * (1 - fAge / 0.5) * calm * onset; roll += 0.6 * k * dl; tip += 0.3 * k - 0.25 * k * df; nod += 0.4 * k; hy -= 0.05 * k; }
      else if (fAge < 2.8 && ff > 0.15 && !panic && !frozen && (dl || df)) { look = clamp(Math.atan2(dl, df), -1.15, 1.15); nod = clamp(-du * 0.6, -0.35, 0.5); } }
    // a hurt or dead crewmate (the three men of the turret can see each other): looks at him, often at first, now and then afterwards
    let mate = null; if (turret && !down && !panic && !frozen && seated && !(fAge < 2.8 && ff > 0.15)) { let best = 1e9; for (const o of ['gnr', 'cdr', 'ldr']) { const m2 = this.men[o]; if (o === role || !m2.L || !(m2.L.hurt || m2.L.down) || m2.L.since == null || !m2.M || !m2.M.on) continue; const a2 = t - m2.L.since; if (a2 >= 0 && a2 < best) { best = a2; mate = o; } }
      if (mate && (best < 25 ? ((t + seed) % 4) < 1.7 : ((t + seed * 1.3) % 11) < 1.3)) { const e2 = MAN[mate].eye, vx = e2[0] - eye[0], vy = e2[1] - eye[1] - (this.men[mate].L.down ? 0.25 : 0.1), vz = e2[2] - eye[2], l = Math.hypot(vx, vy, vz) || 1; look = clamp(Math.atan2(-(vx * cf + vz * sf), vx * sf - vz * cf), -1.2, 1.2); nod = clamp(-vy / l * 0.9 + 0.1, -0.2, 0.7); } else mate = null; }
    // what he is moved to do beyond his drill
    const mood = seated && !hurt && !down && !panic && !frozen ? moodOf(role, who, S, q, br > 0.5) : null, mAge = moodOf.age || 0; let shout = false;
    if (mood === 'relief') { if (mAge < 5 || vet) { tip -= 0.14; nod = -0.32; look = 0; gripL = gripR = 0; hz -= 0.04; for (let i = 0; i < 2; i++) { const Sd = i ? 'Right' : 'Left'; set(Sd + 'Arm', [0.2, -0.9, 0.3], sd[i]); set(Sd + 'ForeArm', [-0.2, -0.5, 0.85], sd[i]); } }   /* head back, hands in his lap, a long breath */
      else { tip += 0.45; nod = 0.6; look = 0; gripL = gripR = 0; roll += 0.014 * Math.sin(t * 27 + seed); for (let i = 0; i < 2; i++) { const Sd = i ? 'Right' : 'Left'; set(Sd + 'Arm', [0.3, 0.1, 0.95], sd[i]); set(Sd + 'ForeArm', [-0.4, 0.9, 0.1], sd[i]); } } }   /* then it catches up with him: head in his hands, shaking */
    else if (mood === 'pray') { tip += 0.2 + 0.05 * Math.sin(t * 2.2 + seed); nod = 0.5; look = 0; cl0 = cl1 = J.Spine2; }   /* hands clasped before his chest, rocking */
    else if (mood === 'curse') { const beat = Math.abs(Math.sin(t * 5.2 + seed)); gripR = 0; set('RightArm', [0.3, -0.45, 0.75], -1); set('RightForeArm', [-0.1, -0.25 + 0.85 * beat, 0.9], -1); look += 0.2 * Math.sin(t * 4.1); tip += 0.06 * (1 - beat); }   /* a fist coming down on his knee */
    // the commander and the gunner in front of him: a hand on his shoulder when he is hurt or has lost his nerve; shaking him when he is down; then taking the gun
    if (role === 'cdr' && !down && !hurt && !panic && !frozen && seated && !me) { const G = this.men.gnr, gl = G.L, gm = G.M; let act = false, shake = false;
      if (gl && gl.down && gl.downAt != null) { const a = t - gl.downAt; act = shake = a > 1.2 && a < 7; if (a >= 0 && a < 12) shout = true; } else if (gm && gm.on && ((gl && gl.hurt) || gm.frozen || gm.state === 'panicked') && (M.state === 'steady' || M.state === 'strained')) act = ((t + 3) % 9) < 3.2;
      this.shaking = shake; if (act && G.jwOk) { const j = J.LeftArm * 3; _hov[0][0] = G.jw[j]; _hov[0][1] = G.jw[j + 1] + 0.04; _hov[0][2] = G.jw[j + 2]; gripL = 1; tip += 0.34; look = -0.1; nod = 0.42; if (shake) { _hov[0][0] += 0.03 * Math.sin(t * 13.5); _hov[0][1] += 0.02 * Math.sin(t * 13.5 + 1); } }
      if (shout && !act) { tip += 0.22; look = 0; nod = 0.12; if (M.ovr) { _hov[1][0] = M.ovr[0]; _hov[1][1] = M.ovr[1]; _hov[1][2] = M.ovr[2]; gripR = 1; } } }   /* leaning to the gunner's override, shouting */
    if (frozen) { tip = B.tip - 0.03; nod = -0.02; look = 0; roll = 0.006 * Math.sin(t * 37 + seed); twist = 0; }   /* rigid: locked on the controls, staring past everything */
    if (panic) { tip += 0.3 + 0.07 * Math.sin(t * 5.2 + seed); nod = 0.55; look = (hsh(Math.floor(t * 1.3), seed) - 0.5) * 0.5; gripL = gripR = 0; for (let i = 0; i < 2; i++) { const Sd = i ? 'Right' : 'Left'; set(Sd + 'Arm', [0.32, 0.25, 0.9], sd[i]); set(Sd + 'ForeArm', [-0.45, 0.88, 0.05], sd[i]); }   /* hands to his helmet, rocking */
      if (role === 'ldr' && seated && ((t + seed) % 6) < 2.6) { set('LeftArm', [0.2, 0.85, 0.3], 1); set('LeftForeArm', [0, 1, 0.1], 1); nod = -0.5; tip = B.tip + 0.05; look = 0.5; }   /* the loader keeps reaching for his hatch */
      if (role === 'cdr' && seated) { hy -= 0.1; tip += 0.12; }
      if (q === 'green' && role !== 'drv' && seated) for (let i = 0; i < 2; i++) set((i ? 'Right' : 'Left') + 'UpLeg', [0.13, 0.3, 1], sd[i]); }   /* a green man curls up */
    // ---- wounded, at his post: thrown, doubled over with both hands on it, then one hand clamped on the wound and the other working
    const worst = L ? L.worst : null, jw = worst ? J[PART_BONE[worst.part]] : -1, wl = worst ? -worst.side[0] : 0;   /* which side of him the wound is on (+ = his left) */
    const tjet = W ? -W.dir[0] : 0, fjet = W ? W.dir[2] : 0;   /* the line of the hit as he sits: + = toward his left, + = from behind him forward */
    if (hurt && L && L.since != null && seated) { const a = t - L.since, armW = worst && /^(arm|fore)/.test(worst.part), onLeft = worst ? /L$/.test(worst.part) : wl > 0, both = worst && /^shin/.test(worst.part);
      if (a < 0.35) { slow = 1.7; roll += -0.5 * tjet; tip += 0.1 + 0.35 * fjet; nod = 0.4; gripL = gripR = 0; for (let i = 0; i < 2; i++) { const Sd = i ? 'Right' : 'Left'; set(Sd + 'Arm', [0.8, 0.1, 0.3], sd[i]); set(Sd + 'ForeArm', [0.3, 0.6, 0.6], sd[i]); } }
      else { const first = a < 1.35, spasm = ((t + seed) % 11) < 2.2; slow = 0.75; tip += first ? 0.45 : spasm ? 0.42 : 0.18; roll += -0.14 * (wl > 0 ? 1 : -1); nod = first || spasm ? 0.55 : nod + 0.25; if (first || spasm || ((t + seed) % 7) < 2) look = clamp(wl * 0.5, -0.5, 0.5);
        if (jw >= 0) { if (first || both) { cl0 = cl1 = jw; gripL = gripR = 1; } else if (armW ? !onLeft : wl > 0) { cl0 = jw; } else cl1 = jw; }   /* the hand of the other arm for an arm wound; otherwise the nearer hand */
        else { gripL = 0; set('LeftArm', [0.18, -0.9, 0.38], 1); set('LeftForeArm', [-0.85, 0.22, 0.48], 1); } } }
    // ---- down: thrown by the hit, a convulsion, then lying as he fell. The dead are still; a man out of action breathes and, for a while, tries to move
    if (down && seated) { const a = L && L.downAt != null ? t - L.downAt : 99, sg = Math.abs(tjet) > 0.3 ? (tjet > 0 ? -1 : 1) : (hsh(seed, W ? W.idx : 9) < 0.5 ? -1 : 1);   /* sg: the side he goes over to (+ = his right): away from where it came in */
      const how = role === 'drv' ? 'lie' : W && W.hatch != null && role === 'ldr' ? 'slid' : Math.abs(tjet) > 0.5 ? 'side' : fjet > 0.4 ? 'over' : fjet < -0.4 ? (role === 'cdr' ? 'back' : 'slid') : (hsh(seed, (W ? W.idx : 3) + 5) < 0.5 ? 'over' : role === 'cdr' ? 'back' : 'slid'), P = LIE[how];
      gripL = gripR = 0; slow = 0.5;
      if (a < 0.3) { slow = 1.9; roll = 0.9 * sg; tip = B.tip + 0.2 + 0.6 * fjet; nod = -0.3; look = -0.6 * sg; hx = 0.12 * sg; for (let i = 0; i < 2; i++) { const Sd = i ? 'Right' : 'Left'; set(Sd + 'Arm', [0.9, 0.35, 0.2], sd[i]); set(Sd + 'ForeArm', [0.5, 0.8, 0.3], sd[i]); } }
      else { const env = a < 3.5 ? Math.exp(-(a - 0.3) / 0.8) : 0, jerk = env * Math.sin(a * 33), kick = env * Math.sin(a * 21 + 1);   /* the convulsion, dying away */
        tip = (role === 'drv' ? B.tip : 0) + P.tip + breath; roll = P.roll * sg; nod = P.nod; pTip = 0.1 * jerk; pRoll = 0.07 * env * Math.sin(a * 27 + 1); pArm = 0.32 * jerk; pLeg = 0.3 * kick;   /* the quick part of the convulsion is laid over the eased pose, straight off the clock (so it is the same at any frame rate) */ look = P.look * sg; hx = P.head[0] * sg; hy = P.head[1]; hz = P.head[2];
        for (let i = 0; i < 2; i++) { const Sd = i ? 'Right' : 'Left', lean = (i ? 1 : -1) === sg; set(Sd + 'Arm', [P.upper[0] * (lean ? 1.5 : 0.6), P.upper[1], P.upper[2]], sd[i]); set(Sd + 'ForeArm', P.fore, sd[i]);
          if (P.thigh) { set(Sd + 'UpLeg', P.thigh, sd[i]); set(Sd + 'Leg', P.shin, sd[i]); } }
        if (W && W.hatch != null && a < 4) { set('LeftArm', [0.2, 0.9, 0.2], 1); set('LeftForeArm', [0, 1, 0.1], 1); }   /* shot in his hatch: one hand still on the rim as he comes down */
        if (!dead && a > 4 && a < 45 && ((t + seed) % 8) < 2.4) { const e = Math.sin(Math.PI * ((t + seed) % 8) / 2.4) * (1 - a / 45); hy += 0.12 * e; nod -= 0.3 * e; tip -= 0.15 * e; const up = role === 'ldr' || role === 'cdr'; set('RightArm', up ? [0.3, -0.9 + 1.7 * e, 0.4] : [0.2, -0.6, 0.6 + 0.3 * e], -1); set('RightForeArm', up ? [0, -0.9 + 1.9 * e, 0.3] : [-0.1, 0.1 * e, 1], -1); }   /* trying to get up: toward the hatch, or pushing off the controls; weaker each time */
        if (role === 'gnr' && this.shaking) pRoll += 0.05 * Math.sin(t * 13.5); } }
    // a limb the jet took: gone at the joint; what is left of an arm is held in to his body
    if (W) for (const part in SEVER_AT) { const gone = W.sever[part] != null && W.sever[part] <= t, b = r.rig.bones[J[SEVER_AT[part]]]; if (!!r.gone[part] !== gone) { r.gone[part] = gone; b.scale.setScalar(gone ? 0.001 : 1); }
      if (gone && /^fore/.test(part)) { const Lft = part === 'foreL'; if (Lft) { gripL = 0; if (cl0 >= 0 && cl1 < 0) { cl1 = J.LeftForeArm; } cl0 = -1; } else { gripR = 0; if (cl1 >= 0 && cl0 < 0) { cl0 = J.RightForeArm; } cl1 = -1; } set(Lft ? 'LeftArm' : 'RightArm', [0.12, -0.95, 0.25], Lft ? 1 : -1); } }
    if (me) { hx = hy = hz = 0; }   /* the viewer's own body: his eye is the camera */
    X.tip = tip; X.roll = roll; X.twist = twist; X.look = clamp(look, -1.2, 1.2); X.nod = clamp(nod, -0.55, 0.9);
    solve(r.rig, D, X, r.goal);
    // ---- every joint chases it
    const first = r.fresh || jump; r.speedJump = 0; slow *= 0.55;
    for (let i = 0; i < NJ; i++) { if (first) { r.cur[i].copy(r.goal[i]); r.vel[i].set(0, 0, 0); } else if (dt > 1e-6) { const w = r.vel[i], w0x = w.x, w0y = w.y, w0z = w.z; chaseJoint(r.cur[i], w, r.prev[i], r.goal[i], Y_POSING[i] * slow, dt); const dj = Math.hypot(w.x - w0x, w.y - w0y, w.z - w0z); if (dj > r.speedJump) r.speedJump = dj; } r.prev[i].copy(r.goal[i]); r.draw[i].copy(r.cur[i]); }
    if (pTip || pRoll || pArm || pLeg) { const rq = r.rig.rootQ; _k.copy(rq).invert().multiply(_k2.setFromAxisAngle(_ax.set(1, 0, 0), pTip)).multiply(_k2.setFromAxisAngle(_ax.set(0, 0, 1), pRoll)).multiply(rq); r.draw[J.Hips].premultiply(_k);
      _k2.setFromAxisAngle(_ax.set(1, 0, 0), pArm); r.draw[J.LeftArm].multiply(_k2); r.draw[J.RightForeArm].multiply(_k2); _k2.setFromAxisAngle(_ax.set(1, 0, 0), -pArm); r.draw[J.RightArm].multiply(_k2); r.draw[J.LeftForeArm].multiply(_k2);
      _k2.setFromAxisAngle(_ax.set(1, 0, 0), pLeg); r.draw[J.LeftUpLeg].multiply(_k2); r.draw[J.RightLeg].multiply(_k2); _k2.setFromAxisAngle(_ax.set(1, 0, 0), -pLeg); r.draw[J.RightUpLeg].multiply(_k2); }
    // his head is held at the seat's eye point, moved by how he has slumped or been thrown (the point itself eases), and the grip of each hand eases on and off
    if (!me && !down) hy -= (hurt ? 0.05 : 0) + 0.05 * fl; const HG = r.hx; HG[0] = M.head[0] + hx * cf + hz * sf; HG[1] = M.head[1] + hy; HG[2] = M.head[2] + hx * sf - hz * cf;
    const yh = stiff(down && !first ? 0.22 : 0.16), yg = stiff(0.14), GG = [gripL, gripR], cl = [cl0, cl1];
    for (let k = 0; k < 3; k++) { const s = r.head[k]; if (first || M.snap) { s.x = HG[k]; s.v = 0; } else if (dt > 1e-6) chase(s, s.g, HG[k], yh, dt); s.g = HG[k]; }
    // ---- stand him so that his eyes are at the eye point, then put his hands where they belong
    const wantY = Math.PI - faceDeg * Math.PI / 180; if (r.g.rotation.y !== wantY) r.g.rotation.y = wantY;   /* the loader up in his hatch turns with his gun */
    fk(r.rig, r.draw); const ry = r.g.rotation.y, c = Math.cos(ry), s = Math.sin(ry), hp = Wp[J.Head], ex = hp.x, ey = hp.y + 0.11, ez = hp.z + 0.12;   /* his eyes: above and ahead of the head joint (which sits at the top of the neck) */
    r.g.position.set(r.head[0].x - (c * ex + s * ez), r.head[1].x - ey, r.head[2].x - (-s * ex + c * ez));
    // where his joints are in the interior's frame (his own hand goes to his wound, a crewmate's hand to his shoulder); taken before his arms are placed, which moves none of the joints a hand is sent to
    { const A = r.jw || (r.jw = new Float32Array(NJ * 3)), px = r.g.position.x, py = r.g.position.y, pz = r.g.position.z; for (let i = 0; i < NJ; i++) { const p = Wp[i]; A[i * 3] = px + c * p.x + s * p.z; A[i * 3 + 1] = py + p.y; A[i * 3 + 2] = pz - s * p.x + c * p.z; } r.jwOk = true; }
    // where his hands should be: on their controls (trembling with his stress), on his wound, on a crewmate's shoulder, clasped
    const yc = stiff(0.035), ys = stiff(0.09);
    for (let i = 0; i < 2; i++) { let tx = M.hands[i][0], ty = M.hands[i][1], tz = M.hands[i][2], soft = false;
      if (!me && cl[i] >= 0 && r.jwOk) { const j = cl[i] * 3, c = J[CHILD[RIGN[cl[i]]]], k = c != null ? 0.45 : 0; tx = r.jw[j]; ty = r.jw[j + 1]; tz = r.jw[j + 2]; if (c != null) { tx += (r.jw[c * 3] - tx) * k; ty += (r.jw[c * 3 + 1] - ty) * k; tz += (r.jw[c * 3 + 2] - tz) * k; } if (mood === 'pray') { tx += sf * 0.2 + cf * (i ? 0.02 : -0.02); ty -= 0.03; tz += -cf * 0.2 + sf * (i ? 0.02 : -0.02); } GG[i] = 1; soft = true; }
      else if (!me && _hov[i][0] === _hov[i][0]) { tx = _hov[i][0]; ty = _hov[i][1]; tz = _hov[i][2]; soft = true; }
      if (tremble > 0 && !me) { tx += tremble * Math.sin(t * 61 + seed + i * 2); ty += tremble * Math.sin(t * 53 + seed * 2 + i); tz += tremble * 0.6 * Math.sin(t * 47 + i); }
      for (let k = 0; k < 3; k++) { const s = r.hand[i][k], gk = k === 0 ? tx : k === 1 ? ty : tz; if (first || M.snap) { s.x = gk; s.v = 0; } else if (dt > 1e-6) chase(s, s.g, gk, soft || r.soft[i] ? ys : yc, dt, soft || r.soft[i] ? 0 : 1); s.g = gk; } r.soft[i] = soft; }
    for (let k = 0; k < 2; k++) { const s = r.grip[k]; if (first) { s.x = GG[k]; s.v = 0; } else if (dt > 1e-6) chase(s, s.g, GG[k], yg, dt); s.g = GG[k]; }
    r.fresh = false;
    for (let i = 0; i < 2; i++) { const g = clamp(r.grip[i].x, 0, 1); if (g < 0.01) { r.handErr[i] = 0; continue; } const Sd = i ? 'Right' : 'Left', H = r.hand[i];
      const dx = H[0].x - r.g.position.x, dy = H[1].x - r.g.position.y, dz = H[2].x - r.g.position.z; _t.set(c * dx - s * dz, dy, s * dx + c * dz);                        /* the point, in his own frame */
      _v.copy(_t).sub(Wp[J[Sd + 'Arm']]).normalize(); _t.addScaledVector(_v, -0.075);   /* the wrist stops a palm's length short, so the palm and fingers, not the wrist, are on it */
      _pole.set(sd[i] * 0.65, -0.7, -0.25); reachQ(r.rig, r.draw, Sd, _t, _pole, g * g * (3 - 2 * g));
      if (this.measure) { fk(r.rig, r.draw); const dxm = M.hands[i][0] - r.g.position.x, dym = M.hands[i][1] - r.g.position.y, dzm = M.hands[i][2] - r.g.position.z; _v.set(c * dxm - s * dzm, dym, s * dxm + c * dzm); r.handErr[i] = g > 0.99 && !r.soft[i] && tremble === 0 ? Math.abs(Wp[J[Sd + 'Hand']].distanceTo(_v) - 0.075) : 0;   /* how far the palm is from the grip (the wrist is meant to be 7.5 cm short of it) */ r.reachLeft = _v.distanceTo(Wp[J[Sd + 'Arm']]) - (r.rig.upper + r.rig.fore); } }
    for (let i = 0; i < NJ; i++) r.rig.bones[i].quaternion.copy(r.draw[i]);
    // the viewer in this seat: no head of his own before his eyes, but his own arms and hands on his controls
    const cut = M.bodyOnly ? (M.up > 0.75 ? -0.22 : 0.14) : 0; if (r.cut !== cut) { r.cut = cut; for (const m of r.mats) m.uniforms.uNearCut.value = cut < 0 && m.userData.headGear ? -0.8 : cut; }   /* head out: his helmet's ear cups and his face are left out whole, not only what is near the eye */
    // ---- his face: the crew panel's expressions, on this head (app/face_table.js)
    const F = r.face; let pal = 0, flu = 0;
    if (F) { const N = F.N; N.w = hurt && L ? L.since : null; N.d = down && L ? L.downAt : null; if (down && N.d == null) N.d = t; if (hurt && N.w == null) N.w = t;
      _mm.state = M.state || 'steady'; _mm.status = down ? 'down' : hurt ? 'wounded' : 'ok'; _mm.stress = stress; _mm.busy = dead ? 'killed' : frozen ? 'frozen' : null;
      _ev.hit = S ? S.lastAnyAge : 99; _ev.near = S && S.pulse && S.pulse.strength < 0.5 ? t - S.pulse.t : 99; _fx.look = L; _fx.mood = shout ? 'shout' : mood; _fx.moodAge = mAge; _fx.quality = q; _fx.lookAt = null;
      const speak = !down && !!CTX.speaking && String(CTX.speaking).toLowerCase() === role, T = faceTarget(F, _mm, t, _ev, speak, N, _fx);
      if (first) F.sp.snap(T); else if (dt > 1e-6) F.sp.step(T, dt); if (!me) facePose(F, F.sp.x, false); pal = clamp(F.sp.x.pallor, 0, 1); flu = clamp(F.sp.x.flush, 0, 1) * (1 - pal); }
    // ---- his wounds, painted where they are; blood, burns, soot; the colour of his skin
    if (r.mats.length) { const n = L ? L.n : 0, key = n + (L ? L.burn + L.soot + L.bleed : 0) + pal * 3 + flu * 7 + (dead ? 100 : 0) + (n ? t : 0);
      if (key !== r.skinKey) { r.skinKey = key; let list = r.wl || (r.wl = []); list.length = 0; if (W && n) { for (const w of W.list) if (w.T <= t) list.push(w); if (list.length > NW) { list.sort(byRank); list.length = NW; } }
        for (const m of r.mats) { const U = m.uniforms, t0 = m.userData.tint0, sk = m.userData.skin, bp = m.userData.bp, ax = m.userData.ax; let kr = 1, kg = 1, kb = 1; if (sk) { kr = (1 + (FLOOK.flush[0] - 1) * flu) * (1 + (FLOOK.pallor[0] - 1) * pal); kg = (1 + (FLOOK.flush[1] - 1) * flu) * (1 + (FLOOK.pallor[1] - 1) * pal); kb = (1 + (FLOOK.flush[2] - 1) * flu) * (1 + (FLOOK.pallor[2] - 1) * pal); }
          U.uTint.value.set(t0[0] * kr, t0[1] * kg, t0[2] * kb); U.uBloodAmt.value = L ? (U.uW && m.userData.bp ? Math.min(0.16, L.bleed * 0.12) : Math.min(0.55, L.bleed * 0.45 + (L.down ? 0.1 : 0))) : 0;   /* with the wounds painted where they are, the old all-over stain is only a light spotting (it made the whole man look painted red) */
          if (!bp || !U.uW) continue; U.uBurn.value = L ? clamp((L.burn - 0.3) / 0.7, 0, 1) : 0; U.uSoot.value = L ? L.soot : 0;
          for (let i = 0; i < NW; i++) { const w = list[i], A = U.uW.value[i], Kk = U.uWk.value[i]; if (!w) { A.w = 0; continue; } const sp = WOUND[w.kind], at = w.kind === 'sever' ? J[SEVER_AT[w.part]] : J[PART_BONE[w.part]], ch = w.kind === 'sever' ? null : CHILD[RIGN[at]], age = t - w.T, R = PART_R[w.part] || 0.06;
            _bp.copy(bp[at]); if (ch) _bp.lerp(bp[J[ch]], 0.5); if (PART_UP[w.part]) _bp.addScaledVector(ax.up, PART_UP[w.part]);
            if (w.kind !== 'sever') _bp.addScaledVector(ax.right, w.side[0] * R * 0.9).addScaledVector(ax.up, w.side[1] * R * 0.9).addScaledVector(ax.fwd, w.side[2] * R * 0.9);
            A.set(_bp.x, _bp.y, _bp.z, w.kind === 'burn' ? sp[1] : sp[1] * (0.3 + 0.7 * (1 - Math.exp(-age / sp[2] * 2.2))) * (0.6 + 0.4 * w.sev)); Kk.set(w.kind === 'frag' ? 0 : w.kind === 'trauma' ? 1 : w.kind === 'burn' ? 2 : 3, sp[0] * (0.7 + 0.5 * w.sev), w.sev, 0); } } } }
  }
  hide() { for (const k in this.men) this.men[k].g.visible = false; }
  triCount() { return Math.round(this.tris); }
}
