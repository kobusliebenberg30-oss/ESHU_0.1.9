/* ================================================================
   ANIMATION DRAW TOOL — Unified Compositor Version (v3)
   Fullscreen, frame-by-frame, layered drawing overlay.

   Public API (window.ANIMATION_DRAW):
     open({ imageUrl, imageMeta, initialData, onSave })
     close()
     isOpen()

   Data format (animationData v3 - CANVAS-RELATIVE coordinates):
   {
     v: 3,
     fps: 12,
     canvasW: 1920,  // Canvas dimensions at creation time
     canvasH: 1080,
     imageMeta: { 
       naturalW, naturalH, 
       crop, border, bgColor,
       displayRect: { x, y, width, height } // normalized 0-1, image position on canvas
     },
     layers: [
       { id, letter, loop, trails, ghost, isolate, skipFrames,
         frames: [ { strokes: [ { points:[[nx,ny,t],...], color, size, fill } ] } ]
       }
     ]
   }
   
   Key improvements in v3:
   - CANVAS-RELATIVE coordinates (0-1 across ENTIRE canvas, not just image)
   - Draw ANYWHERE on the screen, not restricted to image bounds
   - Image is centered composited element with border and background
   - Unified compositor for consistent rendering across all contexts
   - Proper image metadata preservation (crop, border, bg)
   - Automatic migration from v1/v2 to v3
   ================================================================ */
