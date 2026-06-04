/**
 * Storage Layer with Validation and Error Recovery
 * Provides abstracted, type-safe storage with automatic backup
 */
(function() {
  'use strict';

  class StorageManager {
    constructor(options = {}) {
      this.storageKey = options.storageKey || 'eshu_db_v1';
      this.backupKey = `${this.storageKey}_backup`;
      this.schemaVersion = options.schemaVersion || 2;
      this.storage = options.storage || window.localStorage;
      this.validators = new Map();
      this.migrations = new Map();
    }

    /**
     * Register a validator for a data type
     * @param {string} type - Data type (e.g., 'group', 'game')
     * @param {Function} validator - Validation function
     */
    registerValidator(type, validator) {
      this.validators.set(type, validator);
    }

    /**
     * Register a migration function
     * @param {number} fromVersion - Source version
     * @param {number} toVersion - Target version
     * @param {Function} migrator - Migration function
     */
    registerMigration(fromVersion, toVersion, migrator) {
      this.migrations.set(`${fromVersion}->${toVersion}`, migrator);
    }

    /**
     * Validate entity
     * @param {string} type - Entity type
     * @param {Object} entity - Entity to validate
     * @returns {Object} { valid: boolean, errors: Array, sanitized: Object }
     */
    validate(type, entity) {
      const validator = this.validators.get(type);
      if (!validator) {
        return { valid: true, errors: [], sanitized: entity };
      }

      try {
        return validator(entity);
      } catch (err) {
        return {
          valid: false,
          errors: [err.message],
          sanitized: entity
        };
      }
    }

    /**
     * Load data from storage with error recovery
     * @returns {Object} Database object
     */
    load() {
      try {
        const raw = this.storage.getItem(this.storageKey);
        if (!raw) {
          return this.createEmpty();
        }

        const data = JSON.parse(raw);
        
        // Check schema version and migrate if needed
        if (data.schemaVersion !== this.schemaVersion) {
          return this.migrate(data);
        }

        return this.sanitize(data);
      } catch (err) {
        console.error('[Storage] Load error:', err);
        return this.recover();
      }
    }

    /**
     * Save data to storage with automatic backup
     * @param {Object} data - Data to save
     * @returns {boolean} Success status
     */
    save(data) {
      try {
        // Validate before saving
        const sanitized = this.sanitize(data);
        
        // Create backup of current data
        const current = this.storage.getItem(this.storageKey);
        if (current) {
          this.storage.setItem(this.backupKey, current);
        }

        // Save new data
        sanitized.updatedAt = new Date().toISOString();
        const serialized = JSON.stringify(sanitized);
        this.storage.setItem(this.storageKey, serialized);

        return true;
      } catch (err) {
        console.error('[Storage] Save error:', err);
        
        // Try to restore from backup
        if (err.name === 'QuotaExceededError') {
          this.handleQuotaExceeded();
        }
        
        return false;
      }
    }

    /**
     * Sanitize and validate entire database
     * @param {Object} data - Raw data
     * @returns {Object} Sanitized data
     */
    sanitize(data) {
      const sanitized = {
        schemaVersion: this.schemaVersion,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tables: {},
        values: {}
      };

      // Sanitize tables
      const tables = ['groups', 'games', 'creations'];
      tables.forEach(table => {
        const items = Array.isArray(data.tables?.[table]) ? data.tables[table] : [];
        sanitized.tables[table] = items
          .map(item => {
            const result = this.validate(table.slice(0, -1), item);
            if (!result.valid) {
              console.warn(`[Storage] Invalid ${table} item:`, result.errors);
            }
            return result.sanitized;
          })
          .filter(item => item !== null);
      });

      // Sanitize values
      sanitized.values = {
        xpPoints: parseInt(data.values?.xpPoints) || 0,
        profileName: String(data.values?.profileName || ''),
        profileDesc: String(data.values?.profileDesc || ''),
        uiTheme: ['light', 'dark'].includes(data.values?.uiTheme) ? data.values.uiTheme : 'light',
        primaryGroupId: data.values?.primaryGroupId || null
      };

      return sanitized;
    }

    /**
     * Create empty database structure
     * @returns {Object} Empty database
     */
    createEmpty() {
      return {
        schemaVersion: this.schemaVersion,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tables: {
          groups: [],
          games: [],
          creations: []
        },
        values: {
          xpPoints: 0,
          profileName: '',
          profileDesc: '',
          uiTheme: 'light',
          primaryGroupId: null
        }
      };
    }

    /**
     * Migrate data from old schema version
     * @param {Object} oldData - Old data
     * @returns {Object} Migrated data
     */
    migrate(oldData) {
      console.log(`[Storage] Migrating from v${oldData.schemaVersion} to v${this.schemaVersion}`);
      
      let data = { ...oldData };
      const fromVersion = oldData.schemaVersion || 1;

      // Apply migrations sequentially
      for (let v = fromVersion; v < this.schemaVersion; v++) {
        const migrationKey = `${v}->${v + 1}`;
        const migrator = this.migrations.get(migrationKey);
        
        if (migrator) {
          try {
            data = migrator(data);
            data.schemaVersion = v + 1;
          } catch (err) {
            console.error(`[Storage] Migration ${migrationKey} failed:`, err);
            break;
          }
        }
      }

      // Save migrated data
      this.save(data);
      return data;
    }

    /**
     * Recover from corrupted storage
     * @returns {Object} Recovered or empty database
     */
    recover() {
      console.warn('[Storage] Attempting recovery from backup...');
      
      try {
        const backup = this.storage.getItem(this.backupKey);
        if (backup) {
          const data = JSON.parse(backup);
          console.log('[Storage] Recovered from backup');
          return this.sanitize(data);
        }
      } catch (err) {
        console.error('[Storage] Backup recovery failed:', err);
      }

      console.warn('[Storage] Creating new empty database');
      return this.createEmpty();
    }

    /**
     * Handle quota exceeded error
     */
    handleQuotaExceeded() {
      console.error('[Storage] Storage quota exceeded');
      
      // Try to free up space by removing old backups
      try {
        this.storage.removeItem(this.backupKey);
        console.log('[Storage] Removed backup to free space');
      } catch (err) {
        console.error('[Storage] Could not free space:', err);
      }
    }

    /**
     * Export data as JSON
     * @returns {string} JSON string
     */
    export() {
      const data = this.load();
      return JSON.stringify(data, null, 2);
    }

    /**
     * Import data from JSON
     * @param {string} json - JSON string
     * @returns {boolean} Success status
     */
    import(json) {
      try {
        const data = JSON.parse(json);
        return this.save(data);
      } catch (err) {
        console.error('[Storage] Import failed:', err);
        return false;
      }
    }

    /**
     * Clear all data
     */
    clear() {
      this.storage.removeItem(this.storageKey);
      this.storage.removeItem(this.backupKey);
    }

    /**
     * Get storage size estimate
     * @returns {Object} { used: number, available: number }
     */
    getSize() {
      try {
        const data = this.storage.getItem(this.storageKey);
        const backup = this.storage.getItem(this.backupKey);
        
        const used = (data?.length || 0) + (backup?.length || 0);
        const available = 5 * 1024 * 1024; // 5MB typical limit
        
        return { used, available, percentage: (used / available) * 100 };
      } catch (err) {
        return { used: 0, available: 0, percentage: 0 };
      }
    }
  }

  // Create singleton instance
  const storage = new StorageManager();

  // Register validators
  storage.registerValidator('group', (entity) => {
    const errors = [];
    const sanitized = {
      id: entity.id || '',
      name: String(entity.name || 'Unnamed'),
      description: String(entity.description || ''),
      type: ['public', 'private'].includes(entity.type) ? entity.type : 'public',
      timestamp: entity.timestamp || Date.now(),
      status: ['active', 'deleted', 'burned'].includes(entity.status) ? entity.status : 'active',
      liked: !!entity.liked,
      followed: !!entity.followed
    };

    if (!sanitized.id) errors.push('Missing id');
    if (!sanitized.name) errors.push('Missing name');

    return { valid: errors.length === 0, errors, sanitized };
  });

  storage.registerValidator('game', (entity) => {
    const errors = [];
    const sanitized = {
      id: entity.id || '',
      name: String(entity.name || 'Unnamed'),
      description: String(entity.description || ''),
      hostGroupId: entity.hostGroupId || null,
      hostGroupName: String(entity.hostGroupName || ''),
      startTime: typeof entity.startTime === 'number' ? entity.startTime : Date.now(),
      endTime: entity.endTime === null || typeof entity.endTime === 'number' ? entity.endTime : null,
      createdAt: typeof entity.createdAt === 'number' ? entity.createdAt : Date.now(),
      status: ['active', 'deleted', 'burned', 'finished'].includes(entity.status) ? entity.status : 'active',
      liked: !!entity.liked,
      followed: !!entity.followed
    };

    if (!sanitized.id) errors.push('Missing id');
    if (!sanitized.name) errors.push('Missing name');
    if (sanitized.endTime && sanitized.endTime <= sanitized.startTime) {
      errors.push('End time must be after start time');
    }

    return { valid: errors.length === 0, errors, sanitized };
  });

  storage.registerValidator('creation', (entity) => {
    const errors = [];
    const sanitized = {
      id: entity.id || '',
      name: String(entity.name || 'Unnamed'),
      description: String(entity.description || ''),
      devices: String(entity.devices || ''),
      tags: String(entity.tags || ''),
      dateMade: String(entity.dateMade || ''),
      hostGameId: entity.hostGameId || null,
      timestamp: typeof entity.timestamp === 'number' ? entity.timestamp : Date.now(),
      status: ['active', 'deleted', 'burned'].includes(entity.status) ? entity.status : null,
      liked: !!entity.liked,
      followed: !!entity.followed
    };

    if (!sanitized.id) errors.push('Missing id');

    return { valid: errors.length === 0, errors, sanitized };
  });

  // Register migrations
  storage.registerMigration(1, 2, (data) => {
    // Example migration: add 'finished' status support for games
    if (data.tables?.games) {
      data.tables.games = data.tables.games.map(game => {
        if (game.endTime && Date.now() > game.endTime && game.status === 'active') {
          return { ...game, status: 'finished' };
        }
        return game;
      });
    }
    return data;
  });

  // Expose globally
  window.STORAGE = storage;
})();
