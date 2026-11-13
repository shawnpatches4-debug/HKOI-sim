const fs=require('fs'); global.window=global; const HK=require('./engine.js'); global.HK=HK.HK||HK;
const H=global.HK; const DMG=new Function('HK',fs.readFileSync('dmg.js','utf8')+';return DMG')(H); global.DMG=DMG;
const CAMP=new Function('HK','DMG',fs.readFileSync('campaign.js','utf8')+';return CAMP')(H,DMG); global.CAMP=CAMP;
const TAC=new Function('HK','DMG','CAMP',fs.readFileSync('tactics.js','utf8')+';return TAC')(H,DMG,CAMP);
const VEH=+process.env.VEH||1, SHARE=process.env.SHARE!=='0';
const N=+process.argv[2]||150, jit=process.argv[3]==null?3:+process.argv[3];
const base=()=>{const c=H.defaultConfig(); c.enemy.gunner_jitter_mrad=jit; c.enemy.mix={kornet:1,vikhr:1,saclos:1,sal:1,fpv:1,rpg:1,ir:1,fpv_fiber:1}; return c;};
const L=H.meetLookup(base());
const PROT={none:c=>{c.hkoi_enabled=false;c.aps.enabled=false},aps:c=>{c.hkoi_enabled=false},both:c=>{}};
if(process.argv[4]==='log'){const c=base(); const r=TAC.fight(c,{force:process.argv[5]||'platoon',skill:process.argv[6]||'adaptive'},+process.argv[7]||3,L); for(const l of r.E.log) console.log(l.text, l.scores?JSON.stringify(l.scores):''); console.log(r.lost?'TANK LOST':'tank survived', r.waves.map(w=>w.tac+':'+w.hits).join(' ')); process.exit();}
for(const force of ['section','platoon','company']) for(const skill of ['fixed','adaptive','expert']){ let row=`${force.padEnd(8)} ${skill.padEnd(9)}`;
  for(const p in PROT){ let surv=0,waves=0,quit=0; const tc={};
    for(let s=1;s<=N;s++){ const c=base(); PROT[p](c); const r=TAC.fight(c,{force,skill,vehicles:VEH,share:SHARE},s,L); surv+=r.left/r.n; waves+=r.waves.length; if(r.E.quit&&!r.lost) quit++; for(const w of r.waves) tc[w.tac]=(tc[w.tac]||0)+1; }
    row+=` | ${p}: ${(100*surv/N).toFixed(0)}% surv, ${(waves/N).toFixed(1)} waves`; if(p==='both') row+='  '+Object.entries(tc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join(', '); }
  console.log(row); }
