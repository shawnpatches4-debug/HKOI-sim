// How a soldier figure moves. Nothing here draws anything: it is arithmetic on the joints of a skeleton, so it is cheap
// enough to do for every figure on every frame, and it can be tested without a browser (tests/motion/harness.mjs).
//
// The supplied soldier has no recorded movements, so every movement is worked out from a few rules:
//   - a POSE is a list of which way each limb points; `solve` turns it into the turn of every joint;
//   - WALKING and RUNNING are driven by the ground actually covered: a foot that is down stays exactly where it was put
//     while the body passes over it, then lifts, swings forward and is put down ahead (`stepGait`, `stridePose`);
//   - nothing ever jumps from one pose to another. The pose aimed for moves along a short list of in-between poses
//     (a "timeline"), and every joint CHASES what is aimed for like a weight on a damped spring (`chaseJoint`): it
//     starts gently, never overshoots, and arrives gently. Joints further from the hips chase a little more slowly,
//     so the hips lead and the chest, head and arms follow.
// Directions are in the figure's own frame: x = his left, y = up, z = the way he faces.
//
// Another skeleton with the same joints under other names can use all of this: give `makeRig` a naming function.
// A recorded clip can take the place of a worked-out movement: see `clipPose` at the end.
import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------------------------
// Poses: which way each limb segment points [left(+x)/right(-x), up, forward]; `tip` leans the whole body forward about
// the hips first (1.57 = lying face down, negative = on the back).
// ---------------------------------------------------------------------------------------------------------------------
const LIMBS = [['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['LeftFoot', 'LeftToeBase'], ['RightFoot', 'RightToeBase'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand']];
const PRONE_LEGS = { LeftUpLeg: [0.18, -0.03, -1], LeftLeg: [0.05, -0.04, -1], LeftFoot: [0.45, -0.12, -1], RightUpLeg: [-0.18, -0.03, -1], RightLeg: [-0.05, -0.04, -1], RightFoot: [-0.45, -0.12, -1] };
const KNEEL_LEGS = { LeftUpLeg: [0.12, 0.04, 1], LeftLeg: [0, -1, 0.05], LeftFoot: [0, -0.3, 1], RightUpLeg: [-0.05, -1, 0.18], RightLeg: [0, 0.02, -1], RightFoot: [0, -0.1, -1] };
export const POSES = {
  // upright with a straight back: loads are fixed to a figure in this pose
  ready: { Spine: [0, 1, 0.05], Spine1: [0, 1, 0.05], Spine2: [0, 1, 0.08], Neck: [0, 1, 0.05], LeftArm: [0.25, -1, 0.1], LeftForeArm: [0.1, -1, 0.3], RightArm: [-0.25, -1, 0.1], RightForeArm: [-0.1, -1, 0.3] },
  stand: { LeftArm: [0.25, -1, 0.1], LeftForeArm: [0.1, -1, 0.3], RightArm: [-0.25, -1, 0.1], RightForeArm: [-0.1, -1, 0.3] },
  // down on the right knee behind a launcher, hands forward on the controls
  kneel: { Spine: [0, 1, 0.12], Spine1: [0, 1, 0.2], Spine2: [0, 1, 0.25], Neck: [0, 1, 0.25], ...KNEEL_LEGS, LeftArm: [0.2, -0.85, 0.45], LeftForeArm: [-0.35, 0.1, 0.95], RightArm: [-0.2, -0.85, 0.45], RightForeArm: [0.35, 0.1, 0.95] },
  // on the right knee with the back straight and the arms loose: passed through when getting up, and held while handling a load
  knee: { Spine: [0, 1, 0.1], Spine1: [0, 1, 0.14], Spine2: [0, 1, 0.16], Neck: [0, 1, 0.1], ...KNEEL_LEGS, LeftArm: [0.22, -0.9, 0.35], LeftForeArm: [-0.1, -0.5, 0.85], RightArm: [-0.22, -1, 0.2], RightForeArm: [-0.05, -0.8, 0.6] },
  // on the right knee with the left foot forward, bent over with both hands on the ground: between hands and knees and kneeling upright
  lunge: { tip: 1.45, Spine: [0, 0.12, 1], Spine1: [0, 0.16, 1], Spine2: [0, 0.2, 1], Neck: [0, 0.9, 0.6], ...KNEEL_LEGS, LeftArm: [0.25, -1, -0.05], LeftForeArm: [0.05, -1, 0.1], RightArm: [-0.2, -1, -0.05], RightForeArm: [-0.05, -1, 0.1] },
  // sitting back on the heels beside a tripod launcher, leaning in to the eyepiece (the hands are put on the controls separately)
  gunner: { Spine: [0, 1, 0.3], Spine1: [0, 1, 0.42], Spine2: [0, 1, 0.5], Neck: [0, 1, 0.3], LeftUpLeg: [0.22, -0.6, 1], LeftLeg: [0, 0.06, -1], LeftFoot: [0, -0.15, -1], RightUpLeg: [-0.22, -0.6, 1], RightLeg: [0, 0.06, -1], RightFoot: [0, -0.15, -1], LeftArm: [0.1, -0.6, 0.8], LeftForeArm: [-0.4, 0.1, 0.9], RightArm: [-0.1, -0.6, 0.8], RightForeArm: [-0.2, 0.1, 0.95] },
  // kneeling with a tube on the right shoulder
  shoulder: { Spine: [0, 1, 0.05], Spine1: [0, 1, 0.05], Spine2: [0, 1, 0.08], Neck: [0, 1, 0.1], ...KNEEL_LEGS, LeftArm: [-0.35, -0.45, 0.85], LeftForeArm: [-0.95, 0.35, 0.25], RightArm: [-0.55, -0.75, 0.4], RightForeArm: [0.02, 0.8, 0.6] },
  // squatting low, forearms on the knees
  crouch: { Spine: [0, 1, 0.35], Spine1: [0, 1, 0.5], Spine2: [0, 1, 0.55], Neck: [0, 1, 0.1], LeftUpLeg: [0.22, 0.15, 1], LeftLeg: [0, -1, -0.28], LeftFoot: [0, -0.3, 1], RightUpLeg: [-0.22, 0.15, 1], RightLeg: [0, -1, -0.28], RightFoot: [0, -0.3, 1], LeftArm: [0.1, -0.5, 0.85], LeftForeArm: [-0.3, -0.2, 0.9], RightArm: [-0.1, -0.5, 0.85], RightForeArm: [0.3, -0.2, 0.9] },
  // on hands and knees: passed through on the way down to the ground and up from it
  hands_knees: { tip: 1.42, Spine: [0, 0.08, 1], Spine1: [0, 0.1, 1], Spine2: [0, 0.12, 1], Neck: [0, 0.7, 0.75], LeftUpLeg: [0.1, -1, 0.1], LeftLeg: [0, -0.02, -1], LeftFoot: [0, -0.02, -1], RightUpLeg: [-0.1, -1, 0.1], RightLeg: [0, -0.02, -1], RightFoot: [0, -0.02, -1], LeftArm: [0.12, -1, -0.3], LeftForeArm: [0, -1, 0.3], RightArm: [-0.12, -1, -0.3], RightForeArm: [0, -1, 0.3] },
  // lying down with the chest pushed up on the hands: between lying flat and hands and knees
  pushup: { tip: 1.3, Spine: [0, 0.3, 1], Spine1: [0, 0.42, 1], Spine2: [0, 0.5, 1], Neck: [0, 0.8, 0.7], LeftUpLeg: [0.15, -0.5, -1], LeftLeg: [0.05, 0.02, -1], LeftFoot: [0.3, -0.05, -1], RightUpLeg: [-0.15, -0.5, -1], RightLeg: [-0.05, 0.02, -1], RightFoot: [-0.3, -0.05, -1], LeftArm: [0.35, -1, -0.75], LeftForeArm: [0.02, -1, 0.75], RightArm: [-0.35, -1, -0.75], RightForeArm: [-0.02, -1, 0.75] },
  // lying face down on the elbows, head up, looking forward
  prone: { tip: 1.5, Spine: [0, 0.1, 1], Spine1: [0, 0.2, 1], Spine2: [0, 0.3, 1], Neck: [0, 0.75, 0.7], ...PRONE_LEGS, LeftArm: [0.55, -0.55, 0.6], LeftForeArm: [-0.45, 0, 0.9], RightArm: [-0.55, -0.55, 0.6], RightForeArm: [0.45, 0, 0.9] },
  // flat under fire: chest on the ground, arms drawn in beside the head
  pinned: { tip: 1.54, Spine: [0, 0.04, 1], Spine1: [0, 0.08, 1], Spine2: [0, 0.12, 1], Neck: [0, 0.3, 1], ...PRONE_LEGS, LeftArm: [0.9, -0.5, 0.5], LeftForeArm: [-0.25, -0.08, 1], RightArm: [-0.9, -0.5, 0.5], RightForeArm: [0.25, -0.08, 1] },
  // hit: buckling at the knees and the waist
  buckle: { tip: 0.35, Spine: [0.1, 1, 0.5], Spine1: [0.12, 1, 0.7], Spine2: [0.12, 0.9, 0.9], Neck: [0.1, 0.6, 1], LeftUpLeg: [0.2, -0.5, 1], LeftLeg: [0, -1, -0.7], LeftFoot: [0, -0.3, 1], RightUpLeg: [-0.15, -0.8, 0.7], RightLeg: [0, -0.7, -1], RightFoot: [0, -0.5, 0.6], LeftArm: [0.5, -1, 0.3], LeftForeArm: [0.1, -1, 0.5], RightArm: [-0.5, -1, 0.2], RightForeArm: [-0.2, -0.8, 0.8] },
  // lying still, face down, limbs where they fell
  fallen: { tip: 1.56, Spine: [0.05, 0.02, 1], Spine1: [0.08, 0.03, 1], Spine2: [0.1, 0.03, 1], Neck: [0.5, 0.05, 1], LeftUpLeg: [0.3, 0, -1], LeftLeg: [0.5, 0, -1], LeftFoot: [0.6, -0.2, -1], RightUpLeg: [-0.12, 0, -1], RightLeg: [-0.05, 0, -1], RightFoot: [-0.4, -0.3, -1], LeftArm: [1, -0.1, 0.5], LeftForeArm: [0.3, 0, 1], RightArm: [-0.7, -0.1, -0.6], RightForeArm: [-0.2, 0, -1] },
  // lying still on the back
  fallen_back: { tip: -1.5, Spine: [0, 0.03, -1], Spine1: [0.05, 0.03, -1], Spine2: [0.08, 0.04, -1], Neck: [0.3, 0.1, -1], LeftUpLeg: [0.25, 0, 1], LeftLeg: [0.1, 0.25, 1], LeftFoot: [0.5, 0.5, 0.5], RightUpLeg: [-0.3, 0, 1], RightLeg: [-0.5, 0.02, 1], RightFoot: [-0.6, 0.5, 0.4], LeftArm: [1, -0.05, -0.2], LeftForeArm: [0.6, 0, -1], RightArm: [-0.8, -0.05, 0.6], RightForeArm: [-0.9, 0, 0.3] },
};

