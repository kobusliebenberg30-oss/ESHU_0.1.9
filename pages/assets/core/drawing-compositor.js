/* ================================================================
   UNIFIED DRAWING COMPOSITOR v3
   Full-canvas drawing with canvas-relative coordinates.

   Core Principles:
   1. Canvas-relative normalized coordinates (0-1 across ENTIRE canvas)
   2. Full-screen drawing canvas - draw anywhere, not just on image
   3. Image is centered composited element with border and background
   4. Consistent rendering across all contexts (draw, playback, comments, games)
   5. Metadata preservation for image processing (crop, border, bg)

   Data Format (v3 - canvas-relative):
   {
     v: 3,
     fps: 12,
     canvasW: 1920,       // Canvas dimensions at creation time
     canvasH: 1080,
     imageMeta: {
       naturalW: 1920,      // Original image dimensions
       naturalH: 1080,
       crop: { x, y, w, h }, // Optional crop applied (pixels)
       border: { width, color },
       bgColor: '#ffffff',
       // Computed: image display rect relative to canvas (for reconstruction)
       displayRect: { x, y, width, height } // normalized 0-1 relative to canvas
     },
     layers: [{
       id, letter, loop, trails, ghost, isolate, skipFrames,
       frames: [{
         strokes: [{
           points: [[nx, ny, t], ...],  // nx, ny are CANVAS-RELATIVE 0-1
           color, size, fill
         }]
       }]
     }]
   }
   ================================================================ */
