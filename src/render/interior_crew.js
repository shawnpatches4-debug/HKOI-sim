// PROPOSAL ONLY, OFF BY DEFAULT. Crew figures are parked by the owner ("skip implementing crew for now"; the crewman model is not to
// be used without showing him a picture first). This file is loaded only when the page address carries crew=1, to make such
// pictures: it sits the supplied crewman in the four seats of the interior. Nothing else in the simulator uses it.
//
// Known limits of this trial: the figures are lit by the outside sun and sky, not by the interior lamps; hands do not hold the
// controls; the figure whose seat the viewer has taken is hidden. About 84,000 triangles a figure: far too heavy to ship as is.
import * as THREE from 'three';
import { crewFigure } from './units.js';
import { SHARED } from './interior_parts.js';
import { DIM } from './interior_build.js';

const B = n => 'CC_Base_' + n;
// which way each part of the body points, in the figure's own frame: x to his left, y up, z the way he faces
const SIT = { spine: [0, 1, -0.1], thigh: [0.14, -0.12, 1], calf: [0, -1, 0.22], upper: [0.22, -0.85, 0.45], fore: [-0.12, -0.15, 1] };
const POSES = {
  in_gnr: { at: [0.66, -0.5, -0.56], yaw: 0, pose: { ...SIT, spine: [0, 1, 0.12], upper: [0.2, -0.7, 0.7], fore: [-0.15, 0.1, 1] } },
  in_cdr: { at: [DIM.CUP[0], -0.24, DIM.CUP[1] + 0.2], yaw: 0, pose: SIT },
  in_ldr: { at: [-0.84, -0.3, 0.5], yaw: 55, pose: { ...SIT, upper: [0.3, -0.9, 0.2], fore: [-0.1, -0.5, 0.9] } },
  in_drv: { hull: true, at: [0, DIM.HF + 0.36, DIM.DZ + 0.5], yaw: 0, pose: { spine: [0, 0.72, -0.7], thigh: [0.12, 0.15, 1], calf: [0, -0.45, 0.9], upper: [0.2, -0.5, 0.85], fore: [-0.15, 0.25, 1] } },
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();

function pose(g, P) {
  const bone = {}; g.traverse(o => { if (o.isBone) bone[o.name] = o; }); g.updateMatrixWorld(true);
  const turn = (bn, cn, d, side) => { const b = bone[B(bn)], c = bone[B(cn)]; if (!b || !c || !d) return; b.getWorldPosition(_a); c.getWorldPosition(_b); _b.sub(_a).normalize(); _w.set(d[0] * side, d[1], d[2]).normalize(); _q.setFromUnitVectors(_b, _w); b.getWorldQuaternion(_wq); b.parent.getWorldQuaternion(_pq); b.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq))); b.updateMatrixWorld(true); };
  turn('Waist', 'Spine01', P.spine, 1); turn('Spine01', 'Spine02', P.spine, 1); turn('Spine02', 'Head', [0, 1, 0.05], 1);
  for (const [s, k] of [['L', 1], ['R', -1]]) { turn(s + '_Thigh', s + '_Calf', P.thigh, k); turn(s + '_Calf', s + '_Foot', P.calf, k); turn(s + '_Upperarm', s + '_Forearm', P.upper, k); turn(s + '_Forearm', s + '_Hand', P.fore, k); }
  const hip = bone[B('Hip')] || bone[B('Pelvis')]; return hip ? hip.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0.95, 0);
}

// sit a figure in every seat. interior: the Interior (already built); base: the asset folder. Returns the list of { key, group }.
export async function seatCrew(interior, base) {
  const out = [];
  for (const [key, S] of Object.entries(POSES)) {
    const g = await crewFigure(base); if (!g) return out;
    const hip = pose(g, S.pose), seat = new THREE.Group(); seat.position.fromArray(S.at); seat.rotation.y = Math.PI - S.yaw * Math.PI / 180;   /* the figure faces +z; the interior's "forward" is -z */
    g.position.copy(hip).multiplyScalar(-1); seat.add(g);
    g.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = false; for (const m of [].concat(o.material)) { if (!m || m.userData.cabDepth) continue; m.userData.cabDepth = true;
      // drawn with the interior's own depth packing, so the outside model cannot cover the figure and the interior cannot draw through it
      m.onBeforeCompile = sh => { sh.uniforms.uInside = SHARED.uInside; sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uInside;\nvoid main() {').replace('#include <project_vertex>', '#include <project_vertex>\n  if (uInside > 0.5) { float zv = -mvPosition.z; gl_Position.z = -zv + 2.0 * 0.02 * (zv - 0.03) * 40.0 / (40.0 - 0.03); }'); }; m.needsUpdate = true; } });
    (S.hull ? interior.hul : interior.tur).add(seat); out.push({ key, group: seat });
  }
  return out;
}