// --- the bones of a figure by their plain names ---
let boneName = n => n.replace(/^mixamorig:?/, '');
const boneMap = fig => { let B = fig.userData.B; if (!B) { B = fig.userData.B = {}; fig.traverse(o => { if (o.isBone) B[boneName(o.name)] = o; }); } return B; };
export const bone = (fig, name) => boneMap(fig)[name];
// where a joint is, in the frame the figure stands in (its team, or the world if it stands alone)
export function jointAt(fig, name, out) { bone(fig, name).getWorldPosition(out); return fig.parent ? fig.parent.worldToLocal(out) : out; }

// Bend one arm of a real figure so the hand lands on a point (given in the frame the figure stands in). Kept for outside users.
const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _H = new THREE.Vector3(), _T = new THREE.Vector3(), _P = new THREE.Vector3(), _D = new THREE.Vector3(), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
function turnBone(b, from, to) { _q.setFromUnitVectors(from, to); b.getWorldQuaternion(_wq); b.parent.getWorldQuaternion(_pq); b.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq))); b.updateMatrixWorld(true); }
export function reach(fig, side, target, pole) {
  const B = boneMap(fig), up = B[side + 'Arm'], fo = B[side + 'ForeArm'], ha = B[side + 'Hand']; if (!up || !fo || !ha) return;
  up.getWorldPosition(_S); fo.getWorldPosition(_E); ha.getWorldPosition(_H); const L1 = _E.distanceTo(_S), L2 = _H.distanceTo(_E);
  _T.copy(target); _P.copy(pole); if (fig.parent) { fig.parent.localToWorld(_T); _P.transformDirection(fig.parent.matrixWorld); }
  _D.copy(_T).sub(_S); const len = _D.length() || 1e-6, dist = Math.max(Math.abs(L1 - L2) * 1.02 + 1e-4, Math.min(len, (L1 + L2) * 0.999)); _D.divideScalar(len);
  const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), out = Math.sqrt(Math.max(0, L1 * L1 - along * along)); _P.addScaledVector(_D, -_P.dot(_D)); if (_P.lengthSq() < 1e-8) _P.set(0, -1, 0); _P.normalize();
  _T.copy(_S).addScaledVector(_D, dist); _H.copy(_S).addScaledVector(_D, along).addScaledVector(_P, out);
  turnBone(up, _E.sub(_S).normalize(), _H.sub(_S).normalize());
  fo.getWorldPosition(_E); ha.getWorldPosition(_H); turnBone(fo, _H.sub(_E).normalize(), _T.sub(_E).normalize());
}
// Put a real figure that is not yet attached to anything into a pose (used once, when a figure is made, and for stand-in figures).
export function setPose(fig, pose) {
  const B = {}; fig.traverse(o => { if (o.isBone) { B[boneName(o.name)] = o; if (!o.userData.rest) o.userData.rest = o.quaternion.clone(); o.quaternion.copy(o.userData.rest); } });
  if (!B.Hips) return; fig.position.set(0, 0, 0); fig.rotation.set(0, 0, 0); if (fig.parent) fig.parent.updateWorldMatrix(true, false); fig.updateMatrixWorld(true);
  const PQ = fig.parent ? fig.parent.getWorldQuaternion(new THREE.Quaternion()) : null, PI = fig.parent ? fig.parent.matrixWorld.clone().invert() : null;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion(), pq = new THREE.Quaternion(), wq = new THREE.Quaternion();
  const turnWorld = (bn, dq) => { bn.getWorldQuaternion(wq); bn.parent.getWorldQuaternion(pq); bn.quaternion.copy(pq.invert().multiply(dq.multiply(wq))); bn.updateMatrixWorld(true); };
  if (pose.tip) { const ax = new THREE.Vector3(1, 0, 0); if (PQ) ax.applyQuaternion(PQ); turnWorld(B.Hips, new THREE.Quaternion().setFromAxisAngle(ax, pose.tip)); }
  for (const [bn, cn] of LIMBS) {
    const want = pose[bn], bo = B[bn], child = B[cn]; if (!want || !bo || !child) continue;
    bo.getWorldPosition(a); child.getWorldPosition(b); b.sub(a).normalize();
    const to = new THREE.Vector3(want[0], want[1], want[2]).normalize(); if (PQ) to.applyQuaternion(PQ);
    turnWorld(bo, q.setFromUnitVectors(b, to));
  }
  let low = 1e9; for (const k in B) { B[k].getWorldPosition(a); if (PI) a.applyMatrix4(PI); if (a.y < low) low = a.y; }
  fig.userData.seat = -low + (pose.tip ? 0.13 : 0.07);
}

