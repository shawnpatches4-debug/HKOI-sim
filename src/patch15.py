u = open('ui10.html').read()
R = []
def r(a, b, cnt=1): R.append((a, b, cnt))
def cut(text, start, end, repl):
    i = text.index(start); j = text.index(end, i); assert text.count(start) == 1, start
    return text[:i] + repl + text[j:]
cine = ''.join(open(f).read() for f in ['cine10a.js', 'cine10b.js', 'cine10c.js'])
a = "  return { start: kick, pick, show, seek, step, mount, setMode, resize, hooks, next: () => pick(idx + 1),"
assert cine.count(a) == 1
cine = cine.replace(a, ''.join(open(f).read() for f in ['vehhd.js', 'vehm1.js', 'split_m1.js', 'vol.js', 'cab.js', 'sbx3d14.js']) + a.replace("return { start: kick,", "return { Sandbox3D, start: kick,"))
u = cut(u, '// ================================================================ 3D replay (shared by Overview and Watch a mission)', '// ================================================================ replay (Watch a mission)', cine + '\n')
# swap in the v11 sandbox controller (with sound)
u = cut(u, '// ================================================================ live sandbox: place the launchers', '// ================================================================ value tiles, assumptions', open('snd14.js').read() + open('sbx_ui14.js').read() + '\n')
u = cut(u, '  <section class="pane" id="tab-sandbox">', '  <section class="pane" id="tab-overview"', open('sbx14.html').read())
cs = open('css10.css').read(); assert u.count(cs) == 1; u = u.replace(cs, open('css14.css').read())
r("'spec', 'Datasheet: 60–120 rounds, belt-fed'", "'spec', 'Design choice (v16): 300 rounds split evenly; earlier datasheet 60–120'")
r('<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>', '''<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js"></script>''')
r("<span>Mission simulator v10</span>", "<span>Mission simulator v40</span><span id='gfxStat' class='gfxstat'></span>")
r("<span>Simulation results, not validated system performance</span></footer>", """<span>Simulation results, not validated system performance</span><span class="credits">Tank: M1A2 SEPv2 with Trophy model from Sketchfab (author credit to be added) · crew voices: Chatterbox by Resemble AI (MIT) and Kokoro TTS (Apache-2.0) · crew screams: 0 A.D. by Wildfire Games (CC-BY-SA 3.0, wildfiregames.com) · enemy Russian calls: Russian crew voice pack supplied by the owner (licence not independently confirmed) · panic, hit and wound voices: SOID PTSD v8 sound pack (supplied by the owner as open source; licence not independently confirmed) · 3D crew: Microsoft Rocketbox avatars (MIT licence) · sky lighting: Poly Haven “Spruit Sunrise” HDRI (CC0) · cloud texture: pmndrs drei (CC0) · terrain and effects generated in the browser</span></footer>""")
r(".foot{margin-top:28px;", ".foot .credits{flex-basis:100%;font-size:11px;opacity:.85}\n.foot{margin-top:28px;")
r("<li><b>Simplifications.</b> One vehicle,", "<li><b>Armour and damage.</b> The x-ray and damage reports place each hit from the attack direction and the turret angle, and compare the warhead’s penetration with the armour there. Armour and penetration figures are open-source estimates (for example about 1,300 mm line-of-sight against shaped charges on the turret front, about 60 mm on the roof, and about 1,150 mm for a Kornet-class tandem warhead). The damage model never contradicts the engine: a hit the engine scores as a kill always penetrates somewhere that kills.</li>\n          <li><b>Sights.</b> The thermal sights show apparent temperature from a simple model (sky cold, vegetation cool, soil by sun angle, engines, motors and people hot). They are an illustration, not a model of any real sensor.</li>\n          <li><b>Crew and driving.</b> The crew react on the warning, as drilled: the commander slews the turret onto the threat bearing and orders the driver off at once, and they judge again about 4 s before impact. The driver steers in two dimensions with Abrams-class mobility (pivot steer about 45°/s, 30°/s at speed, up to 12 m/s forward and 8 m/s in reverse, 0–32 km/h in about 6 s): he turns the hull square to the threat, left or right, forward or reverse, whichever is cheapest given every other missile still in the air, and weaves. When HKOI fires, the gunner calls “driver, steady” and the driver eases to 4 m/s. The turret traverses at 40°/s (the documented Abrams maximum) and HKOI’s mount slews on top of it. Stress builds from warnings, several missiles at once, near misses, freezes and hits. A panicking crew trusts the warner less, aims worse, reacts later, pops smoke more often and can flee straight down the threat axis or freeze (12% of panics for a veteran crew, 30% trained, 45% green). The intercom lines follow the crew’s stress at the moment they are spoken. All of this is an assumption, not measured behaviour.</li>\n          <li><b>Simplifications.</b> One vehicle,")

