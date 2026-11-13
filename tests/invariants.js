const HK=require('./engine.js');
const R=new HK.RNG(12345);
const pick=a=>a[Math.floor(R.random()*a.length)];
const MIX=[{kornet:1},{vikhr:1},{saclos:1},{sal:1},{fpv:.5,fpv_fiber:.5},{kornet:.55,vikhr:.2,saclos:.1,sal:.05,fpv:.1},{kornet:.25,vikhr:.1,saclos:.25,sal:.2,fpv:.1,fpv_fiber:.1},{rpg:.5,kornet:.5},{ir:1},{rpg:.3,ir:.2,kornet:.3,fpv:.2}];
const fails={};const F=(k,msg)=>{(fails[k]=fails[k]||[]).push(msg)};
let missions=0;
for(let ci=0;ci<120;ci++){
 const c=HK.defaultConfig();
 c.seed=ci+1; c.enemy.mix=pick(MIX); c.enemy.raid_size=1+Math.floor(R.random()*8);
 c.env.terrain=pick(['open','mixed','urban']); c.env.weather=pick(['clear','haze','rain','dust','fog']);
 c.vehicle.speed_ms=pick([0,0,5,10]); c.fc.ai=R.random()<.7; c.fc.meet_mode=pick(['optimal','fixed']); c.fc.fixed_meet_m=pick([500,900,1200,2000]);
 c.fc.human_approval_s=pick([0,0,1.5]); c.radar.mode=pick(['emcon','emcon','continuous']); c.lwr.maws=R.random()<.3;
 c.rnd.payload_g=pick([40,120,400]); c.gun.burst=pick([3,4,6,8,12]); c.obs.alpha_m2_per_g=pick([.85,2]); c.rnd.colocate=R.random()<.5; c.rnd.upwind_offset=c.rnd.colocate&&R.random()<.7;
 c.loss_behavior=pick([null,null,'hold_last','self_destruct','free_fall']); c.crew.enabled=R.random()<.8; c.crew.doctrine=pick(['hold','unsure','cut','warning']); c.crew.smoke=pick(['never','last','always']); c.crew.experience=pick(['green','trained','veteran']); c.crew.trust=R.random(); c.hkoi_enabled=R.random()<.9; c.aps.enabled=R.random()<.85;
 c.enemy.same_beam_pair_prob=pick([0,.15,.6]); c.enemy.decoys=pick([0,3]); c.gun.obscurant_rounds=pick([6,24]);
 const lk=c.hkoi_enabled?HK.meetLookup(c,40):{};
 for(let i=0;i<60;i++){missions++;
  const rec=HK.replayMission(c,lk,i); const id=`cfg${ci} m${i}`;
  const g=c.gun, BDmin=(n)=>(n-1)*60/g.rof_rpm;
  // events sorted
  for(let k=1;k<rec.events.length;k++) if(rec.events[k].t<rec.events[k-1].t-1e-9) {F('events_unsorted',id);break;}
  let hits=0;
  for(const th of rec.threats){
   const e=th.viz.end;
   if(!e) F('no_end',id);
   if(e.t>th.impact+1e-6) F('end_after_impact',`${id} #${th.idx} ${e.type} ${e.t} > ${th.impact}`);
   if(th.state==='hit'){hits++; if(e.type!=='hit') F('hit_state_mismatch',id);}
   if(th.state==='inbound') F('left_inbound',id);
   if(th.viz.fired!=null){
     if(!c.hkoi_enabled) F('fired_without_hkoi',id);
     if(th.track===null) F('fired_without_track',id);
     else if(th.viz.fired < th.track + g.fc_latency_s + c.fc.human_approval_s - 1e-6) F('fired_before_ready',`${id} #${th.idx}`);
     if(th.viz.fired > th.impact) F('fired_after_impact',id);
     if(th.viz.fired < th.t0) F('fired_before_launch',id);
   }
   if(th.state==='blind_pending') F('blind_pending_left',id);
   if(th.viz.sever&&!th.viz.sever.smoke){ if(th.viz.fired==null && !th.tags.includes('cut_by_leader_cloud')) F('sever_without_fire',id);
     if(th.viz.sever.t>th.impact+1e-6) F('sever_after_impact',id);
     if(th.viz.fired!=null && th.viz.sever.t<th.viz.fired) F('sever_before_fire',id);}
   if(th.defeated_by && th.defeated_by!=='aps' && rec.aps.some(a=>a.idx===th.idx)) F('aps_fired_at_dead',id);
   if(th.defeated_by==='aps' && !c.aps.enabled) F('aps_kill_without_aps',id);
   if(th.cue!==null && th.cue < th.t0 - c.lwr.sal_designation_lead_s - 1e-6) F('cue_too_early',id);
   if(th.track!==null && th.track < th.t0) F('track_before_launch',`${id} #${th.idx} ${th.key}`);
  }
  if(hits!==rec.hits) F('hit_count',id);
  // gun bursts must not overlap in time (one barrel)
  const bs=rec.bursts.map(b=>({t0:b.tf,t1:b.tf+BDmin(b.kind==='false'?g.burst:(b.rounds.length||1)),idx:b.idx,k:b.kind})).sort((a,b)=>a.t0-b.t0);
  for(let k=1;k<bs.length;k++) if(bs[k].t0 < bs[k-1].t1 - 1e-6) {F('gun_overlap',`${id} ${bs[k-1].k}#${bs[k-1].idx}@${bs[k-1].t0.toFixed(2)}-${bs[k-1].t1.toFixed(2)} vs ${bs[k].k}#${bs[k].idx}@${bs[k].t0.toFixed(2)}`);break;}
  // rounds
  for(const b of rec.bursts) for(const r of b.rounds){ if(!(r.d>0)) F('round_dist',id); if(r.t_pass<r.t_fire) F('round_time',id);
     if(b.idx>=0){const th=rec.threats[b.idx]; if(r.d>th.R+1) F('meet_beyond_launch',`${id} ${r.d} > ${th.R}`);} }
  // APS magazines and resets
  for(const side of ['L','R']){const sh=rec.aps.filter(a=>a.side===side).sort((a,b)=>a.t-b.t);
   if(sh.length>c.aps.mag_per_side) F('aps_mag_exceeded',id);
   for(let k=1;k<sh.length;k++) if(sh[k].t-sh[k-1].t<c.aps.reset_s-1e-6) F('aps_reset_violated',id);}
  if(rec.ctx.aps_inhibited && rec.aps.length) F('aps_fired_while_inhibited',id);
 }}
console.log('missions checked',missions);
const keys=Object.keys(fails); if(!keys.length) console.log('ALL INVARIANTS PASS');
for(const k of keys) console.log('FAIL',k,fails[k].length,'e.g.',fails[k].slice(0,3).join(' | '));
// replay must reproduce the counted mission exactly
{let bad=0;const c=HK.defaultConfig();c.rnd.payload_g=120;c.rnd.colocate=true;c.enemy.mix={kornet:.3,saclos:.3,sal:.2,fpv:.2};c.enemy.raid_size=5;const lk=HK.meetLookup(c,40);
 for(let i=0;i<400;i++){const a=HK.runMission(c,new HK.RNG(HK.seedFor(c.seed,i)),lk,null);const r=HK.replayMission(c,lk,i);
  if(JSON.stringify(a)!==JSON.stringify(r.metrics)) bad++;}
 console.log(bad?`FAIL replay_mismatch ${bad}/400`:'replay determinism OK');}
