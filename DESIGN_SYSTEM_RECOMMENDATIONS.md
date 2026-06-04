# Design System Recommendations

Based on the UI examples provided, here are recommended additions to the refactoring plan:

## Additional Components Needed

### 1. Multi-Step Wizard Component
**Purpose**: Guide users through complex forms (game creation, profile setup)

**Features**:
- Step indicators with progress
- Navigation (next/back/skip)
- Validation per step
- State persistence
- Mobile-responsive

**Usage**:
```javascript
const wizard = new Wizard({
  steps: [
    { id: 'basic', title: 'Basic Info', validate: validateBasic },
    { id: 'timing', title: 'Timing', validate: validateTiming },
    { id: 'settings', title: 'Settings', validate: validateSettings }
  ],
  onComplete: (data) => {
    createGame(data);
  }
});
```

### 2. Timeline/Schedule Visualizer
**Purpose**: Show game schedule with color-coded states

**Features**:
- Visual timeline
- Color-coded segments (starts/close/over)
- Date/time labels
- Responsive layout

### 3. Image Upload/Gallery Component
**Purpose**: Handle creation submissions and display

**Features**:
- Drag-and-drop upload
- Preview thumbnails
- Grid/list layouts
- Lazy loading
- Image optimization

### 4. Leaderboard Component
**Purpose**: Display ranked submissions

**Features**:
- Sortable columns
- Pagination
- Real-time updates
- User highlighting
- Medal/badge display

### 5. Validation Feedback System
**Purpose**: Inline form validation with clear messaging

**Features**:
- Field-level validation
- Error/warning/success states
- Contextual help text
- Accessible error announcements

### 6. Status Badge Component
**Purpose**: Visual status indicators

**Features**:
- Color-coded badges
- Icon support
- Size variants
- Semantic meaning (live/ended/upcoming)

## Design Tokens to Add

### Colors
```css
/* Status Colors */
--status-live: #22c55e;
--status-upcoming: #f59e0b;
--status-ended: #ef4444;
--status-draft: #6b7280;

/* Timeline Colors */
--timeline-starts: #22c55e;
--timeline-close: #f59e0b;
--timeline-over: #ef4444;

/* Validation States */
--error-bg: #fef2f2;
--error-border: #ef4444;
--error-text: #991b1b;
--success-bg: #f0fdf4;
--success-border: #22c55e;
--success-text: #166534;
```

### Spacing Scale
```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
--spacing-2xl: 48px;
```

### Typography
```css
--font-size-xs: 12px;
--font-size-sm: 14px;
--font-size-base: 16px;
--font-size-lg: 18px;
--font-size-xl: 20px;
--font-size-2xl: 24px;
--font-size-3xl: 30px;

--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

## UX Patterns to Implement

### 1. Inline Validation
- Validate on blur (not on every keystroke)
- Show success state when valid
- Clear, actionable error messages
- Don't block submission, but warn

### 2. Loading States
- Skeleton screens for content loading
- Spinners for actions
- Progress bars for uploads
- Optimistic UI updates

### 3. Empty States
- Helpful illustrations
- Clear CTAs
- Onboarding hints
- Sample data option

### 4. Confirmation Dialogs
- Destructive actions require confirmation
- Clear consequences explained
- "Don't show again" option for frequent actions
- Keyboard shortcuts (Enter/Escape)

### 5. Responsive Breakpoints
```css
/* Mobile first */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
```

## Accessibility Requirements

### ARIA Labels
- All interactive elements labeled
- Form fields with labels/descriptions
- Status announcements for screen readers
- Landmark regions defined

### Keyboard Navigation
- Tab order logical
- Focus visible
- Keyboard shortcuts documented
- Skip links for navigation

### Color Contrast
- WCAG AA minimum (4.5:1 for text)
- Don't rely on color alone
- Test with color blindness simulators

## Animation Guidelines

### Timing
- Fast: 150ms (hover, focus)
- Medium: 300ms (transitions, reveals)
- Slow: 500ms (page transitions)

### Easing
- Ease-out: Elements entering
- Ease-in: Elements exiting
- Ease-in-out: Elements moving

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Implementation Priority

### High Priority (Phase 2)
1. Multi-step wizard component
2. Validation feedback system
3. Status badge component
4. Loading states

### Medium Priority (Phase 3)
1. Timeline visualizer
2. Image upload component
3. Leaderboard component
4. Empty states

### Low Priority (Phase 4)
1. Advanced animations
2. Keyboard shortcuts
3. Accessibility audit
4. Performance optimization

## Next Steps

1. Create design tokens CSS file
2. Build wizard component
3. Implement validation system
4. Add status badges
5. Refactor game creation flow
6. Test with real users
7. Iterate based on feedback