# ---- v18 credibility block
r("// ================================================================ sensitivity", open('cred.js').read().replace('class="btn2"','class="btn"') + "// ================================================================ sensitivity")
r("function engineCfg() {", "function engineCfg() { return applyMeasured(engineCfg0()); }\nfunction engineCfg0() {")
r("  renderHeadline(); renderWhat(); renderCrew(); renderDetails(); renderValue(); renderAssumptions(); syncControls()", "  renderHeadline(); renderWhat(); renderCrew(); renderDetails(); renderValue(); renderAssumptions(); credAfterRun(); syncControls()")
r("""  $('#asTable').innerHTML = '<tr><th>Input</th><th>Value in this run</th><th>Basis</th><th>Where it comes from</th></tr>' + rows.map(([a, b, k, s]) => `<tr><td>${a}</td><td>${b}</td><td><span class="basis ${k}">${B[k]}</span></td><td>${s}</td></tr>`).join('');""",
"""  rows.push(...credRows(c)); B.meas = 'MEASURED';
  $('#asTable').innerHTML = '<tr><th>Input</th><th>Value in this run</th><th>Basis</th><th>Confidence</th><th>Where it comes from</th></tr>' + rows.map(([a, b, k, s]) => { const ms = c.measured && c.measured[a], cf = ms ? ['Measured', 'Replaced by test data'] : (CONF[a] || [k === 'spec' ? 'Medium' : k === 'asm' ? 'Low' : 'Medium', '']);
    return `<tr><td>${a}</td><td>${b}</td><td><span class="basis ${ms ? 'meas' : k}">${B[ms ? 'meas' : k]}</span></td><td><span class="conf c-${cf[0].toLowerCase()}">${cf[0]}</span><div class="cap">${cf[1]}</div></td><td>${ms ? '<b>Measured:</b> ' + ms : s}</td></tr>`; }).join('');""")
r("""    <div class="grid2" style="margin-top:12px">
      <div class="card">
        <h3>Known limits</h3>""", open('cred.html').read().replace('class="btn2"','class="btn"') + """    <div class="grid2" style="margin-top:12px">
      <div class="card">
        <h3>Known limits</h3>""")
r("<li><b>Simplifications.</b> One vehicle,", """<li><b>Enemy gunner jitter.</b> The default 3 mrad is the designer’s figure for a mounted launcher. At that value an unprotected vehicle already survives most raids, because many missiles miss by themselves; that is higher than open-source accounts of missile hit rates suggest, so a reviewer may ask for the source. Run a lower value alongside it (the slider is in the sandbox’s mission editor, or use the measured-data box) to show the result does not rest on it.</li>
          <li><b>Platoon and tank duel.</b> Sandbox only. Tanks share airburst fire by a simple rule; a neighbour’s smoke blocking a sight line is measured but does not change the outcome. The gunnery duel is an illustrative model. Terrain is statistical: there are no hills or buildings that block a line of sight.</li>
          <li><b>Not yet modelled.</b> Jamming or dazzling of HKOI’s sensors, crew injury and fatigue, damage to individual systems, more than one raid in a row, and what happens after the radar is located.</li>
          <li><b>Sound and graphics.</b> For illustration only. They are driven by the simulation but prove nothing about it.</li>
          <li><b>Simplifications.</b> One vehicle,""")
r(".basis.spec{color:var(--radar)}", """.basis.meas{color:#fff;background:var(--good);border-color:var(--good)}
.conf{font:600 11px var(--f-mono);padding:2px 6px;border-radius:3px}.conf.c-high{color:var(--good)}.conf.c-medium{color:var(--lwr)}.conf.c-low{color:var(--laser)}.conf.c-measured{color:#fff;background:var(--good)}
.mono-ta{width:100%;box-sizing:border-box;font:12px/1.45 var(--f-mono);background:var(--bg2,#0b1512);color:var(--fg);border:1px solid var(--line2);border-radius:6px;padding:8px;resize:vertical}
.row-gap{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
.vlist{list-style:none;padding:0;margin:8px 0;display:flex;flex-direction:column;gap:4px;font-size:13px}.vlist b{font:700 11px var(--f-mono);margin-right:6px}.vf-ok b{color:var(--good)}.vf-bad b{color:var(--laser)}
.vchip{font:600 11px var(--f-mono);padding:2px 8px;border-radius:10px;border:1px solid var(--line2);margin-left:8px;vertical-align:middle}.vchip.ok{color:var(--good);border-color:var(--good)}.vchip.bad{color:var(--laser);border-color:var(--laser)}
.st-bar{display:inline-block;height:9px;border-radius:2px;vertical-align:middle}.st-all td{border-top:2px solid var(--line2);font-weight:600}
td.bad,.cap.bad{color:var(--laser)}td.good,.cap.good{color:var(--good)}
.basis.spec{color:var(--radar)}""")
r("$('#sensBtn').addEventListener('click', runSens);", "$('#sensBtn').addEventListener('click', runSens); credInit();")
for a, b, cnt in R:
    assert u.count(a) == cnt, (u.count(a), a[:100])
    u = u.replace(a, b)
open('ui11.html', 'w').write(u)
u = u.replace('const Cine = (() => {', open('dmg.js').read() + '\n' + open('campaign.js').read() + '\n' + open('tactics.js').read() + '\nconst Cine = (() => {', 1)
full = u.replace('/*ENGINE*/', open('engine.js').read())
i_css = full.index('</style>'); full = full[:i_css] + open('ui2.css').read() + full[i_css:] + '\n<script>\n' + open('ui2.js').read() + '\n</script>\n'
open('hkoi-mission-sim.html', 'w').write(full)
L = '../t/node_modules/three/'
t = full.replace('https://cdn.jsdelivr.net/npm/three@0.128.0/', L)
a = "const Cine = (() => {"
open('test.html', 'w').write(t.replace(a, "window.__L = () => LAST; window.__C = () => Cine; window.__SB = () => SBX; window.__SND = () => SND;\n" + a))
print('built', len(u), len(full))
