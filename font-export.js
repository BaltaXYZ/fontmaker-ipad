/* global opentype */
(function () {
  'use strict';

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function makeNotdefGlyph(unitsPerEm) {
    const p = new opentype.Path();
    const m = unitsPerEm * 0.06;
    const w = unitsPerEm * 0.70;
    const h = unitsPerEm * 0.70;
    p.moveTo(m, m);
    p.lineTo(m + w, m);
    p.lineTo(m + w, m + h);
    p.lineTo(m, m + h);
    p.close();
    const g = new opentype.Glyph({
      name: '.notdef',
      unicode: 0,
      advanceWidth: unitsPerEm,
      path: p,
    });
    return g;
  }

  function contoursToPath(contours) {
    const path = new opentype.Path();
    for (const ring of contours) {
      if (!ring || ring.length < 3) continue;
      path.moveTo(ring[0].x, ring[0].y);
      for (let i = 1; i < ring.length; i++) path.lineTo(ring[i].x, ring[i].y);
      path.close();
    }
    return path;
  }

  function buildFont(project) {
    const { unitsPerEm, metrics } = project;
    const glyphs = [];
    glyphs.push(makeNotdefGlyph(unitsPerEm));

    for (const cp of project.glyphOrder) {
      const g = project.glyphs[String(cp)];
      const contours = window.Outline ? window.Outline.glyphToContours(g, metrics) : [];
      const path = contoursToPath(contours);
      const name =
        cp === 32
          ? 'space'
          : cp < 128
            ? String.fromCharCode(cp)
            : 'uni' + cp.toString(16).toUpperCase().padStart(4, '0');
      glyphs.push(
        new opentype.Glyph({
          name,
          unicode: cp,
          advanceWidth: g.advanceWidth,
          path,
        })
      );
    }

    const font = new opentype.Font({
      familyName: project.fontName || 'MyFont',
      styleName: 'Regular',
      unitsPerEm: unitsPerEm,
      ascender: metrics.ascender,
      descender: metrics.descender,
      glyphs,
    });

    // opentype.js can write either TrueType or CFF. We want OTF/CFF for MVP.
    try {
      font.outlinesFormat = 'cff';
    } catch (_) {}

    return font;
  }

  function exportOTF(project) {
    const font = buildFont(project);
    const buf = font.toArrayBuffer();
    const blob = new Blob([buf], { type: 'font/otf' });
    downloadBlob(blob, `${project.fontName || 'MyFont'}.otf`);
  }

  async function buildPreviewFontFace(project) {
    const font = buildFont(project);
    const buf = font.toArrayBuffer();
    const blob = new Blob([buf], { type: 'font/otf' });
    const url = URL.createObjectURL(blob);
    const family = (project.fontName || 'MyFont') + '_Preview_' + Math.random().toString(16).slice(2);
    const ff = new FontFace(family, `url(${url})`, { style: 'normal', weight: '400' });
    await ff.load();
    document.fonts.add(ff);
    return { family, revoke: () => URL.revokeObjectURL(url) };
  }

  window.FontExport = {
    exportOTF,
    buildFont,
    buildPreviewFontFace,
  };
})();

