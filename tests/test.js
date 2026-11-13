const HK=require('./engine.js');
function cfgWith(ch){const c=HK.defaultConfig();c.missions=2000;for(const k in ch){const [a,b]=k.split('.');if(b)c[a][b]=ch[k];else c[k]=ch[k];}return c;}
const sc={
 'none':{'hkoi_enabled':false,'aps.enabled':false},
 'aps only':{'hkoi_enabled':false},
 '40g':{},
 '40g coloc':{'rnd.colocate':true,'rnd.upwind_offset':true},
 '120g':{'rnd.payload_g':120},
 '120g coloc':{'rnd.payload_g':120,'rnd.colocate':true,'rnd.upwind_offset':true},
 '400g':{'rnd.payload_g':400,'rnd.colocate':true,'rnd.upwind_offset':true},
};
for(const [n,ch] of Object.entries(sc)){const c=cfgWith(ch);let t=Date.now();const lk=c.hkoi_enabled?HK.meetLookup(c,160):{};const tl=Date.now()-t;t=Date.now();const r=HK.runSync(c,lk);
console.log(n.padEnd(12),'surv',(r.P_survive*100).toFixed(1),'nohit',(r.P_no_hits*100).toFixed(1),'hits',r.hits.toFixed(2),'lookup ms',tl,'run ms',Date.now()-t, Object.entries(lk).map(([k,v])=>k+':'+v.best_m+'/'+v.best_p.toFixed(2)).join(' '));}
const c=cfgWith({'rnd.payload_g':120,'rnd.colocate':true,'rnd.upwind_offset':true});const lk=HK.meetLookup(c,160);
for(let n=1;n<=8;n++){const cc=JSON.parse(JSON.stringify(c));cc.enemy.raid_size=n;cc.missions=1000;const r=HK.runSync(cc,lk);process.stdout.write((r.P_survive*100).toFixed(0)+' ');}
console.log();
const rec=HK.replayMission(c,lk,5);console.log(rec.events.map(e=>e.t.toFixed(2)+' '+e.text).join('\n'));
