const fs=require('fs'); global.window=global; const HK0=require('./engine.js'); const H=HK0.HK||HK0; global.HK=H;
const DMG=new Function('HK',fs.readFileSync('dmg.js','utf8')+';return DMG')(H); global.DMG=DMG;
const CAMP=new Function('HK','DMG',fs.readFileSync('campaign.js','utf8')+';return CAMP')(H,DMG); global.CAMP=CAMP;
const TAC=new Function('HK','DMG','CAMP',fs.readFileSync('tactics.js','utf8')+';return TAC')(H,DMG,CAMP);

const c0=()=>{const c=H.defaultConfig(); c.enemy.no_dismounts=true; c.enemy.gunner_jitter_mrad=.5; return c}; const L=H.meetLookup(c0()); let n=0,withD=0,down=0,rdown=0,mob=0,surv0=0,surv1=0; const N=1500;
for(let s=1;s<=N;s++){ const mk=()=>{const c=c0(); c.enemy.fixed=[['kornet',2400,-40,0],['kornet',2900,-15,1.5],['kornet',3300,5,3],['kornet',2700,25,4.5],['kornet',3600,45,6],['kornet',3000,60,7.5]].map(([key,R,brg,t0])=>({key,R,brg,t0})); return c};
  const c=mk(); const r=CAMP.fightOnce(c,()=>new H.RNG(H.seedFor(s,0)),L); const c2=mk(); const r0={events:[],bursts:[],aps:[],ctx:{hull:0}}; H.runMission(c2,new H.RNG(H.seedFor(s,0)),L,r0);
  n++; if(r.dmg){withD++; if(r.dmg.hkoi)down++; if(r.dmg.radar)rdown++; if(r.dmg.mob)mob++;} if(!r0.killed)surv0++; if(!r.killed)surv1++; }
console.log('raids',n,'with in-raid system damage',withD,'| HKOI mount',down,'radar',rdown,'mobility',mob,'| survive: damage ignored',(100*surv0/n).toFixed(1)+'%','damage applied',(100*surv1/n).toFixed(1)+'%');
