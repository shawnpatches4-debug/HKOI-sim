// The four crewmen in their seats. They are built here from simple rounded shapes (about a thousand triangles a man, six draw calls
// for all four) rather than from the supplied soldier model: that model is 84,000 triangles, is lit by the battlefield's sun and not by
// the interior's lamps, and could not be posed onto the controls. These are plain figures in coveralls and crew helmets, but they sit
// where the seats are, their hands are on the real controls, and they behave as the battle's crew model says each man is behaving.
//
// A man is a chain of joints worked out each frame: hips on the seat, head at the seat's eye point, hands and feet reaching for their
// targets (two-bone reach with the elbow or knee held to one side). Everything that moves him comes from the battle clock and the battle's
// state, so a replay shows the same thing.
import * as THREE from 'three';
import { COL, DIM, SEATS } from './interior_build.js';
import { K } from './interior_parts.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z), hsh = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const L = { upper: 0.29, fore: 0.27, thigh: 0.43, shin: 0.43, sh: 0.19, hip: 0.1 };
// where each man's hips are, which way he faces (unit x and z of "forward"), where his feet rest, and which side his elbows and knees go
export const MEN = {
  gnr: { g: 'tur', hip: [0.6, -0.55, -0.44], feet: [[0.5, DIM.FL + 0.06, -0.8], [0.7, DIM.FL + 0.06, -0.78]] },
  cdr: { g: 'tur', hip: [0.58, -0.3, 0.5], feet: [[0.5, -0.74, 0.14], [0.68, -0.74, 0.14]] },
  ldr: { g: 'tur', hip: [-0.66, -0.36, 0.42], feet: [[-0.5, DIM.FL + 0.06, 0.12], [-0.72, DIM.FL + 0.06, 0.08]], face: 52 },
  drv: { g: 'hul', hip: [0, DIM.HF + 0.31, DIM.DZ - 0.2], feet: [[-0.13, DIM.HF + 0.2, DIM.DZ - 0.66], [0.13, DIM.HF + 0.2, DIM.DZ - 0.66]] },
};
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V(), _up = V(0, 1, 0);

// two-bone reach: from root to target with segment lengths l1 and l2, the middle joint pushed toward `pole`. Writes the middle joint into mid
// and the reachable end into end.
function reach(root, target, l1, l2, pole, mid, end) {
  _d.copy(target).sub(root); const want = _d.length() || 1e-4, dist = Math.min(want, (l1 + l2) * 0.985); _d.divideScalar(want);
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _e.copy(pole).addScaledVector(_d, -pole.dot(_d)); if (_e.lengthSq() < 1e-6) _e.set(0, -1, 0); _e.normalize();
  mid.copy(root).addScaledVector(_d, along).addScaledVector(_e, out); end.copy(root).addScaledVector(_d, dist);
}

export class CrewFigures {
  // cab: () => interior material; groups { tur, hul }; kitOf: () => a new Kit (to make the shapes with the interior's own colours)
  constructor(cab, groups, kitOf) {
    this.G = groups; this.n = { tur: 0, hul: 0 }; this.mesh = {};
    const mat = cab(), shapes = { cyl: c => { const k = kitOf(); k.cyl('f', 1, 1, 1, c, 0, 0.5, 0, 0, 0, 0, 8); return k.mesh('f', mat).geometry; }, ball: c => { const k = kitOf(); k.ball('f', 1, c, 0, 0, 0); return k.mesh('f', mat).geometry; } };
    this.cols = { cov: [0x6a6c4f, K.CLOTH], skin: [0xb08a6a, K.CLOTH], dark: [0x1c1d1c, K.RUBBER], blood: [0x3a0808, K.CLOTH] };
    for (const g of ['tur', 'hul']) for (const c of Object.keys(this.cols)) for (const sh of ['cyl', 'ball']) { const cap = g === 'tur' ? 48 : 16, im = new THREE.InstancedMesh(shapes[sh](this.cols[c]), mat, cap); im.frustumCulled = false; im.count = 0; groups[g].add(im); this.mesh[g + c + sh] = im; }
    this.J = {}; for (const r of Object.keys(MEN)) this.J[r] = { hip: V(), chest: V(), neck: V(), head: V(), sh: [V(), V()], el: [V(), V()], ha: [V(), V()], hp: [V(), V()], kn: [V(), V()], ft: [V(), V()], side: V(), fwd: V() };
    this.tris = 0; this.triCount = () => { let t = 0; for (const k in this.mesh) { const m = this.mesh[k], g = m.geometry; t += m.count * (g.index ? g.index.count : g.attributes.position.count) / 3; } return Math.round(t); };
  }
  _put(g, col, shape, m) { const im = this.mesh[g + col + shape]; if (im.count < im.instanceMatrix.count) im.setMatrixAt(im.count++, m); }
  // a limb: a tube from a to b of radius r (and a little wider front to back for a torso: rz)
  _limb(g, col, a, b, r, rz) { _d.copy(b).sub(a); const len = _d.length() || 1e-4; _q.setFromUnitVectors(_up, _d.divideScalar(len)); _m.compose(a, _q, _s.set(r, len, rz || r)); this._put(g, col, 'cyl', _m); }
  _ball(g, col, p, r, ry, rz) { _m.compose(p, _q.identity(), _s.set(r, ry || r, rz || r)); this._put(g, col, 'ball', _m); }

