/* image-cropper.js — Eshu engine reusable crop modal
 * Usage: IMAGE_CROPPER.open(file) → Promise<Blob|null>
 */
(function () {
  'use strict';

  const RATIOS = [
    { label: 'Free',     icon: '⊞', w: 0,  h: 0  },
    { label: 'Original', icon: '⊟', w: 0,  h: 0, original: true },
    { label: 'Square',   icon: '□', w: 1,  h: 1  },
    { label: '9:16',     icon: '▯', w: 9,  h: 16 },
    { label: '16:9',     icon: '▭', w: 16, h: 9  },
    { label: '4:5',      icon: '▯', w: 4,  h: 5  },
    { label: '5:4',      icon: '▭', w: 5,  h: 4  },
    { label: '3:4',      icon: '▯', w: 3,  h: 4  },
    { label: '4:3',      icon: '▭', w: 4,  h: 3  },
    { label: '2:3',      icon: '▯', w: 2,  h: 3  },
    { label: '3:2',      icon: '▭', w: 3,  h: 2  },
    { label: '1:2',      icon: '▯', w: 1,  h: 2  },
    { label: '2:1',      icon: '▭', w: 2,  h: 1  },
  ];

  let _resolve = null;
  let _img = null;
  let _naturalW = 0, _naturalH = 0;
  let _crop = { x: 0, y: 0, w: 0, h: 0 };
  let _dragging = false, _resizing = false;
  let _dragStart = null;
  let _resizeHandle = null;
  let _activeRatioIdx = 0;
  let _canvas = null, _ctx = null;
  let _overlayEl = null;
  let _rafId = null;

  const HANDLE_SIZE = 10;
  const MIN_CROP = 20;

  // ── DOM build ──────────────────────────────────────────────────────────────
  function buildModal() {
    if (document.getElementById('eshu-cropper-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'eshu-cropper-modal';
    modal.className = 'eshu-cropper-modal';
    modal.innerHTML = `
      <div class="eshu-cropper-inner">
        <div class="eshu-cropper-header">
          <span class="eshu-cropper-title">Crop Image</span>
          <button class="eshu-cropper-cancel" id="eshuCropCancel" title="Cancel">✕</button>
        </div>
        <div class="eshu-cropper-stage" id="eshuCropStage">
          <canvas class="eshu-cropper-canvas" id="eshuCropCanvas"></canvas>
        </div>
        <div class="eshu-cropper-ratios" id="eshuCropRatios"></div>
        <div class="eshu-cropper-footer">
          <button class="eshu-cropper-done" id="eshuCropDone">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    _overlayEl = modal;

    document.getElementById('eshuCropCancel').addEventListener('click', () => cancel());
    document.getElementById('eshuCropDone').addEventListener('click', () => commit());
    modal.addEventListener('click', (e) => { if (e.target === modal) cancel(); });

    buildRatioBar();
    bindCanvasEvents();
  }

  function buildRatioBar() {
    const bar = document.getElementById('eshuCropRatios');
    if (!bar) return;
    bar.innerHTML = '';
    RATIOS.forEach((r, i) => {
      const btn = document.createElement('button');
      btn.className = 'eshu-cropper-ratio-btn' + (i === _activeRatioIdx ? ' active' : '');
      btn.dataset.idx = i;
      btn.innerHTML = `<span class="eshu-cropper-ratio-icon">${r.icon}</span><span class="eshu-cropper-ratio-label">${r.label}</span>`;
      btn.addEventListener('click', () => selectRatio(i));
      bar.appendChild(btn);
    });
  }

  // ── Open / Close ──────────────────────────────────────────────────────────
  function open(file) {
    return new Promise((resolve) => {
      _resolve = resolve;
      buildModal();

      const reader = new FileReader();
      reader.onload = (ev) => {
        _img = new Image();
        _img.onload = () => {
          _naturalW = _img.naturalWidth;
          _naturalH = _img.naturalHeight;
          _activeRatioIdx = 0;
          rebuildRatioBar();
          setupCanvas();
          resetCrop();
          draw();
          _overlayEl.classList.add('open');
        };
        _img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function cancel() {
    _overlayEl.classList.remove('open');
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_resolve) { _resolve(null); _resolve = null; }
  }

  function commit() {
    const out = document.createElement('canvas');
    out.width  = Math.round(_crop.w);
    out.height = Math.round(_crop.h);
    const octx = out.getContext('2d');
    const scale = _naturalW / _canvas.width;
    octx.drawImage(
      _img,
      _crop.x * scale, _crop.y * scale,
      _crop.w * scale, _crop.h * scale,
      0, 0, out.width, out.height
    );
    out.toBlob((blob) => {
      _overlayEl.classList.remove('open');
      if (_resolve) { _resolve(blob); _resolve = null; }
    }, 'image/jpeg', 0.92);
  }

  // ── Canvas setup ──────────────────────────────────────────────────────────
  function setupCanvas() {
    _canvas = document.getElementById('eshuCropCanvas');
    _ctx = _canvas.getContext('2d');
    const stage = document.getElementById('eshuCropStage');
    const maxW = stage.clientWidth  || 680;
    const maxH = stage.clientHeight || 460;
    const scale = Math.min(maxW / _naturalW, maxH / _naturalH, 1);
    _canvas.width  = Math.round(_naturalW * scale);
    _canvas.height = Math.round(_naturalH * scale);
  }

  // ── Crop helpers ──────────────────────────────────────────────────────────
  function resetCrop() {
    const r = RATIOS[_activeRatioIdx];
    if (r.original || (r.w === 0 && r.h === 0 && !r.original)) {
      _crop = { x: 0, y: 0, w: _canvas.width, h: _canvas.height };
    } else {
      const ratio = r.w / r.h;
      let cw = _canvas.width, ch = Math.round(cw / ratio);
      if (ch > _canvas.height) { ch = _canvas.height; cw = Math.round(ch * ratio); }
      _crop = {
        x: Math.round((_canvas.width  - cw) / 2),
        y: Math.round((_canvas.height - ch) / 2),
        w: cw, h: ch
      };
    }
  }

  function clampCrop() {
    _crop.w = Math.max(MIN_CROP, Math.min(_crop.w, _canvas.width));
    _crop.h = Math.max(MIN_CROP, Math.min(_crop.h, _canvas.height));
    _crop.x = Math.max(0, Math.min(_crop.x, _canvas.width  - _crop.w));
    _crop.y = Math.max(0, Math.min(_crop.y, _canvas.height - _crop.h));
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  function draw() {
    if (!_ctx || !_img) return;
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    // image
    _ctx.drawImage(_img, 0, 0, _canvas.width, _canvas.height);

    // dimmed areas
    _ctx.fillStyle = 'rgba(0,0,0,0.52)';
    _ctx.fillRect(0,          0,          _canvas.width, _crop.y);           // top
    _ctx.fillRect(0,          _crop.y + _crop.h, _canvas.width, _canvas.height - _crop.y - _crop.h); // bottom
    _ctx.fillRect(0,          _crop.y,    _crop.x,       _crop.h);           // left
    _ctx.fillRect(_crop.x + _crop.w, _crop.y, _canvas.width - _crop.x - _crop.w, _crop.h); // right

    // crop border
    _ctx.strokeStyle = '#fff';
    _ctx.lineWidth = 1.5;
    _ctx.strokeRect(_crop.x + 0.5, _crop.y + 0.5, _crop.w - 1, _crop.h - 1);

    // rule-of-thirds
    _ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    _ctx.lineWidth = 0.5;
    for (let i = 1; i <= 2; i++) {
      const lx = _crop.x + (_crop.w / 3) * i;
      const ly = _crop.y + (_crop.h / 3) * i;
      _ctx.beginPath(); _ctx.moveTo(lx, _crop.y); _ctx.lineTo(lx, _crop.y + _crop.h); _ctx.stroke();
      _ctx.beginPath(); _ctx.moveTo(_crop.x, ly); _ctx.lineTo(_crop.x + _crop.w, ly); _ctx.stroke();
    }

    // corner handles
    _ctx.fillStyle = '#fff';
    const hs = HANDLE_SIZE;
    const corners = getHandles();
    corners.forEach(h => _ctx.fillRect(h.x - hs/2, h.y - hs/2, hs, hs));
  }

  function getHandles() {
    const { x, y, w, h } = _crop;
    return [
      { id: 'nw', x: x,     y: y     },
      { id: 'ne', x: x + w, y: y     },
      { id: 'sw', x: x,     y: y + h },
      { id: 'se', x: x + w, y: y + h },
    ];
  }

  // ── Mouse events ──────────────────────────────────────────────────────────
  function bindCanvasEvents() {
    const c = () => document.getElementById('eshuCropCanvas');

    document.getElementById('eshuCropStage').addEventListener('mousedown', (e) => {
      const canvas = c(); if (!canvas) return;
      const pos = canvasPos(e, canvas);
      const handle = hitHandle(pos);
      if (handle) {
        _resizing = true; _resizeHandle = handle;
        _dragStart = { ...pos, crop: { ..._crop } };
      } else if (inCrop(pos)) {
        _dragging = true;
        _dragStart = { ...pos, crop: { ..._crop } };
      }
    });

    window.addEventListener('mousemove', (e) => {
      const canvas = c(); if (!canvas) return;
      if (!_dragging && !_resizing) return;
      const pos = canvasPos(e, canvas);
      const dx = pos.x - _dragStart.x, dy = pos.y - _dragStart.y;
      const r = RATIOS[_activeRatioIdx];
      const locked = (r.w > 0 && r.h > 0);

      if (_dragging) {
        _crop.x = _dragStart.crop.x + dx;
        _crop.y = _dragStart.crop.y + dy;
        clampCrop();
      } else if (_resizing) {
        let { x, y, w, h } = _dragStart.crop;
        const hid = _resizeHandle.id;
        if (hid === 'se') {
          w = Math.max(MIN_CROP, _dragStart.crop.w + dx);
          h = locked ? w / (r.w / r.h) : Math.max(MIN_CROP, _dragStart.crop.h + dy);
        } else if (hid === 'nw') {
          w = Math.max(MIN_CROP, _dragStart.crop.w - dx);
          h = locked ? w / (r.w / r.h) : Math.max(MIN_CROP, _dragStart.crop.h - dy);
          x = _dragStart.crop.x + _dragStart.crop.w - w;
          y = _dragStart.crop.y + _dragStart.crop.h - h;
        } else if (hid === 'ne') {
          w = Math.max(MIN_CROP, _dragStart.crop.w + dx);
          h = locked ? w / (r.w / r.h) : Math.max(MIN_CROP, _dragStart.crop.h - dy);
          y = _dragStart.crop.y + _dragStart.crop.h - h;
        } else if (hid === 'sw') {
          w = Math.max(MIN_CROP, _dragStart.crop.w - dx);
          h = locked ? w / (r.w / r.h) : Math.max(MIN_CROP, _dragStart.crop.h + dy);
          x = _dragStart.crop.x + _dragStart.crop.w - w;
        }
        _crop = { x, y, w, h };
        clampCrop();
      }
      draw();
    });

    window.addEventListener('mouseup', () => { _dragging = false; _resizing = false; });

    // touch
    document.getElementById('eshuCropStage').addEventListener('touchstart', (e) => {
      const canvas = c(); if (!canvas) return;
      const pos = canvasPos(e.touches[0], canvas);
      const handle = hitHandle(pos);
      if (handle) { _resizing = true; _resizeHandle = handle; _dragStart = { ...pos, crop: { ..._crop } }; }
      else if (inCrop(pos)) { _dragging = true; _dragStart = { ...pos, crop: { ..._crop } }; }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      const canvas = c(); if (!canvas || (!_dragging && !_resizing)) return;
      const pos = canvasPos(e.touches[0], canvas);
      const dx = pos.x - _dragStart.x, dy = pos.y - _dragStart.y;
      if (_dragging) { _crop.x = _dragStart.crop.x + dx; _crop.y = _dragStart.crop.y + dy; clampCrop(); }
      draw();
    }, { passive: true });

    window.addEventListener('touchend', () => { _dragging = false; _resizing = false; });
  }

  function canvasPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY
    };
  }

  function hitHandle(pos) {
    const hs = HANDLE_SIZE + 4;
    return getHandles().find(h => Math.abs(pos.x - h.x) < hs && Math.abs(pos.y - h.y) < hs) || null;
  }

  function inCrop(pos) {
    return pos.x >= _crop.x && pos.x <= _crop.x + _crop.w &&
           pos.y >= _crop.y && pos.y <= _crop.y + _crop.h;
  }

  // ── Ratio bar ─────────────────────────────────────────────────────────────
  function rebuildRatioBar() {
    const bar = document.getElementById('eshuCropRatios');
    if (!bar) return;
    bar.querySelectorAll('.eshu-cropper-ratio-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i === _activeRatioIdx);
    });
  }

  function selectRatio(idx) {
    _activeRatioIdx = idx;
    rebuildRatioBar();
    resetCrop();
    draw();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.IMAGE_CROPPER = { open };
})();
