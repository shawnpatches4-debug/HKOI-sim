global.window=global; const H0=require(process.argv[2]||'./engine.js'); const H=H0.HK||H0; const VAR=process.argv[3]||'';
const mk=(j)=>{const c=H.defaultConfig(); c.enemy.no_dismounts=true; c.enemy.gunner_jitter_mrad=j; c.aps.enabled=false; if(VAR.includes('nopartial')) c.obs.partial=false; if(VAR.includes('noupset')) c.gun.stab_upset_mrad=0; if(VAR.includes('noinertia')) c.gun.slew_acc_dps2=0; return c};
const L=H.meetLookup(mk(3));
for(const j of [3,0.3]){ let n=0,cut=0,hit=0,sum=0,surv=0,N=1200; const hs=[0,0,0,0];
  for(let s=1;s<=N;s++){ const c=mk(j); c.enemy.fixed=[{key:'kornet',R:2400,brg:-32,t0:0},{key:'kornet',R:3100,brg:4,t0:2.5},{key:'kornet',R:3600,brg:38,t0:5}]; const rec={events:[],bursts:[],aps:[],ctx:{hull:0}}; H.runMission(c,new H.RNG(H.seedFor(s,0)),L,rec); if(!rec.killed)surv++;
    for(const th of rec.threats){ n++; const sv=th.viz.sever; if(!sv||sv.smoke) continue; cut++; sum+=sv.d; hs[Math.min(3,Math.floor(sv.d/250))]++; if(th.viz.end.type==='hit')hit++; } }
  console.log((process.argv[2]||'engine.js').padEnd(18),VAR.padEnd(28),'jit',j,'cut',(100*cut/n).toFixed(1)+'% of missiles','| mean cut range',(sum/Math.max(cut,1)).toFixed(0),'m','| <250/250-500/500-750/750+:',hs.join('/'),'| cut missiles that still hit',(100*hit/Math.max(cut,1)).toFixed(0)+'%','| survive (no Trophy)',(100*surv/N).toFixed(1)+'%'); }
