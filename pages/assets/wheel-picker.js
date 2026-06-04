/**
 * ESHU Wheel Date/Time Picker
 * A mobile-style scrollable wheel picker for date and time selection
 */
(function() {
  'use strict';

  const WHEEL_PICKER = {
    _overlay: null,
    _container: null,
    _callback: null,
    _currentValue: null,
    _wheels: {},
    _isOpen: false,

    /**
     * Initialize the picker overlay (called once)
     */
    _ensureOverlay() {
      if (this._overlay) return;

      this._overlay = document.createElement('div');
      this._overlay.className = 'wheel-picker-overlay';
      this._overlay.innerHTML = `
        <div class="wheel-picker-container">
          <div class="wheel-picker-header">
            <button type="button" class="wheel-picker-cancel">Cancel</button>
            <span class="wheel-picker-title">Select Date & Time</span>
            <button type="button" class="wheel-picker-confirm">Done</button>
          </div>
          <div class="wheel-picker-body">
            <div class="wheel-picker-wheels">
              <div class="wheel-column" data-type="month">
                <div class="wheel-scroll"></div>
              </div>
              <div class="wheel-column" data-type="day">
                <div class="wheel-scroll"></div>
              </div>
              <div class="wheel-column" data-type="year">
                <div class="wheel-scroll"></div>
              </div>
              <div class="wheel-column" data-type="hour">
                <div class="wheel-scroll"></div>
              </div>
              <div class="wheel-column wheel-separator">:</div>
              <div class="wheel-column" data-type="minute">
                <div class="wheel-scroll"></div>
              </div>
            </div>
            <div class="wheel-picker-highlight"></div>
          </div>
        </div>
      `;

      // Add styles
      this._injectStyles();

      // Event listeners
      this._overlay.querySelector('.wheel-picker-cancel').addEventListener('click', () => this.close());
      this._overlay.querySelector('.wheel-picker-confirm').addEventListener('click', () => this._confirm());
      this._overlay.addEventListener('click', (e) => {
        if (e.target === this._overlay) this.close();
      });

      document.body.appendChild(this._overlay);
      this._container = this._overlay.querySelector('.wheel-picker-container');
    },

    _injectStyles() {
      if (document.getElementById('wheel-picker-styles')) return;

      const style = document.createElement('style');
      style.id = 'wheel-picker-styles';
      style.textContent = `
        .wheel-picker-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          z-index: 10000;
          justify-content: center;
          align-items: flex-end;
          backdrop-filter: blur(2px);
        }
        .wheel-picker-overlay.open {
          display: flex;
        }
        .wheel-picker-container {
          background: var(--bg-panel, #fff);
          border-radius: 16px 16px 0 0;
          width: 100%;
          max-width: 420px;
          animation: wheelPickerSlideUp 0.25s ease-out;
          box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
        }
        @keyframes wheelPickerSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .wheel-picker-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-light, #e5e5e5);
        }
        .wheel-picker-title {
          font-weight: 600;
          font-size: 15px;
          color: var(--text-primary, #333);
        }
        .wheel-picker-cancel,
        .wheel-picker-confirm {
          background: none;
          border: none;
          font-size: 15px;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 8px;
          transition: background 0.15s;
        }
        .wheel-picker-cancel {
          color: var(--text-secondary, #666);
        }
        .wheel-picker-cancel:hover {
          background: var(--hover-bg, #f0f0f0);
        }
        .wheel-picker-confirm {
          color: var(--accent-black, #111111);
          font-weight: 600;
        }
        .wheel-picker-confirm:hover {
          background: rgba(34, 197, 94, 0.1);
        }
        .wheel-picker-body {
          position: relative;
          height: 200px;
          overflow: hidden;
        }
        .wheel-picker-wheels {
          display: flex;
          justify-content: center;
          align-items: stretch;
          height: 100%;
          gap: 4px;
          padding: 0 16px;
        }
        .wheel-column {
          flex: 1;
          max-width: 80px;
          position: relative;
          overflow: hidden;
        }
        .wheel-column[data-type="year"] {
          max-width: 70px;
        }
        .wheel-column[data-type="hour"],
        .wheel-column[data-type="minute"] {
          max-width: 50px;
        }
        .wheel-column.wheel-separator {
          flex: 0 0 auto;
          max-width: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary, #333);
        }
        .wheel-scroll {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          transition: transform 0.1s ease-out;
        }
        .wheel-item {
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          color: var(--text-muted, #999);
          cursor: pointer;
          user-select: none;
          transition: all 0.15s;
        }
        .wheel-item.selected {
          color: var(--text-primary, #333);
          font-weight: 600;
          font-size: 18px;
        }
        .wheel-picker-highlight {
          position: absolute;
          top: 50%;
          left: 16px;
          right: 16px;
          height: 40px;
          transform: translateY(-50%);
          border-top: 1px solid var(--border-color, #ddd);
          border-bottom: 1px solid var(--border-color, #ddd);
          pointer-events: none;
          background: var(--hover-bg, rgba(0,0,0,0.03));
          border-radius: 8px;
        }

        /* Dark theme support */
        html[data-theme="dark"] .wheel-picker-container {
          background: var(--bg-panel, #1a1a1a);
        }
        html[data-theme="dark"] .wheel-picker-highlight {
          background: rgba(255,255,255,0.05);
        }
      `;
      document.head.appendChild(style);
    },

    /**
     * Populate a wheel column with items
     */
    _populateWheel(type, items, selectedValue) {
      const column = this._overlay.querySelector(`.wheel-column[data-type="${type}"]`);
      if (!column) return;

      const scroll = column.querySelector('.wheel-scroll');
      scroll.innerHTML = '';

      // Add padding items for scroll effect
      const paddingCount = 2;
      for (let i = 0; i < paddingCount; i++) {
        const pad = document.createElement('div');
        pad.className = 'wheel-item wheel-padding';
        scroll.appendChild(pad);
      }

      items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'wheel-item';
        div.textContent = item.label;
        div.dataset.value = item.value;
        div.dataset.index = idx;
        if (item.value == selectedValue) {
          div.classList.add('selected');
        }
        scroll.appendChild(div);
      });

      for (let i = 0; i < paddingCount; i++) {
        const pad = document.createElement('div');
        pad.className = 'wheel-item wheel-padding';
        scroll.appendChild(pad);
      }

      // Store wheel data
      this._wheels[type] = {
        column,
        scroll,
        items,
        selectedIndex: items.findIndex(i => i.value == selectedValue) || 0
      };

      // Set initial position
      this._scrollToIndex(type, this._wheels[type].selectedIndex, false);

      // Add touch/mouse handlers
      this._attachWheelHandlers(type);
    },

    _scrollToIndex(type, index, animate = true) {
      const wheel = this._wheels[type];
      if (!wheel) return;

      const itemHeight = 40;
      const containerHeight = 200;
      const centerOffset = (containerHeight / 2) - (itemHeight / 2);
      const paddingOffset = 2 * itemHeight;
      const offset = centerOffset - (index * itemHeight) - paddingOffset;

      wheel.scroll.style.transition = animate ? 'transform 0.2s ease-out' : 'none';
      wheel.scroll.style.transform = `translateY(${offset}px)`;
      wheel.selectedIndex = index;

      // Update selected class
      wheel.scroll.querySelectorAll('.wheel-item').forEach((item, i) => {
        if (item.classList.contains('wheel-padding')) return;
        const realIndex = i - 2; // account for padding
        item.classList.toggle('selected', realIndex === index);
      });

      // Update days if month/year changed
      if (type === 'month' || type === 'year') {
        this._updateDaysInMonth();
      }
    },

    _attachWheelHandlers(type) {
      const wheel = this._wheels[type];
      if (!wheel) return;

      let startY = 0;
      let startOffset = 0;
      let isDragging = false;
      let velocity = 0;
      let lastY = 0;
      let lastTime = 0;

      const getOffset = () => {
        const transform = wheel.scroll.style.transform;
        const match = transform.match(/translateY\(([^)]+)px\)/);
        return match ? parseFloat(match[1]) : 0;
      };

      const onStart = (e) => {
        isDragging = true;
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        startOffset = getOffset();
        lastY = startY;
        lastTime = Date.now();
        velocity = 0;
        wheel.scroll.style.transition = 'none';
      };

      const onMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = currentY - startY;
        const newOffset = startOffset + deltaY;

        wheel.scroll.style.transform = `translateY(${newOffset}px)`;

        // Calculate velocity
        const now = Date.now();
        const dt = now - lastTime;
        if (dt > 0) {
          velocity = (currentY - lastY) / dt;
        }
        lastY = currentY;
        lastTime = now;
      };

      const onEnd = () => {
        if (!isDragging) return;
        isDragging = false;

        const itemHeight = 40;
        const containerHeight = 200;
        const centerOffset = (containerHeight / 2) - (itemHeight / 2);
        const paddingOffset = 2 * itemHeight;

        let currentOffset = getOffset();

        // Apply momentum
        currentOffset += velocity * 100;

        // Calculate nearest index
        const rawIndex = Math.round((centerOffset - currentOffset - paddingOffset) / itemHeight);
        const clampedIndex = Math.max(0, Math.min(wheel.items.length - 1, rawIndex));

        this._scrollToIndex(type, clampedIndex, true);
      };

      // Touch events
      wheel.column.addEventListener('touchstart', onStart, { passive: true });
      wheel.column.addEventListener('touchmove', onMove, { passive: false });
      wheel.column.addEventListener('touchend', onEnd);

      // Mouse events
      wheel.column.addEventListener('mousedown', onStart);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);

      // Click to select
      wheel.column.addEventListener('click', (e) => {
        const item = e.target.closest('.wheel-item:not(.wheel-padding)');
        if (item && item.dataset.index !== undefined) {
          this._scrollToIndex(type, parseInt(item.dataset.index), true);
        }
      });
    },

    _updateDaysInMonth() {
      const monthWheel = this._wheels.month;
      const yearWheel = this._wheels.year;
      const dayWheel = this._wheels.day;

      if (!monthWheel || !yearWheel || !dayWheel) return;

      const month = monthWheel.items[monthWheel.selectedIndex]?.value || 1;
      const year = yearWheel.items[yearWheel.selectedIndex]?.value || new Date().getFullYear();
      const daysInMonth = new Date(year, month, 0).getDate();

      const currentDay = dayWheel.items[dayWheel.selectedIndex]?.value || 1;
      const days = [];
      for (let d = 1; d <= daysInMonth; d++) {
        days.push({ value: d, label: d.toString().padStart(2, '0') });
      }

      // Only repopulate if days changed
      if (dayWheel.items.length !== days.length) {
        const newSelectedDay = Math.min(currentDay, daysInMonth);
        this._populateWheel('day', days, newSelectedDay);
      }
    },

    _getSelectedValue() {
      const year = this._wheels.year?.items[this._wheels.year.selectedIndex]?.value;
      const month = this._wheels.month?.items[this._wheels.month.selectedIndex]?.value;
      const day = this._wheels.day?.items[this._wheels.day.selectedIndex]?.value;
      const hour = this._wheels.hour?.items[this._wheels.hour.selectedIndex]?.value;
      const minute = this._wheels.minute?.items[this._wheels.minute.selectedIndex]?.value;

      if (year === undefined || month === undefined || day === undefined) return null;

      return new Date(year, month - 1, day, hour || 0, minute || 0);
    },

    _confirm() {
      const value = this._getSelectedValue();
      if (value && this._callback) {
        this._callback(value);
      }
      this.close();
    },

    /**
     * Open the picker
     * @param {Date|null} initialValue - Initial date/time value
     * @param {Function} callback - Called with selected Date on confirm
     * @param {Object} options - { title, allowEmpty }
     */
    open(initialValue, callback, options = {}) {
      this._ensureOverlay();

      const date = initialValue instanceof Date && !isNaN(initialValue) ? initialValue : new Date();
      this._callback = callback;
      this._currentValue = date;

      // Set title
      const title = options.title || 'Select Date & Time';
      this._overlay.querySelector('.wheel-picker-title').textContent = title;

      // Populate wheels
      const months = [
        { value: 1, label: 'Jan' }, { value: 2, label: 'Feb' }, { value: 3, label: 'Mar' },
        { value: 4, label: 'Apr' }, { value: 5, label: 'May' }, { value: 6, label: 'Jun' },
        { value: 7, label: 'Jul' }, { value: 8, label: 'Aug' }, { value: 9, label: 'Sep' },
        { value: 10, label: 'Oct' }, { value: 11, label: 'Nov' }, { value: 12, label: 'Dec' }
      ];

      const currentYear = new Date().getFullYear();
      const years = [];
      for (let y = currentYear; y <= currentYear + 5; y++) {
        years.push({ value: y, label: y.toString() });
      }

      const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const days = [];
      for (let d = 1; d <= daysInMonth; d++) {
        days.push({ value: d, label: d.toString().padStart(2, '0') });
      }

      const hours = [];
      for (let h = 0; h < 24; h++) {
        hours.push({ value: h, label: h.toString().padStart(2, '0') });
      }

      const minutes = [];
      for (let m = 0; m < 60; m += 5) {
        minutes.push({ value: m, label: m.toString().padStart(2, '0') });
      }

      this._populateWheel('month', months, date.getMonth() + 1);
      this._populateWheel('day', days, date.getDate());
      this._populateWheel('year', years, date.getFullYear());
      this._populateWheel('hour', hours, date.getHours());
      this._populateWheel('minute', minutes, Math.floor(date.getMinutes() / 5) * 5);

      this._overlay.classList.add('open');
      this._isOpen = true;
    },

    close() {
      if (this._overlay) {
        this._overlay.classList.remove('open');
      }
      this._isOpen = false;
      this._callback = null;
      this._wheels = {};
    },

    isOpen() {
      return this._isOpen;
    }
  };

  // Expose globally
  window.WHEEL_PICKER = WHEEL_PICKER;
})();
