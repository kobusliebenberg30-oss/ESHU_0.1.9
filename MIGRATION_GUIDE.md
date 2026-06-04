# Page Migration Guide

This guide shows how to migrate existing pages to use the foundation modules (STATE, STORAGE, TOAST, Modal, Dropdown).

## Migration Checklist

### 1. Add Foundation Module Scripts
```html
<!-- Design tokens -->
<link rel="stylesheet" href="assets/styles/design-tokens.css">

<!-- Core modules -->
<script src="assets/core/state-manager.js"></script>
<script src="assets/core/storage.js"></script>

<!-- Components -->
<script src="assets/components/toast.js"></script>
<script src="assets/components/modal.js"></script>
<script src="assets/components/dropdown.js"></script>

<!-- Utils -->
<script src="assets/utils/debounce.js"></script>
```

### 2. Replace ESHU_DB with STATE + STORAGE

**Before:**
```javascript
let games = [];

ESHU_DB.subscribe(() => {
  games = ESHU_DB.getTable('games');
  renderGames();
});

function saveGame(game) {
  ESHU_DB.updateTable('games', games => [game, ...games]);
}
```

**After:**
```javascript
// Initialize state
function initializeApp() {
  const data = STORAGE.load();
  STATE.set('games', data.tables.games || []);
}

// Subscribe to changes
STATE.subscribe('games', (games) => {
  renderGames();
  saveToStorage();
});

// Save function
async function saveGame(gameData) {
  try {
    STATE.set('ui.loading', true);
    
    const validation = STORAGE.validate('game', gameData);
    if (!validation.valid) {
      TOAST.error(validation.errors.join(', '), 'Validation Error');
      return false;
    }
    
    const games = STATE.get('games');
    STATE.set('games', [validation.sanitized, ...games]);
    
    TOAST.success('Game created!');
    return true;
  } catch (err) {
    TOAST.error('Failed to save', 'Error');
    return false;
  } finally {
    STATE.set('ui.loading', false);
  }
}

function saveToStorage() {
  const data = STORAGE.load();
  data.tables.games = STATE.get('games');
  STORAGE.save(data);
}
```

### 3. Add User Feedback with TOAST

**Replace silent operations:**
```javascript
// Before: Silent
deleteGame(id);

// After: With feedback
function deleteGame(id) {
  const games = STATE.get('games');
  const updated = games.map(g => g.id === id ? { ...g, status: 'deleted' } : g);
  STATE.set('games', updated);
  TOAST.info('Game moved to trash');
}
```

### 4. Use Modal for Confirmations

**Before:**
```javascript
if (confirm('Delete this game?')) {
  deleteGame(id);
}
```

**After:**
```javascript
const confirmed = await MODAL.confirm({
  title: 'Delete Game',
  message: 'Are you sure you want to delete this game?',
  danger: true,
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel'
});

if (confirmed) {
  deleteGame(id);
}
```

### 5. Replace Dropdowns with Dropdown Component

**Before:**
```html
<select id="hostGroup">
  <option value="">Select...</option>
</select>

<script>
function populateDropdown() {
  const select = document.getElementById('hostGroup');
  select.innerHTML = '<option value="">Select...</option>';
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    select.appendChild(opt);
  });
}
</script>
```

**After:**
```html
<div id="hostGroupContainer"></div>

<script>
const hostGroupDropdown = new Dropdown({
  container: document.getElementById('hostGroupContainer'),
  options: groups.map(g => ({ value: g.id, label: g.name })),
  placeholder: 'Select host group...',
  searchable: true,
  onChange: (value, label) => {
    console.log('Selected:', value, label);
  }
});

// Update options when groups change
STATE.subscribe('groups', (groups) => {
  hostGroupDropdown.setOptions(
    groups.map(g => ({ value: g.id, label: g.name }))
  );
});
</script>
```

### 6. Add Loading States

```html
<div class="loading-overlay" id="loadingOverlay">
  <div class="loading-spinner"></div>
</div>

<style>
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.loading-overlay.active {
  display: flex;
}
.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

<script>
STATE.subscribe('ui.loading', (loading) => {
  document.getElementById('loadingOverlay').classList.toggle('active', loading);
});
</script>
```

