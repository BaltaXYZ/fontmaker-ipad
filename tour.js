// Intro tour (coach marks) for FontMaker iPad.
(function () {
  'use strict';

  const LS_KEY = 'fontmaker_intro_seen_v1';

  const STEPS = [
    {
      title: 'Fontnamn',
      selector: '#fontName',
      body: 'Sätt ett fontnamn. Det används som namnet på den exporterade fonten.',
    },
    {
      title: 'Teckenlista',
      selector: '#glyphGrid',
      body: "Välj vilket tecken du ritar här. Pricken visar status. För export måste alla ‘required’ tecken bli klara.",
    },
    {
      title: 'Verktyg per tecken',
      selector: '.workspace__tools',
      body: 'Ångra/Gör om backar per stroke. Rensa tömmer tecknet och gör att status går tillbaka.',
    },
    {
      title: 'Rityta',
      selector: '#editorCanvas',
      body:
        "Rita tecknet med Apple Pencil (eller finger).\n\n" +
        "Baseline = där bokstäver står.\n" +
        "x-height = höjden på små bokstäver som ‘a’.\n" +
        "cap-height = höjden på versaler som ‘A’.\n" +
        "descender = delar som går under baseline, t.ex. ‘g’.",
      media: {
        type: 'image',
        src: 'assets/guides-a-a-g.svg',
        alt: 'Exempel: A, a, g i förhållande till baseline, x-height, cap-height och descender.',
      },
    },
    {
      title: 'Brush + Advance width',
      selector: '.controls',
      body: 'Justera penselbredd och tecknets advance width. Advance påverkar spacing i den exporterade fonten.',
    },
    {
      title: 'Export (ladda ner font)',
      selector: '#btnExportOTF',
      body:
        "När alla required tecken är klara: tryck Export OTF för att ladda ner fontfilen. Om något saknas får du en lista på exakt vilka tecken som saknas. (Preview-font är valfri och byggs med ‘Build preview font’.)",
      isLast: true,
    },
  ];

  let active = null;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function safeGetRect(el) {
    try {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        right: r.right,
        bottom: r.bottom,
      };
    } catch (_e) {
      return null;
    }
  }

  function viewportRect() {
    const vv = window.visualViewport;
    if (vv) {
      return {
        left: vv.offsetLeft,
        top: vv.offsetTop,
        width: vv.width,
        height: vv.height,
        right: vv.offsetLeft + vv.width,
        bottom: vv.offsetTop + vv.height,
      };
    }
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
  }

  function makeEl(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  function buildTourDom() {
    const overlay = makeEl('div', 'tourOverlay');
    overlay.setAttribute('role', 'presentation');

    const backdrop = makeEl('div', 'tourBackdrop');
    const highlight = makeEl('div', 'tourHighlight');
    const popover = makeEl('div', 'tourPopover');
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'true');

    const title = makeEl('div', 'tourPopover__title');
    const body = makeEl('div', 'tourPopover__body');
    const actions = makeEl('div', 'tourActions');

    const btnBack = makeEl('button', 'btn');
    btnBack.type = 'button';
    btnBack.textContent = 'Tillbaka';

    const btnNext = makeEl('button', 'btn btn--primary');
    btnNext.type = 'button';
    btnNext.textContent = 'Nästa';

    const btnSkip = makeEl('button', 'btn');
    btnSkip.type = 'button';
    btnSkip.textContent = 'Hoppa över';

    actions.appendChild(btnBack);
    actions.appendChild(btnSkip);
    actions.appendChild(btnNext);

    popover.appendChild(title);
    popover.appendChild(body);
    popover.appendChild(actions);

    overlay.appendChild(backdrop);
    overlay.appendChild(highlight);
    overlay.appendChild(popover);

    return {
      overlay,
      backdrop,
      highlight,
      popover,
      title,
      body,
      btnBack,
      btnNext,
      btnSkip,
    };
  }

  function scoreFit(vp, rect) {
    const x1 = Math.max(vp.left, rect.left);
    const y1 = Math.max(vp.top, rect.top);
    const x2 = Math.min(vp.right, rect.right);
    const y2 = Math.min(vp.bottom, rect.bottom);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    return w * h;
  }

  function placePopover(state, targetRect) {
    const vp = viewportRect();
    const margin = 12;
    const gap = 12;

    // Ensure popover is measurable.
    state.popover.style.left = '0px';
    state.popover.style.top = '0px';
    state.popover.style.maxWidth = 'min(360px, calc(100vw - 24px))';
    state.popover.style.visibility = 'hidden';
    state.popover.dataset.side = '';

    const pr = safeGetRect(state.popover);
    const pw = pr ? pr.width : 320;
    const ph = pr ? pr.height : 180;

    const t = targetRect;
    const candidates = [
      {
        side: 'right',
        left: t.right + gap,
        top: t.top + t.height / 2 - ph / 2,
      },
      {
        side: 'left',
        left: t.left - gap - pw,
        top: t.top + t.height / 2 - ph / 2,
      },
      {
        side: 'bottom',
        left: t.left + t.width / 2 - pw / 2,
        top: t.bottom + gap,
      },
      {
        side: 'top',
        left: t.left + t.width / 2 - pw / 2,
        top: t.top - gap - ph,
      },
    ];

    let best = null;
    let bestScore = -1;
    for (const c of candidates) {
      const rect = {
        left: c.left,
        top: c.top,
        right: c.left + pw,
        bottom: c.top + ph,
      };
      const s = scoreFit(vp, rect);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }

    let left = best.left;
    let top = best.top;
    left = clamp(left, vp.left + margin, vp.right - margin - pw);
    top = clamp(top, vp.top + margin, vp.bottom - margin - ph);

    state.popover.style.left = Math.round(left) + 'px';
    state.popover.style.top = Math.round(top) + 'px';
    state.popover.style.visibility = 'visible';
    state.popover.dataset.side = best.side;
  }

  function scrollTargetIntoView(el) {
    try {
      // "instant" is not widely supported; use smooth for nicer UX.
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    } catch (_e) {}
  }

  function layout(state) {
    if (!state || !state.active) return;
    const step = STEPS[state.stepIndex];
    const el = step ? document.querySelector(step.selector) : null;

    if (!el) {
      state.highlight.style.display = 'none';
      state.popover.dataset.side = '';
      state.popover.style.left = '50%';
      state.popover.style.top = '50%';
      state.popover.style.transform = 'translate(-50%, -50%)';
      return;
    }

    state.popover.style.transform = '';
    state.highlight.style.display = 'block';

    const r = safeGetRect(el);
    if (!r || r.width === 0 || r.height === 0) {
      state.highlight.style.display = 'none';
      return;
    }

    const pad = 8;
    const left = Math.round(r.left - pad);
    const top = Math.round(r.top - pad);
    const width = Math.round(r.width + pad * 2);
    const height = Math.round(r.height + pad * 2);

    state.highlight.style.left = left + 'px';
    state.highlight.style.top = top + 'px';
    state.highlight.style.width = width + 'px';
    state.highlight.style.height = height + 'px';

    placePopover(state, { left, top, right: left + width, bottom: top + height, width, height });
  }

  function updateContent(state) {
    const step = STEPS[state.stepIndex];
    state.title.textContent = step.title;
    state.body.textContent = '';

    const text = document.createElement('div');
    text.className = 'tourText';
    text.textContent = step.body;
    state.body.appendChild(text);

    if (step.media && step.media.type === 'image' && step.media.src) {
      const img = document.createElement('img');
      img.className = 'tourMedia';
      img.alt = step.media.alt || '';
      img.src = step.media.src;
      img.decoding = 'async';
      img.loading = 'eager';
      img.addEventListener('load', () => {
        if (state.active && typeof state.onLayout === 'function') state.onLayout();
      });
      state.body.appendChild(img);
    }

    state.btnBack.disabled = state.stepIndex === 0;
    state.btnNext.textContent = step.isLast ? 'Klar' : 'Nästa';
  }

  function setSeen() {
    try {
      localStorage.setItem(LS_KEY, '1');
    } catch (_e) {}
  }

  function cleanup(state) {
    if (!state) return;
    state.active = false;
    document.body.classList.remove('tour-is-open');
    if (state.overlay && state.overlay.parentNode) state.overlay.parentNode.removeChild(state.overlay);

    window.removeEventListener('resize', state.onLayout, { passive: true });
    window.removeEventListener('scroll', state.onLayout, true);
    window.removeEventListener('keydown', state.onKeydown, true);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', state.onLayout, { passive: true });
      window.visualViewport.removeEventListener('scroll', state.onLayout, { passive: true });
    }

    active = null;
  }

  function startIntro(opts) {
    const force = !!(opts && opts.force);
    if (active && active.active) return;
    if (!force) {
      try {
        if (localStorage.getItem(LS_KEY)) return;
      } catch (_e) {}
    }

    const dom = buildTourDom();
    const state = {
      ...dom,
      active: true,
      stepIndex: 0,
      onLayout: null,
      onKeydown: null,
    };
    active = state;

    document.body.classList.add('tour-is-open');
    document.body.appendChild(state.overlay);

    function relayout() {
      if (!state.active) return;
      // Re-run layout after potential smooth scroll kicks in.
      layout(state);
      requestAnimationFrame(() => layout(state));
    }

    state.onLayout = relayout;
    state.onKeydown = function (e) {
      if (!state.active) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setSeen();
        cleanup(state);
      }
    };

    state.btnBack.addEventListener('click', () => {
      if (state.stepIndex <= 0) return;
      state.stepIndex--;
      updateContent(state);
      const el = document.querySelector(STEPS[state.stepIndex].selector);
      if (el) scrollTargetIntoView(el);
      relayout();
    });

    state.btnNext.addEventListener('click', () => {
      if (STEPS[state.stepIndex].isLast) {
        setSeen();
        cleanup(state);
        return;
      }
      state.stepIndex++;
      updateContent(state);
      const el = document.querySelector(STEPS[state.stepIndex].selector);
      if (el) scrollTargetIntoView(el);
      relayout();
    });

    state.btnSkip.addEventListener('click', () => {
      setSeen();
      cleanup(state);
    });

    // Prevent accidental selections; underlying UI is also pointer-blocked via CSS.
    state.overlay.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });

    window.addEventListener('resize', state.onLayout, { passive: true });
    window.addEventListener('scroll', state.onLayout, true);
    window.addEventListener('keydown', state.onKeydown, true);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', state.onLayout, { passive: true });
      window.visualViewport.addEventListener('scroll', state.onLayout, { passive: true });
    }

    updateContent(state);
    const firstEl = document.querySelector(STEPS[0].selector);
    if (firstEl) scrollTargetIntoView(firstEl);
    // Wait a frame for DOM insertion/measurement.
    requestAnimationFrame(() => layout(state));
  }

  function maybeStartIntro() {
    startIntro({ force: false });
  }

  window.Tour = {
    maybeStartIntro,
    startIntro,
  };
})();
