# Unified Drawing System Architecture

## Overview

The ESHU-D drawing system has been redesigned to ensure **100% consistency** between:
- Drawing → Saving → Rendering → Playback

What the user draws is exactly what is seen everywhere else on the platform.

## Core Principles

### 1. Normalized Coordinate System (0-1)
All stroke coordinates are stored as **normalized values** relative to the image's natural dimensions:
- `0` = left/top edge
- `1` = right/bottom edge
- Strokes scale correctly regardless of container size

**Before (v1 - broken):**
```javascript
// Stored as screen pixels - breaks on different screen sizes
points: [[123.5, 456.2, timestamp]]  // pixels at draw time
```

**After (v2 - unified):**
```javascript
// Stored as normalized (0-1) - works at any scale
points: [[0.064, 0.422, timestamp]]  // % of image dimensions
```

### 2. Unified Compositor
A single `DrawingCompositor` class handles all rendering:
- **Image layer** - proper scaling with object-fit:contain behavior
- **Drawing layer(s)** - strokes rendered at correct positions
- **Composite output** - single canvas with both layers

```javascript
const compositor = new DRAWING_COMPOSITOR.Compositor(canvas);
await compositor.setImage(imageUrl);
compositor.calculateLayout({ padding: 80 });
compositor.renderFrame(animationData, frameIndex);
```

### 3. Image Metadata Preservation
Every creation now stores:
- `naturalWidth/naturalHeight` - original image dimensions
- `crop` - optional crop rectangle (if applied)
- `border` - border width and color
- `bgColor` - background color

This ensures drawings align perfectly with the processed image.

### 4. Data Format Migration (v1 → v2)

**v1 Data (legacy):**
```javascript
{
  v: 1,
  fps: 12,
  imageW: 1920,  // screen width at draw time (WRONG!)
  imageH: 1080,  // screen height at draw time (WRONG!)
  layers: [...]
}
```

**v2 Data (unified):**
```javascript
{
  v: 2,
  fps: 12,
  imageMeta: {
    naturalW: 1920,    // actual image width
    naturalH: 1080,    // actual image height
    crop: { x, y, w, h },  // optional crop
    border: { width: 8, color: '#111' },
    bgColor: '#ffffff'
  },
  layers: [{
    id, letter, loop, trails, ghost, isolate, skipFrames,
    frames: [{
      strokes: [{
        points: [[0.12, 0.34], [0.15, 0.38], ...],  // normalized!
        color, size, fill
      }]
    }]
  }]
}
```

## File Structure

```
assets/core/
├── drawing-compositor.js    # Unified rendering engine
├── DRAWING_SYSTEM_README.md # This documentation

assets/components/
├── animation-draw.js        # Drawing tool (uses compositor)
├── animation-player.js      # Playback modal (uses compositor)

assets/styles/
├── animation-draw.css       # Updated for unified canvas
```

## Usage

### Opening the Drawing Tool

```javascript
// Get creation with metadata
const creation = ESHU_DB.getEntityById('creations', id);
const imageMeta = DRAWING_COMPOSITOR.extractImageMeta(creation);

ANIMATION_DRAW.open({
  imageUrl: creation.image,
  imageMeta: imageMeta,  // Now required for proper alignment
  initialData: existingAnimation,  // Optional: edit existing
  onSave: (data) => {
    // data.v === 2
    // data.imageMeta preserved
    // All coordinates normalized
    saveToComment(data);
  }
});
```

### Playback

```javascript
// Automatic - uses unified compositor
ANIMATION_PLAYER.open(animationData, imageUrl);

// Or manually with compositor
const compositor = new DRAWING_COMPOSITOR.Compositor(canvas);
await compositor.setImage(imageUrl);
compositor.renderPlayback(animationData, frameIndex);
```

### Rendering a Single Frame

```javascript
const compositor = new DRAWING_COMPOSITOR.Compositor(canvas);
compositor.resize(width, height);
await compositor.setImage(imageUrl);
compositor.calculateLayout({ padding: 40 });
compositor.renderFrame(animationData, frameIndex, {
  isolateLayerIdx: null,
  ghost: false,
  trails: true
});
```

## Key Improvements

### Before (Broken)
1. **Misaligned drawings** - Strokes drawn at screen coordinates ≠ image coordinates
2. **Broken playback** - Playback used screen dimensions from draw time
3. **Inconsistent containers** - Each context sized images differently
4. **No metadata** - Lost crop/border/bg info after processing

### After (Unified)
1. **Perfect alignment** - Normalized coordinates map to actual image
2. **Responsive playback** - Works at any container size
3. **Consistent rendering** - Same compositor code everywhere
4. **Metadata preserved** - Image processing info travels with creation

## Migration

Existing v1 data is **automatically migrated** to v2 when loaded:

```javascript
function emptyState(initial, imageMeta) {
  // Migrate v1 to v2 if needed
  if (initial && initial.v === 1) {
    return DRAWING_COMPOSITOR.migrateV1ToV2(initial, imageMeta);
  }
  // ... create new v2 state
}
```

The migration:
1. Detects v1 format (has `imageW/imageH` instead of `imageMeta`)
2. Converts pixel coordinates to normalized (0-1)
3. Creates proper `imageMeta` structure
4. Preserves all animation data

## API Reference

### DRAWING_COMPOSITOR

**Constants:**
- `CANVAS_PADDING` - Default padding around image (80px)

**Classes:**
- `Compositor(canvas)` - Main compositor class

**Coordinate Utilities:**
- `screenToNormalized(px, py, imageRect)` → `[nx, ny]`
- `normalizedToScreen(nx, ny, imageRect)` → `[px, py]`
- `calculateImageRect(containerW, containerH, imageW, imageH, padding)`

**Data Utilities:**
- `migrateV1ToV2(v1Data, imageMeta)` → `v2Data`
- `createV2Data(imageMeta)` → empty v2 state
- `extractImageMeta(creation)` → metadata object

### Compositor Instance Methods

- `setImage(img|url)` - Set base image
- `calculateLayout(constraints)` - Compute image display rect
- `resize(w, h, constraints)` - Resize canvas and recalculate
- `renderImage(bgColor, border)` - Draw base image
- `renderStroke(stroke, alpha)` - Draw single stroke
- `renderFrame(data, frameIdx, options)` - Render complete frame
- `renderPlayback(data, globalFrame)` - Render playback frame
- `getStrokeAtPosition(px, py)` - Get normalized coords at position

## Implementation Checklist

When adding drawing support to a new page:

1. [ ] Add `<script src="assets/core/drawing-compositor.js"></script>` before animation-draw.js
2. [ ] Ensure creation objects store `naturalWidth/naturalHeight`
3. [ ] Pass `imageMeta` when calling `ANIMATION_DRAW.open()`
4. [ ] Use `DRAWING_COMPOSITOR.extractImageMeta()` to get metadata
5. [ ] For custom rendering, use `new DRAWING_COMPOSITOR.Compositor(canvas)`

## Testing

To verify the unified system works:

1. **Draw on an image** - Draw strokes at corners/center
2. **Save the animation** - Stored as v2 with normalized coords
3. **Play back in different contexts**:
   - Creation focus view (full screen)
   - Comment thumbnail (small container)
   - Different browser window sizes
4. **Verify alignment** - Strokes should hit exact same spots on image

The drawing should look **identical** in all contexts, regardless of:
- Screen size
- Container size
- Aspect ratio
- Browser/device
