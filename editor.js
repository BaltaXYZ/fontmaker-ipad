// Canvas editor for Apple Pencil / Pointer Events.
(function () {
  'use strict';

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function dist(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.hypot(dx, dy);
  }

  function makeEditor(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const onChange = (opts && opts.onChange) || function () {};

    let glyph = null;
    let metrics = null;
    let currentStroke = null;
    let needsRender = true;

    const state = {
      drawing: false,
      pointerId: null,
      // Used to reduce point spam.
      lastX: null,
      lastY: null,
      minDistPx: 2.5,
    };

    function getRect() {
      return canvas.getBoundingClientRect();
    }

    function canvasToNorm(clientX, clientY) {
      const r = getRect();
      const x = (clientX - r.left) / r.width;
      const y = (clientY - r.top) / r.height;
      return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
    }

    function beginStroke(e) {
      if (!glyph) return;
      state.drawing = true;
      state.pointerId = e.pointerId;
      state.lastX = null;
      state.lastY = null;
      currentStroke = { points: [], t0: Date.now() };
      addPoint(e, true);
    }

    function addPoint(e, force) {
      if (!glyph || !currentStroke) return;
      const r = getRect();
      const xPx = e.clientX - r.left;
      const yPx = e.clientY - r.top;
      if (!force && state.lastX != null) {
        if (dist(state.lastX, state.lastY, xPx, yPx) < state.minDistPx) return;
      }
      state.lastX = xPx;
      state.lastY = yPx;

      const n = canvasToNorm(e.clientX, e.clientY);
      currentStroke.points.push({
        x: n.x,
        y: n.y,
        t: Date.now(),
        p: typeof e.pressure === 'number' ? e.pressure : 0.5,
      });
    }

    function endStroke(e) {
      if (!glyph || !currentStroke) return;
      addPoint(e, true);
      const pts = currentStroke.points;
      // Require at least 2 points to commit.
      if (pts && pts.length >= 2) {
        glyph.strokes.push({ points: pts });
        glyph.undoStack.push({ type: 'addStroke', stroke: { points: pts } });
        glyph.redoStack.length = 0;
      }
      currentStroke = null;
      state.drawing = false;
      state.pointerId = null;
      needsRender = true;
      onChange();
    }

    function pointerDown(e) {
      if (e.button !== 0 && e.pointerType !== 'pen') return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      beginStroke(e);
      needsRender = true;
      onChange();
    }

    function pointerMove(e) {
      if (!state.drawing || e.pointerId !== state.pointerId) return;
      e.preventDefault();
      addPoint(e, false);
      needsRender = true;
    }

    function pointerUp(e) {
      if (!state.drawing || e.pointerId !== state.pointerId) return;
      e.preventDefault();
      endStroke(e);
    }

    function pointerCancel(e) {
      if (!state.drawing || e.pointerId !== state.pointerId) return;
      currentStroke = null;
      state.drawing = false;
      state.pointerId = null;
      needsRender = true;
      onChange();
    }

    canvas.addEventListener('pointerdown', pointerDown, { passive: false });
    canvas.addEventListener('pointermove', pointerMove, { passive: false });
    canvas.addEventListener('pointerup', pointerUp, { passive: false });
    canvas.addEventListener('pointercancel', pointerCancel, { passive: false });

    function clear() {
      if (!glyph) return;
      const prev = glyph.strokes.slice();
      glyph.strokes.length = 0;
      glyph.undoStack.push({ type: 'clear', prevStrokes: prev });
      glyph.redoStack.length = 0;
      needsRender = true;
      onChange();
    }

    function undo() {
      if (!glyph) return;
      const action = glyph.undoStack.pop();
      if (!action) return;
      if (action.type === 'addStroke') {
        glyph.strokes.pop();
      } else if (action.type === 'clear') {
        glyph.strokes = action.prevStrokes;
      } else if (action.type === 'setAdvanceWidth') {
        glyph.advanceWidth = action.prev;
      } else if (action.type === 'setBrushWidth') {
        glyph.brushWidth = action.prev;
      }
      glyph.redoStack.push(action);
      needsRender = true;
      onChange();
    }

    function redo() {
      if (!glyph) return;
      const action = glyph.redoStack.pop();
      if (!action) return;
      if (action.type === 'addStroke') {
        glyph.strokes.push(action.stroke);
      } else if (action.type === 'clear') {
        glyph.strokes.length = 0;
      } else if (action.type === 'setAdvanceWidth') {
        glyph.advanceWidth = action.next;
      } else if (action.type === 'setBrushWidth') {
        glyph.brushWidth = action.next;
      }
      glyph.undoStack.push(action);
      needsRender = true;
      onChange();
    }

    function setGlyph(nextGlyph, nextMetrics) {
      glyph = nextGlyph;
      metrics = nextMetrics;
      currentStroke = null;
      state.drawing = false;
      state.pointerId = null;
      needsRender = true;
      onChange();
    }

    function drawGuides(w, h) {
      if (!metrics) return;
      const yTop = metrics.ascender;
      const yBot = metrics.descender;
      const span = yTop - yBot;
      const mapY = (yUnits) => ((yTop - yUnits) / span) * h;

      const guides = [
        { y: metrics.ascender, label: 'asc', a: 0.35 },
        { y: metrics.capHeight, label: 'cap', a: 0.55 },
        { y: metrics.xHeight, label: 'x', a: 0.55 },
        { y: 0, label: 'base', a: 0.75 },
        { y: metrics.descender, label: 'desc', a: 0.35 },
      ];
      ctx.save();
      ctx.lineWidth = 1;
      for (const g of guides) {
        const yy = mapY(g.y);
        ctx.strokeStyle = `rgba(110,231,255,${g.a})`;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(w, yy);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawStrokes(w, h, strokes, brushWidth, pressureEnabled, alpha) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(231,237,245,${alpha})`;
      for (const s of strokes) {
        const pts = s.points || [];
        if (pts.length < 2) continue;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const aw = brushWidth * (pressureEnabled ? clamp(a.p || 0.5, 0.05, 1) : 1);
          const bw = brushWidth * (pressureEnabled ? clamp(b.p || 0.5, 0.05, 1) : 1);
          ctx.lineWidth = (aw + bw) * 0.5 * (w / 1000); // scale-ish
          ctx.beginPath();
          ctx.moveTo(a.x * w, a.y * h);
          ctx.lineTo(b.x * w, b.y * h);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    function drawOutlinePreview(w, h) {
      if (!glyph || !metrics || !window.Outline) return;
      const contours = window.Outline.glyphToContours(glyph, metrics);
      if (!contours.length) return;

      const yTop = metrics.ascender;
      const yBot = metrics.descender;
      const ySpan = yTop - yBot;
      const adv = glyph.advanceWidth;

      ctx.save();
      ctx.fillStyle = 'rgba(110,231,255,0.16)';
      ctx.strokeStyle = 'rgba(110,231,255,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const ring of contours) {
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i];
          const nx = (p.x / adv) * w;
          const ny = ((yTop - p.y) / ySpan) * h;
          if (i === 0) ctx.moveTo(nx, ny);
          else ctx.lineTo(nx, ny);
        }
        ctx.closePath();
      }
      ctx.fill('nonzero');
      ctx.stroke();
      ctx.restore();
    }

    function render() {
      if (!needsRender) return;
      needsRender = false;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Subtle grid
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      const step = w / 10;
      for (let i = 1; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * step);
        ctx.lineTo(w, i * step);
        ctx.stroke();
      }
      ctx.restore();

      drawGuides(w, h);
      if (!glyph) return;

      // Outline preview first, then strokes on top for clarity.
      drawOutlinePreview(w, h);

      const brushWidth = glyph.brushWidth || 60;
      const pressureEnabled = glyph.pressureEnabled !== false;
      drawStrokes(w, h, glyph.strokes, brushWidth, pressureEnabled, 0.9);
      if (currentStroke) drawStrokes(w, h, [{ points: currentStroke.points }], brushWidth, pressureEnabled, 0.7);
    }

    function tick() {
      render();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    return {
      setGlyph,
      clear,
      undo,
      redo,
      requestRender: function () {
        needsRender = true;
      },
    };
  }

  window.Editor = {
    makeEditor,
  };
})();

