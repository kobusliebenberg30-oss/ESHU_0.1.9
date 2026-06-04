# Behavior Preservation Matrix

This document freezes observable behavior so the refactor can be validated incrementally without changing what users experience.

## Scope

The refactor must preserve:

- UI appearance
- UX behavior
- navigation
- business logic
- API behavior
- state behavior
- animations
- form behavior
- data compatibility
- performance characteristics that are visible to users

## Non-negotiable rule

If a change would be noticeable to a user, it is rejected.

## Compatibility surfaces

- HTML structure and page entry points
- CSS classes and inline attributes that control behavior
- existing script load order
- browser globals and legacy compatibility expectations
- storage keys and serialization formats
- remote sync payload shape
- API endpoints and response contracts
- auth and session behavior
- image and asset handling
- comments and reactions
- XP and leaderboard behavior

## Validation checkpoints

Every migration slice must pass these checks:

1. Page loads and renders the same content
2. Navigation links go to the same destinations
3. Forms submit and validate the same way
4. Existing buttons and controls behave the same
5. Existing animations and transitions remain visually and functionally equivalent
6. Existing localStorage / sessionStorage behavior remains compatible
7. Existing remote sync behavior remains compatible
8. Existing API request and response behavior remains compatible
9. Existing user flows still complete successfully
10. Existing error messages and failure modes remain compatible

## Screen-by-screen behavior contract

### Home / Discover

- default landing behavior stays unchanged
- current game selection behavior stays unchanged
- profile and auth UI behavior stays unchanged
- content cards and feed behavior stay unchanged
- navigation controls and links stay unchanged

### Groups

- group discovery, creation, join, leave, delete, and editing behavior stays unchanged
- visibility / privacy behavior stays unchanged
- member count and related metadata behavior stays unchanged
- group cover and image handling stays unchanged

### Games

- game creation, editing, deletion, and finalization behavior stays unchanged
- timing behavior stays unchanged
- game listing and detail navigation stays unchanged
- status transitions stay unchanged

### Creations

- creation creation, editing, deletion, and display behavior stays unchanged
- image upload and preview behavior stays unchanged
- host game association stays unchanged
- vote and interaction behavior stays unchanged

### Creation focus / creation details

- editor behavior stays unchanged
- drawing and animation behavior stays unchanged
- asset preview behavior stays unchanged
- save / publish / delete behavior stays unchanged

### Profile

- profile edit behavior stays unchanged
- avatar and image crop behavior stays unchanged
- profile switching behavior stays unchanged
- XP display and progression behavior stays unchanged
- export / import behavior stays unchanged

### Shared components

- modal open / close / focus trap behavior stays unchanged
- toast behavior stays unchanged
- dropdown behavior stays unchanged
- auth overlay behavior stays unchanged
- messages and account tools behavior stays unchanged

## State behavior contract

### Browser state

- current profile selection behavior stays unchanged
- active group / game / creation selection stays unchanged
- UI theme behavior stays unchanged
- local-only preferences remain local-only
- remote mode activation remains unchanged

### Persistence

- localStorage keys remain compatible
- sessionStorage keys remain compatible
- sync payload format remains compatible
- legacy data read paths remain compatible

## API behavior contract

- API routes remain unchanged
- HTTP methods remain unchanged
- request shapes remain unchanged
- response shapes remain unchanged
- error codes and messages remain compatible
- auth and session semantics remain unchanged

## Data compatibility contract

- entity schemas remain compatible
- legacy field names remain readable where needed
- legacy image and preview payload handling remains compatible
- `data` payload shape remains compatible
- existing serialized snapshots remain loadable

## Performance and rendering contract

- no user-visible latency regressions
- no visible timing changes in interactions
- no changes to animation timing that users can perceive
- no changed load order that affects page behavior
- no new blocking work on initial page load unless hidden behind existing behavior boundaries

## Change acceptance rules

A refactor slice is only acceptable if:

- all behavior checks pass
- all API compatibility checks pass
- all storage compatibility checks pass
- no user-visible regressions are introduced
- the internal structure is simpler and easier to maintain

## Rollout protocol

1. Identify a narrow behavior slice
2. Create or update internal modules behind compatibility wrappers
3. Validate the slice against this matrix
4. Move to the next slice only after parity is confirmed

## Appendix: parity validation signals

Use these signals to verify parity:

- DOM snapshots where practical
- manual flow walkthroughs for each page
- API call inspection
- storage key inspection
- event order inspection
- remote sync inspection
- profile and XP inspection
- cross-page navigation inspection

## Owner

- Product behavior owner: unchanged
- Engineering owner: refactor implementation
- Validation owner: parity verification
