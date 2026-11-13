  const ENDCHIP = { miss: 'missed', ground: 'hit the ground', he_kill: 'HE kill', aps_kill: 'APS kill', self_destruct: 'self-destructed', hit: 'HIT' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function frame(dt) {
    const cfg = run.cfg, fxs = speed === 'cine' ? base : Math.max(.5, +speed), tv = t / fxs;
    smoke.begin(); fire.begin(); ribbons.begin(); boomHot = 0; let muzHot = 0;
    const hullA = rec.ctx.hull * DEG, dispAt = tt => { const d = rec.crew ? HK.crewDisp(rec.crew, tt) : 0; return Math.sign(d) * rr(Math.abs(d)); }, dk = dispAt(t), vp = V3(Math.sin(hullA) * dk, 0, -Math.cos(hullA) * dk), origin = V3(vp.x, HV, vp.z);
    veh.position.copy(vp); root.getObjectByName('ovl').visible = overlay;
    let deadT = -1, hitT = -1, shake = 0, ride = null;
    const ga0 = gunB * DEG, ce = Math.cos(gunEl), gd = V3(Math.sin(ga0) * ce, Math.sin(gunEl), -Math.cos(ga0) * ce), mz = V3(origin.x + gd.x * 10, origin.y + .2 + gd.y * 10, origin.z + gd.z * 10);
    for (const o of th3) {
      const th = o.th, tt = TH[th.key], e = th.viz.end, m = mstate(th, t), k = th.idx, g = tt.guidance; let chip = 'waiting', cls = '';
      if (o.L.userData.rotor) { o.L.userData.rotor.rotation.y = wall * 38; o.L.position.y = o.lp.y + Math.sin(wall * 1.1 + k) * 1.2; }
      o.mtag.on = false; o.missile.visible = false;
      const la = (t - th.t0) / fxs;
      if (la >= 0 && la < 3.2 && g !== 'drone') { // launch flash and backblast
        if (la < .12) { fire.add(o.lp.x, o.lp.y, o.lp.z, 24 * (1 - la / .12) + 8, 1, 1, .85, .55); if (.5 > boomHot) { boomHot = .5 * (1 - la / .12); boomAt.copy(o.lp); } }
        for (let i = 0; i < 8; i++) { const a = r1(k * 13 + i, 5) * 6.283, d = (4 + 13 * r1(k * 13 + i, 6)) * (1 - Math.exp(-la * 2.5)); smoke.add(o.lp.x + o.back.x * d * 1.4 + Math.cos(a) * d * .5, o.lp.y - .6 + la * 2.2 * r1(i, 8), o.lp.z + o.back.z * d * 1.4 + Math.sin(a) * d * .5, 5 + la * 7, .5 * (1 - la / 3.2), .72, .68, .6, a, i % 4); }
      }
      if (m) {
        const pos = mpos(th, m), guided = m.mode === 'guided';
        if (m.alive) {
          const p2 = mpos(th, mstate(th, t + .04)); o.missile.visible = true; o.missile.position.copy(pos); if (p2.distanceToSquared(pos) > 1e-5) o.missile.lookAt(p2);
          o.missile.userData.body.rotation.z = g === 'drone' ? Math.sin(wall * 3 + k) * .15 : wall * 9;
          if (g !== 'drone') { qA.subVectors(pos, p2); if (qA.lengthSq() < 1e-8) qA.copy(o.back); qA.normalize(); const fl = .8 + .4 * hsh(Math.floor(wall * 45), k);
            fire.add(pos.x + qA.x * 4.2, pos.y + qA.y * 4.2, pos.z + qA.z * 4.2, 4 * fl, .9, 1, .8, .45); fire.add(pos.x + qA.x * 5.5, pos.y + qA.y * 5.5, pos.z + qA.z * 5.5, 8 * fl, .3, 1, .5, .2);
            qB.copy(pos).addScaledVector(qA, 3.6); qC.copy(pos).addScaledVector(qA, 3.6 + 5 * fl); ribbons.add(qB, qC, 1.1, 1, .8, .5, .8, 0); }
          if (focus === k) ride = { pos, th, d: m.d, o, lock: true }; else if (!(ride && ride.lock) && (!ride || m.d < ride.d)) ride = { pos, th, d: m.d, o };
          chip = guided ? ((th.track !== null && t >= th.track ? 'tracked · ' : 'inbound · ') + (m.d >= 1000 ? (m.d / 1000).toFixed(1) + ' km' : Math.round(m.d) + ' m')) : 'BLIND'; cls = guided ? (th.track !== null && t >= th.track ? 'trk' : '') : 'blind';
          o.mtag.on = true; o.mtag.p.set(pos.x, pos.y + 5, pos.z);
          if (overlay && !(mode === 'sight' && sightK === k)) { // sensor lines that are invisible in reality
            const laser = g === 'beam_rider' || g === 'sal';
            if (laser || g === 'radio_saclos') { let end = g === 'sal' ? origin : pos, a = g === 'beam_rider' ? .9 : .32, cu = null;
              if (!guided) { cu = o.cuts.filter(c => c.t <= t).pop(); if (cu && cu.bp && g === 'beam_rider') end = cu.bp; else { a = .07; cu = null; } }
              const fl = .86 + .14 * Math.sin(wall * 53 + k);
              if (g === 'radio_saclos') ribbons.add(o.lp, end, .55, .62, .72, .78, a * .5, a * .5); else { ribbons.add(o.lp, end, 1.7, 1, .14, .09, a * fl, a * fl); ribbons.add(o.lp, end, .5, 1, .72, .62, a * fl, a * fl); fire.add(o.lp.x, o.lp.y, o.lp.z, 7, .8, 1, .2, .14); }
              if (cu) fire.add(end.x, end.y, end.z, 22 + 6 * Math.sin(wall * 14), .75, 1, .2, .13); }
            if (th.track !== null && t >= th.track) ribbons.add(origin, pos, .5, .24, .82, .78, .2, .2);
          }
        } else {
          const ea = (t - e.t) / fxs; chip = ENDCHIP[e.type]; cls = e.type === 'hit' ? 'hit' : 'done';
          if (e.type === 'miss') { // flies on past the vehicle and digs in behind it
            const fa = Math.min(ea, .8), f2 = fa / .8; qA.copy(o.pe).addScaledVector(o.fwd, fa * 170); const gy = gh(qA.x, qA.z) + .5; qA.y = o.pe.y + (gy - o.pe.y) * f2 * f2;
            if (ea < .8) { o.missile.visible = true; o.missile.position.copy(qA); qB.copy(qA).addScaledVector(o.fwd, 6); qB.y -= f2 * 2.5; o.missile.lookAt(qB); fire.add(qA.x - o.fwd.x * 5, qA.y, qA.z - o.fwd.z * 5, 8, .8, 1, .7, .4); }
            else if (ea < 6) boom(qA, ea - .8, 'dirt', k * 7 + 1);
          } else if (ea < 8.5) boom(e.type === 'hit' ? origin : pos, ea, e.type, k * 7 + 1);
          if (e.type === 'hit') { hitT = Math.max(hitT, e.t); if (e.killing) deadT = deadT < 0 ? e.t : Math.min(deadT, e.t); if (ea < .6) shake = Math.max(shake, 7 * (1 - ea / .6)); }
          else if (ea < .35 && (e.type === 'aps_kill' || e.type === 'he_kill')) shake = Math.max(shake, (e.type === 'aps_kill' ? 2.2 : .8) * (1 - ea / .35));
        }
        if (g !== 'drone') { const K = 26, step = Math.min(1.8, rec.t_end / 11) / K, n0 = Math.floor(t / step); // exhaust trail: puffs stay where they were emitted
          for (let q = 0; q < K; q++) { const tq = (n0 - q) * step; if (tq < th.t0 || tq > e.t) continue; const pp = mpos(th, mstate(th, tq)), f = (t - tq) / (K * step), n = n0 - q; smoke.add(pp.x + (r1(k, n) - .5) * f * 4, pp.y + f * 2, pp.z + (r1(k + 5, n) - .5) * f * 4, 2 + f * 8.5, .4 * (1 - f) * (1 - f) * Math.min(1, f * 14), .88, .87, .85, n * 1.7, n & 3); } }
      }
      if (chipTxt[k] !== chip + cls) { chipTxt[k] = chip + cls; const el = $('#cineChips').children[k]; if (el) { el.className = 'chip ' + cls + (focus === k ? ' sel' : ''); el.lastChild.textContent = chip; } }
    }
    // gun, rounds, clouds
    let gb = null, gel = 0; const cr = carbon ? .2 : .8, cg = carbon ? .2 : .8, cb = carbon ? .215 : .78;
    for (const b of rec.bursts) {
      if (b.idx < 0) continue; const th = rec.threats[b.idx], he = b.kind === 'he';
      if (b.tf <= t + .7 * fxs) { gb = th.brg; const r0 = b.rounds[0]; if (r0) gel = Math.atan2(hAt(th, r0.d) - HV, Math.max(20, rr(r0.d))); }
      for (const r of b.rounds) {
        if (t < r.t_fire) continue; const fa = (t - r.t_fire) / fxs; if (fa < .09) muzHot = Math.max(muzHot, 1 - fa / .09); if (r.t_fire > lastFire || lastFire > t) lastFire = r.t_fire;
        if (fa < 1.5) smoke.add(mz.x + gd.x * fa * 7, mz.y + fa * 2.6, mz.z + gd.z * fa * 7, 2.5 + fa * 8, .3 * (1 - fa / 1.5), .8, .8, .78, r.t_fire * 9, 1);
        let d; if (t <= r.t_pass) d = r.d * (t - r.t_fire) / Math.max(r.t_pass - r.t_fire, 1e-3); else if (r.fate === 'downrange' && t < r.t_pass + 1.2) d = r.d + 700 * (t - r.t_pass);
        else { const xa = (t - r.t_pass) / fxs; if (he && xa < 2.6) { const fp = P(r.d, th.brg, 0, hAt(th, r.d)); if (xa < .1) fire.add(fp.x, fp.y, fp.z, 16 * (1 - xa / .1) + 5, 1, 1, .8, .5); for (let i = 0; i < 4; i++) { const a = r1(r.t_fire * 3, i) * 6.283; smoke.add(fp.x + Math.cos(a) * xa * 3, fp.y + Math.sin(a * 2) * 2 + xa, fp.z + Math.sin(a) * xa * 3, 5 + xa * 6, .55 * (1 - xa / 2.6), .13, .13, .14, a, i); } } continue; }
        const lat = clamp((r.ey || 0) * 1.5, -20, 20), hh = q => HV + (hAt(th, q) - HV) * Math.min(1, q / Math.max(r.d, 1)), near = Math.max(0, 1 - d / 150);
        const p1 = P(d, th.brg, lat, hh(d)), p0 = P(d * .84, th.brg, lat * .84, hh(d * .84)); p1.x += vp.x * near; p1.z += vp.z * near; p0.x += vp.x * near; p0.z += vp.z * near;
        ribbons.add(p0, p1, 1.3, 1, he ? .42 : .84, he ? .18 : .48, 0, 1); fire.add(p1.x, p1.y, p1.z, 3.4, 1, 1, he ? .5 : .9, he ? .25 : .6);
      }
      if (b.kind === 'obs' && b.puffs) for (let pi = 0; pi < b.puffs.length; pi++) {
        const p = b.puffs[pi], age = t - (b.t_ref + p.tf); if (age < 0 || age > 12) continue;
        const sig = Math.sqrt(p.s0 * p.s0 + 2 * rec.ctx.K * age), tau = HK.puffTau(p, t - b.t_ref, cfg.obs.alpha_m2_per_g, rec.ctx.K, 0, b.wind_cross), av = age / fxs;
        const c0 = P(p.d, th.brg, clamp((p.y0 + b.wind_cross * age) * 1.8, -45, 45), 0); c0.y = Math.max(gh(c0.x, c0.z) + 6, hAt(th, p.d) + clamp(p.z0, -4, 4));
        const sc = (17 + sig * 7.5) * Math.min(1, .25 + av * 2.8), op = Math.min(1, .5 + .5 * tau / b.tau_need) * Math.min(1, (12 - age) / 4), sd = Math.floor(b.tf * 31) + pi * 7;
        if (av < .14) { fire.add(c0.x, c0.y, c0.z, 13 * (1 - av / .14) + 4, .9, 1, .86, .62); for (let j = 0; j < 5; j++) { const a = r1(sd + 9, j) * 6.283, e2 = r1(sd + 10, j) * 2 - 1; qA.set(c0.x + Math.cos(a) * av * 90, c0.y + e2 * av * 70, c0.z + Math.sin(a) * av * 90); qB.set(c0.x + Math.cos(a) * av * 60, c0.y + e2 * av * 46, c0.z + Math.sin(a) * av * 60); ribbons.add(qB, qA, .6, 1, .8, .5, 0, 1 - av / .14); } }
        for (let j = 0; j < 9; j++) { const a = r1(sd, j) * 6.283, e2 = r1(sd + 1, j) * 2 - 1, rad = j ? sc * .42 * (.45 + .55 * r1(sd + 2, j)) : 0, cy = Math.sqrt(1 - e2 * e2), sh = .8 + .5 * r1(sd + 4, j);
          smoke.add(c0.x + Math.cos(a) * cy * rad, c0.y + e2 * rad * .75 + av * .4, c0.z + Math.sin(a) * cy * rad, sc * (j ? .42 + .24 * r1(sd + 3, j) : .7), op * (j ? .8 : .9), cr * sh, cg * sh, cb * sh, a + av * .11 * (j % 2 ? 1 : -1), (j + pi) & 3); }
      }
    }
    if (gb !== null) { const d = ((gb - gunB + 540) % 360) - 180, k = 1 - Math.exp(-dt * 9); gunB += d * k; gunEl += (gel - gunEl) * k; }
    rws.rotation.y = -(gunB - rec.ctx.hull) * DEG; gunPivot.rotation.x = gunEl; gunBarrel.position.z = -5.1 + .7 * Math.exp(-Math.max(0, t - lastFire) / (.07 * fxs));
    if (muzHot > 0) { fire.add(mz.x, mz.y, mz.z, 9 + 9 * hsh(Math.floor(wall * 60), 3), muzHot, 1, .9, .62); for (let j = 0; j < 4; j++) { const a = j * 1.57 + wall * 31; qA.set(mz.x + gd.x * 3 + Math.cos(a) * 4, mz.y + Math.sin(a) * 4, mz.z + gd.z * 3 + Math.sin(a) * 2); ribbons.add(mz, qA, .8, 1, .8, .5, muzHot, 0); } qB.copy(mz).addScaledVector(gd, 9); ribbons.add(mz, qB, 1.6, 1, .85, .55, muzHot, 0); }
    muzL.intensity = muzHot * 4; muzL.position.copy(mz);
    // APS interceptor
    for (const ap of rec.aps) { const aa = (t - ap.t) / fxs; if (aa < -.04 || aa > 3) continue; const a = ap.brg * DEG, dx = Math.sin(a), dz = -Math.cos(a), far = rr(maxR * .004) + 17; qC.set(origin.x + dx * 5, HV - 1.5, origin.z + dz * 5); qD.set(origin.x + dx * far, HV, origin.z + dz * far);
      if (aa < .1) { const f = Math.max(0, aa + .04) / .14; qA.lerpVectors(qC, qD, Math.min(1, f)); ribbons.add(qC, qA, 2.4, .82, .72, 1, .15, 1); fire.add(qC.x, qC.y, qC.z, 15 * (1 - f) + 4, 1, 1, .92, .82); }
      else { const ba = aa - .1; if (ba < .12) { fire.add(qD.x, qD.y, qD.z, 16 + 26 * ba / .12, (1 - ba / .12) * .9, .86, .8, 1); if (1.1 > boomHot) { boomHot = 1.1 * (1 - ba / .12); boomAt.copy(qD); } }
        if (ba < .7) for (let i = 0; i < 16; i++) { const s1 = (r1(ap.idx + 30, i) - .5) * 1.3, s2 = (r1(ap.idx + 31, i) - .3) * .9, sp = 50 + 90 * r1(ap.idx + 32, i); qA.set(qD.x + (dx - dz * s1) * sp * ba, qD.y + s2 * sp * ba - 40 * ba * ba, qD.z + (dz + dx * s1) * sp * ba); qB.set(qD.x + (dx - dz * s1) * sp * (ba - .04), qD.y + s2 * sp * (ba - .04) - 40 * (ba - .04) * (ba - .04), qD.z + (dz + dx * s1) * sp * (ba - .04)); ribbons.add(qB, qA, .7, .9, .8, 1, 0, 1 - ba / .7); }
        if (!ap.kill) for (let i = 0; i < 6; i++) { const an = r1(ap.idx + 33, i) * 6.283; smoke.add(qD.x + Math.cos(an) * ba * 6, qD.y + i * .6 + ba * 3, qD.z + Math.sin(an) * ba * 6, 6 + ba * 9, .5 * (1 - ba / 2.9), .5, .5, .53, an, i & 3); } } }
    // vehicle: damage, fire, dust, smoke screen
    const burn = deadT >= 0 ? 1 : hitT >= 0 ? .4 : 0; bodyMat.color.setScalar(1 - .78 * burn);
    if (deadT >= 0) column(origin.x, HV - 2, origin.z, (t - deadT) / fxs, tv, 91);
    if (rec.crew && rec.crew.evade !== null && t > rec.crew.evade) for (let i = 0; i < 16; i++) { const L = 2.4, a = (tv + i / 16 * L) % L, tb = t - a * fxs; if (tb < rec.crew.evade) continue; const d0 = dispAt(tb), d1 = dispAt(tb + .05 * fxs); if (Math.abs(d1 - d0) < .02) continue; const sg = d1 > d0 ? -1 : 1, k = a / L, sd = (i % 2 ? 1 : -1) * 5.5;
      smoke.add(Math.sin(hullA) * (d0 + sg * 10) + Math.cos(hullA) * sd, 1.5 + a * 3.5, -Math.cos(hullA) * (d0 + sg * 10) + Math.sin(hullA) * sd, 5 + a * 9, .42 * (1 - k) * Math.min(1, a * 6), .66, .58, .45, i + a * .3, i & 3); }
    if (rec.crew && rec.crew.smoke !== null && t >= rec.crew.smoke) { const c = rec.crew, sa = (t - c.smoke) / fxs, grow = clamp((t - c.smoke) / c.form, 0, 1), fade = clamp((c.smoke + c.form + c.dur + 3 - t) / 3, 0, 1), d0 = dispAt(c.smoke), bx = Math.sin(hullA) * d0, bz = -Math.cos(hullA) * d0, wd = rec.ctx.wind_dir * DEG, drf = Math.min(18, (t - c.smoke) * rec.ctx.wind * .25);
      for (let i = 0; i < 9; i++) { const a = hullA + (i - 4) * .38, rx = Math.sin(a), rz = -Math.cos(a), R0 = 36 + (i % 2) * 6, fl = Math.min(1, sa / .45);
        if (sa < .45) { qA.set(bx + rx * R0 * fl, HV + 13 * Math.sin(fl * Math.PI), bz + rz * R0 * fl); qB.set(bx + rx * R0 * Math.max(0, fl - .12), HV + 13 * Math.sin(Math.max(0, fl - .12) * Math.PI), bz + rz * R0 * Math.max(0, fl - .12)); ribbons.add(qB, qA, .7, 1, .9, .7, 0, .9); }
        else { if (sa < .57) fire.add(bx + rx * R0, 3, bz + rz * R0, 12, 1 - (sa - .45) / .12, 1, .95, .85);
          for (let j = 0; j < 4; j++) { const s = i * 5 + j, rad = (4 + 15 * grow) * (.4 + r1(s, 60)), an = r1(s, 61) * 6.283; smoke.add(bx + rx * R0 + Math.cos(an) * rad + Math.sin(wd) * drf, 4 + grow * (5 + 13 * r1(s, 62)), bz + rz * R0 + Math.sin(an) * rad - Math.cos(wd) * drf, (10 + 32 * grow) * (.7 + .5 * r1(s, 63)), .7 * Math.min(1, (sa - .45) * 4) * fade, .7, .71, .72, an + sa * .05, s & 3); } } } }
    for (const c of calls) { if (t < c.t) { c.at = null; c.o.on = false; continue; } if (c.at === null) c.at = wall; const age = wall - c.at; c.o.on = age < 3.4; if (c.o.on) { c.o.p.copy(c.base); c.o.p.y += 9 + age * 3.5; } }
    // camera
    let want, look, fov = 46, sid = mode, stiff = 3.2, up = 0;
    const wide = () => { const a = (baseA + orbAz + (mode === 'orbit' ? 0 : 20 * Math.sin(drift))) * DEG, RC = 215 * orbZoom, HC = Math.max(7, (78 + orbEl + (mode === 'orbit' ? 0 : 9 * Math.sin(drift * .7))) * orbZoom); want = V3(vp.x + RC * Math.sin(a), HC, vp.z - RC * Math.cos(a)); look = V3(vp.x - 120 * orbZoom * Math.sin(a), -4, vp.z + 120 * orbZoom * Math.cos(a)); };
    if (mode === 'top') { const a = (baseA + 180) * DEG; up = a; want = V3(150 * Math.sin(a), 480, -150 * Math.cos(a)); look = V3(150 * Math.sin(a), 0, -150 * Math.cos(a)); }
    else if (mode === 'ride' && ride) { const p = ride.pos, ux = ride.o.back.x, uz = ride.o.back.z; want = V3(p.x + ux * 60 + uz * 13, p.y + 19, p.z + uz * 60 - ux * 13); look = V3(p.x - ux * 90, Math.max(4, p.y - 12), p.z - uz * 90); sid = 'ride' + ride.th.idx; stiff = 10; fov = 50; }
    else if (mode === 'sight') { sightK = focus >= 0 ? focus : (ride ? ride.th.idx : sightK); const o = th3[sightK] || th3[0]; want = V3(o.lp.x + o.fwd.x * 7, o.lp.y + 2.2, o.lp.z + o.fwd.z * 7); look = origin.clone(); look.y = HV - 3; fov = 12; sid = 'sight' + o.th.idx; stiff = 14; }
    else if (mode === 'auto') { const sh = speed === 'cine' ? autoShot(fxs) : null; wide();
      if (sh) { const o = sh.o, s = sh.s; tA.set(-o.fwd.z, 0, o.fwd.x); if (s.sg == null) { const pref = sunDir.x * tA.x + sunDir.z * tA.z >= 0 ? 1 : -1, tx = s.kind === 'side' ? s.at.x : vp.x, tz = s.kind === 'side' ? s.at.z : vp.z, free = g => { const cx = tx + tA.x * g * 75, cz = tz + tA.z * g * 75; let mn = 1e9; for (const ob of obst) { const ux = cx - tx, uz = cz - tz, l2 = ux * ux + uz * uz, k = clamp(((ob.x - tx) * ux + (ob.z - tz) * uz) / l2, 0, 1.25), dd = Math.hypot(ob.x - tx - ux * k, ob.z - tz - uz * k) - ob.r; if (dd < mn) mn = dd; } return mn; }; s.sg = free(pref) > 6 || free(pref) >= free(-pref) ? pref : -pref; s.hi = free(s.sg) < 6 ? 26 : 0; }
        const sg = s.sg; sid = 'auto' + o.th.idx + s.kind + s.t.toFixed(2); stiff = 2.2;
        if (s.kind === 'side') { const dd = cfg.env.terrain === 'open' ? 86 : 64; want = V3(s.at.x + tA.x * sg * dd - o.fwd.x * 22, s.at.y + 20 + s.hi, s.at.z + tA.z * sg * dd - o.fwd.z * 22); look = V3(s.at.x - o.fwd.x * 8, s.at.y, s.at.z - o.fwd.z * 8); fov = 40; }
        else { want = V3(vp.x + tA.x * sg * 70 + o.fwd.x * 52, 27 + s.hi, vp.z + tA.z * sg * 70 + o.fwd.z * 52); look = V3(vp.x - o.fwd.x * 16, 7, vp.z - o.fwd.z * 16); fov = 44; } } }
    else wide();
    if (sid !== shotId || !camP) { const cut = !!shotId && !!camP && sid !== shotId; camP = want.clone(); camL = look.clone(); camF = fov; if (cut) { const f = $('#cineFade'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); } shotId = sid; }
    else { const k = 1 - Math.exp(-dt * stiff); camP.lerp(want, k); camL.lerp(look, k); camF += (fov - camF) * k; }
    cam.position.copy(camP); if (shake > 0) { cam.position.x += (hsh(wall * 91, 1) - .5) * shake; cam.position.y += (hsh(wall * 91, 2) - .5) * shake; cam.position.z += (hsh(wall * 91, 3) - .5) * shake; }
    cam.position.y = Math.max(cam.position.y, gh(cam.position.x, cam.position.z) + 2.5);
    if (mode === 'top') cam.up.set(Math.sin(up), 0, -Math.cos(up)); else cam.up.set(0, 1, 0); cam.lookAt(camL); if (Math.abs(cam.fov - camF) > .01) { cam.fov = camF; cam.updateProjectionMatrix(); }
    $('#cineScope').hidden = mode !== 'sight';
    cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert(); smoke.m.uniforms.sunV.value.copy(sunDir).transformDirection(cam.matrixWorldInverse);
    smoke.flush(); fire.flush(); ribbons.flush();
    boomL.intensity = Math.min(2.2, boomHot) * 14; boomL.position.copy(boomAt); boomL.position.y += 4;
    sunL.position.copy(vp).addScaledVector(sunDir, 650); sunL.target.position.copy(vp); sky.material.uniforms.time.value = wall;
    if (rain) { const a = rain.geometry.attributes.position, cp = cam.position; for (let i = 0; i < 700; i++) { const x = cp.x + (r1(i, 70) - .5) * 260, z = cp.z + (r1(i, 71) - .5) * 260, y = ((r1(i, 72) * 90 - wall * 95) % 90 + 90) % 90 + cp.y - 40; a.setXYZ(i * 2, x, y, z); a.setXYZ(i * 2 + 1, x + 1.2, y + 5, z); } a.needsUpdate = true; }
    placeLabels();
    if (post && Q >= 1) post.render(scene, cam, wall); else { R.setRenderTarget(null); R.render(scene, cam); }
  }
  // ---- flat fallback when WebGL is unavailable
  function plan2D() {
    const C = 320, RM = 285, rpx = d => RM * Math.sqrt(Math.max(d, 0) / maxR), pol = (d, brg, lat) => { const r = rpx(d), a = brg * DEG, x = C + r * Math.sin(a), y = C - r * Math.cos(a); return lat ? [x + lat * Math.cos(a), y + lat * Math.sin(a)] : [x, y]; };
    maxR = Math.max(1000, ...rec.threats.map(x => x.R)) * 1.06; let s = `<circle cx="${C}" cy="${C}" r="${RM}" fill="none" stroke="var(--line)"/>`;
    for (const r of [250, 500, 1000, 2000, 4000, 8000].filter(r => r <= maxR)) s += `<circle cx="${C}" cy="${C}" r="${rpx(r)}" fill="none" stroke="var(--line)" stroke-dasharray="2 4"/><text x="${C + 4}" y="${C - rpx(r) - 3}" font-size="10" fill="var(--dim)">${r >= 1000 ? r / 1000 + ' km' : r + ' m'}</text>`;
    for (const b of rec.bursts) if (b.kind === 'obs' && b.puffs) for (const p of b.puffs) { const age = t - (b.t_ref + p.tf); if (age < 0 || age > 12) continue; const th = rec.threats[b.idx], sig = Math.sqrt(p.s0 * p.s0 + 2 * rec.ctx.K * age), [x, y] = pol(p.d, th.brg, clamp((p.y0 + b.wind_cross * age) * 1.5, -40, 40)); s += `<circle cx="${x}" cy="${y}" r="${Math.min(34, 5 + sig * 1.6)}" fill="var(--cloud)" opacity="${(.5 * Math.max(0, 1 - age / 12)).toFixed(2)}"/>`; }
    for (const th of rec.threats) { const c = TCOL[th.idx % TCOL.length], [lx, ly] = pol(th.R, th.brg), m = mstate(th, t); s += `<path d="M${lx},${ly - 6} l5,9 h-10 Z" fill="${c}"/><text x="${lx + 9}" y="${ly + 3}" font-size="11" fill="${c}">${th.idx + 1} · ${TH[th.key].short}</text>`;
      if (m && m.alive) { const [x, y] = pol(m.d, th.brg, m.lat * .8); s += `<line x1="${lx}" y1="${ly}" x2="${x}" y2="${y}" stroke="var(--laser)" stroke-dasharray="${m.mode === 'guided' ? '5 3' : '1 6'}" opacity=".7"/><circle cx="${x}" cy="${y}" r="4.5" fill="${m.mode === 'guided' ? c : 'var(--lwr)'}"/>`; } }
    for (const b of rec.bursts) if (b.idx >= 0) for (const r of b.rounds) { if (t < r.t_fire || t > r.t_pass) continue; const [x, y] = pol(r.d * (t - r.t_fire) / Math.max(r.t_pass - r.t_fire, 1e-3), rec.threats[b.idx].brg); s += `<circle cx="${x}" cy="${y}" r="2.6" fill="var(--round)"/>`; }
    s += `<g transform="translate(${C},${C}) rotate(${rec.ctx.hull})"><rect x="-7" y="-11" width="14" height="22" rx="2" fill="var(--fg)"/><path d="M0,-18 l4,6 h-8 Z" fill="var(--fg)"/></g>`; $('#planSvg').innerHTML = s;
  }
  // ---- player
  const mounted = () => $('#cineBox').offsetParent !== null && !document.hidden, inHero = () => $('#cineBox').parentElement.id === 'heroSlot';
  function setPlaying(v) { playing = v; if (v) hold = 0; $('#cinePlay').textContent = v ? 'Pause' : 'Play'; $('#cinePlay').classList.toggle('primary', !v); }
  let slowOn = null; const slowUI = v => { if (v !== slowOn) { slowOn = v; $('#cineSlow').classList.toggle('on', v); } };
  function hud() {
    let ev = null; for (const x of rec.events) { if (x.t <= t + 1e-6) ev = x; else break; }
    $('#cineClock').textContent = t.toFixed(1) + ' s'; const cap = ev ? ev.text : 'Enemy launchers are in position…', ce = $('#cineCap'); if (ce.textContent !== cap) ce.textContent = cap;
    if (!dragging) { const sl = $('#cineSlider'); sl.value = t; sl.style.setProperty('--p', ((t - t0c) / Math.max(.01, rec.t_end - t0c) * 100).toFixed(2) + '%'); }
    if (rec.crew) { const sv = HK.crewStress(rec.crew, t), st = HK.crewState(sv), el = $('#cineCrewS'); if (el.textContent !== st) { el.textContent = st; el.className = 'cs-' + st; } const mt = $('#cineCrewM'); mt.style.width = sv.toFixed(0) + '%'; mt.style.background = `var(${{ CALM: '--good', ALERT: '--radar', STRESSED: '--lwr', PANIC: '--laser' }[st]})`; }
  }
  function loop(ts) {
    raf = 0; if (!rec || !mounted()) return; const dt = Math.min(.1, (ts - last) / 1000 || 0); last = ts; wall += dt;
    if (ok && !qLock && Q > 0) { if (dt > 1 / 24) slowT += dt; else slowT = Math.max(0, slowT - dt * .5); if (slowT > 1.8) { Q--; slowT = 0; applyQ(); } }
    if (playing && !dragging) {
      drift += dt * .2;
      if (t < rec.t_end) { let target = +speed; if (speed === 'cine') { const slow = beats.some(b => t > b - .1 * base && t < b + .22 * base); slowUI(slow); target = base * (slow ? .22 : 1); } else slowUI(false);
        rate += (target - rate) * (1 - Math.exp(-dt * 7)); t = Math.min(rec.t_end, t + dt * rate); }
      else { slowUI(false); const v = $('#cineVerdict'); if (v.hidden) { v.hidden = false; v.className = 'cineverdict ' + (rec.killed ? 'bad' : rec.hits ? 'mid' : 'ok'); v.textContent = rec.killed ? 'Vehicle destroyed' : rec.hits ? 'Hit, but survived' : `All ${rec.threats.length} threats defeated`; }
        hold += dt; if (inHero()) { if (hold > 5) seek(t0c); } else if (hold > 2.5) setPlaying(false); }
    } else slowUI(false);
    if (ok) frame(dt); else plan2D(); hud(); if (hooks.frame) hooks.frame(t);
    raf = requestAnimationFrame(loop);
  }
  function seek(v, pause) { if (!rec) return; t = clamp(v, t0c, rec.t_end); hold = 0; $('#cineVerdict').hidden = true; for (const c of calls) { c.at = c.t <= t - .05 ? -1e9 : null; c.o.on = false; } if (pause) setPlaying(false); kick(); }
  function kick() { if (!rec) return; if (!ok && !failed) init(); resize(); if (!raf && mounted()) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function use(r, i) {
    idx = i; if (init()) load(r, i); else { rec = r; t0c = 0; t = 0; base = Math.max(1, r.t_end / 20); rate = base; calls = []; beats = []; }
    const sl = $('#cineSlider'); sl.min = t0c.toFixed(2); sl.max = rec.t_end.toFixed(2); sl.value = t0c; const span = Math.max(.01, rec.t_end - t0c);
    $('#cineTicks').innerHTML = rec.events.filter(e => ['cut', 'hit', 'kill', 'crew', 'fire'].includes(e.kind) && e.t >= t0c).map(e => `<i class="k-${e.kind}" style="left:${((e.t - t0c) / span * 100).toFixed(2)}%"></i>`).join('');
    chipTxt = rec.threats.map(() => ''); $('#cineChips').innerHTML = rec.threats.map(th => `<button type="button" class="chip" data-i="${th.idx}" title="Follow this threat"><b style="background:${TCOL[th.idx % TCOL.length]}">${th.idx + 1}</b>${TH[th.key].short}<em></em></button>`).join('');
    $('#cineMission').textContent = `Raid ${i + 1} of ${run.cfg.missions.toLocaleString()}${view === 'main' ? '' : ' · ' + VIEW_NAME[view]}`;
    setPlaying(true); if (typeof Wall !== 'undefined') Wall.select(view, i); if (hooks.load) hooks.load(rec, i, view); kick();
  }
  function show(v, i) { if (!LAST || !LAST.runs[v]) return; view = v; run = LAST.runs[v]; use(HK.replayMission(run.cfg, run.lookup, i), i); }
  function pick(from) {
    if (!LAST) return; view = 'main'; run = LAST.runs.main; const per = LAST.res.main.per, n = run.cfg.missions; let fb = -1;
    for (let k = 0; k < Math.min(n, 500); k++) { const i = (from + k) % n; if (per.hits[i] !== 0) continue; if (fb < 0) fb = i; const r = HK.replayMission(run.cfg, run.lookup, i);
      if (r.t_end < 40 && !r.bursts.some(b => b.kind === 'false') && r.threats.length >= Math.min(3, run.cfg.enemy.raid_size) && r.threats.some(x => x.defeated_by === 'hkoi_cut') && r.threats.some(x => x.viz.end.type === 'miss')) { use(r, i); return; } }
    const i = fb >= 0 ? fb : from % n; use(HK.replayMission(run.cfg, run.lookup, i), i);
  }
  function setMode(m, quiet) { mode = m; if (m !== 'orbit') { orbAz = 0; orbEl = 0; orbZoom = 1; } $$('#cineModes button').forEach(x => x.setAttribute('aria-pressed', x.dataset.mode === m)); kick(); }
  function step(dir) { if (!rec) return; if (dir > 0) { const e = rec.events.find(e => e.t > t + .005); seek(e ? Math.max(e.t, t0c) + .001 : rec.t_end, true); } else { const past = rec.events.filter(e => e.t < t - .01); seek(past.length ? Math.max(past[past.length - 1].t, t0c) + .001 : t0c, true); } }
  function mount(slot) { const b = $('#cineBox'); if (b.parentElement !== slot) { slot.appendChild(b); W = 0; } kick(); }
  return { start: kick, pick, show, seek, step, mount, setMode, resize, hooks, next: () => pick(idx + 1),
    toggle() { if (!rec) return; if (!playing && t >= rec.t_end - .01) seek(t0c); setPlaying(!playing); kick(); },
    setSpeed(v) { speed = v; rate = v === 'cine' ? base : +v; }, setOverlay(v) { overlay = v; $('#cine').classList.toggle('bare', !v); }, drag(v) { dragging = v; },
    focus(i) { focus = focus === i ? -1 : i; chipTxt = chipTxt.map(() => ''); if (focus >= 0 && mode !== 'ride' && mode !== 'sight') setMode('ride'); },
    get idx() { return idx; }, get view() { return view; }, get rec() { return rec; }, get t() { return t; }, get t0() { return t0c; }, get playing() { return playing; } };
})();
