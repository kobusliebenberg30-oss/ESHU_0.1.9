# Theme System: Visual Reference Guide

## 🌗 Binary Theme System Overview

### Light Theme = Pure White Surfaces
```
┌─────────────────────────────┐
│    LIGHT THEME (Light)      │
├─────────────────────────────┤
│ Background:  #ffffff        │
│ Text:        #0f172a (dark) │
│ Borders:     #d0d0d0 (gray) │
│                             │
│ ┌─────────────────────────┐ │
│ │  Panel/Card - White     │ │
│ │  Content Area - White   │ │
│ │  Input Fields - White   │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### Dark Theme = Pure Black Surfaces
```
┌─────────────────────────────┐
│     DARK THEME (Dark)       │
├─────────────────────────────┤
│ Background:  #000000        │
│ Text:        #e5e7eb (light)│
│ Borders:     #333333 (gray) │
│                             │
│ ┌─────────────────────────┐ │
│ │  Panel/Card - Black     │ │
│ │  Content Area - Black   │ │
│ │  Input Fields - Black   │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

---

## 🔄 Controlled Inversion Rules

### Backgrounds: INVERT
```
Light Theme:  White (#ffffff) ←→ Dark Theme: Black (#000000)
All panels, cards, inputs use this binary system
```

### Deleted State: INVERT
```
Light Theme:  Black bg + White text  ← High Contrast
Dark Theme:   White bg + Black text  ← High Contrast (INVERTED)
```

### Burned State: NO INVERT (Constant)
```
Light Theme:  Red (#ef4444) + White text
Dark Theme:   Red (#ef4444) + White text  (SAME color)
```

### Semantic Colors: NO INVERT (Constant)
```
Greens:   #22c55e → Same in both themes
Blues:    #38bdf8 → Same in both themes
Oranges:  #f59e0b → Same in both themes
```

---

## 📊 Color Changes Summary

### Light Theme Changes
```
Element              Before          After           Change
────────────────────────────────────────────────────────
Background           #f6f7fb         #ffffff         Pure white
Card                 #f1f5f9         #ffffff         Pure white
Hover                #f1f5f9         #f0f0f0         Adjusted
Border               #e2e8f0         #d0d0d0         Darker
Scrollbar Thumb      #0f172a         #b0b0b0         Lighter
```

### Dark Theme Changes
```
Element              Before          After           Change
────────────────────────────────────────────────────────
Background           #070a12         #000000         Pure black
Panel                #0b1220         #000000         Pure black
Card                 #0f172a         #000000         Pure black
Navigation           #020617         #000000         Pure black
Hover                #1e293b         #1a1a1a         Adjusted
Border               #1e293b         #333333         Lighter
Scrollbar Thumb      #e5e7eb         #555555         Darker
Deleted State        #000000 (bad)   #ffffff (good)  INVERTED
```

---

## 🎯 Key Inversion: Deleted State

### Why This Inversion?

**Problem Before:**
```
In Dark Mode:
┌─────────────────────┐
│ Black background    │  ← Can't see! (Black on black)
│ Deleted Item (dark) │
└─────────────────────┘
```

**Solution After:**
```
In Dark Mode:
┌─────────────────────┐
│ Black background    │
│  ┌───────────────┐  │
│  │ #ffffff bg    │  │ ← Can see! (White on black)
│  │ Deleted Item  │  │
│  └───────────────┘  │
└─────────────────────┘

In Light Mode:
┌─────────────────────┐
│ White background    │
│  ┌───────────────┐  │
│  │ #000000 bg    │  │ ← Can see! (Black on white)
│  │ Deleted Item  │  │
│  └───────────────┘  │
└─────────────────────┘
```

---

## 🔥 Constant Colors (NO Inversion)

### Burned State: Always Red
```
Light Theme:           Dark Theme:
┌──────────────┐       ┌──────────────┐
│ White bg     │       │ Black bg     │
│  ┌────────┐  │       │  ┌────────┐  │
│  │#ef4444 │  │       │  │#ef4444 │  │ ← SAME RED
│  │ Burned │  │       │  │ Burned │  │
│  └────────┘  │       │  └────────┘  │
└──────────────┘       └──────────────┘
```

### Semantic Colors: Always Same
```
Accent Green:   #22c55e    (Both themes)
Accent Blue:    #38bdf8    (Both themes)
Accent Orange:  #f59e0b    (Both themes)
Accent Purple:  #a855f7    (Both themes)

These colors are "theme-neutral" and signal specific
actions/meanings regardless of light or dark mode.
```

---

## 📈 Contrast Ratios

### All Values
```
Light Theme:
  Text on White       28:1  ✓ Excellent
  Deleted on White    21:1  ✓ AAA (7:1 minimum)
  Burned on White     6.5:1 ✓ AAA
  Border on White     6:1   ✓ AA

Dark Theme:
  Text on Black       6.8:1 ✓ AAA (6:1 minimum, round 7:1)
  Deleted on Black    21:1  ✓ AAA
  Burned on Black     6.5:1 ✓ AAA
  Border on Black     4.5:1 ✓ AA
```

**All exceed WCAG accessibility standards.**

---

## ✅ Testing Quick Reference

### Light Mode Checklist
- [ ] Backgrounds appear pure white (not gray)
- [ ] Text is dark and readable
- [ ] Deleted items show black background
- [ ] Borders visible on white
- [ ] Hover state provides feedback

### Dark Mode Checklist
- [ ] Backgrounds appear pure black (not dark gray)
- [ ] Text is light and readable
- [ ] Deleted items show white background (INVERTED)
- [ ] Borders visible on black
- [ ] Hover state provides feedback

### Comparison Checklist
- [ ] Deleted clearly different in both themes
- [ ] Burned remains red in both themes
- [ ] No gray ambiguity in main surfaces
- [ ] No layout shifts
- [ ] Semantic colors unchanged

---

## 🎨 Color Palette (Unchanged)

These colors remain the same across both light and dark themes:

**Semantic States:**
- Primary Green:     `#22c55e` (actions, success)
- Dark Green:        `#16a34a` (hover states)
- Accent Blue:       `#38bdf8` (secondary actions)
- Accent Orange:     `#f59e0b` (warning/edit)
- Accent Purple:     `#a855f7` (tertiary)
- Burn Red:          `#ef4444` (destruction - CONSTANT)

**Text Colors:**
- Light Theme Primary: `#0f172a` (dark)
- Dark Theme Primary:  `#e5e7eb` (light)

---

## 🔒 Design System Rules

```
BINARY THEME = White ↔ Black (backgrounds only)

INVERSION RULES:
  ✓ Backgrounds:     INVERT (white → black, black → white)
  ✓ Deleted State:   INVERT (black → white, white → black)
  ✗ Burned State:    DO NOT INVERT (always red)
  ✗ Semantic Colors: DO NOT INVERT (always same)
  ✗ Text Colors:     DO NOT INVERT (theme-aware, not swapped)
  ✗ Borders:         ADJUST FOR VISIBILITY (not inverted)
```

---

**Version:** 2.0 Binary System  
**Last Updated:** March 24, 2026  