// ---------------------------------------------------------------------------------------------------------------------
// The skeleton as plain numbers
// ---------------------------------------------------------------------------------------------------------------------
export const RIG = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
export const NJ = RIG.length, J = {}; RIG.forEach((n, i) => { J[n] = i; });
export const UPPER = 14;                                 /* joints 0..13 are the hips, back, head and arms; 14..21 the legs */
const AIM_AT = { Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
  LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand' };
const AXX = new THREE.Vector3(1, 0, 0), AXY = new THREE.Vector3(0, 1, 0), AXZ = new THREE.Vector3(0, 0, 1);
// working space shared by every figure (each figure is finished before the next one starts)
export const Wq = RIG.map(() => new THREE.Quaternion()), Wp = RIG.map(() => new THREE.Vector3());   /* where each joint points and sits, in the figure's frame */
export const TQ = RIG.map(() => new THREE.Quaternion());                                             /* the stride pose of this instant */
const _m1 = new THREE.Vector3(), _m2 = new THREE.Vector3(), _m3 = new THREE.Vector3(), _m4 = new THREE.Vector3(), _m5 = new THREE.Vector3();
const _k1 = new THREE.Quaternion(), _k2 = new THREE.Quaternion(), _k3 = new THREE.Quaternion(), _kh = new THREE.Quaternion();
export const sat = x => x < 0 ? 0 : x > 1 ? 1 : x, ease = x => { x = sat(x); return x * x * (3 - 2 * x); }, mix = (a, b, t) => a + (b - a) * t;
export const frac = x => x - Math.floor(x), wrapPi = a => { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; };

// Measure a figure once, while it stands in its as-supplied pose at the origin: how the joints hang off each other and how long the limbs are.
// names (optional): turns a bone's name in the file into one of the plain names in RIG, for skeletons that call their joints something else.
export function makeRig(fig, names) {
  if (names) { boneName = names; fig.userData.B = null; }
  const B = boneMap(fig), bones = RIG.map(n => B[n]);
  if (bones.some(b => !b)) return null;
  fig.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(fig.matrixWorld).invert(), m = new THREE.Matrix4(), sc = new THREE.Vector3();
  const read = o => { const p = new THREE.Vector3(), q = new THREE.Quaternion(); m.multiplyMatrices(inv, o.matrixWorld).decompose(p, q, sc); return { p, q }; };
  const at = bones.map(read), root = read(bones[0].parent);
  const rig = { bones, at, parent: [], rel: [], off: [], aim: [], rootQ: root.q, hipP: at[0].p.clone() };
  for (let i = 0; i < NJ; i++) {
    const pi = i === 0 ? -1 : RIG.indexOf(boneName(bones[i].parent.name));
    if (i > 0 && (pi < 0 || pi >= i)) return null;                       /* not the skeleton this was written for */
    const pq = pi < 0 ? root.q : at[pi].q, pinv = pq.clone().invert();
    rig.parent.push(pi);
    rig.rel.push(pinv.clone().multiply(at[i].q));
    rig.off.push(pi < 0 ? new THREE.Vector3() : at[i].p.clone().sub(at[pi].p).applyQuaternion(pinv));
    const c = AIM_AT[RIG[i]];
    rig.aim.push(c ? at[J[c]].p.clone().sub(at[i].p).applyQuaternion(at[i].q.clone().invert()).normalize() : null);
  }
  let low = 1e9; for (const a of at) if (a.p.y < low) low = a.p.y;
  const hip = at[J.LeftUpLeg].p, ank = at[J.LeftFoot].p, ball = at[J.LeftToeBase].p;
  rig.oy0 = 0.07 - low;                                   /* how high the figure's origin sits when he stands (joints are a few cm inside the body) */
  rig.thigh = rig.off[J.LeftLeg].length(); rig.shin = rig.off[J.LeftFoot].length(); rig.leg = rig.thigh + rig.shin;
  rig.upper = rig.off[J.LeftForeArm].length(); rig.fore = rig.off[J.LeftHand].length();
  rig.ballH = ball.y + rig.oy0; rig.ankH = ank.y + rig.oy0;   /* heights of the ball of the foot and the ankle above the ground, foot flat */
  rig.fz = ball.z - ank.z; rig.ay = ank.y - ball.y;       /* the foot: ankle to ball, forward and down */
  rig.hipW = Math.abs(hip.x); rig.hipY = hip.y; rig.hipZ = hip.z; rig.footW = Math.abs(ball.x); rig.ballZ = ball.z;
  return rig;
}
// How much body there is around each joint (metres): the joints are inside the body, deeper in the trunk than in a hand or a foot.
const FLESH = { Hips: 0.11, Spine: 0.11, Spine1: 0.115, Spine2: 0.12, Neck: 0.07, Head: 0.1, Shoulder: 0.08, Arm: 0.06, ForeArm: 0.045, Hand: 0.035, UpLeg: 0.1, Leg: 0.06, Foot: 0.07, ToeBase: 0.07 };
export const BODY = RIG.map(n => FLESH[n.replace(/^(Left|Right)/, '')]);
// The lowest part of the body (the working space must hold the pose), measured from ground that slopes by (gx, gz) metres per metre in
// the figure's frame. The figure is seated so that this just touches the ground: whatever he rests on, he neither floats nor sinks.
export function lowest(gx = 0, gz = 0) { let low = 1e9; for (let i = 0; i < NJ; i++) { const p = Wp[i], y = p.y - gx * p.x - gz * p.z - BODY[i]; if (y < low) low = y; } return low; }
// From limb directions to joint turns. D[i] = [x, y, z] the way limb i should point (null = leave it as it hangs);
// X (optional) = whole-body extras in radians: tip (lean the pelvis forward), roll, yaw, twist (chest), look and nod (head).
// Fills out[i] with each joint's own turn, and leaves every joint's place (Wp) and facing (Wq) in the working space.
export function solve(rig, D, X, out) {
  for (let i = 0; i < NJ; i++) {
    const pi = rig.parent[i], pq = pi < 0 ? rig.rootQ : Wq[pi], w = Wq[i];
    w.multiplyQuaternions(pq, rig.rel[i]);
    if (pi < 0) {
      Wp[i].copy(rig.hipP);
      if (X) { if (X.tip) w.premultiply(_k1.setFromAxisAngle(AXX, X.tip)); if (X.roll) w.premultiply(_k1.setFromAxisAngle(AXZ, X.roll)); if (X.yaw) w.premultiply(_k1.setFromAxisAngle(AXY, X.yaw)); }
    } else Wp[i].copy(rig.off[i]).applyQuaternion(pq).add(Wp[pi]);
    const d = D[i], a = rig.aim[i];
    if (d && a) { _m1.copy(a).applyQuaternion(w); _m2.set(d[0], d[1], d[2]).normalize(); w.premultiply(_k1.setFromUnitVectors(_m1, _m2)); }
    if (X) {
      if (i === J.Spine2 && X.twist) w.premultiply(_k1.setFromAxisAngle(AXY, X.twist));
      if (i === J.Head) { if (X.nod) w.multiply(_k1.setFromAxisAngle(AXX, X.nod)); if (X.look) w.premultiply(_k1.setFromAxisAngle(AXY, X.look)); }
    }
    out[i].copy(pq).invert().multiply(w);
  }
}
// The other way round: from joint turns to where the first n joints are (fills the working space Wq, Wp).
export function fk(rig, q, n = NJ) {
  for (let i = 0; i < n; i++) {
    const pi = rig.parent[i], pq = pi < 0 ? rig.rootQ : Wq[pi];
    Wq[i].multiplyQuaternions(pq, q[i]);
    if (pi < 0) Wp[i].copy(rig.hipP); else Wp[i].copy(rig.off[i]).applyQuaternion(pq).add(Wp[pi]);
  }
}
// a pose written as { Limb: [x, y, z], tip } as the joint turns of one skeleton
export function poseTurns(rig, pose) { const out = RIG.map(() => new THREE.Quaternion()); solve(rig, RIG.map(n => pose[n] || null), pose, out); return out; }
// Bend one arm so the hand lands on a point (in the figure's frame); pole = which way the elbow should point; w = how firmly (0..1).
// Needs the working space filled by `fk` for the same joint turns q.
export function reachQ(rig, q, side, target, pole, w) {
  const iS = J[side + 'Shoulder'], iA = J[side + 'Arm'], iF = J[side + 'ForeArm'], L1 = rig.upper, L2 = rig.fore, S = Wp[iA];
  const D = _m1.copy(target).sub(S), len = D.length() || 1e-6, dist = Math.max(Math.abs(L1 - L2) * 1.02 + 1e-4, Math.min(len, (L1 + L2) * 0.999)); D.divideScalar(len);
  const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), out = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  const P = _m2.copy(pole); P.addScaledVector(D, -P.dot(D)); if (P.lengthSq() < 1e-8) P.set(0, -1, 0); P.normalize();
  const elbow = _m3.copy(D).multiplyScalar(along).addScaledVector(P, out);          /* from the shoulder to the elbow */
  const hand = _m4.copy(D).multiplyScalar(dist).sub(elbow);                         /* from the elbow to the hand */
  _k1.multiplyQuaternions(Wq[iS], q[iA]); _m5.copy(rig.aim[iA]).applyQuaternion(_k1); _k1.premultiply(_k3.setFromUnitVectors(_m5, elbow.normalize()));
  _k2.multiplyQuaternions(_k1, q[iF]); _m5.copy(rig.aim[iF]).applyQuaternion(_k2); _k2.premultiply(_k3.setFromUnitVectors(_m5, hand.normalize()));
  _k2.premultiply(_k3.copy(_k1).invert());                                          /* the forearm's own turn */
  _k1.premultiply(_k3.copy(Wq[iS]).invert());                                       /* the upper arm's own turn */
  if (w >= 0.999) { q[iA].copy(_k1); q[iF].copy(_k2); } else { q[iA].slerp(_k1, w); q[iF].slerp(_k2, w); }
}

