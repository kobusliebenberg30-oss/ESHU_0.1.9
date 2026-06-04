/**
 * ESHU_IMAGE_VIEWER
 *
 * Lightweight, idempotent zoom + pan helper that attaches to an existing
 * `<img>` element living inside any positioned container (e.g. `.image-box`).
 *
 * Design contract:
 *   - Default state is "fit to container" — the underlying CSS keeps doing
 *     whatever it already did (typically `width:100%; object-fit:contain`).
 *     We never permanently mutate the image bytes, only the CSS transform.
 *   - Zoom in / out operate on the **original** image bitmap via
 *     `transform: scale()`, so quality is preserved even at high zoom and
 *     there is no re-fetch.
 *   - Aspect ratio is preserved by construction.
 *   - Panning is enabled only while zoom > 1.
 *   - Reset button restores fit mode (zoom = 1, pan = 0).
 *   - Re-attaching to the same container is a no-op; switching the `<img>`
 *     `src` automatically resets the zoom (so flipping between creations in
 *     the ESHU compare engine doesn't carry stale zoom state).
 *
 * Public API:
 *   ESHU_IMAGE_VIEWER.attach(imgEl) -> { reset, zoomIn, zoomOut, destroy }
 */
(function () {
  'use strict';

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 8;
  const ZOOM_STEP = 1.5;
  const ATTACH_KEY = '__eshuImageViewer';

  // Get or create mesh overlay within the specific container
  function getMeshForContainer(container) {
    let mesh = container.querySelector('.image-viewer-mesh');
    if (!mesh) {
      mesh = document.createElement('div');
      mesh.className = 'image-viewer-mesh';
      mesh.setAttribute('aria-hidden', 'true');
      container.appendChild(mesh);
    }
    return mesh;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function attach(img) {
    if (!img || !(img instanceof HTMLImageElement)) return null;
    const container = img.closest('.image-box') || img.parentElement;
    if (!container) return null;
    if (container[ATTACH_KEY]) return container[ATTACH_KEY];

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const state = {
      zoom: 1,
      tx: 0,
      ty: 0,
      dragging: false,
      lastX: 0,
      lastY: 0,
      pointerId: null,
    };

    // Control overlay for zoom buttons
    const overlay = document.createElement('div');
    overlay.className = 'image-viewer-overlay';
    overlay.innerHTML = [
      '<button type="button" class="iv-btn iv-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>',
      '<button type="button" class="iv-btn iv-zoom-out" title="Zoom out" aria-label="Zoom out">&minus;</button>',
      '<button type="button" class="iv-btn iv-reset" title="Reset to fit" aria-label="Reset to fit">&#x21BA;</button>',
    ].join('');
    container.appendChild(overlay);

    // Mesh/grid overlay - appears when zoomed past original size
    // Positioned within the container so it only covers the image viewport
    const meshOverlay = getMeshForContainer(container);

    const btnIn = overlay.querySelector('.iv-zoom-in');
    const btnOut = overlay.querySelector('.iv-zoom-out');
    const btnReset = overlay.querySelector('.iv-reset');

    function apply() {
      img.style.transformOrigin = 'center center';
      img.style.transform =
        `translate(${state.tx}px, ${state.ty}px) scale(${state.zoom})`;
      img.style.willChange = state.zoom > 1 ? 'transform' : '';
      img.style.cursor = state.zoom > 1
        ? (state.dragging ? 'grabbing' : 'grab')
        : '';
      img.style.transition = state.dragging ? 'none' : 'transform 0.18s ease';
      overlay.classList.toggle('zoomed', state.zoom > 1);
      btnOut.disabled = state.zoom <= ZOOM_MIN + 0.0001;
      btnIn.disabled = state.zoom >= ZOOM_MAX - 0.0001;
      btnReset.disabled = state.zoom === 1 && state.tx === 0 && state.ty === 0;
      // Show mesh overlay when zoomed past original size
      meshOverlay.classList.toggle('active', state.zoom > 1);
    }

    function setZoom(next) {
      const clamped = clamp(next, ZOOM_MIN, ZOOM_MAX);
      // Snap fully back to fit when we cross the threshold so accumulated
      // pan offsets don't strand the image off-center.
      if (clamped <= 1) {
        state.zoom = 1;
        state.tx = 0;
        state.ty = 0;
      } else {
        state.zoom = clamped;
      }
      apply();
    }

    function zoomIn() { setZoom(state.zoom * ZOOM_STEP); }
    function zoomOut() { setZoom(state.zoom / ZOOM_STEP); }
    function reset() { setZoom(1); }

    btnIn.addEventListener('click', (e) => { e.stopPropagation(); zoomIn(); });
    btnOut.addEventListener('click', (e) => { e.stopPropagation(); zoomOut(); });
    btnReset.addEventListener('click', (e) => { e.stopPropagation(); reset(); });

    // Wheel zoom only when the pointer is already over the image AND the
    // shift/ctrl modifier is held, OR the image is already zoomed. This
    // avoids hijacking page scroll on a passive hover.
    img.addEventListener('wheel', (e) => {
      const shouldZoom = state.zoom > 1 || e.ctrlKey || e.shiftKey;
      if (!shouldZoom) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }, { passive: false });

    // Pointer-based pan, active only while zoomed in.
    // We prevent default to stop text selection and browser gestures.
    img.addEventListener('pointerdown', (e) => {
      if (state.zoom <= 1) return;
      e.preventDefault();
      state.dragging = true;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.pointerId = e.pointerId;
      try { img.setPointerCapture(e.pointerId); } catch (err) { /* ignored */ }
      apply();
    });
    // Disable browser touch gestures (scrolling, zooming) on the image when zoomed
    img.style.touchAction = 'none';
    img.addEventListener('pointermove', (e) => {
      if (!state.dragging) return;
      state.tx += e.clientX - state.lastX;
      state.ty += e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      apply();
    });
    function endDrag(e) {
      if (!state.dragging) return;
      state.dragging = false;
      if (state.pointerId !== null) {
        try { img.releasePointerCapture(state.pointerId); } catch (err) { /* ignored */ }
      }
      state.pointerId = null;
      apply();
    }
    img.addEventListener('pointerup', endDrag);
    img.addEventListener('pointercancel', endDrag);
    // Note: we intentionally do NOT listen to pointerleave because it fires
    // when the cursor briefly crosses out of the image during fast panning,
    // which would cause the drag to drop prematurely. Pointer capture keeps
    // delivering events even outside the element, so we rely on pointerup.
    // lostpointercapture is a safety net in case capture is stolen.
    img.addEventListener('lostpointercapture', endDrag);

    // Whenever the image source changes (e.g. the ESHU engine swaps in a new
    // creation), drop back to fit mode so zoom state isn't carried over.
    let lastSrc = img.currentSrc || img.src;
    const observer = new MutationObserver(() => {
      const nextSrc = img.currentSrc || img.src;
      if (nextSrc !== lastSrc) {
        lastSrc = nextSrc;
        reset();
      }
    });
    observer.observe(img, { attributes: true, attributeFilter: ['src'] });

    const handle = {
      reset,
      zoomIn,
      zoomOut,
      getState: () => ({ zoom: state.zoom, tx: state.tx, ty: state.ty }),
      destroy() {
        observer.disconnect();
        overlay.remove();
        meshOverlay.remove();
        img.style.transform = '';
        img.style.transition = '';
        img.style.cursor = '';
        img.style.willChange = '';
        container[ATTACH_KEY] = null;
      },
    };
    container[ATTACH_KEY] = handle;
    apply();
    return handle;
  }

  window.ESHU_IMAGE_VIEWER = { attach };
})();