### 7. Debounce Search Inputs

**Before:**
```javascript
searchBox.addEventListener('input', (e) => {
  filterResults(e.target.value);
});
```

**After:**
```javascript
searchBox.addEventListener('input', UTILS.debounce((e) => {
  STATE.set('ui.searchQuery', e.target.value);
}, 300));

STATE.subscribe('ui.searchQuery', (query) => {
  filterResults(query);
});
```

### 8. Add Error Handling

**Wrap all operations in try-catch:**
```javascript
async function saveEntity(data) {
  try {
    STATE.set('ui.loading', true);
    
    // Validate
    const validation = STORAGE.validate('entity', data);
    if (!validation.valid) {
      TOAST.error(validation.errors.join(', '), 'Validation Error');
      return false;
    }
    
    // Save
    const entities = STATE.get('entities');
    STATE.set('entities', [validation.sanitized, ...entities]);
    
    TOAST.success('Saved successfully!');
    return true;
    
  } catch (err) {
    console.error('Save error:', err);
    TOAST.error('Failed to save. Please try again.', 'Error');
    return false;
  } finally {
    STATE.set('ui.loading', false);
  }
}
```

## Complete Example: groups.html Migration

See the refactored `games.html` for a complete working example. The pattern is:

1. **Initialize** - Load data from STORAGE into STATE
2. **Subscribe** - React to state changes
3. **Validate** - Use STORAGE.validate() before saving
4. **Feedback** - Show TOAST notifications for all actions
5. **Loading** - Show loading overlay during operations
6. **Error handling** - Try-catch with user-friendly messages

## Testing Checklist

After migrating a page, verify:

- ✅ Data loads correctly on page load
- ✅ CRUD operations work (Create, Read, Update, Delete)
- ✅ Toast notifications appear for all actions
- ✅ Loading states show during operations
- ✅ Validation catches invalid data
- ✅ Dropdowns don't reset after operations
- ✅ Search is debounced (doesn't lag)
- ✅ Errors are handled gracefully
- ✅ Data persists to localStorage
- ✅ Theme switching works
- ✅ Mobile responsive
- ✅ Keyboard navigation works

## Common Patterns

### Pattern: Filtered List
```javascript
STATE.subscribe('entities', renderList);
STATE.subscribe('ui.searchQuery', renderList);
STATE.subscribe('ui.filterValue', renderList);

function renderList() {
  const entities = STATE.get('entities');
  const query = STATE.get('ui.searchQuery').toLowerCase();
  const filter = STATE.get('ui.filterValue');
  
  let filtered = entities.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(query);
    const matchesFilter = !filter || e.category === filter;
    return matchesSearch && matchesFilter;
  });
  
  // Render filtered list
}
```

### Pattern: Optimistic Updates
```javascript
async function updateEntity(id, changes) {
  // Save old state for rollback
  const oldEntities = STATE.get('entities');
  
  try {
    // Optimistic update
    const updated = oldEntities.map(e => 
      e.id === id ? { ...e, ...changes } : e
    );
    STATE.set('entities', updated);
    
    // Simulate API call or validation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    TOAST.success('Updated!');
  } catch (err) {
    // Rollback on error
    STATE.set('entities', oldEntities);
    TOAST.error('Update failed', 'Error');
  }
}
```

### Pattern: Batch Operations
```javascript
function bulkDelete(ids) {
  STATE.batch(() => {
    const entities = STATE.get('entities');
    const updated = entities.map(e => 
      ids.includes(e.id) ? { ...e, status: 'deleted' } : e
    );
    STATE.set('entities', updated);
    STATE.set('ui.selectedIds', []);
  });
  
  TOAST.success(`${ids.length} items deleted`);
}
```

## Next Steps

1. Migrate `groups.html`
2. Migrate `creations.html`
3. Migrate `home.html`
4. Migrate remaining pages
5. Remove old `eshu-db.js` once all pages migrated
6. Add accessibility improvements
7. Performance audit
