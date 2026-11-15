// The sound menu: four volume sliders (master, voices, effects, ambience), night mode, the optional tension layer, mute.
// It builds its own small panel (no markup or CSS elsewhere is needed) and remembers the settings through the page's store.
//
//   const panel = soundPanel(sound, store, onChange);   // store: { get(key, default), set(key, value) }; onChange: called after mute changes
//   panel.toggle()   open or close the panel      panel.mute()   sound on / off (the X key in the page)
//
// What the sliders move (src/audio/mixer.js GROUPS): voices = the intercom, the radio net and the headset tones;
// effects = weapons and explosions; ambience = the own engine and tracks, weather, wildlife, the far battle.
// Night mode: loud things come down and quiet things come up, for playing late without waking the house.
// Tension layer: a low drone and pulse that rise with the number of missiles and drones in the air. Not music; OFF by default.
import { DEFAULTS } from './sound.js';

const ROWS = [['master', 'Master'], ['voices', 'Voices'], ['effects', 'Guns and blasts'], ['ambience', 'Engine and surroundings']];

export function soundPanel(sound, store, onChange) {
  const saved = store && store.get ? store.get('snd', {}) : {}; let now = sound.set({ ...DEFAULTS, ...saved }), el = null;
  const save = o => { now = sound.set(o); if (store && store.set) store.set('snd', now); };
  const D = typeof document !== 'undefined' ? document : null;
  const mk = (tag, style, text) => { const e = D.createElement(tag); if (style) e.style.cssText = style; if (text != null) e.textContent = text; return e; };
  function build() {
    el = mk('div', 'position:fixed;right:14px;bottom:86px;z-index:30;width:290px;padding:12px 14px 10px;font:13px/1.35 system-ui,sans-serif;color:var(--fg,#e6efe9);display:none'); el.className = 'panel'; el.id = 'snd-panel';
    const head = mk('div', 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font:600 11px/1 var(--mono,monospace);letter-spacing:.12em;color:var(--dim,#93a39a)', 'SOUND');
    const x = mk('button', 'background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:2px 4px', 'close'); x.onclick = () => api.toggle(false); head.append(x); el.append(head);
    const nums = {};
    for (const [key, label] of ROWS) {
      const row = mk('label', 'display:grid;grid-template-columns:1fr 34px;gap:2px 8px;align-items:center;margin:0 0 7px'), name = mk('span', '', label), num = mk('span', 'text-align:right;font-family:var(--mono,monospace);color:var(--dim,#93a39a)', Math.round(now[key] * 100) + '');
      const s = D.createElement('input'); s.type = 'range'; s.min = 0; s.max = 100; s.step = 1; s.value = Math.round(now[key] * 100); s.style.cssText = 'grid-column:1 / 3;width:100%;accent-color:var(--accent,#39d98a)'; s.setAttribute('aria-label', label + ' volume');
      s.oninput = () => { sound.start(); save({ [key]: s.value / 100 }); num.textContent = s.value; };
      s.onchange = () => s.blur();   /* give the keyboard back to the simulator */
      nums[key] = num; row.append(name, num, s); el.append(row);
    }
    const tick = (key, label, note) => {
      const row = mk('label', 'display:flex;gap:8px;align-items:flex-start;margin:6px 0 0;cursor:pointer'), c = D.createElement('input'); c.type = 'checkbox'; c.checked = !!now[key]; c.style.cssText = 'margin-top:2px;accent-color:var(--accent,#39d98a)';
      c.onchange = () => { sound.start(); save({ [key]: c.checked }); c.blur(); };
      const t = mk('span', ''); t.append(mk('span', '', label), mk('span', 'display:block;color:var(--dim,#93a39a);font-size:11.5px', note)); row.append(c, t); el.append(row);
    };
    tick('night', 'Night mode', 'Loud things quieter, quiet things louder.');
    tick('tension', 'Tension layer', 'A low drone and pulse that follow the number of threats in the air. Not music. Off by default.');
    el.append(mk('div', 'margin-top:8px;color:var(--dim,#93a39a);font-size:11.5px', 'X: sound on or off.'));
    D.body.append(el);
  }
  const api = {
    get open() { return !!el && el.style.display !== 'none'; },
    get settings() { return { ...now }; },
    toggle(show) { if (!D) return false; if (!el) build(); const on = show == null ? el.style.display === 'none' : !!show; el.style.display = on ? 'block' : 'none'; return on; },
    mute() { sound.start(); sound.setOn(!sound.on); if (store && store.set) store.set('sound', sound.on); if (onChange) onChange(sound.on); return sound.on; },
    set(o) { save(o); return { ...now }; },
  };
  return api;
}