  // men: { gnr: { on, head [x,y,z], hands [[x,y,z],[x,y,z]] (left, right), state, stress, status, brace 0..1, flinch 0..1, bodyOnly (the viewer sits here: draw arms and legs only), blood }, ... }; t = battle time
  update(men, t) {
    for (const k in this.mesh) this.mesh[k].count = 0;
    for (const r of Object.keys(MEN)) { const M = men[r], D = MEN[r], J = this.J[r], g = D.g; if (!M || !M.on) continue;
      const face = (D.face || 0) * Math.PI / 180; J.fwd.set(Math.sin(face), 0, -Math.cos(face)); J.side.set(Math.cos(face), 0, Math.sin(face));   /* side = his right */
      const down = M.status === 'down', panic = M.state === 'panicked' || M.frozen, shaken = M.state === 'shaken', strained = M.state === 'strained', hurt = M.status === 'wounded';
      // the head: at the seat's eye point, moved by what he is doing
      const sp = panic ? 5.5 : shaken ? 3.4 : strained ? 2.2 : 1.1, amp = panic ? 0.012 : shaken ? 0.02 : strained ? 0.016 : 0.012, ph = hsh(r.length, r.charCodeAt(0)) * 6;
      J.head.set(M.head[0], M.head[1], M.head[2]); J.head.addScaledVector(J.side, Math.sin(t * sp + ph) * amp); J.head.y += Math.sin(t * sp * 1.7 + ph) * amp * 0.35;
      if (shaken || panic) { J.head.x += (hsh(Math.floor(t * 14), 3 + ph) - 0.5) * 0.008; J.head.y += (hsh(Math.floor(t * 14), 7 + ph) - 0.5) * 0.008; }   /* tremor */
      const duck = Math.max(M.flinch || 0, (M.brace || 0) * 0.6, panic ? 0.8 : 0, strained ? 0.15 : 0, shaken ? 0.3 : 0); J.head.y -= 0.09 * duck; J.head.addScaledVector(J.fwd, 0.07 * duck);
      J.hip.set(D.hip[0], D.hip[1], D.hip[2]);
      if (down) { J.head.y -= 0.2; J.head.addScaledVector(J.fwd, 0.16).addScaledVector(J.side, (hsh(r.length, 9) - 0.5) * 0.3); }   /* slumped where he sat */
      // spine: from the hips to the base of the neck, which hangs below and behind the eyes
      J.neck.copy(J.head).addScaledVector(J.fwd, -0.09); J.neck.y -= 0.15; J.chest.copy(J.hip).lerp(J.neck, 0.62).addScaledVector(J.fwd, -0.03 + (duck + (down ? 1 : 0)) * 0.05);
      for (let i = 0; i < 2; i++) { const sd = i ? 1 : -1; J.sh[i].copy(J.neck).addScaledVector(J.side, sd * L.sh); J.sh[i].y -= 0.04; J.hp[i].copy(J.hip).addScaledVector(J.side, sd * L.hip);
        // hands: on their controls; off them when frozen or panicked (hands to the helmet), one to the wound when hurt, hanging when down
        const tgt = _a; if (down) tgt.copy(J.hp[i]).addScaledVector(J.side, sd * 0.16).addScaledVector(J.fwd, 0.1), tgt.y -= 0.12;
        else if (panic) tgt.copy(J.head).addScaledVector(J.side, sd * 0.13).addScaledVector(J.fwd, 0.06), tgt.y += 0.03;
        else if (hurt && i === 0) tgt.copy(J.chest).addScaledVector(J.fwd, 0.12).addScaledVector(J.side, 0.05);
        else tgt.set(M.hands[i][0], M.hands[i][1], M.hands[i][2]);
        _b.copy(J.side).multiplyScalar(sd * 0.7); _b.y -= 0.7; reach(J.sh[i], tgt, L.upper, L.fore, _b, J.el[i], J.ha[i]);
        _c.set(D.feet[i][0], D.feet[i][1], D.feet[i][2]); _b.set(0, 1, 0).addScaledVector(J.fwd, 0.4).addScaledVector(J.side, sd * 0.25); reach(J.hp[i], _c, L.thigh, L.shin, _b, J.kn[i], J.ft[i]); }
      // ---- draw him
      const body = !M.bodyOnly;
      if (body) { this._limb(g, 'cov', J.hip, J.chest, 0.15, 0.11); this._limb(g, 'cov', J.chest, J.neck, 0.165, 0.115); this._ball(g, 'cov', J.hip, 0.15, 0.11, 0.12); this._ball(g, 'cov', J.neck, 0.165, 0.07, 0.115);
        _a.copy(J.neck).lerp(J.head, 0.5); this._limb(g, 'skin', J.neck, _a, 0.05); _a.copy(J.head).addScaledVector(J.fwd, -0.07); _a.y -= 0.02; this._ball(g, 'skin', _a, 0.088, 0.108, 0.098);
        _b.copy(_a); _b.y += 0.035; _b.addScaledVector(J.fwd, -0.012); this._ball(g, 'dark', _b, 0.108, 0.1, 0.118);                                   /* crew helmet */
        for (const sd of [-1, 1]) { _c.copy(_a).addScaledVector(J.side, sd * 0.1); _c.y -= 0.01; this._ball(g, 'dark', _c, 0.03, 0.045, 0.045); }   /* ear cups */
        _c.copy(_a).addScaledVector(J.fwd, 0.085).addScaledVector(J.side, -0.05); _c.y -= 0.05; this._ball(g, 'dark', _c, 0.012, 0.012, 0.02);   /* microphone */
        if (M.blood) { _c.copy(J.chest).addScaledVector(J.fwd, 0.085).addScaledVector(J.side, 0.03); this._ball(g, 'blood', _c, 0.09, 0.12, 0.05); if (M.blood === 'killed') { _c.copy(J.hip).addScaledVector(J.fwd, 0.08); this._ball(g, 'blood', _c, 0.13, 0.08, 0.08); _c.copy(_a).addScaledVector(J.side, -0.06); this._ball(g, 'blood', _c, 0.07, 0.09, 0.08); } } }
      for (let i = 0; i < 2; i++) { if (body) this._ball(g, 'cov', J.sh[i], 0.062); this._limb(g, 'cov', J.sh[i], J.el[i], 0.052); this._ball(g, 'cov', J.el[i], 0.048); this._limb(g, 'cov', J.el[i], J.ha[i], 0.043); this._ball(g, 'dark', J.ha[i], 0.046, 0.04, 0.05);
        this._limb(g, 'cov', J.hp[i], J.kn[i], 0.078); this._ball(g, 'cov', J.kn[i], 0.066); this._limb(g, 'cov', J.kn[i], J.ft[i], 0.058); _c.copy(J.ft[i]).addScaledVector(J.fwd, 0.07); _c.y -= 0.02; this._ball(g, 'dark', _c, 0.05, 0.045, 0.12); }
    }
    for (const k in this.mesh) { const m = this.mesh[k]; m.visible = m.count > 0; if (m.count) m.instanceMatrix.needsUpdate = true; }
  }
}