(function () {
  'use strict';

  // ---------------- State ----------------
  let root, stage, canvasHost, bgImg, strokeCanvas, strokeCtx, playCanvas, playCtx;
  let closeBtn, saveBtn, hideUiBtn;
  let panel, layersBox, transport, fpsSlider, fpsVal, undoBtn, redoBtn, autoFrameBtn;
  let layerPropsEl;
  let toolstrip, penSizeSlider, penPreview, primaryColorInput, secondaryColorInput, inkFill;
  let colorPopoverEl, colorGridEl, colorHexInput, colorPreviewEl;
  let activeColorChannel = null;

  const COLOR_PRESETS = [
    '#000000', '#404040', '#7f7f7f', '#bfbfbf', '#ffffff',
    '#8b0000', '#e63a28', '#ff8a3d', '#ffd23f', '#fff07a',
    '#0a6b2a', '#20b24b', '#5dd39e', '#0ea5e9', '#2563eb',
    '#1e1b4b', '#7c3aed', '#d946ef', '#ec4899', '#8b4513'
  ];

  let state = null; // animationData
  let currentLayerIdx = 0;
  let currentFrameIdx = 0;
  let isDrawing = false;
  let currentStroke = null;
  let compositor = null; // DRAWING_COMPOSITOR instance
  let penSize = 4;
  let primaryColor = '#000000';
  let secondaryColor = '#ffffff';
  let isPlaying = false;
  let playTimer = null;
  let undoStack = [];
  let redoStack = [];
  let layerFrameIndexById = new Map();
  let ink = 1.0; // 0..1 remaining
  const INK_MAX = 20000; // total pixel-units worth of drawing
  let inkUsed = 0;
  let onSaveCallback = null;
  let layerPropsOpen = false;
  let isOpen = false;

  function clampFps(v) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return 12;
    return Math.max(1, Math.min(60, n));
  }

  function getLayerFrameIndex(layer) {
    if (!layer || !Array.isArray(layer.frames) || layer.frames.length === 0) return 0;
    const max = layer.frames.length - 1;
    const stored = layerFrameIndexById.get(layer.id);
    const idx = Number.isInteger(stored) ? stored : 0;
    return Math.max(0, Math.min(max, idx));
  }

  function setLayerFrameIndex(layer, idx) {
    if (!layer || !Array.isArray(layer.frames) || layer.frames.length === 0) return 0;
    const max = layer.frames.length - 1;
    const next = Math.max(0, Math.min(max, idx));
    layerFrameIndexById.set(layer.id, next);
    return next;
  }

  // ---------------- Utility ----------------
  function genId() { return 'ad_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }
  function letterFor(i) {
    let s = '';
    i = i + 1;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function askConfirm(options) {
    const opts = options || {};
    const title = opts.title || 'Confirm';
    const message = opts.message || 'Are you sure?';
    const confirmLabel = opts.confirmLabel || 'OK';
    const cancelLabel = opts.cancelLabel || 'Cancel';

    if (window.MODAL && typeof window.MODAL.confirm === 'function') {
      return window.MODAL.confirm({
        title,
        message,
        confirmLabel,
        cancelLabel,
        danger: !!opts.danger,
        size: opts.size || 'sm'
      });
    }

    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.35);z-index:30;display:flex;align-items:center;justify-content:center;';

      const box = document.createElement('div');
      box.style.cssText = 'width:min(320px,calc(100% - 24px));background:#fff;border:1px solid #c8c8c2;border-radius:6px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,0.18);';

      const h = document.createElement('div');
      h.style.cssText = 'font-size:14px;font-weight:800;color:#111;margin-bottom:8px;';
      h.textContent = title;

      const p = document.createElement('div');
      p.style.cssText = 'font-size:12px;color:#222;line-height:1.35;margin-bottom:12px;';
      p.textContent = message;

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = cancelLabel;
      cancelBtn.style.cssText = 'border:1px solid #c7c7c2;background:#fff;color:#111;padding:6px 12px;border-radius:4px;font-size:12px;font-weight:700;cursor:pointer;';

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = confirmLabel;
      okBtn.style.cssText = `border:1px solid ${opts.danger ? '#c93427' : '#1ca544'};background:${opts.danger ? '#e63a28' : '#20b24b'};color:#fff;padding:6px 12px;border-radius:4px;font-size:12px;font-weight:700;cursor:pointer;`;

      const cleanup = () => {
        document.removeEventListener('keydown', onKeyDown);
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      };
      const onCancel = () => { cleanup(); resolve(false); };
      const onOk = () => { cleanup(); resolve(true); };
      const onKeyDown = (ev) => {
        if (ev.key === 'Escape') onCancel();
        if (ev.key === 'Enter') onOk();
      };

      cancelBtn.addEventListener('click', onCancel);
      okBtn.addEventListener('click', onOk);
      backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop) onCancel(); });
      document.addEventListener('keydown', onKeyDown);

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      box.appendChild(h);
      box.appendChild(p);
      box.appendChild(actions);
      backdrop.appendChild(box);
      (root || document.body).appendChild(backdrop);
      okBtn.focus();
    });
  }

  // ---------------- Initial/Empty state ----------------
  function emptyState(initial, imageMeta) {
    // Migrate any version to v3 if needed
    if (initial && window.DRAWING_COMPOSITOR) {
      const canvasInfo = {
        width: window.innerWidth,
        height: window.innerHeight
      };
      // If we already have a compositor with image positioned, use that displayRect
      if (compositor && compositor.imageRect) {
        canvasInfo.imageRect = compositor.imageRect;
      }
      
      // migrateToV3 handles v1, v2, and returns v3 as-is
      const migrated = window.DRAWING_COMPOSITOR.migrateToV3(initial, canvasInfo);
      if (migrated) return migrated;
    }
    
    if (initial && initial.layers && initial.layers.length) {
      // Already v3 or compatible
      return clone(initial);
    }
    
    // Create new v3 state with canvas dimensions
    const meta = imageMeta || {};
    const canvasW = window.innerWidth;
    const canvasH = window.innerHeight;
    
    return {
      v: 3,
      fps: 12,
      autoAddFrame: false,
      canvasW: canvasW,
      canvasH: canvasH,
      imageMeta: {
        naturalW: meta.naturalW || 1920,
        naturalH: meta.naturalH || 1080,
        crop: meta.crop || null,
        border: meta.border || null,
        bgColor: meta.bgColor || '#ffffff',
        displayRect: null  // Will be set when image is positioned
      },
      layers: [{
        id: genId(),
        letter: 'A',
        loop: true,
        trails: false,
        ghost: false,
        isolate: false,
        skipFrames: 0,
        frames: [ { strokes: [] } ]
      }]
    };
  }

  // ---------------- DOM Construction ----------------
  function buildDom() {
    if (root) return;

    root = document.createElement('div');
    root.className = 'adraw-root';
    root.innerHTML = `
      <div class="adraw-stage">
        <div class="adraw-canvas-host">
          <img class="adraw-bg" alt="" />
          <canvas class="adraw-play-canvas"></canvas>
          <canvas class="adraw-stroke-canvas"></canvas>
        </div>
      </div>
      <button class="adraw-close" title="Close">×</button>
      <button class="adraw-hide-ui-floating" title="Show Tools">Show Tools</button>

      <div class="adraw-panel">
        <button class="adraw-add-layer">Add Layer</button>
        <div class="adraw-layer-list"></div>

        <button class="adraw-auto-frame-btn">Auto Add Frame Off</button>

        <div class="adraw-transport-card">
          <div class="adraw-transport">
            <button data-act="first" title="Jump to start"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h2v16H4zM14 4L7 12l7 8zM22 4l-7 8 7 8z"/></svg></button>
            <button data-act="prev" title="Step back"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4L6 12l12 8zM4 4h2v16H4z"/></svg></button>
            <button data-act="next" title="Step forward"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l12 8-12 8zM18 4h2v16h-2z"/></svg></button>
            <button data-act="play" title="Play / Pause"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg></button>
          </div>
          <div class="adraw-fps-row">
            <div class="adraw-fps-left">
              <span>FPS</span>
              <span class="adraw-fps-val">12</span>
            </div>
            <input type="range" min="1" max="60" value="12" class="adraw-fps-slider" />
            <div class="adraw-fps-right">
              <span>Frames</span>
              <span class="adraw-frames-val">1</span>
            </div>
          </div>
        </div>

        <div class="adraw-history-row">
          <button class="adraw-undo">Undo</button>
          <button class="adraw-redo">Redo</button>
        </div>
      </div>

      <button class="adraw-hide-ui" title="Hide UI">Hide<br>Tools</button>

      <div class="adraw-layer-props">
        <div class="adraw-lp-row">
          <button class="adraw-lp-btn mini-toggle" data-lp="isolate">
            <span class="label">Isolate</span>
            <span class="state">Off</span>
            <span class="icon">👁</span>
          </button>
          <button class="adraw-lp-btn mini-toggle" data-lp="ghost">
            <span class="label">Ghost</span>
            <span class="state">Off</span>
            <span class="icon">◼</span>
          </button>
          <button class="adraw-lp-btn danger" data-lp="delete">Delete<br>Layer</button>
        </div>
        <div class="adraw-lp-row">
          <button class="adraw-lp-btn animate" data-lp="animate">ANIMATE</button>
        </div>
        <div class="adraw-lp-row">
          <button class="adraw-lp-btn checkbox on" data-lp="loop">LOOP</button>
          <button class="adraw-lp-btn checkbox" data-lp="trails">TRAILS</button>
        </div>
        <div class="adraw-lp-row adraw-lp-frame-nav">
          <button class="adraw-lp-btn" data-lp="frame-prev" title="Previous frame"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4L6 12l12 8zM4 4h2v16H4z"/></svg></button>
          <span class="adraw-lp-frame-indicator">frames<span class="big">1 of 1</span></span>
          <button class="adraw-lp-btn" data-lp="frame-next" title="Next frame"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l12 8-12 8zM18 4h2v16h-2z"/></svg></button>
        </div>
        <div class="adraw-lp-row adraw-lp-frame-actions">
          <button class="adraw-lp-btn remove-frame" data-lp="remove-frame">Remove<br>Frames</button>
          <button class="adraw-lp-btn insert-frame" data-lp="insert-frame">Insert<br>Frames</button>
        </div>
      </div>

      <div class="adraw-toolstrip">
        <div class="adraw-color-popover" hidden>
          <div class="adraw-color-grid"></div>
          <div class="adraw-color-hex-row">
            <span class="adraw-color-preview"></span>
            <input type="text" class="adraw-color-hex" maxlength="7" />
          </div>
        </div>
        <div class="ts-top">
          <div class="adraw-colors">
            <button type="button" class="adraw-color-btn adraw-primary-color" data-channel="primary" title="Primary (stroke)" style="--sw-color:#000000"></button>
            <button type="button" class="adraw-color-btn adraw-secondary-color" data-channel="secondary" title="Secondary (fill)" style="--sw-color:#ffffff"></button>
          </div>
          <div class="adraw-pen-group">
            <div class="adraw-pen-label">
              <span>Pen size</span>
              <span class="adraw-pen-preview"></span>
            </div>
            <input type="range" min="1" max="40" value="4" class="adraw-pen-size" />
          </div>
        </div>
        <div class="adraw-ink-row">
          <span class="adraw-ink-label">Ink remaining</span>
          <span class="adraw-ink-val">100%</span>
          <div class="adraw-ink-bar"><div class="adraw-ink-fill"></div></div>
        </div>
      </div>

      <button class="adraw-save">Save</button>
    `;

    document.body.appendChild(root);

    // Cache refs
    stage = root.querySelector('.adraw-stage');
    canvasHost = root.querySelector('.adraw-canvas-host');
    bgImg = root.querySelector('.adraw-bg');
    strokeCanvas = root.querySelector('.adraw-stroke-canvas');
    playCanvas = root.querySelector('.adraw-play-canvas');
    strokeCtx = strokeCanvas.getContext('2d');
    playCtx = playCanvas.getContext('2d');

    closeBtn = root.querySelector('.adraw-close');
    saveBtn = root.querySelector('.adraw-save');
    hideUiBtn = root.querySelector('.adraw-hide-ui');
    const hideUiFloating = root.querySelector('.adraw-hide-ui-floating');
    if (hideUiFloating) hideUiFloating.addEventListener('click', toggleUi);
    panel = root.querySelector('.adraw-panel');
    layersBox = root.querySelector('.adraw-layer-list');
    transport = root.querySelector('.adraw-transport');
    fpsSlider = root.querySelector('.adraw-fps-slider');
    fpsVal = root.querySelector('.adraw-fps-val');
    undoBtn = root.querySelector('.adraw-undo');
    redoBtn = root.querySelector('.adraw-redo');
    autoFrameBtn = root.querySelector('.adraw-auto-frame-btn');
    layerPropsEl = root.querySelector('.adraw-layer-props');
    toolstrip = root.querySelector('.adraw-toolstrip');
    penSizeSlider = root.querySelector('.adraw-pen-size');
    penPreview = root.querySelector('.adraw-pen-preview');
    primaryColorInput = root.querySelector('.adraw-primary-color');
    secondaryColorInput = root.querySelector('.adraw-secondary-color');
    colorPopoverEl = root.querySelector('.adraw-color-popover');
    colorGridEl = root.querySelector('.adraw-color-grid');
    colorHexInput = root.querySelector('.adraw-color-hex');
    colorPreviewEl = root.querySelector('.adraw-color-preview');
    buildColorGrid();
    inkFill = root.querySelector('.adraw-ink-fill');

    bindEvents();
  }

  // ---------------- Events ----------------
  function bindEvents() {
    closeBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', doSave);
    hideUiBtn.addEventListener('click', toggleUi);

    root.querySelector('.adraw-add-layer').addEventListener('click', addLayer);

    transport.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'first') {
        currentFrameIdx = 0;
        const L = state.layers[currentLayerIdx];
        if (L) setLayerFrameIndex(L, currentFrameIdx);
        if (isPlaying) {
          stopPlay();
          startPlay();
        } else {
          renderLayerList();
          refreshLayerProps();
          render();
        }
      }
      else if (act === 'prev') { stepFrame(-1); }
      else if (act === 'next') { stepFrame(1); }
      else if (act === 'play') { togglePlay(); }
    });

    fpsSlider.addEventListener('input', () => {
      state.fps = clampFps(fpsSlider.value);
      fpsSlider.value = state.fps;
      fpsVal.textContent = state.fps;
      if (isPlaying) { stopPlay(); startPlay(); }
    });

    undoBtn.addEventListener('click', doUndo);
    redoBtn.addEventListener('click', doRedo);

    autoFrameBtn.addEventListener('click', () => {
      state.autoAddFrame = !state.autoAddFrame;
      autoFrameBtn.textContent = `Auto Add Frame ${state.autoAddFrame ? 'On' : 'Off'}`;
      autoFrameBtn.classList.toggle('on', state.autoAddFrame);
    });

    penSizeSlider.addEventListener('input', () => {
      penSize = parseInt(penSizeSlider.value, 10);
      updatePenPreview();
    });
    primaryColorInput.addEventListener('click', (e) => { e.stopPropagation(); toggleColorPopover('primary'); });
    secondaryColorInput.addEventListener('click', (e) => { e.stopPropagation(); toggleColorPopover('secondary'); });

    colorGridEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.adraw-color-swatch');
      if (!btn) return;
      applyPickedColor(btn.dataset.color);
    });
    colorHexInput.addEventListener('change', () => {
      const v = normalizeHex(colorHexInput.value);
      if (v) applyPickedColor(v);
      else colorHexInput.value = currentChannelColor();
    });
    colorHexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); colorHexInput.blur(); }
    });
    document.addEventListener('click', (e) => {
      if (!colorPopoverEl || colorPopoverEl.hidden) return;
      if (colorPopoverEl.contains(e.target)) return;
      if (e.target === primaryColorInput || e.target === secondaryColorInput) return;
      closeColorPopover();
    });

    // Layer props panel
    layerPropsEl.addEventListener('click', onLayerPropsClick);

    // Canvas drawing
    strokeCanvas.addEventListener('pointerdown', onPointerDown);
    strokeCanvas.addEventListener('pointermove', onPointerMove);
    strokeCanvas.addEventListener('pointerup', onPointerUp);
    strokeCanvas.addEventListener('pointercancel', onPointerUp);
    strokeCanvas.addEventListener('pointerleave', onPointerUp);

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!isOpen) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    else if (e.key === 'Escape') { close(); }
    else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft') { stepFrame(-1); }
    else if (e.key === 'ArrowRight') { stepFrame(1); }
  }

  // ---------------- Layer management ----------------
  function addLayer() {
    snapshot();
    const letter = letterFor(state.layers.length);
    const layer = {
      id: genId(),
      letter,
      loop: false,
      trails: false,
      ghost: false,
      isolate: false,
      skipFrames: 0,
      frames: [ { strokes: [] } ]
    };
    state.layers.push(layer);
    setLayerFrameIndex(layer, 0);
    currentLayerIdx = state.layers.length - 1;
    currentFrameIdx = 0;
    layerPropsOpen = true;
    renderLayerList();
    render();
    layerPropsEl.classList.add('open');
    updateLayerPointer();
  }

  function renderLayerList() {
    const activeLayer = state.layers[currentLayerIdx];
    if (activeLayer) setLayerFrameIndex(activeLayer, currentFrameIdx);
    layersBox.innerHTML = '';
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const L = state.layers[i];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'adraw-layer-row' + (i === currentLayerIdx ? ' active' : '');
      row.dataset.idx = String(i);
      const frameIdxShown = getLayerFrameIndex(L) + 1;
      row.innerHTML = `
        <span class="adraw-layer-letter">${L.letter}</span>
        <span class="adraw-layer-frames"><span>frames</span><span class="big">${frameIdxShown} of ${L.frames.length}</span></span>
      `;
      row.addEventListener('click', () => {
        if (currentLayerIdx === i) {
          layerPropsOpen = !layerPropsOpen;
        } else {
          const prevLayer = state.layers[currentLayerIdx];
          if (prevLayer) setLayerFrameIndex(prevLayer, currentFrameIdx);
          currentLayerIdx = i;
          const L2 = state.layers[currentLayerIdx];
          currentFrameIdx = getLayerFrameIndex(L2);
          layerPropsOpen = true;
        }
        if (isPlaying) {
          // Light update while animating — keep DOM intact so clicks keep working.
          layersBox.querySelectorAll('.adraw-layer-row').forEach(r => {
            r.classList.toggle('active', parseInt(r.dataset.idx, 10) === currentLayerIdx);
          });
          if (layerPropsEl) layerPropsEl.classList.toggle('open', layerPropsOpen);
          refreshLayerProps();
          updateLayerPointer();
          return;
        }
        renderLayerList();
        refreshLayerProps();
        render();
      });
      layersBox.appendChild(row);
    }
    layerPropsEl.classList.toggle('open', layerPropsOpen);
    const activeRow = layersBox.querySelector('.adraw-layer-row.active');
    if (activeRow && typeof activeRow.scrollIntoView === 'function') {
      activeRow.scrollIntoView({ block: 'nearest' });
    }
    updateLayerPointer();
  }

  // ---------------- Custom color popover ----------------
  function buildColorGrid() {
    if (!colorGridEl) return;
    colorGridEl.innerHTML = COLOR_PRESETS.map(c =>
      `<button type="button" class="adraw-color-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`
    ).join('');
  }

  function currentChannelColor() {
    return activeColorChannel === 'secondary' ? secondaryColor : primaryColor;
  }

  function normalizeHex(v) {
    if (!v) return null;
    v = String(v).trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
      v = '#' + v.slice(1).split('').map(ch => ch + ch).join('');
    }
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
  }

  function toggleColorPopover(channel) {
    if (!colorPopoverEl) return;
    if (!colorPopoverEl.hidden && activeColorChannel === channel) {
      closeColorPopover();
      return;
    }
    activeColorChannel = channel;
    colorPopoverEl.hidden = false;
    syncPopoverToChannel();
  }

  function closeColorPopover() {
    if (!colorPopoverEl) return;
    colorPopoverEl.hidden = true;
  }

  function syncPopoverToChannel() {
    const color = currentChannelColor();
    if (colorHexInput) colorHexInput.value = color;
    if (colorPreviewEl) colorPreviewEl.style.background = color;
    colorGridEl.querySelectorAll('.adraw-color-swatch').forEach(sw => {
      sw.classList.toggle('active', (sw.dataset.color || '').toLowerCase() === color.toLowerCase());
    });
    // Show active state on secondary color box only when fill mode is selected
    if (primaryColorInput) {
      primaryColorInput.title = activeColorChannel === 'primary' ? 'Primary (stroke)' : 'Primary (stroke) - Click to switch';
    }
    if (secondaryColorInput) {
      secondaryColorInput.classList.toggle('active-channel', activeColorChannel === 'secondary');
      secondaryColorInput.title = activeColorChannel === 'secondary' ? 'Fill mode ACTIVE - Shapes will close and fill' : 'Click for fill mode';
    }
  }

  function applyPickedColor(color) {
    const hex = normalizeHex(color) || color;
    if (activeColorChannel === 'primary') {
      primaryColor = hex;
      primaryColorInput.style.setProperty('--sw-color', primaryColor);
    } else if (activeColorChannel === 'secondary') {
      secondaryColor = hex;
      secondaryColorInput.style.setProperty('--sw-color', secondaryColor);
    }
    syncPopoverToChannel();
  }

  function updatePenPreview() {
    if (!penPreview) return;
    const size = Math.max(8, Math.min(14, penSize));
    penPreview.style.width = size + 'px';
    penPreview.style.height = size + 'px';
    updateBrushCursor();
  }

  function updateBrushCursor() {
    if (!strokeCanvas) return;
    // Build a round circle cursor (SVG) sized to match the current pen.
    const d = Math.max(6, Math.min(48, penSize || 4));
    const stroke = 1.25;
    const r = (d / 2) - stroke;
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}"><circle cx="${d/2}" cy="${d/2}" r="${r}" fill="none" stroke="%23000" stroke-width="${stroke}"/><circle cx="${d/2}" cy="${d/2}" r="${r}" fill="none" stroke="%23ffffff" stroke-width="${stroke}" stroke-dasharray="2 2"/></svg>`;
    const url = `url("data:image/svg+xml;utf8,${svg}") ${d/2} ${d/2}, crosshair`;
    strokeCanvas.style.cursor = url;
  }

  function updateLayerPointer() {
    if (!layerPropsEl || !layersBox) return;
    const activeRow = layersBox.querySelector('.adraw-layer-row.active');
    if (!activeRow) return;
    // Align the layer-props panel so its static triangle pointer lines up with
    // the center of the active layer row. The triangle sits ~21px from the top
    // of the panel (see .adraw-layer-props::before/::after in the CSS).
    const rowRect = activeRow.getBoundingClientRect();
    const propsH = layerPropsEl.offsetHeight || 0;
    // Triangle sits at CSS top:24 inside panel; border-top=1 shifts children by 1.
    // Triangle vertical center = panel.top + 1 (border) + 24 (css top) + 7 (half height) = panel.top + 32.
    const pointerOffset = 32;
    const rowCenter = rowRect.top + (rowRect.height / 2);
    const margin = 8;
    // Never let the panel overlap the Hide Tools tab (40px tall, 10px bottom inset).
    const hideToolsTop = window.innerHeight - (10 + 40);
    const maxTop = Math.max(margin, hideToolsTop - propsH - 6);
    let top = Math.round(rowCenter - pointerOffset);
    if (top < margin) top = margin;
    if (top > maxTop) top = maxTop;
    layerPropsEl.style.top = top + 'px';
  }

  async function onLayerPropsClick(e) {
    const btn = e.target.closest('.adraw-lp-btn');
    if (!btn) return;
    const act = btn.dataset.lp;
    const L = state.layers[currentLayerIdx];
    if (!L) return;
    if (act === 'isolate') { snapshot(); L.isolate = !L.isolate; }
    else if (act === 'ghost') { snapshot(); L.ghost = !L.ghost; }
    else if (act === 'loop') { snapshot(); L.loop = !L.loop; }
    else if (act === 'trails') { snapshot(); L.trails = !L.trails; }
    else if (act === 'animate') { togglePlay(); }
    else if (act === 'delete') {
      if (state.layers.length <= 1) { flash('Cannot delete the only layer'); return; }
      const shouldDelete = await askConfirm({
        title: 'Delete Layer',
        message: `Delete layer ${L.letter}?`,
        confirmLabel: 'OK',
        cancelLabel: 'Cancel',
        danger: true,
        size: 'sm'
      });
      if (!shouldDelete) return;
      snapshot();
      layerFrameIndexById.delete(L.id);
      state.layers.splice(currentLayerIdx, 1);
      currentLayerIdx = Math.max(0, currentLayerIdx - 1);
      // Recalculate ink after deleting layer
      recalculateInk();
      currentFrameIdx = Math.min(currentFrameIdx, state.layers[currentLayerIdx].frames.length - 1);
      layerPropsOpen = false;
    }
    else if (act === 'insert-frame') {
      snapshot();
      L.frames.splice(currentFrameIdx + 1, 0, { strokes: [] });
      currentFrameIdx++;
      setLayerFrameIndex(L, currentFrameIdx);
    }
    else if (act === 'remove-frame') {
      if (L.frames.length <= 1) { flash('Cannot remove the only frame'); return; }
      snapshot();
      L.frames.splice(currentFrameIdx, 1);
      if (currentFrameIdx >= L.frames.length) currentFrameIdx = L.frames.length - 1;
      setLayerFrameIndex(L, currentFrameIdx);
      // Recalculate ink after removing frame
      recalculateInk();
    }
    else if (act === 'frame-prev') { stepFrame(-1); return; }
    else if (act === 'frame-next') { stepFrame(1); return; }
    renderLayerList();
    refreshLayerProps();
    render();
  }

  function refreshLayerProps() {
    const L = state.layers[currentLayerIdx];
    if (!L) return;
    const map = { isolate: L.isolate, ghost: L.ghost, loop: L.loop, trails: L.trails };
    layerPropsEl.querySelectorAll('[data-lp]').forEach(btn => {
      const key = btn.dataset.lp;
      if (key in map) {
        btn.classList.toggle('on', !!map[key]);
        const s = btn.querySelector('.state');
        if (s) s.textContent = map[key] ? 'On' : 'Off';
      }
    });
    const ind = layerPropsEl.querySelector('.adraw-lp-frame-indicator');
    if (ind) ind.innerHTML = `frames<span class="big">${currentFrameIdx + 1} of ${L.frames.length}</span>`;
    const animateBtn = layerPropsEl.querySelector('[data-lp="animate"]');
    if (animateBtn) animateBtn.classList.toggle('on', !!isPlaying);
    // Update Frames counter (max frames across layers)
    const framesVal = root.querySelector('.adraw-frames-val');
    if (framesVal) framesVal.textContent = getMaxFrameCount();
  }

  // ---------------- Frame navigation ----------------
  function stepFrame(dir) {
    const L = state.layers[currentLayerIdx];
    if (!L) return;
    currentFrameIdx = Math.max(0, Math.min(L.frames.length - 1, currentFrameIdx + dir));
    setLayerFrameIndex(L, currentFrameIdx);
    renderLayerList();
    refreshLayerProps();
    render();
  }

  // ---------------- Drawing (v3 - Canvas-relative coordinates) ----------------
  function getCanvasPos(ev) {
    const rect = strokeCanvas.getBoundingClientRect();
    const scaleX = strokeCanvas.width / rect.width;
    const scaleY = strokeCanvas.height / rect.height;
    const px = (ev.clientX - rect.left) * scaleX;
    const py = (ev.clientY - rect.top) * scaleY;
    
    // Convert to canvas-normalized coordinates (0-1 across entire canvas)
    // This allows drawing ANYWHERE on the canvas, not just on the image
    const canvasW = strokeCanvas.width;
    const canvasH = strokeCanvas.height;
    const nx = px / canvasW;
    const ny = py / canvasH;
    
    return { x: nx, y: ny, px, py }; // x,y are canvas-normalized (0-1), px,py are screen pixels
  }

  function onPointerDown(ev) {
    if (ink <= 0) { flash('Out of ink'); return; }
    ev.preventDefault();
    strokeCanvas.setPointerCapture(ev.pointerId);
    isDrawing = true;
    const p = getCanvasPos(ev);
    if (state.autoAddFrame) {
      const L = state.layers[currentLayerIdx];
      if (L.frames[currentFrameIdx] && L.frames[currentFrameIdx].strokes.length > 0) {
        snapshot();
        L.frames.splice(currentFrameIdx + 1, 0, { strokes: [] });
        currentFrameIdx++;
        setLayerFrameIndex(L, currentFrameIdx);
        renderLayerList();
        refreshLayerProps();
        render();
      }
    }
    snapshot();
    // Store canvas-normalized coordinates (v3 format)
    // These are 0-1 across the entire canvas, not just the image
    // When fill mode is active: stroke with primary, fill with secondary
    const isFillMode = activeColorChannel === 'secondary';
    currentStroke = {
      color: primaryColor,  // Always use primary for stroke outline
      size: penSize,
      fill: isFillMode ? secondaryColor : null,  // Fill with secondary when in fill mode
      points: [[p.x, p.y, performance.now()]],  // x,y are canvas-normalized 0-1
      _isFillMode: isFillMode  // Track for completion
    };
    const L = state.layers[currentLayerIdx];
    L.frames[currentFrameIdx].strokes.push(currentStroke);
    drawLiveStroke();
  }

  function onPointerMove(ev) {
    if (!isDrawing || !currentStroke) return;
    const p = getCanvasPos(ev);
    const pts = currentStroke.points;
    const last = pts[pts.length - 1];
    
    // Calculate distance in canvas-normalized space (0-1 range)
    const dx = p.x - last[0], dy = p.y - last[1];
    const dist = Math.hypot(dx, dy);
    
    // Threshold in normalized coordinates (smaller = more precise)
    // Adjusted for canvas-relative scale
    if (dist < 0.001) return;
    
    pts.push([p.x, p.y, performance.now()]);
    
    // Ink calculation based on screen distance (in pixels)
    const screenDist = Math.hypot(p.px - (last[0] * strokeCanvas.width), 
                                  p.py - (last[1] * strokeCanvas.height));
    const strokeInk = screenDist * currentStroke.size / 50;
    inkUsed += strokeInk;
    // Track ink used for this stroke so we can refund on undo/delete
    currentStroke._inkUsed = (currentStroke._inkUsed || 0) + strokeInk;
    ink = Math.max(0, 1 - inkUsed / INK_MAX);
    updateInkUi();
    
    drawLiveStroke();
  }

  function onPointerUp(ev) {
    if (!isDrawing) return;
    isDrawing = false;
    try { strokeCanvas.releasePointerCapture(ev.pointerId); } catch (e) {}
    
    // If in fill mode (secondary color active), close the shape and apply fill
    if (currentStroke && currentStroke._isFillMode && currentStroke.points.length >= 3) {
      const pts = currentStroke.points;
      const first = pts[0];
      const last = pts[pts.length - 1];
      
      // Check if already closed (first and last points are close)
      const dist = Math.hypot(last[0] - first[0], last[1] - first[1]);
      const CLOSED_THRESHOLD = 0.02; // In normalized coordinates
      
      if (dist > CLOSED_THRESHOLD) {
        // Not closed - add closing segment
        pts.push([first[0], first[1], performance.now()]);
      }
      
      // Ensure fill is set and clean up temp flag
      currentStroke.fill = secondaryColor;
      delete currentStroke._isFillMode;
    }
    
    currentStroke = null;
    render();
  }

  function updateInkUi() {
    inkFill.style.width = (ink * 100).toFixed(1) + '%';
    const v = root.querySelector('.adraw-ink-val');
    if (v) v.textContent = (ink * 100).toFixed(0) + '%';
  }

  function drawLiveStroke() {
    // Redraw just the current frame for perf
    render();
  }

  // ---------------- Rendering ----------------
  function drawStroke(ctx, stroke, alpha = 1) {
    // Delegate to compositor for consistent rendering
    if (compositor) {
      compositor.renderStroke(stroke, alpha);
      return;
    }
    
    // Fallback if compositor not available (shouldn't happen)
    const pts = stroke.points;
    if (!pts || pts.length === 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = stroke.color || '#111';
    ctx.fillStyle = stroke.fill || 'transparent';  // Use stroke.fill for fill color
    ctx.lineWidth = stroke.size || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], Math.max(0.5, (stroke.size || 4) / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
      
      // If fill is set, close the path and fill it
      if (stroke.fill) {
        ctx.closePath();
        ctx.fill();
        // Re-stroke the outline after fill
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        ctx.lineTo(last[0], last[1]);
        ctx.stroke();
      } else {
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function render() {
    if (!state || !compositor) return;

    // Trails and ghosting come from the per-layer settings only.
    // Previously `trails: !isPlaying` forced onion-skin trails on whenever
    // the user was drawing, which ignored the layer's own Trails/Ghost flags.
    compositor.renderFrame(state, currentFrameIdx, {
      isolateLayerIdx: state.layers[currentLayerIdx]?.isolate ? currentLayerIdx : null,
      ghost: false,
      trails: false
    });
  }

  // ---------------- Playback ----------------
  function togglePlay() {
    if (isPlaying) stopPlay();
    else startPlay();
  }

  function startPlay() {
    if (isPlaying) return;
    isPlaying = true;
    const pb = transport.querySelector('[data-act="play"]');
    pb.classList.add('playing');
    pb.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
    const animateBtn = layerPropsEl ? layerPropsEl.querySelector('[data-lp="animate"]') : null;
    if (animateBtn) animateBtn.classList.add('on');

    let frame = currentFrameIdx;
    const maxFrames = getMaxFrameCount();
    if (maxFrames <= 1) { stopPlay(); return; }

    const step = () => {
      if (!isPlaying) return;
      const activeLayer = state.layers[currentLayerIdx];
      if (activeLayer && activeLayer.frames && activeLayer.frames.length) {
        const skip = Math.max(0, activeLayer.skipFrames || 0);
        const localFrame = Math.floor(frame / (1 + skip));
        currentFrameIdx = activeLayer.loop
          ? (localFrame % activeLayer.frames.length)
          : Math.min(localFrame, activeLayer.frames.length - 1);
        setLayerFrameIndex(activeLayer, currentFrameIdx);
      } else {
        currentFrameIdx = frame % maxFrames;
      }
      renderPlaybackFrame(frame);
      updatePlaybackIndicators(frame);
      frame++;
      playTimer = setTimeout(step, 1000 / (state.fps || 12));
    };
    step();
  }

  // Lightweight per-tick update: mutates existing DOM so click handlers survive.
  // Each layer displays its own playing frame cycling within its range
  // (1..N, then back to 1 when looping). Indefinitely ticking, bounded per layer.
  function computePlayingFrameIdx(L, globalFrame) {
    if (!L || !L.frames || !L.frames.length) return 0;
    const step = 1 + Math.max(0, L.skipFrames || 0);
    const localFrame = Math.floor(globalFrame / step);
    return L.loop
      ? (localFrame % L.frames.length)
      : Math.min(localFrame, L.frames.length - 1);
  }

  function updatePlaybackIndicators(globalFrame) {
    if (!layersBox) return;
    layersBox.querySelectorAll('.adraw-layer-row').forEach(row => {
      const i = parseInt(row.dataset.idx, 10);
      const L = state.layers[i];
      if (!L) return;
      row.classList.toggle('active', i === currentLayerIdx);
      const big = row.querySelector('.adraw-layer-frames .big');
      if (big) {
        const fi = computePlayingFrameIdx(L, globalFrame);
        big.textContent = `${fi + 1} of ${L.frames.length}`;
      }
    });
    const framesVal = root.querySelector('.adraw-frames-val');
    if (framesVal) {
      const maxFrames = getMaxFrameCount();
      const framesIdx = maxFrames > 0 ? (globalFrame % maxFrames) : 0;
      framesVal.textContent = String(framesIdx + 1);
    }
    if (layerPropsEl) {
      const ind = layerPropsEl.querySelector('.adraw-lp-frame-indicator');
      const L = state.layers[currentLayerIdx];
      if (ind && L) {
        const fi = computePlayingFrameIdx(L, globalFrame);
        ind.innerHTML = `frames<span class="big">${fi + 1} of ${L.frames.length}</span>`;
      }
    }
  }

  function stopPlay() {
    if (!isPlaying) return;
    isPlaying = false;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    const pb = transport.querySelector('[data-act="play"]');
    if (pb) { pb.classList.remove('playing'); pb.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>'; }
    const animateBtn = layerPropsEl ? layerPropsEl.querySelector('[data-lp="animate"]') : null;
    if (animateBtn) animateBtn.classList.remove('on');
    // Rebuild the layer list cleanly now that playback has stopped, so the
    // frame indicators snap back to the true per-layer current frame.
    renderLayerList();
    refreshLayerProps();
    render();
  }

  function getMaxFrameCount() {
    let max = 1;
    state.layers.forEach(L => { if (L.frames.length > max) max = L.frames.length; });
    return max;
  }

  function renderPlaybackFrame(globalFrame) {
    if (!compositor) return;
    compositor.renderPlayback(state, globalFrame, { activeLayerIdx: currentLayerIdx });
  }

  // ---------------- Undo/Redo ----------------
  function snapshot() {
    undoStack.push(clone(state));
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
    updateHistoryUi();
  }
  function doUndo() {
    if (undoStack.length === 0) return;
    redoStack.push(clone(state));
    state = undoStack.pop();
    fixIndices();
    state.fps = clampFps(state.fps);
    fpsSlider.value = state.fps;
    // Recalculate ink from all strokes in the restored state
    recalculateInk();
    fpsVal.textContent = state.fps;
    autoFrameBtn.textContent = `Auto Add Frame ${state.autoAddFrame ? 'On' : 'Off'}`;
    autoFrameBtn.classList.toggle('on', state.autoAddFrame);
    renderLayerList();
    refreshLayerProps();
    render();
    updateHistoryUi();
  }
  function doRedo() {
    if (redoStack.length === 0) return;
    undoStack.push(clone(state));
    state = redoStack.pop();
    fixIndices();
    state.fps = clampFps(state.fps);
    fpsSlider.value = state.fps;
    // Recalculate ink from all strokes in the restored state
    recalculateInk();
    fpsVal.textContent = state.fps;
    autoFrameBtn.textContent = `Auto Add Frame ${state.autoAddFrame ? 'On' : 'Off'}`;
    autoFrameBtn.classList.toggle('on', state.autoAddFrame);
    renderLayerList();
    refreshLayerProps();
    render();
    updateHistoryUi();
  }
  function fixIndices() {
    if (currentLayerIdx >= state.layers.length) currentLayerIdx = state.layers.length - 1;
    if (currentLayerIdx < 0) currentLayerIdx = 0;
    const L = state.layers[currentLayerIdx];
    if (!L) return;
    if (currentFrameIdx >= L.frames.length) currentFrameIdx = L.frames.length - 1;
    if (currentFrameIdx < 0) currentFrameIdx = 0;
    setLayerFrameIndex(L, currentFrameIdx);
  }
  function updateHistoryUi() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  // Recalculate ink usage from all strokes in current state
  function recalculateInk() {
    let totalInk = 0;
    if (state && state.layers) {
      state.layers.forEach(layer => {
        if (layer.frames) {
          layer.frames.forEach(frame => {
            if (frame.strokes) {
              frame.strokes.forEach(stroke => {
                // Sum up ink from stroke._inkUsed or estimate from points
                if (stroke._inkUsed) {
                  totalInk += stroke._inkUsed;
                } else if (stroke.points && stroke.points.length > 1) {
                  // Estimate ink for strokes without tracked ink
                  let strokeDist = 0;
                  for (let i = 1; i < stroke.points.length; i++) {
                    const p1 = stroke.points[i - 1];
                    const p2 = stroke.points[i];
                    // Convert normalized to approximate pixels for estimation
                    const dx = (p2[0] - p1[0]) * (strokeCanvas?.width || 1920);
                    const dy = (p2[1] - p1[1]) * (strokeCanvas?.height || 1080);
                    strokeDist += Math.hypot(dx, dy);
                  }
                  totalInk += strokeDist * (stroke.size || 4) / 50;
                }
              });
            }
          });
        }
      });
    }
    inkUsed = totalInk;
    ink = Math.max(0, 1 - inkUsed / INK_MAX);
    updateInkUi();
  }

  // ---------------- UI toggles ----------------
  function toggleUi() {
    root.classList.toggle('adraw-ui-hidden');
    const hidden = root.classList.contains('adraw-ui-hidden');
    if (hideUiBtn) hideUiBtn.innerHTML = hidden ? 'Show<br>Tools' : 'Hide<br>Tools';
  }

  function flash(msg) {
    if (window.TOAST && typeof window.TOAST.error === 'function') window.TOAST.error(msg);
    else console.warn('[ANIMATION_DRAW]', msg);
  }

  // ---------------- Sizing ----------------
  function onResize() {
    if (!isOpen) return;
    fitCanvas();
    render();
  }

  function fitCanvas() {
    // Canvas fills the full screen for unrestricted drawing.
    const w = window.innerWidth;
    const h = window.innerHeight;
    strokeCanvas.width = w;
    strokeCanvas.height = h;
    playCanvas.width = w;
    playCanvas.height = h;
    
    // Update state canvas dimensions
    if (state) {
      state.canvasW = w;
      state.canvasH = h;
    }
    
    // Initialize or resize compositor
    if (!compositor) {
      compositor = new window.DRAWING_COMPOSITOR.Compositor(strokeCanvas);
    } else {
      compositor.resize(w, h);
    }
    
    // Calculate layout with padding for image display
    if (state && state.imageMeta) {
      compositor.calculateLayout({
        padding: 80  // 80px padding around image
      });
      
      // Store the normalized display rect in state for saving
      const displayRect = compositor.getNormalizedImageRect();
      if (displayRect) {
        state.imageMeta.displayRect = displayRect;
      }
      
      // Update compositor visual properties
      compositor.setVisualProperties({
        bgColor: state.imageMeta.bgColor,
        border: state.imageMeta.border
      });
    }
  }

  // ---------------- Open / Close / Save ----------------
  function open(options) {
    options = options || {};
    buildDom();
    isOpen = true;
    
    // Extract image metadata from options or derive from existing data
    const imageMeta = options.imageMeta || (options.initialData?.imageMeta) || {};
    state = emptyState(options.initialData, imageMeta);
    
    layerFrameIndexById = new Map();
    state.layers.forEach(L => setLayerFrameIndex(L, 0));
    state.fps = clampFps(state.fps);
    currentLayerIdx = 0;
    currentFrameIdx = 0;
    undoStack = [];
    redoStack = [];
    inkUsed = 0;
    ink = 1.0;
    isPlaying = false;
    layerPropsOpen = false;
    onSaveCallback = typeof options.onSave === 'function' ? options.onSave : null;

    fpsSlider.value = state.fps;
    fpsVal.textContent = state.fps;
    autoFrameBtn.textContent = `Auto Add Frame ${state.autoAddFrame ? 'On' : 'Off'}`;
    autoFrameBtn.classList.toggle('on', state.autoAddFrame);
    penSizeSlider.value = penSize;
    updatePenPreview();
    updateInkUi();
    updateHistoryUi();

    if (stage) stage.style.background = options.bgColor || '#111';

    const imgSrc = options.imageUrl || '';
    const onImg = async () => {
      // Initialize compositor with image
      if (!compositor) {
        compositor = new window.DRAWING_COMPOSITOR.Compositor(strokeCanvas);
      }
      if (bgImg && bgImg.src) {
        await compositor.setImage(bgImg);
        compositor.calculateLayout({
          padding: window.DRAWING_COMPOSITOR.CANVAS_PADDING
        });
      }
      fitCanvas();
      renderLayerList();
      refreshLayerProps();
      render();
    };
    bgImg.onload = onImg;
    bgImg.onerror = () => { onImg(); };
    if (imgSrc) bgImg.src = imgSrc;
    else { bgImg.removeAttribute('src'); onImg(); }

    root.classList.add('adraw-active');
    document.body.style.overflow = 'hidden';
    renderLayerList();
    refreshLayerProps();
  }

  function close() {
    if (!isOpen) return;
    stopPlay();
    isOpen = false;
    if (root) root.classList.remove('adraw-active');
    document.body.style.overflow = '';
  }

  function doSave() {
    if (!onSaveCallback) { close(); return; }
    stopPlay();
    
    // Ensure displayRect is captured before saving
    if (compositor && compositor.imageRect && state && state.imageMeta) {
      const displayRect = compositor.getNormalizedImageRect();
      if (displayRect) {
        state.imageMeta.displayRect = displayRect;
      }
      // Ensure canvas dimensions are current
      state.canvasW = strokeCanvas.width;
      state.canvasH = strokeCanvas.height;
    }
    
    // Clean state for storage (trim timestamps to reduce size)
    const out = clone(state);
    out.layers.forEach(L => L.frames.forEach(f => f.strokes.forEach(s => {
      // Round normalized coordinates to 4 decimal places for storage efficiency
      s.points = s.points.map(p => p.length >= 2 ? [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000] : p);
    })));
    try { onSaveCallback(out); } catch (e) { console.error('[ANIMATION_DRAW] onSave error', e); }
    close();
  }

  // ---------------- Player (read-only playback of saved animations) ----------------
  function createPlayer(container, imageUrl, data, options) {
    options = options || {};
    
    // Use unified compositor for consistent rendering
    container.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    container.style.background = options.bgColor || '#111';
    container.innerHTML = '';

    // Single canvas that composites both image and drawings
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#111;';
    container.appendChild(cv);
    
    // Set initial canvas size
    const rect = container.getBoundingClientRect();
    cv.width = rect.width || window.innerWidth;
    cv.height = rect.height || window.innerHeight;

    // Create compositor
    const playerCompositor = new window.DRAWING_COMPOSITOR.Compositor(cv);
    let frame = 0;
    let timer = null;
    let isRunning = true;

    const startPlayback = async () => {
      // Set image (with error handling)
      if (imageUrl) {
        try {
          await playerCompositor.setImage(imageUrl);
          console.log('[createPlayer] Image loaded successfully');
        } catch (err) {
          console.warn('[createPlayer] Failed to load image, continuing without background:', err);
          // Continue without image - strokes will still render
        }
      }
      
      // Get container dimensions
      const rect = container.getBoundingClientRect();
      cv.width = rect.width || window.innerWidth;
      cv.height = rect.height || window.innerHeight;
      
      // Set visual properties from saved data
      const meta = data.imageMeta || {};
      playerCompositor.setVisualProperties({
        bgColor: meta.bgColor || '#ffffff',
        border: meta.border || null
      });
      
      // Calculate layout with same padding as drawing mode
      playerCompositor.calculateLayout({
        padding: 80  // Match drawing mode padding
      });

      const maxFrames = Math.max(1, ...data.layers.map(L => L.frames.length));
      
      console.log('[createPlayer] Starting playback:', {
        frames: maxFrames,
        layers: data.layers.length,
        fps: data.fps || 12,
        canvasSize: `${cv.width}x${cv.height}`,
        dataVersion: data.v || 1
      });
      
      const step = () => {
        if (!isRunning) return;
        
        // Use compositor for unified rendering
        playerCompositor.renderPlayback(data, frame);
        
        frame = (frame + 1) % (maxFrames * Math.max(1, ...data.layers.map(L => 1 + (L.skipFrames || 0))));
        timer = setTimeout(step, 1000 / (data.fps || 12));
      };
      
      step();
    };

    // Handle resize
    const onResize = () => {
      const rect = container.getBoundingClientRect();
      playerCompositor.resize(rect.width || window.innerWidth, rect.height || window.innerHeight, {
        padding: 80  // Match drawing mode
      });
    };
    window.addEventListener('resize', onResize);

    // Defer until after the modal is visible and laid out
    requestAnimationFrame(startPlayback);
    
    return {
      stop() { 
        isRunning = false;
        if (timer) clearTimeout(timer); 
        window.removeEventListener('resize', onResize);
      }
    };
  }

  // ---------------- Public API ----------------
  window.ANIMATION_DRAW = {
    open,
    close,
    isOpen() { return isOpen; },
    createPlayer
  };
})();
