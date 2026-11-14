// The picture behind the title screen: a battle fought with the current setup, filmed by a small automatic director.
// It cuts between a slow turn around the vehicle, a view from behind it, a low view from the front quarter, and a ride
// with a missile or drone while one is in the air.
//
// Everything here is a function of elapsed time (seconds), never of the number of frames, so it looks the same at 30 and
// at 240 frames a second. Two of the shots (behind the vehicle, riding the missile) are the ordinary camera modes of
// src/render/cameras.js, which smooth with exponentials of the frame time and are frame-rate independent for the same reason.
//
// Nothing here touches the battle: it only moves the camera.

const SHOTS = [
  { key: 'turn', secs: 16, name: 'turning around the vehicle' },
  { key: 'behind', secs: 11, name: 'behind the vehicle', mode: 'chase' },
  { key: 'low', secs: 12, name: 'low, from the front quarter' },
];
const MISSILE = { key: 'missile', secs: 9, name: 'riding the incoming missile', mode: 'missile' };
const RAD = Math.PI / 180;

export class TitleShow {
  // scene: Scene3D, cams: Cameras
  constructor(scene, cams) {
    this.s = scene; this.cams = cams;
    this.side = 0.17;            // radians the camera is turned to the left, so the vehicle sits to the right of the menu
    this.reset();
  }
  reset() {
    this.t = 0;                  // seconds this show has been running
    this.i = 0;                  // which of SHOTS is on
    this.shot = SHOTS[0];
    this.shotT = 0;              // seconds into the current shot
    this.lastMissile = -99;      // when the last missile ride ended
    this.noMissile = 0;          // seconds without anything in the air while riding
    this.cams.mode = 'free';     // the ordinary cameras stay out of it until a shot asks for one
  }
  name() { return this.shot.name; }

  _cut(shot) {
    this.shot = shot; this.shotT = 0; this.noMissile = 0;
    if (shot.mode) this.cams.set(shot.mode); else this.cams.mode = 'free';
  }
  _next() { this.i = (this.i + 1) % SHOTS.length; this._cut(SHOTS[this.i]); }

  // One step of the show. dt: seconds since the last step. ctx: the camera context of the frame loop
  // ({ tank: { e, n, h }, missiles: [...] , ... }). moving: false freezes the director on a still picture.
  update(dt, ctx, moving) {
    const S = this.s, cam = S.camera, W = S.world, T = ctx.tank;
    if (moving) {
      this.t += dt; this.shotT += dt;
      const flying = ctx.missiles.length > 0;
      if (this.shot === MISSILE) {
        this.noMissile = flying ? 0 : this.noMissile + dt;
        if (this.noMissile > 1.2 || this.shotT > MISSILE.secs) { this.lastMissile = this.t; this._next(); }
      } else if (flying && this.shotT > 2.5 && this.t - this.lastMissile > 14) this._cut(MISSILE);
      else if (this.shotT > this.shot.secs) this._next();
    }
    const tp = S.at(T.e, T.n, 0), k = this.shot.key;
    if (this.shot.mode) this.cams.update(dt, ctx);
    else {
      let e, n, up, fov = 45;
      if (k === 'turn') {
        const a = 0.9 + this.t * 0.06, r = 40 + 8 * Math.sin(this.t * 0.05);
        e = T.e + Math.sin(a) * r; n = T.n + Math.cos(a) * r; up = 9 + 3 * Math.sin(this.t * 0.04);
      } else {   // low, ahead and to one side of the hull, sliding slowly across the front
        const h = T.h * RAD, f = 15, side = -9 + this.shotT * 1.1;
        e = T.e + Math.sin(h) * f + Math.cos(h) * side; n = T.n + Math.cos(h) * f - Math.sin(h) * side; up = 1.7; fov = 38;
      }
      cam.up.set(0, 1, 0);
      cam.position.set(e, Math.max(W.h(e, n) + 1.2, W.h(T.e, T.n) + up), -n);
      cam.lookAt(tp.x, tp.y + 2, tp.z);
      if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    }
    cam.rotateY(this.side);
  }
}
