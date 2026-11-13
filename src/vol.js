  // ================================================================ volumetric obscurant cloud: ray-marched through the engine's own puffs
  // Extinction at a point is the true concentration times the mass extinction coefficient:
  //   k(p) = alpha * sum_i m_i / ((2 pi)^1.5 sigma_i^3) * exp(-|p - c_i|^2 / (2 sigma_i^2))   [1/m]
  // so a ray straight through a puff's centre accumulates alpha m / (2 pi sigma^2), the same optical depth the engine uses.
  const VOL_N = 10;
  const VOL_V = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
  const VOL_F = `
    uniform vec4 uP[${VOL_N}]; uniform float uK[${VOL_N}]; uniform int uN; uniform vec3 uMin; uniform vec3 uMax;
    uniform vec3 uSun; uniform vec3 uSunC; uniform vec3 uAmb; uniform vec3 uAlb; uniform float uTime; uniform vec3 uFogC; uniform float uFogD;
    varying vec3 vW;
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ return 0.55 * n3(p) + 0.28 * n3(p * 2.03 + 7.1) + 0.17 * n3(p * 4.11 + 3.3); }
    float dens(vec3 p){ float s = 0.0; for (int i = 0; i < ${VOL_N}; i++){ if (i >= uN) break; vec3 d = p - uP[i].xyz; float s2 = uP[i].w * uP[i].w; s += uK[i] * exp(-dot(d, d) / (2.0 * s2)); } return s; }
    void main(){
      vec3 ro = cameraPosition, rd = normalize(vW - ro);
      vec3 t0 = (uMin - ro) / rd, t1 = (uMax - ro) / rd, tn3 = min(t0, t1), tf3 = max(t0, t1);
      float tn = max(max(max(tn3.x, tn3.y), tn3.z), 0.0), tf = min(min(tf3.x, tf3.y), tf3.z); if (tf <= tn) discard;
      const int ST = 36; float dt = (tf - tn) / float(ST), T = 1.0; vec3 L = vec3(0.0);
      float t = tn + dt * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      float cosT = dot(rd, uSun), phase = 0.6 + 0.9 * pow(max(cosT, 0.0), 6.0);
      for (int i = 0; i < ST; i++){
        vec3 p = ro + rd * t; float d = dens(p);
        if (d > 0.0005){
          float w = fbm(p * 0.32 + vec3(0.0, uTime * 0.12, uTime * 0.05)); d *= 0.35 + 1.3 * w * w;
          float ls = dens(p + uSun * 2.0) * 2.0 + dens(p + uSun * 5.0) * 3.0;
          vec3 Lp = uAlb * (uAmb * (0.55 + 0.45 * w) + uSunC * exp(-ls) * phase);
          float a = 1.0 - exp(-d * dt); L += T * a * Lp; T *= 1.0 - a; if (T < 0.015) break;
        }
        t += dt; if (t > tf) break;
      }
      float fog = 1.0 - exp(-uFogD * uFogD * tn * tn); L = mix(L, uFogC * (1.0 - T), fog);
      gl_FragColor = vec4(L, 1.0 - T);
    }`;
  function VolCloud() {
    const P = Array.from({ length: VOL_N }, () => new THREE.Vector4()), K = new Array(VOL_N).fill(0);
    const m = new THREE.ShaderMaterial({ uniforms: { uP: { value: P }, uK: { value: K }, uN: { value: 0 }, uMin: { value: V3(0, 0, 0) }, uMax: { value: V3(1, 1, 1) }, uSun: { value: V3(0, 1, 0) }, uSunC: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uAlb: { value: new THREE.Color() }, uTime: { value: 0 }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0 } },
      vertexShader: VOL_V, fragmentShader: VOL_F, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.visible = false;
    return { mesh, m, P, K,
      set(list, floorY) { // list of { x, y, z, s, k } in world metres; nearby puffs are merged to keep the shader cheap
        const L = []; for (const q of list) { const o = L.find(r => (r.x - q.x) ** 2 + (r.y - q.y) ** 2 + (r.z - q.z) ** 2 < (0.45 * Math.min(r.s, q.s)) ** 2); if (o) { const w = o.k * o.s ** 3, w2 = q.k * q.s ** 3; o.x = (o.x * w + q.x * w2) / (w + w2); o.y = (o.y * w + q.y * w2) / (w + w2); o.z = (o.z * w + q.z * w2) / (w + w2); o.k = (w + w2) / o.s ** 3; } else L.push(Object.assign({}, q)); }
        L.sort((a, b) => b.k * b.s ** 3 - a.k * a.s ** 3); const n = Math.min(VOL_N, L.length); m.uniforms.uN.value = n; if (!n) { mesh.visible = false; return; }
        let lo = V3(1e9, 1e9, 1e9), hi = V3(-1e9, -1e9, -1e9);
        for (let i = 0; i < n; i++) { const q = L[i]; P[i].set(q.x, q.y, q.z, q.s); K[i] = q.k; const r = q.s * 3.2; lo.min(V3(q.x - r, q.y - r, q.z - r)); hi.max(V3(q.x + r, q.y + r, q.z + r)); }
        if (floorY != null) lo.y = Math.max(lo.y, floorY); if (hi.y <= lo.y + .5) { mesh.visible = false; return; } m.uniforms.uMin.value.copy(lo); m.uniforms.uMax.value.copy(hi); mesh.position.copy(lo).add(hi).multiplyScalar(.5); mesh.scale.copy(hi).sub(lo); mesh.visible = true;
      } };
  }