(function () {
  'use strict';

  // ============ CONSTANTS ============
  const MIN_DISPLAY_SIZE = 100;

  // ============ COORDINATE SYSTEM ============

  /**
   * Convert screen pixel coordinates to canvas-normalized (0-1 across full canvas)
   * @param {number} px - Pixel x coordinate
   * @param {number} py - Pixel y coordinate
   * @param {number} canvasW - Canvas width
   * @param {number} canvasH - Canvas height
   * @returns {[number, number]} Normalized coordinates [nx, ny] (0-1 across canvas)
   */
  function screenToCanvasNormalized(px, py, canvasW, canvasH) {
    return [
      px / canvasW,
      py / canvasH
    ];
  }

  /**
   * Convert canvas-normalized coordinates (0-1) to screen pixels
   * @param {number} nx - Normalized x (0-1 across canvas)
   * @param {number} ny - Normalized y (0-1 across canvas)
   * @param {number} canvasW - Canvas width
   * @param {number} canvasH - Canvas height
   * @returns {[number, number]} Pixel coordinates [px, py]
   */
  function canvasNormalizedToScreen(nx, ny, canvasW, canvasH) {
    return [
      nx * canvasW,
      ny * canvasH
    ];
  }

  /**
   * Calculate the displayed image rectangle within a container
   * Matches CSS: object-fit: contain with centering
   * @param {number} containerW - Container width
   * @param {number} containerH - Container height
   * @param {number} imageW - Image natural width
   * @param {number} imageH - Image natural height
   * @param {number} padding - Optional padding around image
   * @returns {Object} {x, y, width, height, scale}
   */
  function calculateImageRect(containerW, containerH, imageW, imageH, padding = 0) {
    const availW = Math.max(MIN_DISPLAY_SIZE, containerW - padding * 2);
    const availH = Math.max(MIN_DISPLAY_SIZE, containerH - padding * 2);

    const scale = Math.min(availW / imageW, availH / imageH, 1);
    const width = imageW * scale;
    const height = imageH * scale;
    const x = (containerW - width) / 2;
    const y = (containerH - height) / 2;

    return { x, y, width, height, scale };
  }

  /**
   * Calculate the displayed image rectangle within a container
   * Matches CSS: object-fit: contain with centering
   * @param {number} containerW - Container width
   * @param {number} containerH - Container height
   * @param {number} imageW - Image natural width
   * @param {number} imageH - Image natural height
   * @param {number} padding - Optional padding around image
   * @returns {Object} {x, y, width, height, scale}
   */
  function calculateImageRect(containerW, containerH, imageW, imageH, padding = 0) {
    const availW = Math.max(MIN_DISPLAY_SIZE, containerW - padding * 2);
    const availH = Math.max(MIN_DISPLAY_SIZE, containerH - padding * 2);

    const scale = Math.min(availW / imageW, availH / imageH, 1);
    const width = imageW * scale;
    const height = imageH * scale;
    const x = (containerW - width) / 2;
    const y = (containerH - height) / 2;

    return { x, y, width, height, scale };
  }

  // ============ UNIFIED COMPOSITOR ============

  /**
   * Unified compositor that handles full-canvas drawing with centered image
   */
  class DrawingCompositor {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.image = null;
      this.imageRect = null; // Current display rect (pixels)
      this.data = null;
      this.bgColor = '#ffffff';
      this.border = null;
    }

    /**
     * Set the base image
     * @param {HTMLImageElement|string} img - Image element or URL
     * @returns {Promise}
     */
    async setImage(img) {
      if (typeof img === 'string') {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => {
            this.image = image;
            resolve(image);
          };
          image.onerror = reject;
          image.src = img;
        });
      } else {
        this.image = img;
        return Promise.resolve(img);
      }
    }

    /**
     * Set visual properties
     * @param {Object} props - {bgColor, border}
     */
    setVisualProperties(props = {}) {
      this.bgColor = props.bgColor || this.bgColor;
      this.border = props.border || this.border;
    }

    /**
     * Calculate image rect for current canvas size
     * @param {Object} constraints - Optional {padding, forcedWidth, forcedHeight}
     */
    calculateLayout(constraints = {}) {
      const { padding = 0, forcedWidth, forcedHeight } = constraints;

      let imageW, imageH;
      
      if (this.image) {
        imageW = forcedWidth || this.image.naturalWidth || this.image.width || 800;
        imageH = forcedHeight || this.image.naturalHeight || this.image.height || 600;
      } else {
        // Default aspect ratio if no image
        imageW = forcedWidth || 800;
        imageH = forcedHeight || 600;
      }

      this.imageRect = calculateImageRect(
        this.canvas.width,
        this.canvas.height,
        imageW,
        imageH,
        padding
      );

      return this.imageRect;
    }

    /**
     * Get current image rect as normalized (0-1 relative to canvas)
     * @returns {Object} {x, y, width, height} all 0-1 normalized
     */
    getNormalizedImageRect() {
      if (!this.imageRect) return null;
      const { x, y, width, height } = this.imageRect;
      return {
        x: x / this.canvas.width,
        y: y / this.canvas.height,
        width: width / this.canvas.width,
        height: height / this.canvas.height
      };
    }

    /**
     * Render the base image
     * @param {string} bgColor - Background color
     * @param {Object} border - Optional {width, color}
     */
    renderImage(bgColor = '#ffffff', border = null) {
      if (!this.ctx || !this.imageRect) return;

      const { x, y, width, height } = this.imageRect;

      // Clear canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Fill background
      if (bgColor) {
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }

      // Draw border if specified
      if (border && border.width > 0) {
        this.ctx.fillStyle = border.color || '#111111';
        this.ctx.fillRect(
          x - border.width,
          y - border.width,
          width + border.width * 2,
          height + border.width * 2
        );
      }

      // Draw image (only if loaded)
      if (this.image && this.image.complete && this.image.naturalWidth > 0) {
        this.ctx.drawImage(this.image, x, y, width, height);
      }
    }

    /**
     * Render a single stroke (canvas-relative coordinates)
     * @param {Object} stroke - {points: [[nx, ny], ...], color, size}
     * @param {number} alpha - Opacity
     * @param {Object} dataDisplayRect - Optional display rect from saved data (v3 format)
     */
    renderStroke(stroke, alpha = 1, dataDisplayRect = null) {
      if (!this.ctx || !stroke.points || stroke.points.length === 0) return;

      const pts = stroke.points;
      const canvasW = this.canvas.width;
      const canvasH = this.canvas.height;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = stroke.color || '#111';
      this.ctx.fillStyle = stroke.fill || 'transparent';  // Use stroke.fill for fill color
      
      // Scale pen size relative to canvas size (base on 1000px reference)
      const scaleFactor = Math.sqrt(canvasW * canvasH) / 1000;
      this.ctx.lineWidth = (stroke.size || 4) * scaleFactor;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      // Convert canvas-normalized coordinates to screen pixels
      // Points are stored as [nx, ny, t] where nx, ny are 0-1 across canvas
      const screenPts = pts.map(p => [
        p[0] * canvasW,
        p[1] * canvasH
      ]);

      if (screenPts.length === 1) {
        // Single point - draw dot
        this.ctx.beginPath();
        const r = Math.max(0.5, (stroke.size || 4) * scaleFactor / 2);
        this.ctx.arc(screenPts[0][0], screenPts[0][1], r, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        // Draw smooth curve through points
        this.ctx.beginPath();
        this.ctx.moveTo(screenPts[0][0], screenPts[0][1]);

        for (let i = 1; i < screenPts.length - 1; i++) {
          const mx = (screenPts[i][0] + screenPts[i + 1][0]) / 2;
          const my = (screenPts[i][1] + screenPts[i + 1][1]) / 2;
          this.ctx.quadraticCurveTo(screenPts[i][0], screenPts[i][1], mx, my);
        }

        const last = screenPts[screenPts.length - 1];
        this.ctx.lineTo(last[0], last[1]);
        
        // If fill is set, close the path and fill it
        if (stroke.fill) {
          this.ctx.closePath();
          this.ctx.fill();
          // Re-stroke the outline after fill
          this.ctx.beginPath();
          this.ctx.moveTo(screenPts[0][0], screenPts[0][1]);
          for (let i = 1; i < screenPts.length - 1; i++) {
            const mx = (screenPts[i][0] + screenPts[i + 1][0]) / 2;
            const my = (screenPts[i][1] + screenPts[i + 1][1]) / 2;
            this.ctx.quadraticCurveTo(screenPts[i][0], screenPts[i][1], mx, my);
          }
          this.ctx.lineTo(last[0], last[1]);
          this.ctx.stroke();
        } else {
          this.ctx.stroke();
        }
      }

      this.ctx.restore();
    }

    /**
     * Transform stroke points based on data version
     * v1: pixel coordinates relative to canvas at save time -> convert to current canvas 0-1
     * v2: image-relative 0-1 coordinates -> convert to canvas-relative
     * v3: canvas-relative 0-1 coordinates -> use directly
     */
    transformStrokePoints(stroke, data) {
      if (!stroke.points || stroke.points.length === 0) return stroke;
      
      const version = data.v || 1;
      const canvasW = this.canvas.width;
      const canvasH = this.canvas.height;
      
      // Create new stroke with transformed points
      const newStroke = { ...stroke };
      
      if (version >= 3) {
        // v3: points are already canvas-relative 0-1
        newStroke.points = stroke.points.map(p => [p[0], p[1], p[2]]);
      } else if (version === 2) {
        // v2: points are image-relative 0-1, need to convert to canvas-relative
        // Get the saved image display rect or current
        const meta = data.imageMeta || {};
        const displayRect = meta.displayRect || this.getNormalizedImageRect();
        
        if (displayRect) {
          newStroke.points = stroke.points.map(p => [
            displayRect.x + p[0] * displayRect.width,
            displayRect.y + p[1] * displayRect.height,
            p[2]
          ]);
        } else {
          // Fallback: assume image fills canvas
          newStroke.points = stroke.points.map(p => [p[0], p[1], p[2]]);
        }
      } else {
        // v1: points are pixel coordinates relative to canvas at save time
        const savedW = data.imageW || canvasW;
        const savedH = data.imageH || canvasH;
        
        newStroke.points = stroke.points.map(p => [
          (p[0] / savedW),  // normalize to 0-1
          (p[1] / savedH),
          p[2]
        ]);
      }
      
      return newStroke;
    }

    /**
     * Render a complete frame with all layers
     * @param {Object} data - Animation data
     * @param {number} frameIdx - Frame index
     * @param {Object} options - {isolateLayerIdx, ghost, trails}
     */
    renderFrame(data, frameIdx, options = {}) {
      if (!data || !data.layers) return;

      const { isolateLayerIdx = null, ghost = false, trails = false } = options;

      // First, render the base image
      const meta = data.imageMeta || {};
      this.renderImage(meta.bgColor || '#ffffff', meta.border);

      // Then render each layer
      data.layers.forEach((layer, layerIdx) => {
        // Ghost + Isolate together on a layer = hide that layer.
        if (layer.ghost && layer.isolate) return;
        if (isolateLayerIdx !== null && layerIdx !== isolateLayerIdx) return;

        const frame = layer.frames[Math.min(frameIdx, layer.frames.length - 1)];
        if (!frame) return;

        const isActive = layerIdx === isolateLayerIdx;
        const ghostOn = !!(layer.ghost || ghost);
        const trailsOn = !!(layer.trails || trails);
        const baseAlpha = (!isActive && ghostOn) ? 0.3 : 1;

        // Render previous frames (onion-skin / trails) when either setting is on.
        //   Trails off, Ghost off  -> nothing (current frame only).
        //   Trails off, Ghost on   -> single transparent onion-skin of the previous frame.
        //   Trails on,  Ghost off  -> up to 4 opaque cumulative previous frames.
        //   Trails on,  Ghost on   -> up to 4 transparent cumulative previous frames.
        if ((trailsOn || ghostOn) && frameIdx > 0) {
          const trailCount = trailsOn ? Math.min(4, frameIdx) : 1;
          for (let t = trailCount; t > 0; t--) {
            const fi = frameIdx - t;
            if (fi < 0) continue;
            const trailFrame = layer.frames[fi];
            if (!trailFrame) continue;

            const trailAlpha = ghostOn
              ? (0.08 + (0.25 * (trailCount - t + 1) / trailCount))
              : 1;

            trailFrame.strokes.forEach(s => {
              const transformed = this.transformStrokePoints(s, data);
              this.renderStroke(transformed, trailAlpha);
            });
          }
        }

        // Render current frame strokes
        frame.strokes.forEach(s => {
          const transformed = this.transformStrokePoints(s, data);
          this.renderStroke(transformed, baseAlpha);
        });
      });
    }

    /**
     * Render playback frame (all layers, animated)
     * @param {Object} data - Animation data
     * @param {number} globalFrame - Global frame counter
     * @param {Object} options - {activeLayerIdx}
     */
    renderPlayback(data, globalFrame, options = {}) {
      if (!data || !data.layers) return;

      const { activeLayerIdx = null } = options;

      const meta = data.imageMeta || {};
      this.renderImage(meta.bgColor || '#ffffff', meta.border);

      // When the active layer has Ghost on during playback, show ONLY that
      // layer — ghost becomes a solo/isolate modifier during animation.
      // Ghost + Isolate together on a layer hides it, so it does not solo.
      const activeLayer = (activeLayerIdx != null) ? data.layers[activeLayerIdx] : null;
      const soloActive = !!(activeLayer && activeLayer.ghost && !activeLayer.isolate);

      data.layers.forEach((layer, idx) => {
        // Ghost + Isolate together on a layer = hide that layer.
        if (layer.ghost && layer.isolate) return;
        if (soloActive && idx !== activeLayerIdx) return;
        const skip = Math.max(0, layer.skipFrames || 0);
        const step = 1 + skip;
        const localFrame = Math.floor(globalFrame / step);

        let fi;
        if (layer.loop) {
          fi = localFrame % layer.frames.length;
        } else {
          fi = Math.min(localFrame, layer.frames.length - 1);
        }

        const frame = layer.frames[fi];
        if (!frame) return;

        // Render trails
        //   Trails on,  Ghost off -> opaque cumulative previous frames.
        //   Trails on,  Ghost on  -> transparent cumulative previous frames.
        //   Trails off, Ghost on  -> single transparent onion-skin (previous frame).
        //   Trails off, Ghost off -> no trails.
        const ghostOn = !!layer.ghost;
        const trailsOn = !!layer.trails;
        if ((trailsOn || ghostOn) && fi > 0) {
          const startIdx = trailsOn ? 0 : fi - 1;
          for (let tFi = startIdx; tFi < fi; tFi++) {
            const prevFrame = layer.frames[tFi];
            if (!prevFrame) continue;
            const trailAlpha = ghostOn ? 0.35 : 1;
            prevFrame.strokes.forEach(s => {
              const transformed = this.transformStrokePoints(s, data);
              this.renderStroke(transformed, trailAlpha);
            });
          }
        }

        const alpha = ghostOn ? 0.4 : 1;
        frame.strokes.forEach(s => {
          const transformed = this.transformStrokePoints(s, data);
          this.renderStroke(transformed, alpha);
        });
      });
    }

    /**
     * Get stroke data at a screen position
     * Returns canvas-relative normalized coordinates (0-1 across full canvas)
     * @param {number} px - Screen x
     * @param {number} py - Screen y
     * @returns {Object|null} {normalized: [nx, ny], screen: [px, py], isInside: boolean}
     */
    getStrokeAtPosition(px, py) {
      const canvasW = this.canvas.width;
      const canvasH = this.canvas.height;
      
      const nx = px / canvasW;
      const ny = py / canvasH;
      
      // Check if inside image (for visual feedback)
      let isInside = false;
      if (this.imageRect) {
        isInside = px >= this.imageRect.x && 
                   px <= this.imageRect.x + this.imageRect.width &&
                   py >= this.imageRect.y && 
                   py <= this.imageRect.y + this.imageRect.height;
      }

      return {
        normalized: [nx, ny],  // canvas-relative 0-1
        screen: [px, py],
        isInside
      };
    }

    /**
     * Resize canvas and recalculate layout
     * @param {number} width - New width
     * @param {number} height - New height
     * @param {Object} constraints - Layout constraints
     */
    resize(width, height, constraints = {}) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.calculateLayout(constraints);
    }
  }

  // ============ DATA MIGRATION & UTILITIES ============

  /**
   * Migrate any version data to v3 (canvas-relative coordinates)
   * @param {Object} oldData - Old format data (v1 or v2)
   * @param {Object} canvasInfo - {width, height, imageRect} at time of creation
   * @returns {Object} v3 canvas-relative data
   */
  function migrateToV3(oldData, canvasInfo) {
    if (!oldData) return null;
    if (oldData.v === 3) return oldData;

    const canvasW = canvasInfo?.width || oldData.imageW || 1920;
    const canvasH = canvasInfo?.height || oldData.imageH || 1080;
    
    // Calculate display rect for v2 migration
    let displayRect = null;
    if (canvasInfo?.imageRect) {
      displayRect = {
        x: canvasInfo.imageRect.x / canvasW,
        y: canvasInfo.imageRect.y / canvasH,
        width: canvasInfo.imageRect.width / canvasW,
        height: canvasInfo.imageRect.height / canvasH
      };
    }

    const meta = oldData.imageMeta || {};
    const imgW = meta.naturalW || 1920;
    const imgH = meta.naturalH || 1080;

    const v3Data = {
      v: 3,
      fps: oldData.fps || 12,
      autoAddFrame: oldData.autoAddFrame || false,
      canvasW: canvasW,  // Store canvas dimensions at creation
      canvasH: canvasH,
      imageMeta: {
        naturalW: imgW,
        naturalH: imgH,
        crop: meta.crop || null,
        border: meta.border || null,
        bgColor: meta.bgColor || '#ffffff',
        displayRect: displayRect || meta.displayRect || null  // Store normalized display rect
      },
      layers: oldData.layers.map(layer => ({
        ...layer,
        frames: layer.frames.map(frame => ({
          strokes: frame.strokes.map(stroke => ({
            ...stroke,
            points: stroke.points.map(p => {
              const version = oldData.v || 1;
              let nx, ny;
              
              if (version >= 2) {
                // v2: points are image-relative 0-1, convert to canvas-relative
                // Need to know where image was on canvas
                if (displayRect) {
                  nx = displayRect.x + p[0] * displayRect.width;
                  ny = displayRect.y + p[1] * displayRect.height;
                } else {
                  // Fallback: assume centered image with same aspect ratio
                  const aspect = imgW / imgH;
                  const canvasAspect = canvasW / canvasH;
                  let imgDisplayW, imgDisplayH, imgX, imgY;
                  
                  if (aspect > canvasAspect) {
                    imgDisplayW = canvasW;
                    imgDisplayH = canvasW / aspect;
                  } else {
                    imgDisplayH = canvasH;
                    imgDisplayW = canvasH * aspect;
                  }
                  imgX = (canvasW - imgDisplayW) / 2;
                  imgY = (canvasH - imgDisplayH) / 2;
                  
                  nx = (imgX + p[0] * imgDisplayW) / canvasW;
                  ny = (imgY + p[1] * imgDisplayH) / canvasH;
                }
              } else {
                // v1: points are pixel coordinates, normalize to canvas 0-1
                nx = p[0] / canvasW;
                ny = p[1] / canvasH;
              }
              
              return p.length >= 3 ? [nx, ny, p[2]] : [nx, ny];
            })
          }))
        }))
      }))
    };

    return v3Data;
  }

  /**
   * Create v3 data structure from scratch (canvas-relative coordinates)
   * @param {Object} imageMeta - Image metadata
   * @param {number} canvasW - Canvas width
   * @param {number} canvasH - Canvas height
   * @returns {Object} Empty v3 data
   */
  function createV3Data(imageMeta, canvasW, canvasH) {
    const meta = imageMeta || {};
    return {
      v: 3,
      fps: 12,
      autoAddFrame: false,
      canvasW: canvasW || 1920,
      canvasH: canvasH || 1080,
      imageMeta: {
        naturalW: meta.naturalW || 1920,
        naturalH: meta.naturalH || 1080,
        crop: meta.crop || null,
        border: meta.border || null,
        bgColor: meta.bgColor || '#ffffff',
        displayRect: null  // Will be set when image is positioned
      },
      layers: [{
        id: 'layer_' + Date.now(),
        letter: 'A',
        loop: true,
        trails: false,
        ghost: false,
        isolate: false,
        skipFrames: 0,
        frames: [{ strokes: [] }]
      }]
    };
  }

  /**
   * Extract image metadata from a processed creation image
   * @param {Object} creation - Creation object from ESHU_DB
   * @returns {Object} Image metadata
   */
  function extractImageMeta(creation) {
    if (!creation) return {};

    return {
      naturalW: creation.naturalWidth || creation.width || 1920,
      naturalH: creation.naturalHeight || creation.height || 1080,
      crop: creation.crop || null,
      border: creation.border || null,
      bgColor: creation.bgColor || creation.backgroundColor || '#ffffff'
    };
  }

  // ============ PUBLIC API ============

  window.DRAWING_COMPOSITOR = {
    // Classes
    Compositor: DrawingCompositor,

    // Coordinate utilities
    screenToCanvasNormalized,
    canvasNormalizedToScreen,
    calculateImageRect,

    // Data utilities
    migrateToV3,
    createV3Data,
    extractImageMeta,

    // Backward compatibility
    migrateV1ToV2: migrateToV3,  // Alias for backward compatibility
    createV2Data: (meta, w, h) => createV3Data(meta, w, h),  // Alias
    
    // Legacy coordinate functions (for backward compatibility)
    screenToNormalized: (px, py, rect) => {
      return screenToCanvasNormalized(px, py, rect?.width || window.innerWidth, rect?.height || window.innerHeight);
    },
    normalizedToScreen: (nx, ny, rect) => {
      return canvasNormalizedToScreen(nx, ny, rect?.width || window.innerWidth, rect?.height || window.innerHeight);
    }
  };
})();
