global.window=global; const H0=require(process.argv[2]); const H=H0.HK||H0; const c=H.defaultConfig(); c.enemy.no_dismounts=true; if(process.argv[3]) c.enemy.gunner_jitter_mrad=+process.argv[3]; const L=H.meetLookup(c); const d={}; let n=0,sv=0,bur=0;
for(let s=1;s<=300;s++){ c.enemy.fixed=[{key:'kornet',R:2400,brg:-32,t0:0},{key:'kornet',R:3100,brg:4,t0:2.5},{key:'kornet',R:3600,brg:38,t0:5}]; const rec={events:[],bursts:[],aps:[],ctx:{hull:0}}; H.runMission(c,new H.RNG(H.seedFor(s,0)),L,rec);
 for(const th of rec.threats){ n++; const k=(th.viz.end.type==='hit'?'HIT':th.defeated_by)||'none'; d[k]=(d[k]||0)+1; if(th.viz.sever)sv++; } bur+=rec.bursts.filter(b=>b.kind==='obs').length; }
console.log(process.argv[2], JSON.stringify(d), 'sever', sv, 'obs bursts', bur);
