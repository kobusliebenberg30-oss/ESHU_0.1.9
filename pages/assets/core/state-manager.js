/**
 * Centralized State Manager
 * Provides reactive state management with pub/sub pattern
 * Eliminates race conditions and provides single source of truth
 */
(function() {
  'use strict';

  class StateManager {
    constructor() {
      this.state = {
        user: null,
        groups: [],
        games: [],
        creations: [],
        comments: [],
        ui: {
          theme: 'light',
          activePanel: null,
          selectedItem: null,
          loading: false,
          error: null
        }
      };
      this.subscribers = new Map();
      this.middleware = [];
      this.history = [];
      this.maxHistory = 50;
    }

    /**
     * Subscribe to state changes
     * @param {string} path - Dot notation path (e.g., 'user.name' or '*' for all)
     * @param {Function} callback - Called with (newValue, oldValue, path)
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback) {
      if (!this.subscribers.has(path)) {
        this.subscribers.set(path, new Set());
      }
      this.subscribers.get(path).add(callback);

      // Return unsubscribe function
      return () => {
        const subs = this.subscribers.get(path);
        if (subs) {
          subs.delete(callback);
          if (subs.size === 0) {
            this.subscribers.delete(path);
          }
        }
      };
    }

    /**
     * Get state value by path
     * @param {string} path - Dot notation path
     * @returns {*} State value
     */
    get(path) {
      if (!path) return this.state;
      
      const keys = path.split('.');
      let value = this.state;
      
      for (const key of keys) {
        if (value === null || value === undefined) return undefined;
        value = value[key];
      }
      
      return value;
    }

    /**
     * Set state value by path
     * @param {string} path - Dot notation path
     * @param {*} value - New value
     * @param {Object} options - { silent: boolean, source: string }
     */
    set(path, value, options = {}) {
      const { silent = false, source = 'unknown' } = options;
      
      // Get old value
      const oldValue = this.get(path);
      
      // Run middleware
      for (const mw of this.middleware) {
        const result = mw(path, value, oldValue);
        if (result === false) {
          console.warn(`[StateManager] Middleware blocked update to ${path}`);
          return false;
        }
        if (result !== undefined && result !== true) {
          value = result;
        }
      }
      
      // Update state
      const keys = path.split('.');
      let current = this.state;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current) || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
      
      const lastKey = keys[keys.length - 1];
      current[lastKey] = value;
      
      // Add to history
      this.history.push({
        timestamp: Date.now(),
        path,
        oldValue,
        newValue: value,
        source
      });
      
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      
      // Notify subscribers
      if (!silent) {
        this.notify(path, value, oldValue);
      }
      
      return true;
    }

    /**
     * Update state with partial object
     * @param {string} path - Path to object
     * @param {Object} updates - Partial updates
     */
    update(path, updates, options = {}) {
      const current = this.get(path);
      if (typeof current !== 'object' || current === null) {
        console.error(`[StateManager] Cannot update non-object at ${path}`);
        return false;
      }
      
      const merged = { ...current, ...updates };
      return this.set(path, merged, options);
    }

    /**
     * Notify subscribers of state change
     */
    notify(path, newValue, oldValue) {
      // Notify exact path subscribers
      const exactSubs = this.subscribers.get(path);
      if (exactSubs) {
        exactSubs.forEach(cb => {
          try {
            cb(newValue, oldValue, path);
          } catch (err) {
            console.error('[StateManager] Subscriber error:', err);
          }
        });
      }
      
      // Notify wildcard subscribers
      const wildcardSubs = this.subscribers.get('*');
      if (wildcardSubs) {
        wildcardSubs.forEach(cb => {
          try {
            cb(newValue, oldValue, path);
          } catch (err) {
            console.error('[StateManager] Wildcard subscriber error:', err);
          }
        });
      }
      
      // Notify parent path subscribers
      const pathParts = path.split('.');
      for (let i = pathParts.length - 1; i > 0; i--) {
        const parentPath = pathParts.slice(0, i).join('.');
        const parentSubs = this.subscribers.get(parentPath);
        if (parentSubs) {
          const parentValue = this.get(parentPath);
          parentSubs.forEach(cb => {
            try {
              cb(parentValue, undefined, parentPath);
            } catch (err) {
              console.error('[StateManager] Parent subscriber error:', err);
            }
          });
        }
      }
    }

    /**
     * Add middleware to intercept state changes
     * @param {Function} fn - Middleware function (path, newValue, oldValue) => newValue | false
     */
    use(fn) {
      this.middleware.push(fn);
    }

    /**
     * Reset state to initial values
     */
    reset() {
      const oldState = { ...this.state };
      this.state = {
        user: null,
        groups: [],
        games: [],
        creations: [],
        comments: [],
        ui: {
          theme: 'light',
          activePanel: null,
          selectedItem: null,
          loading: false,
          error: null
        }
      };
      this.notify('*', this.state, oldState);
    }

    /**
     * Get state change history
     */
    getHistory(path = null) {
      if (!path) return this.history;
      return this.history.filter(h => h.path === path || h.path.startsWith(path + '.'));
    }

    /**
     * Batch multiple state updates
     * @param {Function} fn - Function that performs multiple updates
     */
    batch(fn) {
      const originalNotify = this.notify;
      const changes = [];
      
      // Collect changes without notifying
      this.notify = (path, newValue, oldValue) => {
        changes.push({ path, newValue, oldValue });
      };
      
      try {
        fn();
      } finally {
        // Restore notify and emit all changes
        this.notify = originalNotify;
        changes.forEach(({ path, newValue, oldValue }) => {
          this.notify(path, newValue, oldValue);
        });
      }
    }

    /**
     * Create a computed value that updates when dependencies change
     * @param {Array<string>} deps - Dependency paths
     * @param {Function} compute - Compute function
     * @returns {Function} Unsubscribe function
     */
    computed(deps, compute) {
      const update = () => {
        const values = deps.map(dep => this.get(dep));
        return compute(...values);
      };

      const unsubscribers = deps.map(dep => 
        this.subscribe(dep, update)
      );

      return () => unsubscribers.forEach(unsub => unsub());
    }
  }

  // Create singleton instance
  const stateManager = new StateManager();

  // Add validation middleware
  stateManager.use((path, value, oldValue) => {
    // Prevent null/undefined for arrays
    if (path.match(/^(groups|games|creations|comments)$/)) {
      if (!Array.isArray(value)) {
        console.warn(`[StateManager] ${path} must be an array, got:`, typeof value);
        return [];
      }
    }
    return value;
  });

  // Expose globally
  window.STATE = stateManager;

  // Debug helper
  if (typeof window !== 'undefined') {
    window.debugState = () => {
      console.log('Current State:', stateManager.state);
      console.log('Subscribers:', stateManager.subscribers);
      console.log('History:', stateManager.history);
    };
  }
})();
