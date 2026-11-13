// ================================================================ v20 layout: three modes, one large scene, one status panel, everything else behind named tabs.
// It only moves the existing elements into a new frame; every control keeps its id and its behaviour. The classic layout is one click away (footer).
(function UI2() {
  const $ = s => document.querySelector(s), mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  let classic = location.hash === '#classic'; try { const v = localStorage.getItem('hkoi_ui'); if (v) classic = v === 'classic'; } catch (e) {}
  const foot = $('footer.foot');
  if (foot) { const sw = mk('button', 'btn sm ui2-switch', classic ? 'Switch to the new layout' : 'Switch to the classic layout'); sw.type = 'button'; sw.addEventListener('click', () => { try { localStorage.setItem('hkoi_ui', classic ? 'new' : 'classic'); } catch (e) {} location.hash = classic ? '' : 'classic'; location.reload(); }); foot.prepend(sw); }
  if (classic) return;
  const card = $('#tab-sandbox .sbxcard'), plan = $('#tab-sandbox .sbxplan'), layout = $('.layout'); if (!card || !plan || !layout) return;
  const body = document.body; body.classList.add('ui2');
  const aside = layout.querySelector('aside'), main = layout.querySelector('main'), tabs = $('nav.tabs');
  // ---- header: three modes
  const top = $('header.top'), modes = mk('div', 'seg ui2-modes', '<button type="button" data-mode="fight" aria-pressed="true">Fight a raid</button><button type="button" data-mode="study" aria-pressed="false">Run the numbers</button><button type="button" data-mode="ref" aria-pressed="false">Reference</button>');
  modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'What to do'); top.insertBefore(modes, top.querySelector('.tools'));
  const GROUP = { sandbox: 'fight', overview: 'study', what: 'study', replay: 'study', sweep: 'study', sens: 'study', details: 'study', assume: 'ref', how: 'ref' }, lastTab = { fight: 'sandbox', study: 'overview', ref: 'assume' };
  const tabBtn = n => tabs.querySelector(`button[data-tab="${n}"]`);
  tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { const g = GROUP[b.dataset.tab]; if (g) lastTab[g] = b.dataset.tab; }));
  // ---- the sandbox frame
  const tools = card.querySelector('.sbxtools'), grid = card.querySelector('.sbxgrid'), view = $('#sbxView'), station = grid.querySelector('.station'), bars = card.querySelectorAll('.cinebar'), mis = plan.querySelector('.mis');
  const head = card.querySelector('.sbxhead'); if (head) head.remove();
  const left = mk('div', 'f-left'); grid.insertBefore(left, station); left.append(view, bars[0], $('#sbxOrders'), bars[1]); { const m = $('#sbxCarryMsg'); if (m) left.append(m); }
  // transport: what you do after a raid sits next to the playback controls
  const after = mk('div', 'f-after'); for (const id of ['sbxNext', 'sbxGapL', 'sbxFresh', 'sbxXrayBtn', 'sbxReviewBtn']) { const e = $('#' + id); if (e) after.append(e); } bars[0].append(after);
  // display options in one popover
  const pop = mk('details', 'ui2-pop', '<summary class="btn sm">Display and sound</summary><div class="ui2-popb"></div>'), pb = pop.querySelector('.ui2-popb');
  for (const id of ['sbxOverlay', 'sbxPipT', 'sbxVoice', 'sbxPack', 'sbxTod', 'sbxQ']) { const e = $('#' + id); if (e) pb.append(e.closest('label')); } for (const id of ['sbxSnd', 'sbxCb', 'sbxKeysBtn', 'sbxFull']) { const e = $('#' + id); if (e) pb.append(e); }
  bars[1].append(pop); document.addEventListener('click', e => { if (pop.open && !pop.contains(e.target)) pop.open = false; });
  // toolbar: wind is a mission condition, not a per-raid control
  const grd = mis.querySelector('.mis-grid'), wind = $('#sbxWind'); if (wind && grd) grd.prepend(wind.closest('.tl'));
  const setupBtn = mk('button', 'btn sm ui2-setup', 'Change the round, terrain or crew'); setupBtn.type = 'button'; tools.append(setupBtn);
  // ---- status panel: the summary on top, the detail behind two tabs
  const sth = station.querySelector('.st-h'); if (sth) sth.remove();
  const stTop = mk('div', 'st-top'); stTop.append($('#stCrew'), $('#mags'), $('#stVeh'));
  const stSeg = mk('div', 'mini-seg st-seg', '<button type="button" data-st="threats" aria-pressed="true">Threats</button><button type="button" data-st="enemy" aria-pressed="false">Enemy and friends</button>'); stSeg.setAttribute('role', 'group');
  const pT = mk('div', 'st-p'), pE = mk('div', 'st-p'); pE.hidden = true; pT.append($('#scope'), station.querySelector('.st-sub') || '', $('#fcList')); pE.append($('#stEnemy'), mk('p', 'cap st-none', 'Pick a “Thinking enemy” scenario to fight a commander who changes the attack after each wave. His reasoning and your friendly vehicles show here.'));
  const logH = mk('div', 'st-sub', 'What just happened'); station.append(stTop, stSeg, pT, pE, logH, $('#stLog'));
  stSeg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; stSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); pT.hidden = b.dataset.st !== 'threats'; pE.hidden = b.dataset.st !== 'enemy'; });
  { const en = $('#stEnemy'); if (en && window.MutationObserver) new MutationObserver(() => { const b = stSeg.querySelector(`[data-st="${en.hidden ? 'threats' : 'enemy'}"]`); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); }).observe(en, { attributes: true, attributeFilter: ['hidden'] }); }
  // ---- everything else: named tabs under the scene
  const P = {}, NAMES = [['enemy', 'Place the enemy'], ['mission', 'Mission conditions'], ['crew', 'Crew'], ['whatif', 'What if'], ['settings', 'Round and settings'], ['library', 'Save and share'], ['review', 'After-action review']];
  const lower = mk('div', 'card f-lower'), nav = mk('div', 'f-tabs'); nav.setAttribute('role', 'tablist'); lower.append(nav);
  for (const [k, n] of NAMES) { const b = mk('button', '', n); b.type = 'button'; b.dataset.ft = k; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', k === 'enemy'); nav.append(b); P[k] = mk('div', 'f-panel f-' + k); P[k].hidden = k !== 'enemy'; lower.append(P[k]); }
  const showF = k => { nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b.dataset.ft === k)); for (const q in P) P[q].hidden = q !== k; if (k === 'settings' && body.dataset.mode === 'fight') P.settings.append(aside); window.dispatchEvent(new Event('resize')); };
  nav.addEventListener('click', e => { const b = e.target.closest('button'); if (b) showF(b.dataset.ft); });
  // sort the mission editor's parts into the panels
  let grp = 'mission'; const eCol = mk('div', 'f-ecol');
  for (const ch of [...mis.children]) { if (ch.classList.contains('mis-sub')) { const tx = ch.textContent.toLowerCase(); grp = tx.includes('library') ? 'library' : tx.includes('crew') ? 'crew' : tx.includes('what if') ? 'whatif' : 'enemy'; if (grp !== 'enemy') continue; }
    if (ch.classList.contains('mis-h')) { const c = ch.querySelector('#misCount'); if (c) { c.classList.add('f-count'); nav.append(c); } continue; }
    (grp === 'enemy' ? eCol : P[grp]).append(ch); }
  P.enemy.append(plan.querySelector('.mis-map'), eCol, plan.querySelector('.mis-tl'));
  const rv = $('#sbxReview'); rv.classList.remove('card'); P.review.append(rv, mk('p', 'cap f-none', 'Play a raid to the end and the review appears here: what stopped each threat, where the hits landed, ammunition and crew stress over time, and the data export.'));
  P.settings.append(mk('p', 'cap', 'These settings are shared with “Run the numbers”. Changing one re-fights the raid on screen with the same dice.'));
  card.parentNode.insertBefore(lower, plan); plan.remove();
  $('#sbxReviewBtn').addEventListener('click', () => { showF('review'); lower.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  setupBtn.addEventListener('click', () => { showF('settings'); lower.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  // ---- modes
  function setMode(m) { body.dataset.mode = m; modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
    tabs.querySelectorAll('button').forEach(b => { b.hidden = GROUP[b.dataset.tab] !== m; });
    if (m === 'fight') P.settings.append(aside); else layout.insertBefore(aside, main);
    const b = tabBtn(lastTab[m]); if (b) b.click(); window.scrollTo(0, 0); }
  modes.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  // mission conditions: only show the dials that apply
  const cond = () => { const duel = !!($('#misDuel') || {}).value, plt = !!($('#misPlatoon') || {}).value; for (const id of ['misDuelR', 'misDuelB', 'misDuelT']) { const e = $('#' + id); if (e) e.closest('.tl').hidden = !duel; } for (const id of ['misGap', 'misShare']) { const e = $('#' + id); if (e) e.closest('.tl').hidden = !plt; } };
  for (const id of ['misDuel', 'misPlatoon']) { const e = $('#' + id); if (e) e.addEventListener('change', cond); } { const e = $('#sbxPreset'); if (e) e.addEventListener('change', () => setTimeout(cond, 60)); } nav.addEventListener('click', cond); cond();
  const toSetup = $('#toSetup'); if (toSetup) toSetup.hidden = true;
  setMode('fight');
})();

;(function(){ const el = document.getElementById('gfxStat'); if (!el) return; const N = { m1: 'tank model', crew_gunner: 'crew', crew_loader: 'crew', crew_driver: 'crew', sky: 'sky lighting', cloud: 'cloud texture' };
  const tick = () => { const g = window.__gfx; let msg = '', bad = false;
    if (!window.THREE) { msg = 'Graphics: 3D library did not load (network or content blocker); basic view only'; bad = true; }
    else if (!g) { msg = (Date.now() - T0 > 6000) ? 'Graphics: 3D view did not start (WebGL unavailable or hardware acceleration off); basic view only' : ''; bad = !!msg; }
    else if (!g.loader) { msg = 'Graphics: model loader blocked; basic shapes only'; bad = true; }
    else { const fail = [], wait = []; for (const k in N) { if (g[k] === 0) { if (!fail.includes(N[k])) fail.push(N[k]); } else if (g[k] == null && !(k === 'm1' && g.m1 == null && Date.now() - g.t0 < 1500)) { if (!wait.includes(N[k])) wait.push(N[k]); } }
      if (fail.length) { msg = 'Graphics: failed to load ' + fail.join(', ') + (location.protocol === 'file:' ? ' (this is a saved copy of the page; the models only load from the published link)' : ' (check connection, then reload)'); bad = true; }
      else if (wait.length) { const slow = Date.now() - g.t0 > 45000; msg = slow ? 'Graphics: still waiting for ' + wait.join(', ') + ' (slow connection, or the 3D view could not start: check that hardware acceleration is on)' : 'Graphics: loading ' + wait.join(', ') + '…'; bad = slow; } else msg = 'Graphics: detailed models loaded'; }
    el.textContent = msg; el.classList.toggle('bad', bad); }; const T0 = Date.now(); tick(); setInterval(tick, 1500); })();
