global.HK = require('./engine.js'); const fs = require('fs'); eval(fs.readFileSync('dmg.js', 'utf8') + '; global.DMG = DMG;');
const c = HK.defaultConfig(); c.hkoi_enabled = false; c.aps.enabled = false; c.seed = 5; const lk = {};
const zones = {}, eff = {}; let n = 0, kills = 0, killPen = 0, nonKillPen = 0, crewK = 0, ammo = 0;
for (let i = 0; i < 400; i++) { const r = HK.replayMission(c, lk, i); for (const h of DMG.report(r, c)) { n++; zones[h.zone] = (zones[h.zone] || 0) + 1; if (h.killing) { kills++; if (h.penetrated) killPen++; } else if (h.penetrated) nonKillPen++; crewK += Object.values(h.crew).filter(s => s === 'killed').length; if (h.comps.some(x => x.id === 'ammo')) ammo++; } }
console.log({ hits: n, kills, killPenetrated: killPen, survivableButPenetrated: nonKillPen, crewKilled: crewK, ammoHits: ammo }); console.log(zones);
const r = HK.replayMission(c, lk, 3); console.log(JSON.stringify(DMG.report(r, c)[0], null, 0).slice(0, 700));
