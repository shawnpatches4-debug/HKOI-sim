global.window=global; const HK0=require('./engine.js'); const H=HK0.HK||HK0;
const c0=()=>{const c=H.defaultConfig(); c.enemy.mix={kornet:1,vikhr:1,saclos:1,sal:1,fpv:1,rpg:1,ir:1,fpv_fiber:1}; c.enemy.no_dismounts=true; return c;}; const L=H.meetLookup(c0());
const SC={ four_front:(i)=>({key:'fpv',R:1500,brg:-45+30*i,t0:1+1.2*i}), ten:(i)=>({key:i%2?'fpv':'fpv_fiber',R:2000+100*i,brg:-60+13*i,t0:i*.8}) };
const NN={four_front:4,ten:10};
for(const RK of [8,12,16]) for(const sk of ['trained','expert']) for(const aps of [true,false]) for(const k in SC){ let fired=0,hits=0,killsHE=0,bursts=0,surv=0,fe=0; const N=600;
  for(let s=1;s<=N;s++){ const c=c0(); c.rnd.he_drone_radius_m=RK; c.aps.enabled=aps; if(sk==='off') c.enemy.drone_evasion=false; else c.enemy.drone_skill=sk; c.enemy.fixed=Array.from({length:NN[k]},(_,i)=>SC[k](i)); const rec={events:[],bursts:[],aps:[],ctx:{hull:0}}; H.runMission(c,new H.RNG(H.seedFor(s,0)),L,rec);
    let h=0; for(const th of rec.threats){ fired++; if(th.defeated_by==='hkoi_he') killsHE++; if(th.viz.end.type==='hit'){hits++;h++;} if(th.tags.includes('feinted')) fe++; } if(!h) surv++; bursts+=rec.bursts.filter(b=>b.kind==='he').length; }
  console.log(RK,sk.padEnd(8),(aps?'APS  ':'noAPS'),k.padEnd(11),'drones through',(100*hits/fired).toFixed(1)+'%','HE kills',(100*killsHE/fired).toFixed(0)+'%','bursts/drone',(bursts/fired).toFixed(2),'no-hit raids',(100*surv/N).toFixed(0)+'%','feinted',(100*fe/fired).toFixed(0)+'%'); }
