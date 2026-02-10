/* global martinez, simplify */
// Stroke -> outline (filled polygon) helpers. Output is contours in font units.
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

  function polylineLength(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    return len;
  }

  function unitNormal(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.hypot(dx, dy) || 1;
    // Left normal for y-up coordinates.
    return { nx: -dy / d, ny: dx / d };
  }

  function arcPoints(cx, cy, r, a0, a1, steps) {
    const out = [];
    const n = Math.max(2, steps | 0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = a0 + (a1 - a0) * t;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  }

  // Build a filled polygon around a polyline.
  // pts: [{x,y,p}] in font units (y-up)
  function strokeToPolygon(pts, baseWidth, pressureEnabled) {
    if (!pts || pts.length < 2) return null;
    const left = [];
    const right = [];
    const capsSteps = 8;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const { nx, ny } = unitNormal(a.x, a.y, b.x, b.y);
      const pa = pressureEnabled ? clamp(a.p || 0.5, 0.05, 1) : 1;
      const pb = pressureEnabled ? clamp(b.p || 0.5, 0.05, 1) : 1;
      const wa = baseWidth * pa * 0.5;
      const wb = baseWidth * pb * 0.5;

      // Miter-ish by segment: accumulate offset points on both sides.
      left.push([a.x + nx * wa, a.y + ny * wa]);
      right.push([a.x - nx * wa, a.y - ny * wa]);

      if (i === pts.length - 2) {
        left.push([b.x + nx * wb, b.y + ny * wb]);
        right.push([b.x - nx * wb, b.y - ny * wb]);
      }
    }

    // Round caps: use tangent direction of first/last segments.
    const p0 = pts[0];
    const p1 = pts[1];
    const pn = pts[pts.length - 1];
    const pn1 = pts[pts.length - 2];

    const aN = unitNormal(p0.x, p0.y, p1.x, p1.y);
    const zN = unitNormal(pn1.x, pn1.y, pn.x, pn.y);
    const p0w = baseWidth * (pressureEnabled ? clamp(p0.p || 0.5, 0.05, 1) : 1) * 0.5;
    const pnw = baseWidth * (pressureEnabled ? clamp(pn.p || 0.5, 0.05, 1) : 1) * 0.5;

    // Start cap from right to left around p0.
    const a0 = Math.atan2(-aN.ny, -aN.nx); // right side direction
    const a1ang = Math.atan2(aN.ny, aN.nx); // left side direction
    const startCap = arcPoints(p0.x, p0.y, p0w, a0, a1ang, capsSteps);

    // End cap from left to right around pn.
    const z0 = Math.atan2(zN.ny, zN.nx);
    const z1ang = Math.atan2(-zN.ny, -zN.nx);
    const endCap = arcPoints(pn.x, pn.y, pnw, z0, z1ang, capsSteps);

    const ring = [];
    // Walk left side (already from start to end)
    for (const p of left) ring.push(p);
    // End cap
    for (const p of endCap) ring.push(p);
    // Walk right side reversed (end to start)
    for (let i = right.length - 1; i >= 0; i--) ring.push(right[i]);
    // Start cap (close)
    for (const p of startCap) ring.push(p);

    // Ensure closed by repeating first point (martinez tolerates but doesn't require; we'll do it).
    if (ring.length > 0) {
      const f = ring[0];
      const l = ring[ring.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
    }
    return [ring]; // polygon format: [ring]
  }

  function simplifyRing(ring, epsilon) {
    if (!ring || ring.length < 5) return ring;
    const pts = ring.map(([x, y]) => ({ x, y }));
    const simp = simplify(pts, epsilon, true);
    if (!simp || simp.length < 3) return ring;
    const out = simp.map((p) => [p.x, p.y]);
    const f = out[0];
    const l = out[out.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
    return out;
  }

  function unionPolygons(polys) {
    if (!polys.length) return null;
    let acc = polys[0];
    for (let i = 1; i < polys.length; i++) {
      try {
        acc = martinez.union(acc, polys[i]);
      } catch (e) {
        // If union fails, bail out and signal failure.
        return null;
      }
      if (!acc) return null;
    }
    return acc;
  }

  function glyphToContours(glyph, metrics) {
    const strokes = glyph && glyph.strokes ? glyph.strokes : [];
    if (!strokes.length) return [];

    const adv = glyph.advanceWidth;
    const yTop = metrics.ascender;
    const yBot = metrics.descender;
    const ySpan = yTop - yBot;

    const strokePolys = [];
    const baseWidth = glyph.brushWidth || 60;
    const pressureEnabled = glyph.pressureEnabled !== false;

    for (const s of strokes) {
      const pts = (s.points || []).map((p) => {
        const x = clamp(p.x, 0, 1) * adv;
        const y = yTop - clamp(p.y, 0, 1) * ySpan;
        return { x, y, p: clamp(p.p ?? 0.5, 0, 1) };
      });
      if (pts.length < 2) continue;
      if (polylineLength(pts) < 2) continue;
      const poly = strokeToPolygon(pts, baseWidth, pressureEnabled);
      if (poly) strokePolys.push(poly);
    }
    if (!strokePolys.length) return [];

    // Union best-effort; if it fails, keep as separate polygons.
    const merged = unionPolygons(strokePolys);
    const polyOut = merged || strokePolys;

    // Normalize output to MultiPolygon shape.
    const multipoly = Array.isArray(polyOut[0][0][0]) ? polyOut : [polyOut];
    const epsilon = 2.0; // units; tuned for unitsPerEm=1000

    const contours = [];
    for (const poly of multipoly) {
      // poly: [ring, hole?, ...] where ring is [[x,y], ...]
      for (const ring of poly) {
        if (!ring || ring.length < 4) continue;
        const simp = simplifyRing(ring, epsilon);
        if (simp && simp.length >= 4) contours.push(simp.map(([x, y]) => ({ x, y })));
      }
    }
    return contours;
  }

  function glyphInkEstimate(glyph) {
    if (!glyph || !glyph.strokes || !glyph.strokes.length) return 0;
    let len = 0;
    for (const s of glyph.strokes) {
      const pts = s.points || [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        len += dist(a.x, a.y, b.x, b.y);
      }
    }
    return len;
  }

  window.Outline = {
    glyphToContours,
    glyphInkEstimate,
  };
})();
