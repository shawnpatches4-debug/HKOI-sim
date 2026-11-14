// node tests/battle/cloud.js : which cloud assumption moves the answer. The engine's own table (chance one Kornet's beam is cut, by distance from the vehicle where the rounds meet it), as built and with one input changed at a time. Nothing here changes the defaults.
const { HK } = require('./load.js');
const row = (label, f) => { const c = HK.defaultConfig(); c.enemy.mix = { kornet: 1 }; f(c); const L = HK.meetLookup(c, 200).kornet; const at = d => Math.round(100 * L.p[L.grid.indexOf(d)]); console.log(label.padEnd(46), 'best', Math.round(100 * L.best_p) + '% at', L.best_m, 'm | at 600/900/1200/1500/2000 m:', [600, 900, 1200, 1500, 2000].map(at).join(' / ')); };
row('AS BUILT (75 g from Shawn, 99% block needed, burst 4)', c => {});
row('the old 40 g', c => { c.rnd.payload_g = 40; });
row('near-IR fill 2.0 m2 per g (old page preset, untested)', c => { c.obs.alpha_m2_per_g = 2.0; });
row('payload 120 g', c => { c.rnd.payload_g = 120; });
row('95% block is enough (margin 3.0)', c => { c.obs.tau_lock_margin = 3.0; });
row('90% block is enough (margin 2.3)', c => { c.obs.tau_lock_margin = 2.3; });
row('burst of 8', c => { c.gun.burst = 8; });
row('tighter gun, 1 mrad', c => { c.gun.dispersion_mrad = 1; });
row('cloud spreads half as fast', c => { c.obs.eddy_K_m2s = 1; });
row('burst of 6', c => { c.gun.burst = 6; });
