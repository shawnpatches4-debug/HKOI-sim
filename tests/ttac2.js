const fs=require('fs'); global.window=global; const HK0=require('./engine.js'); const H=HK0.HK||HK0; global.HK=H;
const DMG=new Function('HK',fs.readFileSync('dmg.js','utf8')+';return DMG')(H); global.DMG=DMG;
const CAMP=new Function('HK','DMG',fs.readFileSync('campaign.js','utf8')+';return CAMP')(H,DMG); global.CAMP=CAMP;
const TAC=new Function('HK','DMG','CAMP',fs.readFileSync('tactics.js','utf8')+';return TAC')(H,DMG,CAMP);
const c0=()=>{const c=H.defaultConfig(); c.enemy.mix={kornet:1,vikhr:1,saclos:1,sal:1,fpv:1,rpg:1,ir:1,fpv_fiber:1}; return c;}; const L=H.meetLookup(c0());
const by={}, fired={}; let N=300;
for(let s=1;s<=N;s++){ const r=TAC.fight(c0(),{force:process.argv[2]||'platoon',skill:'adaptive',keep:true},s,L);
  for(const w of r.waves) for(const th of w.rec.threats){ if(!th.tac) continue; const k=w.tac+'/'+th.key+(th.late?'(late)':''); fired[k]=(fired[k]||0)+1; if(th.viz.end&&th.viz.end.type==='hit'){ const tg=th.tags.filter(t=>!['reengaged'].includes(t)).join('+')||'-'; by[k]=by[k]||{h:0,k:0,t:{}}; by[k].h++; if(th.viz.end.killing) by[k].k++; by[k].t[tg]=(by[k].t[tg]||0)+1; } } }
for(const k of Object.keys(fired).sort()) { const b=by[k]||{h:0,k:0,t:{}}; console.log(k.padEnd(28), 'fired',String(fired[k]).padStart(4),'hits',String(b.h).padStart(4),'kills',String(b.k).padStart(3),' ',Object.entries(b.t).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([t,n])=>t+':'+n).join('  ')); }
