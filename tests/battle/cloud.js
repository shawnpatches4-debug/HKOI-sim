// node tests/battle/cloud.js : which cloud assumption moves the answer. The engine's own table (chance one Kornet's beam is cut, by distance from the vehicle where the rounds meet it), as built and with one input changed at a time. Nothing here changes the defaults.
const { HK } = require('./load.js');
const row = (label, f) => { const c = HK.defaultConfig(); c.enemy.mix = { kornet: 1 }; f(c); const L = HK.meetLookup(c, 200).kornet; const at = d => Math.round(100 * L.p[L.grid.indexOf(d)]); console.log(label.padEnd(46), 'best', Math.round(100 * L.best_p) + '% at', L.best_m, 'm | at 600/900/1200/1500/2000 m:', [600, 900, 1200, 1500, 2000].map(at).join(' / ')); };
row('AS BUILT (40 g, 99% block needed, burst 4)', c => {});
row('payload 80 g', c => { c.rnd.payload_g = 80; });
row('payload 120 g', c => { c.rnd.payload_g = 120; });
row('95% block is enough (margin 3.0)', c => { c.obs.tau_lock_margin = 3.0; });
row('90% block is enough (margin 2.3)', c => { c.obs.tau_lock_margin = 2.3; });
row('burst of 8', c => { c.gun.burst = 8; });
row('tighter gun, 1 mrad', c => { c.gun.dispersion_mrad = 1; });
row('cloud spreads half as fast', c => { c.obs.eddy_K_m2s = 1; });
row('80 g and 95% block', c => { c.rnd.payload_g = 80; c.obs.tau_lock_margin = 3.0; });
