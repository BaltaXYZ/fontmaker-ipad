(function () {
  'use strict';

  const PROJECT_VERSION = 1;

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

  function exportProject(project) {
    const safe = {
      version: PROJECT_VERSION,
      projectId: project.projectId,
      fontName: project.fontName,
      unitsPerEm: project.unitsPerEm,
      metrics: project.metrics,
      glyphOrder: project.glyphOrder,
      glyphs: {},
    };
    for (const cpStr of Object.keys(project.glyphs)) {
      const g = project.glyphs[cpStr];
      safe.glyphs[cpStr] = {
        codepoint: g.codepoint,
        advanceWidth: g.advanceWidth,
        brushWidth: g.brushWidth,
        pressureEnabled: g.pressureEnabled,
        strokes: g.strokes,
      };
    }
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${project.fontName || 'fontmaker'}-project.json`);
  }

  function importProjectFromText(text) {
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON');
    }
    if (!data || data.version !== PROJECT_VERSION) throw new Error(`Unsupported project version (expected ${PROJECT_VERSION})`);
    if (!data.glyphs || !data.glyphOrder || !data.metrics) throw new Error('Invalid project shape');
    return data;
  }

  window.ProjectIO = {
    exportProject,
    importProjectFromText,
  };
})();

