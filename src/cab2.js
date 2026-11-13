  // ================================================================ Abrams turret interior, rebuilt from reference photos and cutaways
  // Frame: metres, origin at the turret ring centre on the ring plane, x right, y up, -z toward the muzzle.
  // Gunner forward-right of the gun at his primary sight; commander behind and above him on the raised seat under the cupola;
  // loader standing on the left of the breech; the ready rounds behind a sliding blast door in the bustle; the driver reclined in the hull.
  // Bone axes of the Rocketbox rigs (measured): Spine1/Head x = twist (head + = left), z = bend forward/down, y = side bend;
  // UpperArm z - = raise forward, y = raise sideways (right arm +, left arm -), Forearm z - = bend elbow; Thigh z + = raise knee, Calf z - = bend knee.
  const RIG = (src) => { const m = THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(src) : src, B = {}, rest = {}; m.traverse(o => { if (o.isBone) B[o.name.replace(/^Bip01_/, '')] = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    for (const k in B) rest[k] = B[k].quaternion.clone(); return { m, B, rest, cur: {} }; };
  const qX = new THREE.Quaternion(), qY = new THREE.Quaternion(), qZ = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
  function applyPose(r, P) { for (const k in r.rest) { const b = r.B[k], p = P[k]; b.quaternion.copy(r.rest[k]); if (!p) continue; qZ.setFromAxisAngle(AZ, (p[2] || 0) * DEG); qY.setFromAxisAngle(AY, (p[1] || 0) * DEG); qX.setFromAxisAngle(AX, (p[0] || 0) * DEG); b.quaternion.multiply(qZ).multiply(qY).multiply(qX); } }
  // pose library, degrees [x, y, z] per bone, layered: legs, torso, arms, head
  const PL = {
    seat: { L_Thigh: [0, 0, 90], R_Thigh: [0, 0, 90], L_Calf: [0, 0, -90], R_Calf: [0, 0, -90] },
    seatHigh: { L_Thigh: [0, 0, 78], R_Thigh: [0, 0, 82], L_Calf: [0, 0, -100], R_Calf: [0, 0, -85] },
    stand: { L_Thigh: [0, 0, 4], R_Thigh: [0, 0, -2], L_Calf: [0, 0, -6], R_Calf: [0, 0, -3] },
    crouch: { L_Thigh: [0, 0, 75], R_Thigh: [0, 0, 70], L_Calf: [0, 0, -110], R_Calf: [0, 0, -105] },
    recline: { L_Thigh: [0, 0, 55], R_Thigh: [0, 0, 55], L_Calf: [0, 0, -35], R_Calf: [0, 0, -40], Spine: [0, 0, -30] },
    armsDown: { L_UpperArm: [0, 48, -8], R_UpperArm: [0, -48, -8], L_Forearm: [0, 0, -12], R_Forearm: [0, 0, -12] },
    yoke: { L_UpperArm: [0, 30, -58], R_UpperArm: [0, -30, -58], L_Forearm: [0, 0, -55], R_Forearm: [0, 0, -55] },
    handle: { L_UpperArm: [0, 30, -35], R_UpperArm: [0, -25, -48], L_Forearm: [0, 0, -75], R_Forearm: [0, 0, -65] },
    overhead: { L_UpperArm: [0, 10, -150], R_UpperArm: [0, -45, -10], L_Forearm: [0, 0, -30], R_Forearm: [0, 0, -15] },
    scope: { L_UpperArm: [0, 15, -130], R_UpperArm: [0, -15, -130], L_Forearm: [0, 0, -70], R_Forearm: [0, 0, -70] },
    point: { L_UpperArm: [0, 30, -35], R_UpperArm: [0, -20, -100], L_Forearm: [0, 0, -75], R_Forearm: [0, 0, -12] },
    guard: { L_UpperArm: [0, 10, -125], R_UpperArm: [0, -10, -125], L_Forearm: [0, 0, -115], R_Forearm: [0, 0, -115] },
    climb: { L_UpperArm: [0, 5, -170], R_UpperArm: [0, -5, -165], L_Forearm: [0, 0, -20], R_Forearm: [0, 0, -25] },
    tbar: { L_UpperArm: [0, 25, -40], R_UpperArm: [0, -25, -40], L_Forearm: [0, 0, -35], R_Forearm: [0, 0, -35] },
    slump: { L_UpperArm: [0, 40, -15], R_UpperArm: [0, -38, -20], L_Forearm: [0, 0, -10], R_Forearm: [0, 0, -8] },
  };
  const merge = (...ps) => { const o = {}; for (const p of ps) for (const k in p) o[k] = p[k].slice(); return o; };
  const addB = (P, k, x, y, z) => { const p = P[k] || (P[k] = [0, 0, 0]); p[0] += x || 0; p[1] += y || 0; p[2] += z || 0; };
  function Cabin(R2) {
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(80, 16 / 9, .03, 60); sc.fog = new THREE.FogExp2(0x2a2420, 0); sc.background = new THREE.Color(0x0b0d0e);
    const gunRT = new THREE.WebGLRenderTarget(640, 400, { encoding: THREE.sRGBEncoding }), periRT = new THREE.WebGLRenderTarget(2048, 256, { encoding: THREE.sRGBEncoding }), drvRT = new THREE.WebGLRenderTarget(1024, 256, { encoding: THREE.sRGBEncoding });
    const FL = -.78, RF = 1.02;   // basket floor and turret roof
    // ---- materials: Abrams interior white, black recoil guard, olive and black boxes, red handles
    const paintT = canvasTex(256, 256, x => { const im = x.createImageData(256, 256), d = im.data; for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const o = (j * 256 + i) * 4, v = 228 + 18 * fbm(i * .05, j * .05, 4) - 50 * sst(.7, .95, fbm(i * .02 + 9, j * .02, 3)) - 12 * hsh(i, j); d[o] = v; d[o + 1] = v * .985; d[o + 2] = v * .93; d[o + 3] = 255; } x.putImageData(im, 0, 0); }, true);
    paintT.wrapS = paintT.wrapT = THREE.RepeatWrapping; paintT.repeat.set(2, 2);
    const S = (c, r, m, map) => new THREE.MeshStandardMaterial({ color: col(c), roughness: r == null ? .7 : r, metalness: m || 0, map: map || null });
    const cream = S(0xc3ccbd, .8, .05, paintT), creamD = S(0xa3ad9d, .84, .05, paintT), wallM = new THREE.MeshStandardMaterial({ color: col(0xb9c3b3), roughness: .9, map: paintT, side: THREE.DoubleSide, emissive: col(0x14170f) });
    const black = S(0x17181a, .55, .25), blackM = S(0x232527, .45, .5), olive = S(0x4f5640, .7, .15), steel = S(0x8b8f8d, .35, .85), gunm = S(0x3a3d3e, .4, .7), rubber = S(0x0e0e0e, .95, 0);
    const red = S(0xb3160f, .45, .2), yellow = S(0xd8ab2c, .55, .1), brass = S(0xb8913e, .32, .9), caseM = S(0x2b2c28, .7, .2), floorM = S(0x9c9a92, .5, .7);
    const P = (geo, mat, x, y, z, rx, ry, rz, parent) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = o.receiveShadow = true; (parent || sc).add(o); return o; };
    const scrMats = [], scrM = tex => { const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); scrMats.push(m); return m; };   // every display, so a hit can black them out together
    const B = (w, h, d, mat, x, y, z, rx, ry, rz, parent) => P(box(w, h, d), mat, x, y, z, rx, ry, rz, parent);
    const Cy = (r0, r1v, l, mat, x, y, z, rx, ry, rz, parent, seg) => P(cyl(r0, r1v, l, seg || 16), mat, x, y, z, rx, ry, rz, parent);
    const tube = (pts, r, mat, parent) => P(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V3(...p))), Math.max(8, pts.length * 6), r, 6), mat, 0, 0, 0, 0, 0, 0, parent);
    const lab = (txt, w, h, x, y, z, ry, parent, fg, bg) => { const tx = canvasTex(256, 64, c => { c.fillStyle = bg || '#e9e4d0'; c.fillRect(0, 0, 256, 64); c.fillStyle = fg || '#22231f'; c.font = '700 26px IBM Plex Mono, monospace'; c.fillText(txt, 10, 42); }, true); return P(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tx, roughness: .6 }), x, y, z, 0, ry || 0, 0, parent); };
    const roof = new THREE.Group(), upper = new THREE.Group(); sc.add(roof, upper);   // hidden in the cutaway view
    // ---- turret shell: plan outline, walls, roof with the two hatches, ring and basket
    const plan = [[-1.2, -1.6], [1.2, -1.6], [1.55, -.55], [1.55, 1.0], [-1.55, 1.0], [-1.55, -.55]];
    for (let i = 0; i < plan.length; i++) { const a = plan[i], b = plan[(i + 1) % plan.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const w = P(new THREE.PlaneGeometry(L, RF + .02), wallM, (a[0] + b[0]) / 2, RF / 2, (a[1] + b[1]) / 2, 0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0); if (i === 0 || i === 3) upper.add(w); }
    { const rs = new THREE.Shape(plan.map(p => new THREE.Vector2(p[0], -p[1]))); for (const [hx, hz, hr] of [[.7, .1, .43], [-.7, -.05, .37]]) { const h = new THREE.Path(); h.absarc(hx, -hz, hr, 0, Math.PI * 2, true); rs.holes.push(h); }
      const rg = new THREE.ShapeGeometry(rs, 24); rg.rotateX(-Math.PI / 2); const roofM = new THREE.MeshStandardMaterial({ color: col(0xb9c3b3), roughness: .9, map: paintT, side: THREE.DoubleSide, emissive: col(0x2a2436) }); roof.add(P(rg, roofM, 0, RF, 0));
      roof.add(P(new THREE.CircleGeometry(.37, 28), roofM, -.7, RF + .06, -.05, Math.PI / 2)); }   // loader's hatch, closed
    P(new THREE.TorusGeometry(1.12, .022, 6, 64), creamD, 0, -.02, 0, Math.PI / 2); P(new THREE.CircleGeometry(1.1, 48), floorM, 0, FL, 0, -Math.PI / 2);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; if (Math.abs(Math.sin(a)) < .3 && Math.cos(a) < 0) continue; B(.04, -FL, .04, creamD, Math.sin(a) * 1.08, FL / 2, -Math.cos(a) * 1.08); }   // basket guard posts
    // hull tub around the basket and the driver's compartment (seen in the cutaway)
    const hullM = S(0xdcd5c0, .8, .05, paintT); P(new THREE.PlaneGeometry(3.3, 6.4), hullM, 0, FL - .18, -.9, -Math.PI / 2);
    for (const sx of [-1, 1]) P(new THREE.PlaneGeometry(6.4, 1.0), hullM, sx * 1.65, FL + .3, -.9, 0, sx * Math.PI / 2);
    P(new THREE.PlaneGeometry(3.3, 1.0), hullM, 0, FL + .3, -4.1); upper.add(B(3.3, .04, 2.4, hullM, 0, .02, -2.85));   // hull roof over the driver
    // ---- main gun: trunnions, breech, recoil cylinders, the big black recoil guard (deflector), spent-case bag, coax MG
    const GY = .4; B(1.1, .26, .4, gunm, 0, GY - .25, -1.45); for (const sx of [-1, 1]) B(.1, .7, .55, creamD, sx * .55, GY, -1.4);
    B(.58, .52, 1.0, steel, 0, GY, -.95); B(.5, .44, .08, blackM, 0, GY, -.43); Cy(.025, .025, .34, steel, -.36, GY + .05, -.7, 0, 0, Math.PI / 2); Cy(.04, .04, .14, black, -.55, GY + .05, -.7);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) Cy(.065, .065, .9, gunm, sx * .2, GY + sy * .28, -1.05, Math.PI / 2);
    const guardM = S(0x1b1c1f, .5, .3); for (const sx of [-1, 1]) B(.035, .66, 1.5, guardM, sx * .42, GY - .12, .02);
    B(.88, .035, 1.5, guardM, 0, GY - .44, .02); B(.88, .5, .035, guardM, 0, GY - .2, .76); P(new THREE.CylinderGeometry(.44, .44, .66, 20, 1, true, 0, Math.PI), guardM, 0, GY - .12, .76, 0, Math.PI / 2, 0).scale.set(1, 1, .35);
    lab('5309', .14, .05, .44, GY - .05, .3, Math.PI / 2, null, '#e8e8e8', '#1b1c1f');
    P(new THREE.SphereGeometry(.16, 12, 8), S(0x5f5a44, 1), 0, GY - .5, .45).scale.set(1.3, .55, 1.4);
    const cx0 = .44; B(.13, .15, .8, black, cx0, GY + .05, -1.15); B(.24, .26, .32, olive, cx0 + .08, GY - .3, -1.0); tube([[cx0 + .08, GY - .17, -1.0], [cx0 + .05, GY - .05, -.95], [cx0, GY + .02, -.9]], .03, black);
    // ---- gunner's station: primary sight with browpad, Cadillacs, computer panel, seat
    const gx = .62; B(.42, .55, .5, cream, gx, GY + .3, -1.35); B(.3, .2, .22, cream, gx, GY + .2, -1.08); P(new THREE.TorusGeometry(.07, .028, 8, 18, Math.PI), rubber, gx, GY + .24, -.96);
    for (const sx of [-1, 1]) Cy(.032, .032, .08, black, gx + sx * .05, GY + .2, -.96, Math.PI / 2);
    const yoke = new THREE.Group(); yoke.position.set(gx, GY - .18, -.88); sc.add(yoke); B(.32, .05, .1, black, 0, 0, 0, 0, 0, 0, yoke); Cy(.04, .04, .22, steel, 0, -.12, -.05, 0, 0, 0, yoke);
    for (const sx of [-1, 1]) { Cy(.03, .034, .16, rubber, sx * .16, .06, 0, 0, 0, sx * -.3, yoke); B(.02, .02, .03, red, sx * .19, .15, -.01, 0, 0, 0, yoke); }
    const gcp = new THREE.Group(); gcp.position.set(1.12, GY + .05, -.95); gcp.rotation.y = -1.2; sc.add(gcp); B(.34, .26, .1, cream, 0, 0, 0, 0, 0, 0, gcp); B(.22, .09, .01, new THREE.MeshBasicMaterial({ color: 0x2a6b3c }), 0, .06, .051, 0, 0, 0, gcp); for (let i = 0; i < 8; i++) Cy(.01, .01, .015, black, -.12 + (i % 4) * .08, -.03 - Math.floor(i / 4) * .05, .052, Math.PI / 2, 0, 0, gcp, 8);
    B(.42, .06, .4, black, gx, -.3, -.66); B(.42, .46, .06, black, gx, -.06, -.44, -.12);
    // ---- commander's station: raised seat, gunner's sight extension, control handle, cupola with vision blocks, HKOI display and gun-camera screen
    const cxp = .72; Cy(.05, .05, .9, steel, cxp, -.33, .32); B(.44, .07, .42, black, cxp, .24, .28); B(.44, .5, .07, black, cxp, .52, .5, .12);
    Cy(.04, .04, .4, cream, .74, .45, -.72, Math.PI / 2 - .6); B(.12, .1, .12, cream, .74, .55, -.55); Cy(.03, .03, .05, black, .74, .57, -.48, Math.PI / 2);
    B(.12, .08, .16, black, 1.05, .45, -.05); Cy(.025, .028, .17, rubber, 1.05, .55, -.03, .15);
    roof.add(P(new THREE.CylinderGeometry(.44, .44, .3, 32, 1, true), wallM, .7, RF + .15, .1)); roof.add(P(new THREE.CircleGeometry(.44, 32), wallM, .7, RF + .3, .1, Math.PI / 2)); roof.add(P(new THREE.TorusGeometry(.44, .03, 8, 32), steel, .7, RF, .1, Math.PI / 2));
    // ---- optics. The outside is rendered as two 120-degree views (left and right of the turret's axis) side by side in periRT.
    // A device looking along bearing a (degrees from the turret axis) with a field of hf by vf degrees shows exactly that piece of it.
    const T60 = Math.tan(60 * DEG), TV = T60 / 4;   // each half is 1024 x 256: 120 degrees wide, about 47 high
    function slice(gm, a, hf, vf, pitch) { const h = a < 0 ? 0 : 1, c = h ? 60 : -60, f = x => (h + .5 + Math.tan(Math.max(-59, Math.min(59, x - c)) * DEG) / (2 * T60)) / 2, u0 = f(a - hf / 2), u1 = f(a + hf / 2), vc = .5 + Math.tan((pitch || 0) * DEG) / (2 * TV), dv = Math.tan(vf / 2 * DEG) / (2 * TV), uv = gm.attributes.uv;
      for (let k = 0; k < uv.count; k++) { uv.setX(k, uv.getX(k) < .5 ? u0 : u1); uv.setY(k, uv.getY(k) < .5 ? vc - dv : vc + dv); } uv.needsUpdate = true; return gm; }
    const glassM = () => new THREE.MeshBasicMaterial({ map: periRT.texture, toneMapped: false });
    // dirt and damage on the glass: a streaked film on every block, cracks on the ones facing a hit
    const dirtT = canvasTex(256, 96, x => { x.clearRect(0, 0, 256, 96); for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(${150 + r1(i, 3) * 60 | 0},${135 + r1(i, 4) * 50 | 0},${105 + r1(i, 5) * 40 | 0},${.03 + r1(i, 6) * .07})`; x.beginPath(); x.ellipse(r1(i, 1) * 256, r1(i, 2) * 96, 4 + r1(i, 7) * 26, 2 + r1(i, 8) * 9, r1(i, 9), 0, 7); x.fill(); } const g = x.createLinearGradient(0, 0, 0, 96); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(.25, 'rgba(0,0,0,0)'); g.addColorStop(.8, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.3)'); x.fillStyle = g; x.fillRect(0, 0, 256, 96); }, true);
    const crackT = canvasTex(256, 96, x => { x.clearRect(0, 0, 256, 96); x.fillStyle = 'rgba(210,220,225,.16)'; x.fillRect(0, 0, 256, 96); x.strokeStyle = 'rgba(235,245,250,.85)'; x.lineWidth = 1.2; for (let i = 0; i < 16; i++) { let px = 150, py = 40; x.beginPath(); x.moveTo(px, py); const a = i / 16 * 6.283; for (let k = 0; k < 7; k++) { px += Math.cos(a + (r1(i, k) - .5) * 1.1) * (8 + r1(i, k + 9) * 22); py += Math.sin(a + (r1(i, k + 3) - .5) * 1.1) * (5 + r1(i, k + 5) * 12); x.lineTo(px, py); } x.stroke(); } }, true);
    const optics = [];   // { film, crack, rel } so a hit can crack the blocks that face it
    function device(w, h, a, hf, vf, pitch, x, y, z, lx, ly, lz, par) { const gl = new THREE.Mesh(slice(new THREE.PlaneGeometry(w, h), a, hf, vf, pitch), glassM()); gl.position.set(x, y, z); gl.lookAt(lx, ly, lz); (par || roof).add(gl);
      const film = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: dirtT, transparent: true, depthWrite: false })); film.position.set(0, 0, .002); gl.add(film);
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: crackT, transparent: true, depthWrite: false })); crack.position.set(0, 0, .003); crack.visible = false; gl.add(crack); optics.push({ gl, crack, rel: a }); return gl; }
    // eight unity-power vision blocks round the cupola: each 30 degrees wide, 16 high
    const NB = 8; for (let i = 0; i < NB; i++) { const ad = -105 + i * 30, a = ad * DEG, cx0 = .7 + Math.sin(a) * .41, cz0 = .1 - Math.cos(a) * .41;
      device(.2, .085, ad, 30, 16, -3, cx0, RF + .19, cz0, .7, RF + .19, .1);
      const fr = new THREE.Mesh(box(.225, .11, .025), black); fr.position.set(.7 + Math.sin(a) * .428, RF + .19, .1 - Math.cos(a) * .428); fr.lookAt(.7, RF + .19, .1); roof.add(fr);
      const pad = new THREE.Mesh(box(.2, .02, .03), rubber); pad.position.set(.7 + Math.sin(a) * .395, RF + .245, .1 - Math.cos(a) * .395); pad.lookAt(.7, RF + .245, .1); roof.add(pad); }
    const panelTex = new THREE.CanvasTexture(document.createElement('canvas')); panelTex.encoding = THREE.sRGBEncoding;
    const pg = new THREE.Group(); pg.position.set(1.32, .78, -.12); pg.rotation.y = -1.35; sc.add(pg); B(.48, .34, .06, olive, 0, 0, -.032, 0, 0, 0, pg); P(new THREE.PlaneGeometry(.42, .27), scrM(panelTex), 0, .01, .002, 0, 0, 0, pg);
    lab('HKOI FIRE CONTROL', .22, .028, -.1, .16, .003, 0, pg, '#7ff0e6', '#27301f');
    const gg = new THREE.Group(); gg.position.set(1.36, .48, .3); gg.rotation.y = -1.45; sc.add(gg); B(.34, .24, .05, olive, 0, 0, -.026, 0, 0, 0, gg); P(new THREE.PlaneGeometry(.3, .19), scrM(gunRT.texture), 0, 0, .002, 0, 0, 0, gg);
    const lamp = P(new THREE.SphereGeometry(.02, 12, 8), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 0 }), 1.2, .98, -.3);
    // status display (mode, rounds, mount bearing)
    const stCv = document.createElement('canvas'); stCv.width = 512; stCv.height = 160; const stTex = new THREE.CanvasTexture(stCv); stTex.encoding = THREE.sRGBEncoding;
    const st = new THREE.Group(); st.position.set(1.4, .98, .45); st.rotation.y = -1.45; sc.add(st); B(.3, .11, .04, olive, 0, 0, -.021, 0, 0, 0, st); P(new THREE.PlaneGeometry(.27, .085), scrM(stTex), 0, 0, .002, 0, 0, 0, st);
    let stKey = ''; function setStatus(o) { const k = JSON.stringify(o); if (k === stKey) return; stKey = k; const x = stCv.getContext('2d'); x.fillStyle = '#020806'; x.fillRect(0, 0, 512, 160); x.font = '700 30px IBM Plex Mono, monospace';
      x.fillStyle = '#ffb020'; x.fillText('HKOI', 14, 40); x.fillStyle = o.arm ? '#ff4a3d' : '#3cff6a'; x.fillText(o.arm ? 'ENGAGING' : o.on ? 'READY' : 'OFF', 120, 40); x.fillStyle = '#7ff0e6'; x.font = '600 26px IBM Plex Mono, monospace';
      x.fillText(`OBS ${String(o.obs).padStart(3, ' ')}   HE ${String(o.he).padStart(3, ' ')}`, 14, 86); x.fillText(`AZ ${String(Math.round(((o.az % 360) + 360) % 360)).padStart(3, '0')}  TUR ${o.tur >= 0 ? '+' : ''}${Math.round(o.tur)}`, 14, 128); stTex.needsUpdate = true; }
    // ---- loader's side: periscope, hatch, knee switch, network box, radios, extinguisher, grab handles
    roof.add(P(new THREE.TorusGeometry(.38, .03, 8, 28), steel, -.7, RF, -.05, Math.PI / 2));
    const lpg = device(.19, .07, -20, 34, 13, -3, -.7, RF - .08, -.47, -.7, RF - .08, 0); roof.add(P(box(.22, .1, .12), black, -.7, RF - .08, -.53));
    for (const sx of [-1, 1]) roof.add(P(new THREE.TorusGeometry(.05, .012, 6, 12, Math.PI), yellow, -.7 + sx * .14, RF - .14, -.5, 0, 0, Math.PI));
    const nb = new THREE.Group(); nb.position.set(-1.5, .5, -.3); nb.rotation.y = Math.PI / 2; sc.add(nb); B(.42, .3, .1, olive, 0, 0, 0, 0, 0, 0, nb); lab('TURRET NETWORK BOX', .36, .04, 0, .11, .052, 0, nb, '#e8e4cf', '#3b4232'); for (let i = 0; i < 6; i++) Cy(.016, .016, .05, black, -.15 + i * .06, -.06, .06, Math.PI / 2, 0, 0, nb, 8);
    for (let k = 0; k < 2; k++) { const rb = new THREE.Group(); rb.position.set(-1.48, .2 - k * .32, .55); rb.rotation.y = Math.PI / 2; sc.add(rb); B(.38, .26, .3, olive, 0, 0, 0, 0, 0, 0, rb); for (let i = 0; i < 5; i++) Cy(.012, .012, .02, black, -.12 + i * .05, .05, .16, Math.PI / 2, 0, 0, rb, 8); }
    Cy(.065, .065, .5, red, -1.35, -.5, -.85); Cy(.02, .02, .1, steel, -1.35, -.2, -.85); B(.06, .14, .04, red, -1.32, -.12, -.83);
    B(.16, .1, .14, yellow, -.45, FL + .06, .7); B(.12, .03, .1, black, -.45, FL + .12, .7);   // knee switch
    for (const [x, z] of [[-.2, -.9], [.2, .55], [-1.0, .6]]) roof.add(P(new THREE.TorusGeometry(.06, .012, 6, 12, Math.PI), yellow, x, RF - .015, z, Math.PI / 2));
    for (let i = 0; i < 5; i++) { const pts = []; for (let k = 0; k <= 8; k++) pts.push([-1.53, RF - .08 - i * .035 + Math.sin(k * 1.7 + i) * .01, -1.3 + k * .3]); tube(pts, .008 + (i % 2) * .003, i % 3 ? black : S(0x3a3a34, .6, .3)); }
    for (let i = 0; i < 4; i++) { const pts = []; for (let k = 0; k <= 8; k++) pts.push([1.53, RF - .1 - i * .035 + Math.sin(k * 1.3 + i) * .01, -1.2 + k * .28]); tube(pts, .009, black); }
    lab('MIN LEVEL', .2, .04, -1.535, .78, -.9, Math.PI / 2, null, '#2b2b26', '#d8d0b6');
    // ---- the bustle: blast door and 18 ready rounds
    const bz = 1.0; B(3.1, .35, .04, cream, 0, .9, bz); B(3.1, .1, .04, cream, 0, .05, bz); for (const sx of [-1, 1]) B(.6, .9, .04, cream, sx * 1.25, .45, bz);
    const door = B(1.9, .74, .04, steel, 0, .47, bz - .03); for (let i = 0; i < 6; i++) B(1.86, .012, .02, gunm, 0, .17 + i * .12, bz - .06, 0, 0, 0, door).position.set(0, -.3 + i * .12, -.03);
    lab('KEEP DOOR CLOSED', .3, .05, 0, .2, -.025, Math.PI, door, '#fff', '#b3160f');
    B(3.1, 1.0, .04, creamD, 0, .45, bz + 1.15); B(3.1, .04, 1.15, creamD, 0, -.05, bz + .58); upper.add(B(3.1, .04, 1.15, creamD, 0, .95, bz + .58));
    const rounds = new THREE.Group(); sc.add(rounds);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) { const x = -.84 + i * .21, y = .28 + r * .34; Cy(.06, .06, .98, caseM, x, y, bz + .62, Math.PI / 2, 0, 0, rounds, 14); Cy(.066, .066, .03, brass, x, y, bz + .12, Math.PI / 2, 0, 0, rounds, 14); Cy(.018, .018, .01, steel, x, y, bz + .1, Math.PI / 2, 0, 0, rounds, 10); }
    // ---- driver's compartment (hull front): reclined seat, T-bar, instrument panel
    const dz = -2.75; B(.5, .08, .5, black, 0, FL + .25, dz + .2, -.2); B(.5, .55, .08, black, 0, FL + .45, dz + .55, -.95); const tbarG = new THREE.Group(); tbarG.position.set(0, FL + .47, dz - .55); sc.add(tbarG); B(.44, .045, .06, black, 0, 0, 0, 0, 0, 0, tbarG); for (const sx of [-1, 1]) Cy(.024, .024, .15, rubber, sx * .27, 0, 0, 0, 0, Math.PI / 2, tbarG);
    const tcol = Cy(.028, .028, 1, steel, 0, 0, 0); const tbase = V3(0, FL + .12, dz - .62);
    // the driver's three periscopes, and his display below them
    for (let i = 0; i < 3; i++) { const gm = new THREE.PlaneGeometry(.3, .095), uv = gm.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3); uv.needsUpdate = true; const x = (i - 1) * .34, gl = new THREE.Mesh(gm, new THREE.MeshBasicMaterial({ map: drvRT.texture, toneMapped: false })); gl.position.set(x, FL + .74, dz - .22 + Math.abs(i - 1) * .06); gl.rotation.y = -(i - 1) * .32; sc.add(gl);
      const fr = B(.34, .14, .1, black, x, FL + .74, dz - .28 + Math.abs(i - 1) * .06, 0, -(i - 1) * .32, 0); fr.position.z -= .02; }
    upper.add(B(1.3, .04, .7, hullM, 0, FL + .86, dz - .1));   // hull roof right above his head
    const drvCv = document.createElement('canvas'); drvCv.width = 512; drvCv.height = 200; const drvTex = new THREE.CanvasTexture(drvCv); drvTex.encoding = THREE.sRGBEncoding;
    P(new THREE.PlaneGeometry(.36, .14), scrM(drvTex), 0, FL + .5, dz - .5, -.5);
    let drvKey = ''; function drvPanel(sp, hd, gear, warn) { const k = sp.toFixed(0) + '|' + hd.toFixed(0) + gear + warn; if (k === drvKey) return; drvKey = k; const x = drvCv.getContext('2d'); x.fillStyle = '#020806'; x.fillRect(0, 0, 512, 200); x.fillStyle = '#7ff0e6'; x.font = '700 64px IBM Plex Mono, monospace'; x.fillText(String(Math.round(sp * 3.6)).padStart(2, ' '), 20, 90); x.font = '600 26px IBM Plex Mono, monospace'; x.fillText('km/h', 110, 90); x.fillText('HDG ' + String(Math.round(((hd % 360) + 360) % 360)).padStart(3, '0'), 250, 60); x.fillText('GEAR ' + gear, 250, 100); x.fillStyle = warn ? '#ff4a3d' : '#3cff6a'; x.fillText(warn ? 'MISSILE WARNING' : 'NO WARNING', 20, 160); drvTex.needsUpdate = true; }
    const dp = B(.7, .2, .06, olive, 0, FL + .34, dz - .62, -.5); lab('DRIVER', .2, .04, 0, .06, .032, 0, dp, '#e8e4cf', '#3b4232');
    // ---- lights: two white dome lights; combat red under panic; the HKOI screen's glow
    const hemi = new THREE.HemisphereLight(0xeef4ee, 0x3e443a, .5), dome = new THREE.PointLight(0xfff0d8, 1.9, 5.5, 1.8), dome2 = new THREE.PointLight(0xfff0d8, 1.4, 4.5, 1.8), red2 = new THREE.PointLight(0xff2a1a, 0, 6, 2), glow = new THREE.PointLight(0x5ef0e0, .45, 1.6, 2), fire = new THREE.PointLight(0xff7a2a, 0, 6, 2);
    dome.position.set(.3, RF - .1, .5); dome2.position.set(-.6, RF - .1, -.7); red2.position.set(0, .6, 0); glow.position.set(1.1, .8, -.1); fire.position.set(0, .3, .3); sc.add(hemi, dome, dome2, red2, glow, fire);
    const domes = []; for (const [x, z] of [[.3, .5], [-.6, -.7]]) { roof.add(P(box(.16, .03, .1), cream, x, RF - .015, z)); const dm = P(new THREE.PlaneGeometry(.12, .06), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff1d6, emissiveIntensity: 2 }), x, RF - .032, z, Math.PI / 2); roof.add(dm); domes.push(dm); }
    let camC = cam; const sp = Parts(500, true, glowTex(), () => camC), sm = Parts(400, false, puffTex(), () => camC); sc.add(sp.mesh, sm.mesh);
    sm.m.uniforms.sunC.value.setRGB(.6, .5, .4); sm.m.uniforms.amb.value.setRGB(.5, .45, .4); sm.m.uniforms.fogC.value.set(0x2a2420);
    // ---- the crew
    // ================================================================ interior detail: stencils, weld seams, floor plate, switch panels, intercom boxes, warning lamps, the driver's hole
    const sten = (txt, w, x, y, z, ry, colr, par) => { const tx = canvasTex(512, 64, c => { c.clearRect(0, 0, 512, 64); c.fillStyle = colr || '#2a2b26'; c.font = '700 34px IBM Plex Mono, monospace'; c.textBaseline = 'middle'; c.fillText(txt, 6, 34); }, true); const m = P(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, opacity: .82 }), x, y, z, 0, ry || 0, 0, par); return m; };
    sten('CAUTION  RECOIL PATH', .5, 0, GY + .5, .775, Math.PI, '#d8ab2c'); sten('KEEP CLEAR OF BREECH', .46, -.438, GY + .12, .05, -Math.PI / 2, '#d8ab2c');
    sten('TURRET TRAVERSE LOCK', .34, -1.535, .3, -.95, Math.PI / 2); sten('FIRE EXT  PULL', .26, -1.535, -.05, -.85, Math.PI / 2, '#b3160f'); sten('STOW EQUIPMENT HERE', .36, 1.535, .1, .75, -Math.PI / 2);
    sten('MAX LOAD 18 RDS', .34, .95, .88, bz - .022, Math.PI); sten('GUNNER', .16, gx + .2, GY + .62, -1.34 + .255, 0); sten('LOADER', .16, -1.3, .92, -1.59, 0); sten('CDR', .1, 1.25, .97, -.02, -1.35);
    // weld seams and stiffeners
    const seamM = S(0xbdb59c, .9, .05); for (const z of [-1.1, -.3, .5]) for (const sx of [-1, 1]) B(.012, RF, .025, seamM, sx * 1.545, RF / 2, z);
    for (const x of [-1.0, -.35, .35, 1.0]) roof.add(B(.03, .02, 2.5, seamM, x, RF - .012, -.3));
    // floor: anti-slip plate
    const slipT = canvasTex(128, 128, c => { c.fillStyle = '#8f8d86'; c.fillRect(0, 0, 128, 128); for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { c.fillStyle = (i + j) % 2 ? '#a5a39b' : '#77756e'; c.save(); c.translate(i * 16 + 8, j * 16 + 8); c.rotate((i + j) % 2 ? .78 : -.78); c.fillRect(-5, -1.5, 10, 3); c.restore(); } for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(40,36,30,${.05 + r1(i, 3) * .12})`; c.beginPath(); c.arc(r1(i, 1) * 128, r1(i, 2) * 128, 3 + r1(i, 4) * 10, 0, 7); c.fill(); } }, true); slipT.wrapS = slipT.wrapT = THREE.RepeatWrapping; slipT.repeat.set(7, 7); floorM.map = slipT; floorM.needsUpdate = true;
    // breech: ring, block, operating handle, firing-circuit box; mesh on the guard
    Cy(.2, .2, .06, gunm, 0, GY, -.44, Math.PI / 2, 0, 0, null, 20); B(.26, .34, .05, steel, 0, GY, -.405); B(.05, .22, .04, red, .33, GY + .02, -.5, 0, 0, -.5); Cy(.025, .025, .09, red, .4, GY + .12, -.5, Math.PI / 2);
    B(.16, .1, .12, olive, -.34, GY + .3, -.75); for (let i = 0; i < 3; i++) Cy(.008, .008, .03, i ? steel : red, -.38 + i * .04, GY + .36, -.75);
    { const rp = new THREE.Group(); rp.position.set(gx - .3, GY + .42, -1.1); rp.rotation.y = .5; sc.add(rp); B(.26, .19, .04, olive, 0, 0, -.021, 0, 0, 0, rp); P(new THREE.PlaneGeometry(.23, .145), scrM(gunRT.texture), 0, 0, .002, 0, 0, 0, rp); lab('HKOI CAM', .1, .02, -.06, .085, .003, 0, rp, '#7ff0e6', '#27301f'); }
    // gunner: auxiliary sight, ammunition select panel, switch rows
    Cy(.035, .035, .5, black, gx - .22, GY + .12, -1.2, Math.PI / 2); P(new THREE.TorusGeometry(.035, .012, 6, 12), rubber, gx - .22, GY + .12, -.95);
    const selM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffb020, emissiveIntensity: 1.6 }); { const gp = new THREE.Group(); gp.position.set(gx + .32, GY - .02, -1.12); gp.rotation.y = -.6; sc.add(gp); B(.2, .14, .06, olive, 0, 0, 0, 0, 0, 0, gp); B(.05, .03, .01, selM, -.05, .03, .031, 0, 0, 0, gp); for (let i = 0; i < 3; i++) B(.04, .025, .01, black, -.06 + i * .06, -.03, .031, 0, 0, 0, gp); lab('SABOT', .09, .022, -.03, .068, .033, 0, gp, '#ffb020', '#27301f'); }
    for (let i = 0; i < 6; i++) { Cy(.007, .007, .03, steel, 1.0 + (i % 3) * .05, GY + .32 - Math.floor(i / 3) * .06, -1.33, Math.PI / 2); }
    // intercom boxes with a volume knob and a channel lamp at every station
    const icom = (x, y, z, ry) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; sc.add(g); B(.13, .09, .05, olive, 0, 0, 0, 0, 0, 0, g); Cy(.014, .014, .03, black, -.035, 0, .035, Math.PI / 2, 0, 0, g, 10); Cy(.014, .014, .03, black, .005, 0, .035, Math.PI / 2, 0, 0, g, 10); const lm = P(new THREE.SphereGeometry(.008, 8, 6), new THREE.MeshStandardMaterial({ color: 0x052005, emissive: 0x30ff60, emissiveIntensity: .4 }), .045, .02, .028, 0, 0, 0, g); return lm; };
    const ICL = { gnr: icom(1.2, GY + .32, -1.2, -1.1), cdr: icom(1.48, .62, .05, -Math.PI / 2), ldr: icom(-1.5, .86, -.6, Math.PI / 2), drv: icom(.5, FL + .62, dz - .3, -.9) };
    // master caution lamps
    const mcM = () => new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 0 }); const MC = [P(box(.05, .03, .012), mcM(), gx + .1, GY + .6, -1.09), P(box(.05, .03, .012), mcM(), -1.2, .95, -1.585), P(box(.06, .03, .012), mcM(), -.25, FL + .52, dz - .52, -.5)];
    // the driver's hole: side consoles, hatch ring above, pedals, gear selector
    for (const sx of [-1, 1]) { B(.22, .5, 1.3, hullM, sx * .62, FL + .25, dz + .1); B(.2, .03, .5, olive, sx * .62, FL + .52, dz - .2); for (let i = 0; i < 4; i++) Cy(.012, .012, .03, i === 1 ? red : black, sx * .62 + (i % 2 ? .05 : -.05), FL + .55, dz - .35 + Math.floor(i / 2) * .12, 0, 0, 0, null, 8); }
    upper.add(P(new THREE.TorusGeometry(.3, .025, 8, 24), steel, 0, FL + .85, dz + .25, Math.PI / 2)); B(.1, .03, .16, black, -.15, FL + .03, dz - .75, .5); B(.12, .03, .2, black, .15, FL + .03, dz - .75, .5);
    Cy(.012, .012, .16, steel, .5, FL + .6, dz - .05); P(new THREE.SphereGeometry(.025, 10, 8), black, .5, FL + .69, dz - .05);
    // the round the loader carries, shown in his hands during the drill
    const carry = new THREE.Group(); Cy(.06, .06, .62, caseM, 0, 0, 0, Math.PI / 2, 0, 0, carry, 14); Cy(.066, .066, .03, brass, 0, 0, .31, Math.PI / 2, 0, 0, carry, 14); Cy(.018, .03, .34, S(0x202224, .5, .6), 0, 0, -.46, Math.PI / 2, 0, 0, carry, 10); carry.visible = false; sc.add(carry);
    const crew = {}; const HEADS = { gnr: V3(gx - .02, GY + .26, -.86), cdr: V3(cxp - .03, 1.1, .13), ldr: V3(-.78, .84, -.15), drv: V3(0, FL + .6, dz + .35) };
    // casualties: the uniform darkens with blood and spatter lands on the surfaces round the man (the dead more than the wounded)
    const bloodTex = canvasTexB(), bloodAll = [];
    function canvasTexB() { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); for (let i = 0; i < 46; i++) { const a = Math.random() * 6.283, d = Math.pow(Math.random(), 1.6) * 56, r = 2 + Math.random() * (i < 6 ? 20 : 7); x.fillStyle = `rgba(${90 + Math.random() * 50 | 0},${Math.random() * 8 | 0},${Math.random() * 8 | 0},${.55 + Math.random() * .4})`; x.beginPath(); x.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, r * (.5 + Math.random() * .6), a, 0, 6.283); x.fill(); } for (let i = 0; i < 7; i++) { const x0 = 30 + Math.random() * 68, y0 = 50 + Math.random() * 30; x.fillStyle = 'rgba(105,4,4,.8)'; x.fillRect(x0, y0, 2 + Math.random() * 2, 18 + Math.random() * 40); } const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }
    function bloody(r, key, lvl) { if (r.bl === lvl) return; r.bl = lvl; if (r.blood) { for (const m of r.blood) sc.remove(m); r.blood = null; }
      if (!r.mat0) { r.mat0 = []; r.m.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); r.mat0.push([o.material, o.material.color.clone()]); } }); }
      for (const [m, c0] of r.mat0) { m.color.copy(c0); if (lvl === 2) m.color.multiply(new THREE.Color(.62, .2, .18)); else if (lvl === 1) m.color.multiply(new THREE.Color(.85, .5, .46)); }
      if (!lvl) return; r.g.updateMatrixWorld(true); const h = V3(0, 0, 0); r.B.Head.getWorldPosition(h); r.blood = []; const n = lvl === 2 ? 14 : 5;
      for (let i = 0; i < n; i++) { const s = (lvl === 2 ? .46 : .24) * (.6 + Math.random() * .8), m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: bloodTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: .92 })); const a = Math.random() * 6.283, d = .2 + Math.random() * .45; m.position.set(h.x + Math.cos(a) * d, h.y - .05 - Math.random() * .45, h.z + Math.sin(a) * d); m.rotation.set((Math.random() - .5) * 1.2, a + Math.PI / 2 + (Math.random() - .5), Math.random() * 6.283); m.renderOrder = 5; sc.add(m); r.blood.push(m); } }
    function crewUp() {
      if (crew.gnr || !ASSET.crew.gunner || !ASSET.crew.loader || !ASSET.crew.driver || !THREE.SkeletonUtils) return;
      const mk = (src, role, base, rotY, extraY) => { const r = RIG(src), g = new THREE.Group(); g.add(r.m); g.rotation.y = rotY; sc.add(g); applyPose(r, base); g.updateMatrixWorld(true); const h = V3(0, 0, 0); r.B.Head.getWorldPosition(h); g.position.add(HEADS[role].clone().sub(h)); g.position.y += extraY || 0;
        r.g = g; r.base = g.position.clone(); r.role = role; r.P = merge(base); r.look = { y: 0, p: 0, ty: 0, tp: 0, next: 0 }; r.kick = 0; r.rise = 0; return r; };
      crew.gnr = mk(ASSET.crew.gunner, 'gnr', merge(PL.seat, PL.yoke, { Spine1: [0, 0, 22], Head: [0, 0, 12] }), Math.PI);
      crew.cdr = mk(ASSET.crew.gunner, 'cdr', merge(PL.seatHigh, PL.handle, { Spine1: [0, 0, 6] }), Math.PI);
      crew.ldr = mk(ASSET.crew.loader, 'ldr', merge(PL.stand, PL.overhead), Math.PI * .92);
      crew.drv = mk(ASSET.crew.driver, 'drv', merge(PL.recline, PL.tbar), Math.PI);
    }
    ASSET.cbs.push(crewUp);
    // ---- what each crewman is doing, from the state of the fight
    // ---- crew behaviour: every crewman has a job in each phase of the fight.
    // Phases: calm (<30), alert (30-55), stressed (55-80), panic (80+), shock (just hit), bailout (knocked out).
    // Each role cycles through a short list of actions for its phase; an action is a pose, a place to look, and a label.
    const phaseOf = s => s.killed ? 'bailout' : (s.hitAge != null && s.hitAge < 2.6) ? 'shock' : s.stress > 80 ? 'panic' : s.stress > 55 ? 'stressed' : s.stress >= 30 ? 'alert' : 'calm';
    const ACT = {
      gnr: {
        calm: [[5, 'Scanning his sector through the primary sight', () => merge(PL.seat, PL.yoke, { Spine1: [0, 0, 16], Head: [0, 0, 8] }), 6], [2.5, 'Checks the fire-control panel', () => merge(PL.seat, PL.yoke, { Spine1: [-18, 0, 10], Head: [-35, 0, 4] }), 0]],
        alert: [[4, 'On the sight, laying toward the warning', () => merge(PL.seat, PL.yoke, { Spine1: [0, 0, 22], Head: [0, 0, 12] }), 3], [1.2, 'Glances at the HKOI status', () => merge(PL.seat, PL.yoke, { Spine1: [-12, 0, 16], Head: [-40, 0, 2] }), 0]],
        stressed: [[3, 'Pressed into the browpad, fast corrections on the handles', () => merge(PL.seat, PL.yoke, { L_Clavicle: [0, -7, 0], R_Clavicle: [0, 7, 0], Spine1: [0, 0, 28], Neck: [0, 0, 6], Head: [0, 0, 16] }), 2], [.8, 'Wipes his eyes, back on the sight', () => merge(PL.seat, PL.yoke, { Spine1: [0, 0, 18], Head: [0, 0, 2], R_UpperArm: [0, -15, -120], R_Forearm: [0, 0, -120] }), 0]],
        panic: [[1.3, 'Jammed into the browpad, overcorrecting on the handles', () => merge(PL.seat, PL.yoke, { Spine1: [0, 0, 32], Neck: [0, 0, 8], Head: [0, 0, 16], L_Clavicle: [0, -10, 0], R_Clavicle: [0, 10, 0] }), 1], [1.5, 'Frozen on the sight', () => merge(PL.seat, PL.yoke, { Spine1: [0, 0, 30], Head: [0, 0, 16], L_Clavicle: [0, -12, 0], R_Clavicle: [0, 12, 0] }), 0, 1], [.6, 'Head snaps off the sight toward the commander, and back', () => merge(PL.seat, PL.yoke, { Spine1: [-10, 0, 28], Head: [-45, 0, 6], L_Clavicle: [0, -10, 0], R_Clavicle: [0, 10, 0] }), 0]],
        shock: [[9, 'Thrown against the sight, arms up', () => merge(PL.seat, PL.guard, { Spine1: [0, 0, 40], Head: [0, 0, 28] }), 0]],
      },
      cdr: {
        calm: [[5, 'Scanning through the vision blocks', () => merge(PL.seatHigh, PL.handle, { Spine1: [0, 0, 4], Head: [0, 0, -8] }), 70], [3, 'Reading the tactical display', () => merge(PL.seatHigh, PL.handle, { Spine1: [-14, 0, 8], Head: [-48, 0, 12] }), 0], [3, 'Checks the map board', () => merge(PL.seatHigh, PL.armsDown, { Spine1: [0, 0, 22], Head: [0, 0, 30], R_Forearm: [0, 0, -70] }), 0]],
        alert: [[2.5, 'Searching the warning bearing through the vision blocks', () => merge(PL.seatHigh, PL.handle, { Spine1: [0, 0, 4], Head: [0, 0, -8] }), -1], [1.6, 'Checks the threat on the tactical display', () => merge(PL.seatHigh, PL.handle, { Spine1: [-14, 0, 8], Head: [-48, 0, 12] }), 0], [1.5, 'Hand on the override, slewing the turret', () => merge(PL.seatHigh, PL.handle, { Spine1: [0, 0, 10], Head: [0, 0, 4], R_Forearm: [0, 0, -80] }), -1]],
        stressed: [[1.6, 'Calls the threat, pointing', () => merge(PL.seatHigh, PL.point, { Spine1: [0, 0, 4] }), -1], [1.4, 'Eyes on the display, keying the intercom', () => merge(PL.seatHigh, PL.handle, { Spine1: [-14, 0, 10], Head: [-48, 0, 12], L_UpperArm: [0, 20, -95], L_Forearm: [0, 0, -125] }), 0], [1.3, 'Down on the gunner\'s sight extension', () => merge(PL.seatHigh, PL.handle, { Spine1: [0, 0, 30], Head: [0, 0, 18] }), 0]],
        panic: [[.9, 'Braced hard forward, shouting the threat', () => merge(PL.seatHigh, PL.point, { Spine1: [0, 0, 16], L_Clavicle: [0, -12, 0], R_Clavicle: [0, 12, 0] }), -1], [1.6, 'Frozen, staring at the display', () => merge(PL.seatHigh, PL.handle, { Spine1: [-12, 0, 16], Head: [-44, 0, 12], L_Clavicle: [0, -14, 0], R_Clavicle: [0, 14, 0] }), 0, 1], [.7, 'Head snaps to the vision blocks', () => merge(PL.seatHigh, PL.handle, { Spine1: [0, 0, 12], Head: [0, 0, -8], L_Clavicle: [0, -12, 0], R_Clavicle: [0, 12, 0] }), -1], [.8, 'Hand on the smoke switch', () => merge(PL.seatHigh, PL.handle, { Spine1: [-16, 0, 16], Head: [-36, 0, 8], R_UpperArm: [0, -35, -95], R_Forearm: [0, 0, -20], L_Clavicle: [0, -12, 0], R_Clavicle: [0, 12, 0] }), 0]],
        shock: [[9, 'Slammed forward, covering his head', () => merge(PL.seatHigh, PL.guard, { Spine1: [0, 0, 34], Head: [0, 0, 25] }), 0]],
      },
      ldr: {
        calm: [[6, 'Standing at his hatch ring, watching the radios', () => merge(PL.stand, PL.overhead, { Spine1: [0, 0, 4] }), 40], [3, 'Checks the ready rack door', () => merge(PL.stand, PL.armsDown, { Spine1: [140, 0, 6], Head: [40, 0, 6] }), 0]],
        alert: [[3, 'On his periscope, searching for the launch', () => merge(PL.stand, PL.scope, { Spine1: [0, 0, 8], Head: [0, 0, -12] }), -1], [1.5, 'Arms the Trophy panel', () => merge(PL.stand, PL.handle, { Spine1: [50, 0, 10], Head: [30, 0, 10] }), 0]],
        stressed: [[1.8, 'Braced on the overhead grip, watching the periscope', () => merge(PL.stand, PL.overhead, { Spine1: [0, 0, 10], Head: [0, 0, -10] }), -1], [1.4, 'Knee on the door switch, ready to load', () => merge(PL.crouch, PL.handle, { Spine1: [120, 0, 14], Head: [40, 0, 4] }), 0]],
        panic: [[1.0, 'Both hands locked on the grips, braced against the turret wall', () => merge(PL.stand, PL.overhead, { Spine1: [0, 0, 16], Head: [0, 0, 6], R_UpperArm: [0, -10, -150], R_Forearm: [0, 0, -30], L_Clavicle: [0, -12, 0], R_Clavicle: [0, 12, 0] }), 0], [.7, 'Head snaps to the periscope', () => merge(PL.stand, PL.scope, { Spine1: [0, 0, 10], Head: [0, 0, -14], L_Clavicle: [0, -12, 0], R_Clavicle: [0, 12, 0] }), -1], [1.4, 'Frozen at his station', () => merge(PL.stand, PL.overhead, { Spine1: [0, 0, 18], Head: [0, 0, 10], L_Clavicle: [0, -14, 0], R_Clavicle: [0, 14, 0] }), 0, 1]],
        shock: [[9, 'Knocked down, curled against the breech guard', () => merge(PL.crouch, PL.guard, { Spine1: [0, 0, 35], Head: [0, 0, 25] }), 0]],
        load: [[.9, 'Knee switch: blast door open', () => merge(PL.crouch, PL.handle, { Spine1: [150, 0, 10], Head: [50, 0, 0] }), 0], [1.1, 'Pulls a round from the rack', () => merge(PL.stand, PL.tbar, { Spine1: [165, 0, 18], Head: [20, 0, 6], L_UpperArm: [0, 25, -75], R_UpperArm: [0, -25, -75] }), 0], [1.0, 'Swings it round and rams it home', () => merge(PL.stand, PL.tbar, { Spine1: [-40, 0, 26], Head: [-20, 0, 12], L_UpperArm: [0, 15, -85], R_UpperArm: [0, -15, -95], R_Forearm: [0, 0, -15] }), 0], [.8, 'Clear of the breech, arms the gun: "Up!"', () => merge(PL.stand, PL.overhead, { Spine1: [60, 0, 0] }), 0]],
      },
      drv: {
        calm: [[8, 'Relaxed on the T-bar, watching his periscopes', () => merge(PL.recline, PL.tbar), 20], [3, 'Checks the gauges', () => merge(PL.recline, PL.tbar, { Head: [0, 0, 18] }), 0]],
        alert: [[4, 'Both hands on the T-bar, ready to move', () => merge(PL.recline, PL.tbar, { Spine1: [0, 0, 8] }), 10]],
        stressed: [[2, 'Hunched forward, throttle hard over', () => merge(PL.recline, PL.tbar, { Spine1: [0, 0, 16], Head: [0, 0, -6] }), 25], [1, 'Flicks a look at the warning light', () => merge(PL.recline, PL.tbar, { Spine1: [0, 0, 12], Head: [25, 0, 10] }), 0]],
        panic: [[1.0, 'Hunched over the T-bar, hard corrections', () => merge(PL.recline, PL.tbar, { Spine1: [0, 0, 20], Head: [0, 0, -8], L_Clavicle: [0, -12, 0], R_Clavicle: [0, 12, 0] }), 0], [1.5, 'Frozen, hands locked on the T-bar', () => merge(PL.recline, PL.tbar, { Spine1: [0, 0, 16], Head: [0, 0, -10], L_Clavicle: [0, -14, 0], R_Clavicle: [0, 14, 0] }), 0, 1]],
        shock: [[9, 'Thrown back in the seat', () => merge(PL.recline, PL.guard, { Spine1: [0, 0, -8] }), 0]],
      },
    };
    const BAIL = { cdr: 1.3, ldr: 1.8, drv: 2.4, gnr: 3.1 }, BAILTXT = { cdr: 'Up through the cupola hatch', ldr: 'Out through the loader\'s hatch', drv: 'Out through the driver\'s hatch', gnr: 'Last out, climbing over the commander\'s seat' };
    function target(r, s, t) {
      const ph = phaseOf(s), rel = s.alarmRel != null ? ((s.alarmRel - (s.tur || 0) + 540) % 360) - 180 : null, key = r.role; let P, look = 0, label; const hk = (s.health && s.health[key]) || 'ok';
      if (hk === 'killed') { const sd = key === 'ldr' ? -1 : 1; P = merge(key === 'drv' ? PL.recline : PL.seat, PL.slump, { Spine: [0, 0, 14], Spine1: [10 * sd, 0, key === 'drv' ? 18 : 38], Neck: [0, 0, 18], Head: [22 * sd, 0, 34] }); r.label = 'Killed'; r.phase = 'dead'; r.frozen = true; r.dead = true; return P; }
      r.dead = false; r.hurt = hk === 'wounded';
      if (ph === 'bailout') { const ka = s.killAge || 0; if (ka > BAIL[key]) { P = merge(PL.stand, PL.climb, { Spine1: [0, 0, 8] }); label = BAILTXT[key]; } else { P = ACT[key].shock[0][2](); label = 'Stunned, then unbuckling'; } }
      else { let list = ACT[key][ph];
        if (key === 'ldr' && s.loadIn != null && s.loadIn < 3.8 && s.loadIn >= 0 && ph !== 'shock') list = ACT.ldr.load;   // the main gun needs a round: the loader's drill comes first
        if (r.act == null || r.actList !== list || t >= r.actEnd) { if (r.actList !== list) r.act = -1; r.actList = list; r.act = list === ACT.ldr.load ? Math.min(list.length - 1, r.act + 1) : (r.act + 1 + (ph === 'panic' && Math.random() < .35 ? 1 : 0)) % list.length; r.actEnd = t + list[r.act][0] * (.8 + Math.random() * .4); }
        const a = list[r.act]; P = a[2](); label = a[1]; look = a[3]; r.frozen = !!a[4]; }
      // what the hands and body add on top of the action
      if (key === 'gnr' && ph !== 'shock' && ph !== 'bailout') { const tr = Math.max(-1, Math.min(1, (s.turRate || 0) / 30)), jerk = r.frozen ? 0 : ph === 'panic' ? Math.sin(t * 11) * 4 : ph === 'stressed' ? Math.sin(t * 7) * 2.5 : 0; addB(P, 'L_UpperArm', 0, 0, tr * 12 + jerk); addB(P, 'R_UpperArm', 0, 0, -tr * 12 - jerk); addB(P, 'Spine1', tr * 6, tr * 4, 0); if (s.firing || s.mainFire) addB(P, 'R_Forearm', 0, 0, -8); }
      if (key === 'drv' && ph !== 'bailout') { const steer = Math.max(-1, Math.min(1, (s.hullRate || 0) / 30)); addB(P, 'L_UpperArm', 0, 0, steer * 15); addB(P, 'R_UpperArm', 0, 0, -steer * 15); }
      // eyes: an action either looks at something fixed (0), scans (a positive arc in degrees), or follows the threat bearing (-1)
      if (ph === 'bailout' || ph === 'shock') r.frozen = false;
      const L = r.look; if (t > L.next && !r.frozen) { L.next = t + (ph === 'panic' ? .25 + Math.random() * .4 : ph === 'stressed' ? .5 + Math.random() * .7 : 1.4 + Math.random() * 2.2);
        if (look === -1 && rel != null) { L.ty = Math.max(-80, Math.min(80, -rel * .8)) + (Math.random() - .5) * (ph === 'panic' ? 50 : 12); L.tp = key === 'cdr' ? -8 : 0; }
        else if (look > 0) { L.ty = (Math.random() - .5) * 2 * look; L.tp = (Math.random() - .5) * 12; } else { L.ty = (Math.random() - .5) * (ph === 'panic' ? 40 : 6); L.tp = 0; } }
      if (r.hurt && ph !== 'bailout') { addB(P, 'Spine1', 0, 0, 16); addB(P, 'Head', 0, 0, 10); P.R_UpperArm = [0, -12, -55]; P.R_Forearm = [0, 0, -115]; label = 'Wounded: ' + (label || '').charAt(0).toLowerCase() + (label || '').slice(1); }
      addB(P, 'Head', L.y, 0, L.p); r.label = label; r.phase = r.hurt && ph !== 'bailout' && ph !== 'shock' ? 'wounded' : ph;
      return P;
    }
    let doorS = 0, lastHits = 0, cdrDrop = 0, shake = 0, flick = 0, smokeIn = 0, view = 'cdr', orb = { a: .55, e: 1.05, d: 6.2 }, lastTur = null;
    function update(t, dt, s) {
      crewUp(); camC = cam; const panic = s.stress >= 80, stressed = s.stress >= 55;
      s.turRate = lastTur == null ? 0 : (((s.tur || 0) - lastTur + 540) % 360 - 180) / Math.max(dt, 1e-3); lastTur = s.tur || 0;
      if (s.hitAge != null && s.hitAge >= 0 && s.hitAge < dt * 1.5 + .02) { shake = Math.max(shake, s.killed ? 2 : 1.6); flick = 2.2; blk = .5; dust = 1; for (const k in crew) crew[k].kick = 1; }
      if (s.nearAge != null && s.nearAge >= 0 && s.nearAge < dt * 1.5 + .02 && s.nearK > .05) { const K = s.nearK; shake = Math.max(shake, .3 + .7 * K); flick = Math.max(flick, .25 + .7 * K); if (K > .7) blk = Math.max(blk, .12); dust = Math.max(dust, K); for (const k in crew) crew[k].kick = Math.max(crew[k].kick, .5 * K); }
      blk = Math.max(0, blk - dt); dust = Math.max(0, dust - dt * .45); if ((scrN = (scrN + 1) % 3) === 0) for (const k in xt) if (xt[k].image && xt[k].image.width) xt[k].needsUpdate = true;
      if (s.apsAge != null && s.apsAge >= 0 && s.apsAge < dt * 1.5 + .02) { shake = Math.max(shake, .3); for (const k in crew) crew[k].kick = Math.max(crew[k].kick, .45); }
      if (s.hitRel != null && s.hitCount !== lastHits) { lastHits = s.hitCount; if (!s.hitCount) for (const o of optics) o.crack.visible = false; else for (const o of optics) { const d = Math.abs(((o.rel - s.hitRel + 540) % 360) - 180); if (d < 50 && hsh(o.rel + 7, s.hitCount) > .35) o.crack.visible = true; } }
      if (s.mainFire) { shake = Math.max(shake, .4); for (const k in crew) crew[k].kick = Math.max(crew[k].kick, .25); }
      shake *= Math.exp(-dt * 2.2); flick = Math.max(0, flick - dt); smokeIn = s.killed ? Math.min(1, smokeIn + dt * .25) : Math.max(0, smokeIn - dt);
      // the crew: blend toward what they are doing; faster and jerkier as fear rises; breathing, tremor, hit recoil, climbing out
      const rate = panic ? 5.5 : stressed ? 4.6 : 3.8, k = 1 - Math.exp(-dt * rate)   /* poses settle in roughly 0.4-0.8 s */, br = .25 + s.stress / 100 * .9;
      for (const key in crew) { const r = crew[key], T = target(r, s, t), L = r.look; L.y += (L.ty - L.y) * (1 - Math.exp(-dt * (panic ? 14 : 5))); L.p += (L.tp - L.p) * (1 - Math.exp(-dt * 5));
        for (const b in r.rest) { const tv = T[b] || [0, 0, 0], cv = r.cur[b] || (r.cur[b] = [0, 0, 0]); for (let i = 0; i < 3; i++) cv[i] += (tv[i] - cv[i]) * k; }
        const Q = {}; for (const b in r.cur) Q[b] = r.cur[b].slice();
        if (!r.dead) { addB(Q, 'Spine', 0, 0, Math.sin(t * br * 6.283 + key.length) * (1.5 + s.stress / 40) * (r.hurt ? 1.8 : 1)); addB(Q, 'Spine1', 0, 0, r.kick * 22); addB(Q, 'Head', 0, 0, r.kick * 15); }
        if (panic && !s.killed && !r.frozen && !r.dead) { const tr = Math.sin(t * 29 + key.length * 3) * 1.6; addB(Q, 'L_Forearm', 0, 0, tr); addB(Q, 'R_Forearm', 0, 0, -tr); addB(Q, 'Head', Math.sin(t * 17) * 1.5, 0, 0); }
        const tk = s.talk && s.talk[key] ? 1 : 0; r.talk = (r.talk || 0) + (tk - (r.talk || 0)) * (1 - Math.exp(-dt * 14));
        if (r.talk > .02 && !s.killed && !r.dead) { const a = r.talk * (.6 + s.stress / 160), syl = Math.max(0, Math.sin(t * 21 + key.length) * .6 + Math.sin(t * 33.7 + 1.3) * .4); addB(Q, 'MJaw', 0, 0, a * (3 + 13 * syl)); addB(Q, 'Head', Math.sin(t * 5.1 + key.length) * 2.2 * a, 0, Math.sin(t * 7.3) * 1.8 * a); addB(Q, 'Spine1', 0, 0, Math.sin(t * 3.7) * 1.2 * a); }
        // hands close round whatever they hold
        const grip = { gnr: 'LR', drv: 'LR', cdr: 'R', ldr: 'L' }[key]; if (r.phase !== 'bailout' && !r.dead) for (const sd of grip) for (const f of '1234') for (const sg of ['', '1', '2']) addB(Q, sd + '_Finger' + f + sg, 0, 0, 42);
        applyPose(r, Q); r.kick *= Math.exp(-dt * 3);
        // the controls sit in the hands: the driver's T-bar and the gunner's handles follow them
        if ((key === 'drv' || key === 'gnr') && r.phase !== 'shock' && r.phase !== 'bailout' && !r.dead) { r.g.updateMatrixWorld(true); const hl = r.B.L_Hand.getWorldPosition(V3(0, 0, 0)), hr = r.B.R_Hand.getWorldPosition(V3(0, 0, 0));
          if (key === 'drv') { tbarG.position.set((hl.x + hr.x) / 2, (hl.y + hr.y) / 2 - .015, (hl.z + hr.z) / 2 - .045); tbarG.rotation.set(0, Math.atan2(hl.z - hr.z, hr.x - hl.x) * .8, Math.atan2(hr.y - hl.y, hr.x - hl.x)); const w = Math.max(.3, Math.min(.7, Math.abs(hr.x - hl.x))); tbarG.scale.set(w / .54, 1, 1);
            const d = tbarG.position.clone().sub(tbase), L = d.length(); tcol.position.copy(tbase).addScaledVector(d, .5); tcol.scale.set(1, L, 1); tcol.quaternion.setFromUnitVectors(AY, d.normalize()); }
          else if (!r.frozenCtl) { yoke.position.set(hl.x + .16, hl.y - .05, hl.z - .04); } }
        const climbT = { cdr: 1.3, ldr: 1.8, drv: 2.4, gnr: 3.1 }[key] + (r.hurt ? 1.4 : 0), ka = s.killed && !r.dead ? (s.killAge || 0) : -1, rise = ka > climbT ? Math.min(1.6, (ka - climbT) * (r.hurt ? .6 : 1.1)) : 0; bloody(r, key, r.dead ? 2 : r.hurt ? 1 : 0);
        r.g.position.copy(r.base); r.g.position.y += rise; if (key === 'gnr' && rise) { r.g.position.x += (cxp - gx) * Math.min(1, rise); r.g.position.z += (.2 - (-.86)) * Math.min(1, rise); }
        // first person: keep the body (you see your own arms and hands on the controls) and take away only the head
        const pov = (view === 'cdr' && key === 'cdr') || (view === 'ldr' && key === 'ldr') || (view === 'drv' && key === 'drv') || (view === 'gnr' && key === 'gnr'); const body = pov && key === 'drv'; r.g.visible = !(rise > 1.5) && !(pov && (!body || rise > 0)); r.B.Head.scale.setScalar(body ? .001 : 1); }
      drvPanel(s.speed || 0, s.hull || 0, s.rev ? 'R' : (s.speed || 0) > .3 ? 'D' : 'N', !!s.alarm);
      // the loader's drill made visible: the blast door slides, a round leaves the rack and travels in his hands to the breech
      { const ld = crew.ldr, loading = ld && ld.actList === ACT.ldr.load && !s.killed, a = loading ? ld.act : -1; doorS += ((a >= 0 && a <= 1 ? 1 : 0) - doorS) * (1 - Math.exp(-dt * 7)); door.position.x = doorS * 1.0;
        const fired = s.mainShots || 0; rounds.children.forEach((m, i) => { m.visible = Math.floor(i / 3) < 18 - Math.min(18, fired + (a >= 1 ? 1 : 0)); });
        carry.visible = a === 1 || a === 2; if (carry.visible) { ld.g.updateMatrixWorld(true); const hl = ld.B.L_Hand.getWorldPosition(V3(0, 0, 0)), hr = ld.B.R_Hand.getWorldPosition(V3(0, 0, 0)); carry.position.set((hl.x + hr.x) / 2, (hl.y + hr.y) / 2 + .04, (hl.z + hr.z) / 2); carry.rotation.y = a === 1 ? 0 : Math.PI * .08; } }
      { const blink = Math.floor(t * (panic ? 7 : 3.5)) % 2 === 0, lvl = s.killed ? 0 : s.alarm ? (blink ? (panic ? 9 : 5) : .3) : 0; for (const m of MC) m.material.emissiveIntensity = lvl; for (const k in ICL) ICL[k].material.emissiveIntensity = s.talk && s.talk[k] ? 4 : .4; selM.emissiveIntensity = s.killed ? 0 : 1.6 * (flick > 0 ? .3 : 1); }
      // cameras
      const n = q => (hsh(Math.floor(t * 40 + q), q) - .5), amp = .003 + s.stress / 100 * .012, rum = (s.speed || 0) * .0012 + (s.firing ? .004 : 0);
      cam.up.set(0, 1, 0); roof.visible = upper.visible = view !== 'cut';
      if (view === 'cdr') { const hp = V3(0, 0, 0); if (crew.cdr) { crew.cdr.B.Head.getWorldPosition(hp); hp.y += .06; hp.z -= .04; } else hp.copy(HEADS.cdr);
        const ka = s.killed ? (s.killAge || 0) : -1; if (ka > 1.3) hp.y += Math.min(1.4, (ka - 1.3) * 1.1);
        // head up in the cupola at the vision blocks; look down and he drops below the roof to see the crew
        const pDeg = -4 + (s.lookPitch || 0), dn = Math.max(0, Math.min(1, (-pDeg - 10) / 16)); cdrDrop += (dn - cdrDrop) * (1 - Math.exp(-dt * 6));
        if (ka <= 1.3) { hp.x = .7 + (hp.x - .7) * .4; hp.z = .1 + (hp.z - .1) * .4 + cdrDrop * .08; hp.y = RF + .185 - cdrDrop * .34; }
        cam.position.set(hp.x + n(1) * (shake * .06 + rum), hp.y + Math.sin(t * br * 6.283) * amp * .5 + n(2) * (shake * .05 + rum), hp.z + n(3) * shake * .04);
        const yaw = ((s.lookYaw || 0) + 8 + cdrDrop * 14) * DEG + (panic && s.alarmRel != null ? Math.sin(t * 1.3) * .06 : 0), pit = pDeg * DEG + n(4) * shake * .08;
        cam.rotation.set(0, 0, 0); cam.rotateY(yaw); cam.rotateX(pit); cam.rotateZ(n(5) * shake * .08); cam.fov = s.narrow ? 95 : 78; cam.near = .02; }
      else if (view === 'drv') { const hp = V3(0, 0, 0); if (crew.drv) { crew.drv.B.Head.getWorldPosition(hp); hp.y += .05; hp.z -= .06; } else hp.copy(HEADS.drv); const ka = s.killed ? (s.killAge || 0) : -1; if (ka > 2.4) hp.y += Math.min(1.4, (ka - 2.4) * 1.1);
        cam.position.set(hp.x + n(1) * (shake * .06 + rum * 1.5), hp.y + n(2) * (shake * .05 + rum * 1.5), hp.z + n(3) * shake * .04);
        cam.rotation.set(0, 0, 0); cam.rotateY(Math.max(-70, Math.min(70, s.lookYaw || 0)) * DEG); cam.rotateX((4 + Math.max(-30, Math.min(30, s.lookPitch || 0))) * DEG + n(4) * shake * .08); cam.rotateZ(n(5) * shake * .08 + Math.max(-.05, Math.min(.05, (s.hullRate || 0) * .001))); cam.fov = s.narrow ? 88 : 66; }
      else if (view === 'gnr') { const hp = V3(0, 0, 0); if (crew.gnr) { crew.gnr.B.Head.getWorldPosition(hp); hp.y += .1; hp.z += .24; hp.x -= .06; } else hp.copy(HEADS.gnr); const ka = s.killed ? (s.killAge || 0) : -1; if (ka > 3.1) hp.y += Math.min(1.4, (ka - 3.1) * 1.1);
        cam.position.set(hp.x + n(1) * (shake * .05 + rum), hp.y + Math.sin(t * br * 6.283) * amp * .5 + n(2) * (shake * .05 + rum), hp.z + .1 + n(3) * shake * .04);
        cam.rotation.set(0, 0, 0); cam.rotateY(Math.max(-100, Math.min(100, s.lookYaw || 0)) * DEG); cam.rotateX((-6 + Math.max(-40, Math.min(40, s.lookPitch || 0))) * DEG + n(4) * shake * .08); cam.rotateZ(n(5) * shake * .08); cam.fov = s.narrow ? 92 : 70; }
      else if (view === 'ldr') { const hp = V3(0, 0, 0); if (crew.ldr) { crew.ldr.B.Head.getWorldPosition(hp); hp.y += .07; } else hp.copy(HEADS.ldr); const ka = s.killed ? (s.killAge || 0) : -1; if (ka > 1.8) hp.y += Math.min(1.4, (ka - 1.8) * 1.1);
        cam.position.set(hp.x + n(1) * (shake * .06 + rum), Math.min(hp.y, ka > 1.8 ? 9 : RF - .14) + Math.sin(t * br * 6.283) * amp + n(2) * (shake * .05 + rum), hp.z + .12 + n(3) * shake * .04);
        cam.rotation.set(0, 0, 0); cam.rotateY((-62 + (s.lookYaw || 0)) * DEG); cam.rotateX((-24 + (s.lookPitch || 0)) * DEG + n(4) * shake * .08); cam.rotateZ(n(5) * shake * .08); cam.fov = s.narrow ? 98 : 84; }
      else { orb.a = (s.lookYaw != null ? .7 - (s.lookYaw || 0) * DEG * .6 : orb.a); orb.e = Math.max(.35, Math.min(1.45, .95 - (s.lookPitch || 0) * DEG * .6)); const d = orb.d;
        cam.position.set(Math.sin(orb.a) * Math.cos(orb.e) * d + n(1) * shake * .08, -.2 + Math.sin(orb.e) * d, Math.cos(orb.a) * Math.cos(orb.e) * d - .7); cam.lookAt(0, -.3, -.7); cam.fov = s.narrow ? 70 : 50; }
      if (shake > .02 && view !== 'cut') { cam.position.x += n(11) * shake * .03; cam.position.y += n(12) * shake * .026; cam.rotateZ(n(13) * shake * .045); cam.rotateX(n(14) * shake * .02); }   // the whole fighting compartment jumps
      const D = window.__cabDbg; if (D) { cam.position.set(...D.p); cam.up.set(0, 1, 0); cam.lookAt(...D.l); cam.fov = D.fov || 70; if (D.cut) roof.visible = upper.visible = false; }
      cam.updateProjectionMatrix();
      // lights
      const alarmOn = s.alarm && Math.floor(t * 4) % 2 === 0, redMode = panic || s.killed, fl = blk > 0 ? 0 : flick > 0 ? (hsh(Math.floor(t * 30), 7) > (flick > 1 ? .35 : .5) ? .08 : 1) : 1; { const sv = blk > 0 ? 0 : flick > 0 && hsh(Math.floor(t * 22), 3) > .55 ? .2 : 1; for (const m of scrMats) m.color.setScalar(s.killed ? .25 * sv : sv); }
      lamp.material.emissiveIntensity = alarmOn ? 6 : .2; red2.intensity = (panic ? 1.3 + .7 * Math.sin(t * 9) : stressed ? .45 : 0) + (alarmOn ? .7 : 0) + (s.killed ? 1.5 : 0);
      dome.intensity = (s.killed ? .1 : redMode ? .6 : 2.4) * fl; dome2.intensity = (s.killed ? 0 : redMode ? .4 : 1.9) * fl; hemi.intensity = (s.killed ? .15 : redMode ? .35 : .9) + (view === 'cut' ? .4 : 0);
      for (const d of domes) { d.material.emissive.setHex(redMode ? 0xff3020 : 0xfff1d6); d.material.emissiveIntensity = s.killed ? .3 : 2 * fl; }
      fire.intensity = s.killed ? 1.2 + Math.sin(t * 23) * .5 + Math.sin(t * 7.3) * .4 : 0; glow.intensity = s.killed ? .05 : .45; sc.fog.density = smokeIn * 1.6;
      thermT = t;
      // sparks and smoke after a hit
      sp.begin(); sm.begin();
      if (dust > .02) for (let i = 0; i < 60; i++) { const L = 2.2, a = (t * (.5 + r1(i, 21) * .5) + r1(i, 22) * L) % L, ph = a / L; sm.add((r1(i, 23) - .5) * 2.8, 1.25 - ph * 1.9, (r1(i, 24) - .5) * 2.6 - .4, .1 + ph * .22, .5 * dust * Math.sin(ph * Math.PI), .62, .58, .5, i, i & 3); }   // dust and paint flakes shaken off the roof
      if (s.hitAge != null && s.hitAge < 1.6) for (let i = 0; i < 70; i++) { const a = r1(i, 33) * 6.283, v = 1.5 + r1(i, 34) * 4, ta = s.hitAge * (.5 + r1(i, 35) * .7); if (ta > 1) continue; const sx = s.hitRel != null ? Math.sin((s.hitRel - (s.tur || 0)) * DEG) * 1.2 : -.6; sp.add(sx + Math.cos(a) * v * ta * .6, .7 + r1(i, 36) * .5 - 4.9 * ta * ta + v * .4 * ta, -.5 + Math.sin(a) * v * ta * .6, .025 + .02 * (1 - ta), 1 - ta, 1, .8, .4); }
      if (s.hitAge != null && s.hitAge < 1.4) for (let i = 0; i < 50; i++) { const a = r1(i, 3) * 6.283, v = 1 + r1(i, 4) * 3, ta = s.hitAge * (.6 + r1(i, 5) * .6); if (ta > 1) continue; sp.add(.2 + Math.cos(a) * v * ta, .5 + r1(i, 6) * .4 - 4.9 * ta * ta + v * .5 * ta, -.4 + Math.sin(a) * v * ta, .02 + .02 * (1 - ta), 1 - ta, 1, .75, .35); }
      if (smokeIn > 0) for (let i = 0; i < 45; i++) { const a = (t * .1 + i * .7) % 4, ph = a / 4; sm.add((r1(i, 8) - .5) * 2.6, FL + ph * 2, (r1(i, 9) - .5) * 2.4, .5 + ph * 1.2, .5 * smokeIn * Math.sin(ph * Math.PI), .22, .2, .19, i, i & 3); }
      cam.updateMatrixWorld(); sp.flush(); sm.flush();
    }
    let thermT = 0, blk = 0, dust = 0;
    // more displays: the threat scope, the crew cameras and a systems page, fed from the same canvases the page draws
    const xt = {}, mfd = (key, w, h, x, y, z, ry, title) => { const tex = new THREE.CanvasTexture(document.createElement('canvas')); tex.encoding = THREE.sRGBEncoding; xt[key] = tex; const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; sc.add(g); B(w + .06, h + .07, .05, olive, 0, 0, -.027, 0, 0, 0, g); P(new THREE.PlaneGeometry(w, h), scrM(tex), 0, .008, .002, 0, 0, 0, g); for (let i = 0; i < 5; i++) B(.022, .012, .012, selM, -w / 2 + .03 + i * (w - .06) / 4, -h / 2 - .018, .004, 0, 0, 0, g); return g; };
    mfd('scope', .27, .27, 1.0, .93, -.44, -.4); mfd('faces', .46, .146, 1.33, .47, -.1, -1.35); mfd('sys', .34, .22, -1.42, .92, -.28, 1.3); mfd('sys2', .3, .2, gx + .34, GY + .18, -1.12, -.55);
    let scrN = 0; function setScreens(o) { for (const k in o) { const tx = k === 'sys' ? [xt.sys, xt.sys2] : [xt[k]]; for (const q of tx) if (q && o[k] && q.image !== o[k]) q.image = o[k]; } }
    function setPanel(cv) { if (panelTex.image !== cv) panelTex.image = cv; panelTex.needsUpdate = true; }
    return { sc, cam, gunRT, periRT, drvRT, update, setPanel, setScreens, setStatus, crewState() { return ['cdr', 'gnr', 'ldr', 'drv'].filter(k => crew[k]).map(k => ({ who: k, phase: crew[k].phase, doing: crew[k].label })); }, setView(v) { view = v; }, get view() { return view; }, get crewLoaded() { return !!crew.gnr; } };
  }
