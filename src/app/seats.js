// Mouse handling for the crew seats inside the vehicle: drag to turn the head, wheel to lean in, click a switch.
// Nothing here changes the battle: the crew runs the vehicle; a click only flips harmless things (lamps, display brightness).
export class SeatUI {
  constructor(canvas, interior) {
    this.cv = canvas; this.I = interior; this.down = null; this.moved = false; this.hoverT = 0; this.sayT = 0;
    const c = this.cap = document.createElement('div');
    c.style.cssText = 'position:fixed;left:50%;bottom:122px;transform:translateX(-50%);max-width:min(860px,calc(100vw - 32px));padding:7px 14px;border-radius:8px;background:rgba(8,12,12,.78);border:1px solid rgba(127,240,230,.35);color:#e6f2ee;font:500 14px/1.35 system-ui,Segoe UI,sans-serif;text-align:center;pointer-events:none;z-index:3;transition:opacity .3s;opacity:0';
    c.id = 'seatcap'; document.body.appendChild(c);
    canvas.addEventListener('pointerdown', e => { if (!this.I.inside || e.button !== 0) return; this.down = [e.clientX, e.clientY]; this.moved = false; try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic event has no pointer to capture */ } });
    canvas.addEventListener('pointermove', e => {
      if (!this.I.inside) return;
      if (this.down) { const dx = e.clientX - this.down[0], dy = e.clientY - this.down[1]; if (this.moved || Math.abs(dx) + Math.abs(dy) > 4) { this.moved = true; this.I.turnHead(dx, dy); this.down = [e.clientX, e.clientY]; } return; }
      const now = performance.now(); if (now - this.hoverT < 90) return; this.hoverT = now;
      const c2 = this.I.pick(...this.ndc(e)); canvas.style.cursor = c2 ? 'pointer' : 'grab'; if (c2 && now > this.sayT) this.show(this.I.describe(c2), 1600, true);
    });
    const up = e => { if (!this.down) return; const was = this.moved; this.down = null; if (!this.I.inside || was) return; if (this.I.optic) { this.I.lookThrough(null); return; } const c2 = this.I.pick(...this.ndc(e)); if (c2) this.show(this.I.operate(c2), 4200); };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', () => { this.down = null; });
    (typeof window !== 'undefined' ? window : canvas).addEventListener('keydown', e => { const I = this.I; if (!I.inside || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape' && I.optic) { I.lookThrough(null); e.stopImmediatePropagation(); e.preventDefault(); }   /* first Esc sits back from the optic; the next one leaves the seat as before */
      else if (e.code === 'KeyV') { const c = I.optic ? null : I.primaryOptic(); I.lookThrough(c); if (c) this.show(c.name + ' · click, V or Esc to sit back' + (c.optic.ring != null ? '; A and D step round the ring.' : '.'), 4200); }
      else if ((e.code === 'KeyA' || e.code === 'KeyD') && I.optic && I.optic.optic.ring != null) { I.stepOptic(e.code === 'KeyD' ? 1 : -1); e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    canvas.addEventListener('wheel', e => { if (!this.I.inside) return; e.preventDefault(); this.I.zoomBy(e.deltaY); }, { passive: false });
  }
  ndc(e) { const r = this.cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]; }
  // show a line of text for a while; a hover line never replaces a line that a click has just put up
  show(text, ms = 3000, hover = false) { if (!text) return; const now = performance.now(); if (hover && now < this.sayT) return; if (!hover) this.sayT = now + ms; this.cap.textContent = text; this.cap.style.opacity = 1; clearTimeout(this.timer); this.timer = setTimeout(() => { this.cap.style.opacity = 0; }, ms); }
  hide() { this.cap.style.opacity = 0; this.cv.style.cursor = ''; this.down = null; }
}
