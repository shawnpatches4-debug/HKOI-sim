// node tools/dumpworld.js <biome> <seed> <out.json> : dump a generated battlefield for the map preview renderer
const { World } = require('../src/world/world.js'); const fs = require('fs');
const [biome, seed, out] = [process.argv[2] || 'farmland', +(process.argv[3] || 1), process.argv[4] || '/tmp/world.json'];
const w = new World({ seed, biome }), sites = w.ambushSites(0, 0, { rmin: 700, rmax: 4000 }).slice(0, 40), vs = w.viewshed(0, 0, 2.2, 4000, 90);
const pick = []; for (const s of sites) { if (pick.every(p => Math.hypot(p.e - s.e, p.n - s.n) > 500)) pick.push(s); if (pick.length >= 6) break; }
const cover = w.coverFrom(0, 0, pick.slice(0, 3), { radius: 400 }).slice(0, 12);
fs.writeFileSync(out, JSON.stringify({ n: w.n, size: w.size, H: Array.from(w.H, v => +v.toFixed(2)), V: Array.from(w.V), F: Array.from(w.F), buildings: w.buildings.map(b => [b.e, b.n, b.w, b.d, b.rot, b.h]), roads: w.roads.map(r => r.pts), places: w.places, sites: pick, vs, cover, stats: w.stats() }));
console.log(JSON.stringify(w.stats()), 'sites', pick.length);
