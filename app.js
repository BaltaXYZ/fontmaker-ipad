/* global Editor, ProjectIO, FontExport */
(function () {
  'use strict';

  const REQUIRED_SETS = {
    upper: rangeChars('A', 'Z'),
    lower: rangeChars('a', 'z'),
    digits: rangeChars('0', '9'),
    swedishUpper: ['\u00c5', '\u00c4', '\u00d6'], // ÅÄÖ
    swedishLower: ['\u00e5', '\u00e4', '\u00f6'], // åäö
  };

  const OPTIONAL_CHARS = [' ', '.', ',', '!', '?', '-', '(', ')'];

  const METRICS_DEFAULT = {
    ascender: 800,
    descender: -200,
    lineGap: 200,
    capHeight: 700,
    xHeight: 500,
  };

  function rangeChars(a, b) {
    const out = [];
    const ca = a.charCodeAt(0);
    const cb = b.charCodeAt(0);
    for (let c = ca; c <= cb; c++) out.push(String.fromCharCode(c));
    return out;
  }

  function toCodepoints(chars) {
    return chars.map((ch) => ch.codePointAt(0));
  }

  function uniq(arr) {
    const s = new Set(arr);
    return Array.from(s);
  }

  function defaultAdvanceWidthFor(cp) {
    if (cp === 32) return 300; // space
    if (cp >= 48 && cp <= 57) return 600; // digits
    // Basic punctuation.
    if (cp === 46 || cp === 44) return 300; // . ,
    if (cp === 33 || cp === 63) return 350; // ! ?
    if (cp === 45) return 350; // -
    if (cp === 40 || cp === 41) return 350; // ( )
    return 600;
  }

  function makeGlyph(codepoint) {
    return {
      codepoint,
      advanceWidth: defaultAdvanceWidthFor(codepoint),
      strokes: [],
      undoStack: [],
      redoStack: [],
      brushWidth: 60,
      pressureEnabled: true,
    };
  }

  function makeProject() {
    const required = []
      .concat(REQUIRED_SETS.upper, REQUIRED_SETS.lower, REQUIRED_SETS.digits, REQUIRED_SETS.swedishUpper, REQUIRED_SETS.swedishLower);
    const all = uniq(required.concat(OPTIONAL_CHARS));
    const order = toCodepoints(all);
    order.sort((a, b) => a - b); // stable

    const glyphs = {};
    for (const cp of order) glyphs[String(cp)] = makeGlyph(cp);

    return {
      version: 1,
      projectId: Math.random().toString(16).slice(2),
      fontName: 'MyFont',
      unitsPerEm: 1000,
      metrics: { ...METRICS_DEFAULT },
      glyphOrder: order,
      glyphs,
    };
  }

  function glyphStatus(project, glyph) {
    if (!glyph || !glyph.strokes || glyph.strokes.length === 0) return 'empty';
    const ink = window.Outline ? window.Outline.glyphInkEstimate(glyph) : 0.1;
    // Estimate is in normalized coords; tiny scribbles should not count as "done".
    if (ink < 0.03) return 'partial';
    return 'done';
  }

  function isRequiredCodepoint(cp) {
    if (cp >= 65 && cp <= 90) return true;
    if (cp >= 97 && cp <= 122) return true;
    if (cp >= 48 && cp <= 57) return true;
    if (cp === 0x00c5 || cp === 0x00c4 || cp === 0x00d6) return true;
    if (cp === 0x00e5 || cp === 0x00e4 || cp === 0x00f6) return true;
    return false;
  }

  function requiredMissing(project) {
    const missing = [];
    for (const cp of project.glyphOrder) {
      if (!isRequiredCodepoint(cp)) continue;
      const g = project.glyphs[String(cp)];
      const st = glyphStatus(project, g);
      if (st !== 'done') missing.push(cp);
    }
    return missing;
  }

  function cpLabel(cp) {
    if (cp === 32) return '␠';
    return String.fromCharCode(cp);
  }

  function categoryOf(cp) {
    if (cp >= 65 && cp <= 90) return 'upper';
    if (cp >= 97 && cp <= 122) return 'lower';
    if (cp >= 48 && cp <= 57) return 'digits';
    if (cp === 0x00c5 || cp === 0x00c4 || cp === 0x00d6 || cp === 0x00e5 || cp === 0x00e4 || cp === 0x00f6) return 'swedish';
    return 'punct';
  }

  function showModal(title, body) {
    const modal = document.getElementById('modal');
    if (!modal || typeof modal.showModal !== 'function') {
      // iOS Safari should support <dialog> nowadays, but keep a hard fallback.
      alert(title + '\n\n' + body);
      return;
    }
    const t = document.getElementById('modalTitle');
    const b = document.getElementById('modalBody');
    t.textContent = title;
    b.textContent = body;
    modal.showModal();
  }

  function main() {
    let project = makeProject();
    let currentFilter = 'all';
    let currentCp = 'A'.codePointAt(0);
    let previewFontHandle = null;

    const elFontName = document.getElementById('fontName');
    const elGrid = document.getElementById('glyphGrid');
    const elCurrentChar = document.getElementById('currentChar');
    const elCurrentMeta = document.getElementById('currentMeta');
    const elBrushWidth = document.getElementById('brushWidth');
    const elBrushWidthValue = document.getElementById('brushWidthValue');
    const elAdvanceWidth = document.getElementById('advanceWidth');
    const elAdvanceWidthValue = document.getElementById('advanceWidthValue');
    const elPreviewText = document.getElementById('previewText');
    const elFontPreview = document.getElementById('fontPreview');
    const elFileImport = document.getElementById('fileImport');

    const editor = Editor.makeEditor(document.getElementById('editorCanvas'), {
      onChange: function () {
        renderGrid();
        renderHeader();
      },
    });

    function currentGlyph() {
      return project.glyphs[String(currentCp)];
    }

    function setCurrent(cp) {
      currentCp = cp;
      editor.setGlyph(currentGlyph(), project.metrics);
      syncControlsFromGlyph();
      renderGrid();
      renderHeader();
    }

    function syncControlsFromGlyph() {
      const g = currentGlyph();
      elBrushWidth.value = String(g.brushWidth || 60);
      elAdvanceWidth.value = String(g.advanceWidth || 600);
      elBrushWidthValue.textContent = String(g.brushWidth || 60);
      elAdvanceWidthValue.textContent = String(g.advanceWidth || 600);
    }

    function renderHeader() {
      const g = currentGlyph();
      elCurrentChar.textContent = cpLabel(currentCp);
      const meta = [];
      meta.push(`U+${currentCp.toString(16).toUpperCase().padStart(4, '0')}`);
      meta.push(`status: ${glyphStatus(project, g)}`);
      meta.push(`strokes: ${g.strokes.length}`);
      elCurrentMeta.textContent = meta.join(' · ');
    }

    function renderGrid() {
      const activeId = String(currentCp);
      elGrid.innerHTML = '';

      const cps = project.glyphOrder.filter((cp) => {
        if (currentFilter === 'all') return true;
        return categoryOf(cp) === currentFilter;
      });

      for (const cp of cps) {
        const g = project.glyphs[String(cp)];
        const st = glyphStatus(project, g);
        const btn = document.createElement('button');
        btn.className = 'glyphBtn' + (String(cp) === activeId ? ' is-active' : '');
        btn.dataset.status = st;
        btn.type = 'button';
        btn.innerHTML = `<div class="glyphBtn__char"></div><div class="glyphBtn__dot"></div>`;
        btn.querySelector('.glyphBtn__char').textContent = cpLabel(cp);
        btn.addEventListener('click', () => setCurrent(cp));
        elGrid.appendChild(btn);
      }
    }

    function setFilter(next) {
      currentFilter = next;
      document.querySelectorAll('.segmented__btn').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.filter === next);
      });
      renderGrid();
    }

    document.querySelectorAll('.segmented__btn').forEach((b) => {
      b.addEventListener('click', () => setFilter(b.dataset.filter));
    });

    document.getElementById('btnUndo').addEventListener('click', () => editor.undo());
    document.getElementById('btnRedo').addEventListener('click', () => editor.redo());
    document.getElementById('btnClear').addEventListener('click', () => editor.clear());

    elBrushWidth.addEventListener('input', () => {
      const g = currentGlyph();
      const prev = g.brushWidth || 60;
      const next = Number(elBrushWidth.value);
      g.brushWidth = next;
      g.undoStack.push({ type: 'setBrushWidth', prev, next });
      g.redoStack.length = 0;
      elBrushWidthValue.textContent = String(next);
      editor.requestRender();
      renderGrid();
    });

    elAdvanceWidth.addEventListener('input', () => {
      const g = currentGlyph();
      const prev = g.advanceWidth || 600;
      const next = Number(elAdvanceWidth.value);
      g.advanceWidth = next;
      g.undoStack.push({ type: 'setAdvanceWidth', prev, next });
      g.redoStack.length = 0;
      elAdvanceWidthValue.textContent = String(next);
      editor.requestRender();
      renderGrid();
    });

    elFontName.value = project.fontName;
    elFontName.addEventListener('input', () => {
      project.fontName = (elFontName.value || 'MyFont').trim();
    });

    elPreviewText.value = 'Aa\u00c5\u00e5\u00d6\u00f6012 Hello!';
    elFontPreview.textContent = elPreviewText.value;
    elPreviewText.addEventListener('input', () => {
      elFontPreview.textContent = elPreviewText.value;
    });

    document.getElementById('btnExportProject').addEventListener('click', () => {
      ProjectIO.exportProject(project);
    });

    document.getElementById('btnImportProject').addEventListener('click', () => {
      elFileImport.value = '';
      elFileImport.click();
    });

    elFileImport.addEventListener('change', async () => {
      const f = elFileImport.files && elFileImport.files[0];
      if (!f) return;
      const text = await f.text();
      try {
        const data = ProjectIO.importProjectFromText(text);
        // Adopt imported data but keep runtime-only properties sane.
        project = {
          projectId: data.projectId || Math.random().toString(16).slice(2),
          fontName: data.fontName || 'MyFont',
          unitsPerEm: data.unitsPerEm || 1000,
          metrics: data.metrics || { ...METRICS_DEFAULT },
          glyphOrder: data.glyphOrder,
          glyphs: {},
        };
        for (const cp of project.glyphOrder) {
          const raw = data.glyphs[String(cp)] || makeGlyph(cp);
          project.glyphs[String(cp)] = {
            codepoint: cp,
            advanceWidth: raw.advanceWidth || defaultAdvanceWidthFor(cp),
            brushWidth: raw.brushWidth || 60,
            pressureEnabled: raw.pressureEnabled !== false,
            strokes: raw.strokes || [],
            undoStack: [],
            redoStack: [],
          };
        }
        elFontName.value = project.fontName;
        setCurrent(project.glyphOrder.includes(currentCp) ? currentCp : project.glyphOrder[0]);
      } catch (e) {
        showModal('Import failed', String(e && e.message ? e.message : e));
      }
    });

    document.getElementById('btnExportOTF').addEventListener('click', () => {
      const missing = requiredMissing(project);
      if (missing.length) {
        const list = missing.map((cp) => cpLabel(cp) + ` (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`).join('\n');
        showModal('Missing required glyphs', list);
        return;
      }
      try {
        FontExport.exportOTF(project);
      } catch (e) {
        console.error(e);
        showModal('Export failed', String(e && e.message ? e.message : e));
      }
    });

    document.getElementById('modalClose').addEventListener('click', () => {
      document.getElementById('modal').close();
    });

    document.getElementById('btnBuildPreviewFont').addEventListener('click', async () => {
      const missing = requiredMissing(project);
      if (missing.length) {
        const list = missing.map((cp) => cpLabel(cp)).join(' ');
        showModal('Preview font blocked', `Missing required glyphs: ${list}`);
        return;
      }
      try {
        if (previewFontHandle && previewFontHandle.revoke) previewFontHandle.revoke();
        previewFontHandle = await FontExport.buildPreviewFontFace(project);
        elFontPreview.style.fontFamily = `"${previewFontHandle.family}", ${getComputedStyle(document.body).fontFamily}`;
        elFontPreview.textContent = elPreviewText.value;
      } catch (e) {
        console.error(e);
        showModal('Preview build failed', String(e && e.message ? e.message : e));
      }
    });

    setCurrent(currentCp);
    setFilter('all');
    renderGrid();
    renderHeader();
    editor.setGlyph(currentGlyph(), project.metrics);
    syncControlsFromGlyph();
  }

  window.addEventListener('DOMContentLoaded', main);
})();