// ---------------------------------------------------------------------------------------------------------------------
// Chasing: how anything gets from where it is to where it should be without a jolt.
// A value chases its goal like a weight on a spring that is damped just enough never to overshoot. The sums below are the
// exact answer for a goal that moved in a straight line during the step, so a slow computer and a fast one get the same
// movement. half = seconds to cover half the remaining distance (roughly); stiff(half) is the matching spring rate.
// ---------------------------------------------------------------------------------------------------------------------
export const stiff = half => 2 * Math.LN2 / Math.max(half, 1e-4);
// s = { x, v }. The goal went from g0 to g1 during dt. lead = 0: trail a moving goal (it eases off the mark and eases to a stop);
// lead = 1: keep up with a moving goal (no trailing once up to speed).
export function chase(s, g0, g1, y, dt, lead = 0) {
  if (Math.abs(g1 - g0) > 0.03 + 12 * dt) g0 = g1;        /* a goal that leapt is a new goal, not a moving one */
  const gv = (g1 - g0) / dt, lag = (1 - lead) * 2 * gv / y, e0 = s.x - g0 + lag, v0 = s.v - gv, j = v0 + e0 * y, ex = Math.exp(-y * dt);
  s.x = ex * (e0 + j * dt) - lag + g1; s.v = ex * (v0 - j * y * dt) + gv;
}
// the same for an angle (radians), taking the short way round
export function chaseAngle(s, g0, g1, y, dt, lead = 0) {
  if (Math.abs(wrapPi(g1 - g0)) > 0.1 + 12 * dt) g0 = g1;
  const d = wrapPi(g1 - g0), gv = d / dt, lag = (1 - lead) * 2 * gv / y, e0 = wrapPi(s.x - g0) + lag, v0 = s.v - gv, j = v0 + e0 * y, ex = Math.exp(-y * dt);
  s.x = g0 + d + ex * (e0 + j * dt) - lag; s.v = ex * (v0 - j * y * dt) + gv;
}
// a turn (quaternion) as an arrow along its axis, as long as its angle, and back
function turnToArrow(q, out) {
  let x = q.x, y = q.y, z = q.z, w = q.w; if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.sqrt(x * x + y * y + z * z); if (s < 1e-9) return out.set(2 * x, 2 * y, 2 * z);
  const k = 2 * Math.atan2(s, w) / s; return out.set(x * k, y * k, z * k);
}
function arrowToTurn(v, out) {
  const a = v.length(); if (a < 1e-9) return out.set(v.x * 0.5, v.y * 0.5, v.z * 0.5, 1).normalize();
  const k = Math.sin(a / 2) / a; return out.set(v.x * k, v.y * k, v.z * k, Math.cos(a / 2));
}
const _ce = new THREE.Vector3(), _cg = new THREE.Vector3(), _cq = new THREE.Quaternion(), _ci = new THREE.Quaternion();
// One joint chases its goal. q = the joint's turn now (changed), w = how fast it is turning (changed), g0 -> g1 = where the goal was and is.
export function chaseJoint(q, w, g0, g1, y, dt) {
  _ci.copy(g0).invert();
  turnToArrow(_cq.multiplyQuaternions(g1, _ci), _cg);                    /* how far the goal turned during the step */
  if (_cg.lengthSq() > 0.36) _cg.set(0, 0, 0); else _cg.multiplyScalar(1 / dt);    /* (a goal that leapt is a new goal, not a moving one) */
  turnToArrow(_cq.multiplyQuaternions(q, _ci), _ce);                     /* how far the joint is from where the goal was */
  const k = 2 / y, ex = Math.exp(-y * dt);
  const ex0 = _ce.x + k * _cg.x, ey0 = _ce.y + k * _cg.y, ez0 = _ce.z + k * _cg.z;
  const vx = w.x - _cg.x, vy = w.y - _cg.y, vz = w.z - _cg.z, jx = vx + ex0 * y, jy = vy + ey0 * y, jz = vz + ez0 * y;
  _ce.set(ex * (ex0 + jx * dt) - k * _cg.x, ex * (ey0 + jy * dt) - k * _cg.y, ex * (ez0 + jz * dt) - k * _cg.z);
  w.set(ex * (vx - jx * y * dt) + _cg.x, ex * (vy - jy * y * dt) + _cg.y, ex * (vz - jz * y * dt) + _cg.z);
  q.multiplyQuaternions(arrowToTurn(_ce, _cq), g1);
}
// How quickly each joint chases (seconds to cover half the way). The hips and legs lead; the back, head and arms follow.
const HALF_MOVING = { Hips: 0.02, Spine: 0.03, Spine1: 0.035, Spine2: 0.04, Neck: 0.05, Head: 0.06, Shoulder: 0.04, Arm: 0.045, ForeArm: 0.06, Hand: 0.07, UpLeg: 0.02, Leg: 0.02, Foot: 0.02, ToeBase: 0.02 };
const HALF_POSING = { Hips: 0.085, Spine: 0.095, Spine1: 0.105, Spine2: 0.115, Neck: 0.13, Head: 0.145, Shoulder: 0.11, Arm: 0.115, ForeArm: 0.13, Hand: 0.14, UpLeg: 0.085, Leg: 0.09, Foot: 0.095, ToeBase: 0.1 };
const rate = T => RIG.map(n => stiff(T[n.replace(/^(Left|Right)/, '')]));
export const Y_MOVING = rate(HALF_MOVING), Y_POSING = rate(HALF_POSING);

