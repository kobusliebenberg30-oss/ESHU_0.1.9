# Refactoring Plan

This plan describes a behavior-preserving refactor strategy for the existing application. The objective is to replace the prototype internals with a clean architecture while keeping the user experience visually and functionally identical.

## Goals

- Preserve all observable behavior
- Replace mixed responsibilities with clear module boundaries
- Reduce duplicated logic
- Reduce page-controller complexity
- Improve state predictability
- Improve performance without changing UX
- Make the codebase easier to extend safely

## Constraints

- No redesign of the UI
- No workflow changes
- No business rule changes
- No new product features
- No behavior changes visible to users
- No architecture changes that alter API or storage compatibility

## Refactor principles

1. Preserve exact user-visible output
2. Treat existing implementation as a behavioral specification
3. Refactor incrementally, one behavior slice at a time
4. Keep legacy compatibility layers until parity is proven
5. Prefer extraction over replacement
6. Separate infrastructure concerns from feature logic
7. Keep current runtime model unless a compatibility-safe improvement is required

## Current architecture baseline

### Frontend

- Static HTML pages
- Vanilla JavaScript page controllers
- Global shared scripts
- Legacy shared storage and sync helpers
- Large page-specific files with mixed concerns
- Reusable components embedded as standalone scripts

### Backend

- Express application with route modules
- Prisma-backed data access
- Domain modules already separated by resource
- Storage abstraction
- Session-based auth

## Target architecture

### Frontend layers

1. Bootstrap
   - page entry hooks
   - global bootstrapping
   - compatibility shims

2. Core infrastructure
   - API client
   - storage adapters
   - sync adapters
   - asset adapters
   - shared constants
   - shared types

3. Domain
   - normalized entities
   - selectors
   - formatters
   - invariants
   - permission helpers

4. State
   - canonical browser state
   - compatibility bridge to legacy storage
   - subscriptions
   - mutation orchestration

5. Features
   - page-specific flows
   - form orchestration
   - lifecycle logic
   - side-effect coordination

6. UI components
   - reusable render-only components
   - shared visual primitives
   - current CSS classes preserved

### Backend layers

1. Delivery
   - routes
   - validation
   - response shaping

2. Application
   - use cases
   - orchestration
   - authorization

3. Domain
   - business rules
   - status transitions
   - XP rules
   - ownership rules

4. Infrastructure
   - Prisma repositories
   - storage drivers
   - session adapters
   - logging

## Migration strategy

### Phase 1 — Compatibility scaffolding

- Introduce shared core adapters
- Introduce browser state store
- Keep current UI and storage behavior intact
- Preserve current page boot sequence

### Phase 2 — Extract shared logic

- Move repeated selectors and formatters out of page scripts
- Extract permission and entity normalization helpers
- Centralize asset image resolution logic
- Consolidate comment and reaction logic

### Phase 3 — Split page controllers

- Extract feature modules from the largest page controllers
- Keep the same DOM output and event behavior
- Preserve all existing page entry scripts

### Phase 4 — Normalize state ownership

- Move page-local state into shared store
- Keep persistence compatibility with existing storage layers
- Preserve remote sync behavior

### Phase 5 — Backend cleanup

- Separate routes, services, and repositories more explicitly
- Preserve API payload shape and response behavior
- Keep transport contracts unchanged

### Phase 6 — Dead code cleanup

- Remove duplication only after parity is confirmed
- Remove unused helpers only when behavior is proven unchanged

## Frontend migration order

1. Introduce compatibility adapters for API, storage, sync, and assets
2. Create shared domain helpers and selectors
3. Refactor the smallest safe pages first
4. Extract reusable components and shared UI behavior
5. Refactor state ownership and subscription patterns
6. Refactor high-complexity pages last

## Backend migration order

1. Audit current route/service responsibilities
2. Introduce application-layer orchestration where needed
3. Extract repositories for Prisma access
4. Consolidate shared domain rules
5. Remove duplication after API parity is verified

## Risk controls

### Risks

- Hidden global dependencies
- DOM-sensitive behavior
- Sync timing edge cases
- Asset upload edge cases
- LocalStorage and remote mode compatibility
- User flow coupling across pages

### Mitigations

- Preserve current script order
- Keep compatibility shims in place
- Validate one behavior slice at a time
- Use the behavior matrix as the gate for every step
- Avoid replacing storage or sync code until parity is proven

## Validation gates

Each refactor slice must satisfy:

- visual parity
- functional parity
- navigation parity
- API parity
- storage parity
- sync parity
- animation parity
- state parity
- error-handling parity

## Rollout checkpoints

### Checkpoint A

- compatibility adapters in place
- browser state store introduced
- no user-visible changes

### Checkpoint B

- shared logic extracted from page scripts
- page controllers smaller and easier to reason about
- no user-visible changes

### Checkpoint C

- major page controllers split into feature modules
- state ownership normalized
- no user-visible changes

### Checkpoint D

- backend layers cleaned up
- API compatibility confirmed
- no user-visible changes

## Deliverables

1. Behavior Preservation Matrix
2. Target Architecture Map
3. Frontend migration checklist
4. Backend migration checklist
5. Incremental validation checklist

## Success criteria

- Internal architecture is significantly cleaner
- Maintainability is improved
- Performance is improved where safe
- Observable behavior remains unchanged
- Future changes become easier and safer
