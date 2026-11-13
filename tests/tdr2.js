global.window=global; const HK0=require('./engine.js'); const H=HK0.HK||HK0;
const c0=()=>{const c=H.defaultConfig(); c.enemy.mix={kornet:1,fpv:1}; c.enemy.no_dismounts=true; c.aps.enabled=false; return c;}; const L=H.meetLookup(c0()); let shown=0;
for(let s=1;s<=400&&shown<3;s++){ const c=c0(); c.enemy.fixed=[{key:'fpv',R:2000,brg:10,t0:0}]; const rec={events:[],bursts:[],aps:[],ctx:{hull:0}}; H.runMission(c,new H.RNG(H.seedFor(s,0)),L,rec); const th=rec.threats[0];
  if(th.viz.end.type==='hit'&&th.tags.includes('reengaged')){shown++; console.log('seed',s,th.tags.join('+')); for(const e of rec.events) console.log('  ',e.t.toFixed(1),e.kind,e.text.slice(0,110));} }