// ---------------------------------------------------------------------------------------------------------------------
// Walking and running
// What is remembered about one figure's stride: how far through the stride he is (ph, 0..1; the left foot lands at 0, the
// right at 0.5), his smoothed speed over the ground, how much of a run it is (0 walk .. 1 run), and where the ball of each
// foot is on the ground (figure's frame; on = the foot is down and must not slide; gy = height of the ground under it).
// ---------------------------------------------------------------------------------------------------------------------
export function newGait() { const foot = () => ({ x: 0, z: 0, on: true, sx: 0, sz: 0, gy: 0, gY: 0, fresh: true, far: 0 }); return { ph: 0.5, run: 0, vx: 0, vz: 0, v: 0, L: 0.5, beta: 0.56, slope: 0, ref: { x: 0, v: 0 }, refOk: false, hy: { x: 0, v: 0 }, hyOk: false, hy0: 0, clipL: 0, acc: 0, clock: 0, turn: 0, feet: [foot(), foot()] }; }
export function resetGait(g, rig) { g.ph = 0.5; g.vx = g.vz = g.v = 0; g.run = 0; g.L = 0.5; g.beta = 0.56; g.turn = 0; g.acc = 0; g.refOk = false; g.hyOk = false; g.feet.forEach((f, k) => { f.x = (k ? -1 : 1) * rig.footW; f.z = rig.ballZ; f.on = true; f.sx = f.x; f.sz = f.z; f.gy = 0; f.fresh = true; }); }
// Stride length and the share of the stride each foot spends on the ground, from the speed. Chosen so the legs can actually reach:
// an easy walk is about 1.3 m per stride (two steps); from about 1.7 m/s a loaded man breaks into a short-stepping trot, feet barely
// leaving the ground; a real run is 2.4 to 3.4 m per stride with both feet off the ground between steps.
function gaitShape(g) {
  const v = g.v, r = g.run;
  const Lw = Math.max(0.25, Math.min(1.5, (0.40 + 0.21 * v) / 0.56) * sat(v / 0.5)), bw = 0.56;
  const Lr = Math.max(1.5, v / (1.36 + 0.07 * (v - 3.2))), br = mix(0.5, Math.min(0.92, 0.72 + 0.06 * (v - 3.2)) / Lr, ease((v - 2.3) / 1.1));
  g.L = g.clipL > 0 ? g.clipL : mix(Lw, Lr, r); g.beta = Math.min(0.7, Math.max(0.2, mix(bw, br, r)));
}
// Move the stride on by one small step of time. (mx, mz) = how far the figure moved over the ground and dyaw = how far he turned,
// both in his own frame.
export function stepGait(g, rig, mx, mz, dyaw, dt) {
  if (dt > 1e-6) {
    const k = 1 - Math.exp(-dt * 9), v0 = g.v; g.vx += (mx / dt - g.vx) * k; g.vz += (mz / dt - g.vz) * k; g.v = Math.hypot(g.vx, g.vz);
    g.acc += ((g.v - v0) / dt - g.acc) * (1 - Math.exp(-dt * 7)); g.clock += dt;       /* how hard he is speeding up or slowing down */
    g.run += (ease((g.v - 1.7) / 0.7) - g.run) * (1 - Math.exp(-dt * 4));
    g.turn += (dyaw / dt - g.turn) * (1 - Math.exp(-dt * 5));
  }
  gaitShape(g);
  const v = g.v, ux = v > 0.05 ? g.vx / v : 0, uz = v > 0.05 ? g.vz / v : 1;
  const along = Math.max(0, mx * ux + mz * uz);
  let dph = along / g.L + dt * 0.9 * (1 - sat(v / 0.4)) * (g.feet[0].on && g.feet[1].on && offCentre(g, rig) < 0.06 ? 0 : 1);     /* nearly stopped: finish the step in hand, then stand */
  // a foot left too far behind (he set off faster than his stride had reckoned with), or out of reach, or crossed over in a turn, is picked up at once
  for (let k = 0; k < 2; k++) { const f = g.feet[k], p0 = frac(g.ph + k * 0.5); const side = k ? -1 : 1, out = Math.hypot(f.x - side * rig.hipW, f.z - rig.hipZ); if (f.on && p0 < g.beta && ((out > 0.5 * rig.leg && f.x * ux + f.z * uz < 0) || out > 0.62 * rig.leg || f.x * side < -0.12)) dph = Math.max(dph, Math.min(g.beta - p0 + 1e-3, dt * 5)); }
  const n = Math.min(16, Math.max(1, Math.ceil(dph / 0.1)));   /* long steps of time are taken in pieces so no step of the feet is skipped */
  for (let k = 0; k < n; k++) gaitPiece(g, rig, mx / n, mz / n, dyaw / n, dph / n, ux, uz);
}
// how far the feet are from where a standing man would have them
function offCentre(g, rig) { let d = 0; for (let k = 0; k < 2; k++) { const f = g.feet[k]; d = Math.max(d, Math.hypot(f.x - (k ? -1 : 1) * rig.footW, f.z - rig.ballZ)); } return d; }
function gaitPiece(g, rig, mx, mz, dyaw, dph, ux, uz) {
  const b = g.beta, S = b * g.L, r = g.run, c = Math.cos(dyaw), s = Math.sin(dyaw), amp = sat(g.v / 1.3);
  const M = Math.min(g.L * (1 - b), 0.7 * S), wide = rig.footW * mix(0.85, 0.5, r), zc = mix(rig.ballZ, rig.hipZ + 0.03, amp);
  for (let k = 0; k < 2; k++) {
    const f = g.feet[k], side = k ? -1 : 1, p0 = frac(g.ph + k * 0.5), p1 = p0 + dph;
    const tx = ux * S / 2 * sat(g.v / 0.4) + side * mix(rig.footW, wide, amp), tz = uz * S / 2 * sat(g.v / 0.4) + zc;          /* where this foot will be put down next */
    if (f.on && p0 >= b) { f.on = false; f.sx = f.x; f.sz = f.z; }      /* (the stride changed shape under him) */
    if (!f.on) f.far = Math.hypot(tx - f.sx, tz - f.sz);            /* how long this step is */
    if (!f.on && p1 < b) { f.on = true; f.fresh = true; }
    if (f.on) {
      const x = f.x * c - f.z * s - mx, z = f.x * s + f.z * c - mz; f.x = x; f.z = z;   /* the ground goes by under the body; the foot stays on its spot */
      if (p1 >= b && dph > 0) { const rest = 1 - (b - p0) / dph; f.on = false; f.sx = f.x + mx * rest; f.sz = f.z + mz * rest; }   /* it lifts part-way through this piece */
    }
    if (!f.on) {
      if (p1 >= 1) { const rest = (p1 - 1) / (dph || 1e-9); f.on = true; f.fresh = true; f.x = tx - mx * rest; f.z = tz - mz * rest; continue; }   /* it is put down part-way through this piece */
      const t = sat((p1 - b) / (1 - b)), t2 = t * t, t3 = t2 * t, h0 = 2 * t3 - 3 * t2 + 1, h1 = t3 - 2 * t2 + t, h2 = -2 * t3 + 3 * t2, h3 = t3 - t2;
      f.x = h0 * f.sx + h2 * tx - (h1 + h3) * ux * M; f.z = h0 * f.sz + h2 * tz - (h1 + h3) * uz * M;   /* leaves the ground and meets it again at ground speed */
    }
  }
  g.ph = frac(g.ph + dph);
}
// The pose for this instant of the stride. Fills SD (limb directions), SX (pelvis, chest, head) and SO (where the hips are relative to standing).
// carry: 0 = arms free, 1 = both hands busy with a load (the chest turns less). g.slope = how steeply the ground rises the way he faces (radians).
export const SD = RIG.map(n => AIM_AT[n] ? [0, 0, 0] : null), SX = { tip: 0, roll: 0, yaw: 0, twist: 0, look: 0, nod: 0 }, SO = new THREE.Vector3();
const _ank = [new THREE.Vector3(), new THREE.Vector3()], _def = [0, 0], _th = [0, 0], _lift = [0, 0];
export function stridePose(rig, g, carry, dt) {
  const r = g.run, v = g.v, amp = sat(v / 1.3), ph = g.ph, b = g.beta, TAU = Math.PI * 2, slope = g.slope;
  const c0 = Math.cos(TAU * ph);                    /* +1 as the left foot lands, -1 as the right foot lands */
  const c1 = Math.cos(TAU * (ph - b / 2));          /* +1 with the weight over the left foot, -1 over the right */
  const c0late = Math.cos(TAU * (ph - 0.07));       /* the same swing a little later: forearms and hands trail the upper arms */
  // pelvis and chest: lean into it (and into a hill), hip forward with its leg, chest and shoulders the other way, weight over the standing foot
  // (he also leans into speeding up and back against slowing down, and shifts his weight from foot to foot when standing about)
  const push = Math.max(-0.1, Math.min(0.12, 0.028 * g.acc)), idle = 1 - sat(v / 0.35), sway = idle * Math.sin(g.clock * 0.55 + 0.6 * Math.sin(g.clock * 0.21));
  const lean = 0.04 + (0.05 + 0.15 * r) * amp + 0.35 * slope * amp + 0.6 * push;
  SX.tip = (0.03 + 0.08 * r) * amp + 0.2 * slope * amp + 0.4 * push; SX.yaw = -(0.09 + 0.03 * r) * amp * c0; SX.roll = (0.04 - 0.015 * r) * amp * c1 + 0.012 * sway;
  SX.twist = (0.10 + 0.07 * r) * amp * c0 * (1 - 0.6 * carry);
  SX.look = -0.9 * (SX.yaw + SX.twist) + Math.max(-0.5, Math.min(0.5, -0.22 * g.turn));     /* the head stays on where he is going, and leads into a turn */
  SX.nod = -0.55 * (SX.tip + lean);
  SO.x = (0.022 - 0.012 * r) * amp * c1 + 0.016 * sway; SO.z = 0;
  _kh.multiplyQuaternions(rig.rootQ, rig.rel[0]).premultiply(_k1.setFromAxisAngle(AXX, SX.tip)).premultiply(_k1.setFromAxisAngle(AXZ, SX.roll)).premultiply(_k1.setFromAxisAngle(AXY, SX.yaw));
  // feet: heel down first, flat, heel up, toe off, then the swing with the knee lifted (a run kicks the heel up behind)
  const reach = rig.leg * 0.985, offA = (0.55 + 0.30 * r) * amp, strikeA = (0.28 - 0.22 * r) * amp;
  const top = mix(rig.ankH + rig.leg * 0.968, rig.ankH + rig.leg * (0.95 - 0.045 * sat((v - 2.2) / 2.2)) - (0.02 + 0.02 * sat((v - 2.2) / 2)) * amp * Math.cos(2 * TAU * (ph - b / 2)), r);   /* hip height when nothing pulls it down; a run sinks over the standing foot and rises in the air */
  for (let k = 0; k < 2; k++) {
    const f = g.feet[k], side = k ? -1 : 1, pf = frac(ph + k * 0.5);
    let th, lift = 0, pull;
    if (f.on) { const u = sat(pf / b), up = ease((u - 0.5) / 0.5); th = offA * up - strikeA * (1 - ease(u / 0.16)); pull = 1 - up; }
    else {
      const s = sat((pf - b) / (1 - b)), bump = Math.sin(Math.PI * Math.pow(s, 0.8));
      th = mix(offA, -strikeA, ease(s)) + (0.10 + 0.60 * r) * amp * bump * (1 - s) * 2;
      lift = Math.max((0.04 + (0.20 + 0.04 * Math.max(0, v - 3.2)) * r) * amp, 0.035 * sat((f.far || 0) / 0.12)) * bump; pull = ease((s - 0.4) / 0.6);   /* even a small step to settle the feet is lifted, not slid */
    }
    th -= slope; _th[k] = th; _lift[k] = lift;            /* on a slope the whole foot lies along the ground */
    const tp = Math.max(th, -slope), A = _ank[k];         /* heel up: the foot turns about its ball; toes up: about the ankle */
    A.set(f.x, f.gy + rig.ballH + lift + rig.fz * Math.sin(tp) + rig.ay * Math.cos(tp), f.z - (rig.fz * Math.cos(tp) - rig.ay * Math.sin(tp)));
    const fd = SD[k ? J.RightFoot : J.LeftFoot]; fd[0] = 0; fd[1] = -rig.fz * Math.sin(th) - rig.ay * Math.cos(th); fd[2] = rig.fz * Math.cos(th) - rig.ay * Math.sin(th);
    const d = Math.min(0.62 * reach, Math.hypot(A.x - (SO.x + side * rig.hipW), A.z - rig.hipZ)), most = A.y + Math.sqrt(reach * reach - d * d);   /* (a foot far out of reach does not drag the hips to the ground: the heel lifts instead) */
    const need = top - most; _def[k] = pull * 0.5 * (need + Math.sqrt(need * need + 0.0009));             /* how far the hips must come down for this leg to reach its foot */
  }
  // The hips have weight: they cannot change direction in an instant the way the sums above can when a foot lands. They chase the
  // height worked out above; the legs below are then fitted to wherever the hips really are, so the feet stay exactly on their spots.
  const most = 0.13 * rig.leg, want = top - most * Math.tanh(Math.hypot(_def[0], _def[1]) / most) - rig.hipY;   /* (the hips give by a hand's breadth at most) */
  if (!g.hyOk || !(dt > 0)) { g.hy.x = want; g.hy.v = 0; g.hyOk = true; }
  else { const rate = (want - g.hy0) / dt; chase(g.hy, g.hy0, want, stiff(0.05), dt, 1); if (g.hy.x > want + 0.035) { g.hy.x = want + 0.035; if (g.hy.v > rate) g.hy.v = rate; } }
  g.hy0 = want;   /* (but never so high that a standing leg cannot reach the ground: a raised heel takes up the last 3 cm) */
  SO.y = g.hy.x;
  // legs: thigh and shin worked out so the ankle is exactly where the foot is, knee forward, never quite straight
  for (let k = 0; k < 2; k++) {
    const side = k ? -1 : 1, iU = k ? J.RightUpLeg : J.LeftUpLeg, hipJ = _m1.copy(rig.off[iU]).applyQuaternion(_kh).add(rig.hipP).add(SO);
    const A = _ank[k], f = g.feet[k], fd = SD[iU + 2], far = rig.leg * 0.992;
    if (A.distanceTo(hipJ) > far) {
      // The leg is at full stretch: the heel comes up further while the ball of the foot stays put. The ankle swings on a circle about
      // the ball of the foot; take the point of that circle the leg can just reach, or the nearest one if it cannot reach at all.
      const By = f.gy + rig.ballH + _lift[k], rho = Math.hypot(rig.fz, rig.ay), phi = Math.atan2(rig.ay, rig.fz), lo = Math.max(_th[k], -slope);
      const hy = hipJ.y - By, hz = hipJ.z - f.z, hh = Math.hypot(hy, hz) || 1e-6, dx = hipJ.x - f.x, R2 = far * far - dx * dx, kc = (rho * rho + hh * hh - R2) / (2 * rho * hh);
      const toHip = Math.atan2(hy, -hz), open = kc >= 1 ? 0 : Math.acos(Math.max(-1, kc));
      let t = wrapPi(toHip - open - phi - lo) + lo; if (t < lo) t = wrapPi(toHip + open - phi - lo) + lo; t = Math.max(lo, Math.min(lo + 1.5, t));
      A.y = By + rig.fz * Math.sin(t) + rig.ay * Math.cos(t); A.z = f.z - (rig.fz * Math.cos(t) - rig.ay * Math.sin(t));
      fd[1] = -rig.fz * Math.sin(t) - rig.ay * Math.cos(t); fd[2] = rig.fz * Math.cos(t) - rig.ay * Math.sin(t);
    }
    const D = _m2.copy(A).sub(hipJ), len = D.length() || 1e-6, dist = Math.min(len, far), L1 = rig.thigh, L2 = rig.shin; D.divideScalar(len);
    const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), out = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const P = _m3.set(side * 0.12, 0, 1); P.addScaledVector(D, -P.dot(D)).normalize();
    const ku = SD[iU], kl = SD[iU + 1];
    ku[0] = D.x * along + P.x * out; ku[1] = D.y * along + P.y * out; ku[2] = D.z * along + P.z * out;
    kl[0] = D.x * dist - ku[0]; kl[1] = D.y * dist - ku[1]; kl[2] = D.z * dist - ku[2];
  }
  // back: leaning into a run; head kept up
  const sp = SD[J.Spine], s1 = SD[J.Spine1], s2 = SD[J.Spine2], nk = SD[J.Neck];
  sp[0] = 0; sp[1] = 1; sp[2] = lean * 0.8; s1[0] = 0; s1[1] = 1; s1[2] = lean; s2[0] = 0; s2[1] = 1; s2[2] = lean * 1.05; nk[0] = 0; nk[1] = 1; nk[2] = 0.05 + lean * 0.25;
  // arms: each swings from the shoulder, forward with the opposite leg; the elbow is loose in a walk and bent square in a run
  const swing = (0.36 + 0.34 * r) * amp, hang = -0.02 - 0.2 * r * amp;
  for (let k = 0; k < 2; k++) {
    const side = k ? -1 : 1, sg = k ? 1 : -1, a = hang + swing * c0 * sg, af = hang + swing * c0late * sg;
    const bend = 0.30 + 1.1 * r * amp + 0.3 * Math.max(0, (af - hang) / (swing + 1e-6)) * amp, ua = SD[k ? J.RightArm : J.LeftArm], fa = SD[k ? J.RightForeArm : J.LeftForeArm];
    ua[0] = side * 0.17; ua[1] = -Math.cos(a); ua[2] = Math.sin(a);
    fa[0] = -side * (0.04 + 0.26 * r * amp); fa[1] = -Math.cos(af + bend); fa[2] = Math.sin(af + bend);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Recorded movements. If the owner supplies motion-capture clips for this skeleton (for example from Mixamo: walk, run,
// kneel, go prone), a clip can take the place of a worked-out pose. `readClip` turns a clip (the 3D library's
// AnimationClip, or anything with tracks named "<bone>.quaternion" holding times and values) into a table for this
// skeleton; `clipPose` fills `out` with the joint turns at time t (seconds, wrapped if the clip loops).
// In TeamView, set TeamView.CLIPS.walk / .run to such a table and the stride pose is taken from the clip, played at the
// rate the ground is covered: one loop of the clip = one full stride of two steps, left foot landing at the start.
// Give the table a `stride` (metres of ground one loop covers at its natural speed) and the stride length follows the clip,
// so its feet meet the ground at the speed the ground goes by. What is NOT done yet: the clip's legs are used as recorded
// (no correction of each foot onto its exact footprint, so a clip played far from its natural speed will slide a little),
// and the hips' recorded up-and-down track is not read (the worked-out hip height is used). Timelines (kneel, lie down, get up)
// could take clips the same way: a key in a timeline is just a table of joint turns.
// ---------------------------------------------------------------------------------------------------------------------
export function readClip(clip, names) {
  const nm = names || (n => n.replace(/^mixamorig:?/, '')), tracks = RIG.map(() => null); let dur = clip.duration || 0;
  for (const t of clip.tracks || []) {
    const dot = t.name.lastIndexOf('.'), j = J[nm(t.name.slice(0, dot))]; if (j == null || t.name.slice(dot + 1) !== 'quaternion') continue;
    tracks[j] = { times: t.times, values: t.values }; dur = Math.max(dur, t.times[t.times.length - 1]);
  }
  return { tracks, duration: dur, loop: clip.loop !== false };
}
export function clipPose(table, rig, t, out) {
  const T = table.duration || 1; t = table.loop ? ((t % T) + T) % T : Math.max(0, Math.min(T, t));
  for (let j = 0; j < NJ; j++) {
    const tr = table.tracks[j]; if (!tr) { out[j].copy(rig.rel[j]); continue; }
    const ts = tr.times, n = ts.length; let i = 1; while (i < n && ts[i] < t) i++;
    if (i >= n) { out[j].fromArray(tr.values, (n - 1) * 4); continue; }
    const u = (t - ts[i - 1]) / Math.max(1e-6, ts[i] - ts[i - 1]);
    out[j].fromArray(tr.values, (i - 1) * 4).slerp(_k1.fromArray(tr.values, i * 4), sat(u));
  }
}
