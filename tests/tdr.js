global.window=global; const HK0=require('./engine.js'); const H=HK0.HK||HK0;
const c0=()=>{const c=H.defaultConfig(); c.enemy.mix={kornet:1,vikhr:1,saclos:1,sal:1,fpv:1,rpg:1,ir:1,fpv_fiber:1}; c.enemy.no_dismounts=true; return c;}; const L=H.meetLookup(c0());
const SC={ four_front:(i)=>({key:'fpv',R:1500,brg:-45+30*i,t0:1+1.2*i}), four_rear:(i)=>({key:'fpv',R:1200,brg:165+10*i,t0:1+.8*i}), ten:(i)=>({key:i%2?'fpv':'fpv_fiber',R:2000+100*i,brg:-60+13*i,t0:i*.8}), one:(i)=>({key:'fpv',R:2000,brg:10,t0:0}) };
const NN={four_front:4,four_rear:4,ten:10,one:1};
for(const aps of [true,false]) for(const k in SC){ let fired=0,hits=0,killsHE=0,bursts=0; const tg={}; const N=400;
  for(let s=1;s<=N;s++){ const c=c0(); c.aps.enabled=aps; c.enemy.fixed=Array.from({length:NN[k]},(_,i)=>SC[k](i)); const rec={events:[],bursts:[],aps:[],ctx:{hull:0}}; H.runMission(c,new H.RNG(H.seedFor(s,0)),L,rec);
    for(const th of rec.threats){ fired++; if(th.defeated_by==='hkoi_he') killsHE++; if(th.viz.end.type==='hit'){hits++; const t=th.tags.join('+'); tg[t]=(tg[t]||0)+1;} } bursts+=rec.bursts.filter(b=>b.kind==='he').length; }
  console.log((aps?'APS ':'noAPS'),k.padEnd(11),'leak',(100*hits/fired).toFixed(1)+'%','HE kills',(100*killsHE/fired).toFixed(0)+'%','bursts/drone',(bursts/fired).toFixed(2),' ',Object.entries(tg).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([t,n])=>t+':'+n).join('  ')); }
