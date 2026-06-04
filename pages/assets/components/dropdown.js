/**
 * Enhanced Searchable Dropdown Component
 * Reusable dropdown with search, keyboard navigation, and accessibility
 */
(function() {
  'use strict';

  class Dropdown {
    constructor(options = {}) {
      this.container = options.container;
      this.options = options.options || [];
      this.value = options.value || '';
      this.placeholder = options.placeholder || 'Select...';
      this.searchPlaceholder = options.searchPlaceholder || 'Type to search...';
      this.onChange = options.onChange || (() => {});
      this.onSearch = options.onSearch || null;
      this.allowClear = options.allowClear !== false;
      this.searchable = options.searchable !== false;
      this.disabled = options.disabled || false;
      
      this.isOpen = false;
      this.highlightedIndex = -1;
      this.filteredOptions = [...this.options];
      
      this.elements = {};
      this.render();
      this.attachEvents();
    }

    render() {
      if (!this.container) return;

      this.container.innerHTML = '';
      this.container.className = 'dropdown-wrapper';

      // Hidden input for form submission
      this.elements.hidden = document.createElement('input');
      this.elements.hidden.type = 'hidden';
      this.elements.hidden.value = this.value;

      // Display input
      this.elements.input = document.createElement('input');
      this.elements.input.type = 'text';
      this.elements.input.className = 'dropdown-input';
      this.elements.input.placeholder = this.placeholder;
      this.elements.input.readOnly = !this.searchable;
      this.elements.input.disabled = this.disabled;
      this.elements.input.setAttribute('role', 'combobox');
      this.elements.input.setAttribute('aria-expanded', 'false');
      this.elements.input.setAttribute('aria-haspopup', 'listbox');
      this.elements.input.setAttribute('aria-autocomplete', 'list');

      // Set initial display value
      const selectedOption = this.options.find(opt => opt.value === this.value);
      if (selectedOption) {
        this.elements.input.value = selectedOption.label;
      }

      // Clear button
      if (this.allowClear && this.value) {
        this.elements.clearBtn = document.createElement('button');
        this.elements.clearBtn.type = 'button';
        this.elements.clearBtn.className = 'dropdown-clear';
        this.elements.clearBtn.innerHTML = '×';
        this.elements.clearBtn.setAttribute('aria-label', 'Clear selection');
        this.elements.clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.clear();
        });
      }

      // Dropdown arrow
      this.elements.arrow = document.createElement('span');
      this.elements.arrow.className = 'dropdown-arrow';
      this.elements.arrow.innerHTML = '▼';

      // Options list
      this.elements.list = document.createElement('div');
      this.elements.list.className = 'dropdown-list';
      this.elements.list.setAttribute('role', 'listbox');
      this.elements.list.style.display = 'none';

      // Assemble
      const inputWrapper = document.createElement('div');
      inputWrapper.className = 'dropdown-input-wrapper';
      inputWrapper.appendChild(this.elements.input);
      if (this.elements.clearBtn) inputWrapper.appendChild(this.elements.clearBtn);
      inputWrapper.appendChild(this.elements.arrow);

      this.container.appendChild(this.elements.hidden);
      this.container.appendChild(inputWrapper);
      this.container.appendChild(this.elements.list);

      this.renderOptions();
      this.injectStyles();
    }

    renderOptions(filter = '') {
      this.elements.list.innerHTML = '';

      // Filter options
      if (filter && this.onSearch) {
        this.filteredOptions = this.onSearch(filter);
      } else if (filter) {
        const lowerFilter = filter.toLowerCase();
        this.filteredOptions = this.options.filter(opt => 
          opt.label.toLowerCase().includes(lowerFilter)
        );
      } else {
        this.filteredOptions = [...this.options];
      }

      if (this.filteredOptions.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'dropdown-empty';
        empty.textContent = 'No options found';
        this.elements.list.appendChild(empty);
        return;
      }

      this.filteredOptions.forEach((opt, index) => {
        const item = document.createElement('div');
        item.className = 'dropdown-option';
        item.dataset.value = opt.value;
        item.dataset.index = index;
        item.textContent = opt.label;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', opt.value === this.value ? 'true' : 'false');

        if (opt.value === this.value) {
          item.classList.add('selected');
        }

        if (index === this.highlightedIndex) {
          item.classList.add('highlighted');
        }

        item.addEventListener('click', () => {
          this.select(opt.value, opt.label);
        });

        this.elements.list.appendChild(item);
      });
    }

    attachEvents() {
      // Input click - toggle dropdown
      this.elements.input.addEventListener('click', () => {
        if (!this.disabled) {
          this.toggle();
        }
      });

      // Input focus - open dropdown
      this.elements.input.addEventListener('focus', () => {
        if (!this.disabled && this.searchable) {
          this.open();
        }
      });

      // Input typing - filter options
      if (this.searchable) {
        this.elements.input.addEventListener('input', UTILS.debounce(() => {
          const query = this.elements.input.value;
          this.renderOptions(query);
          this.highlightedIndex = -1;
          if (!this.isOpen) this.open();
        }, 200));
      }

      // Keyboard navigation
      this.elements.input.addEventListener('keydown', (e) => {
        if (this.disabled) return;

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            if (!this.isOpen) {
              this.open();
            } else {
              this.highlightNext();
            }
            break;

          case 'ArrowUp':
            e.preventDefault();
            if (this.isOpen) {
              this.highlightPrevious();
            }
            break;

          case 'Enter':
            e.preventDefault();
            if (this.isOpen && this.highlightedIndex >= 0) {
              const opt = this.filteredOptions[this.highlightedIndex];
              if (opt) this.select(opt.value, opt.label);
            } else if (!this.isOpen) {
              this.open();
            }
            break;

          case 'Escape':
            e.preventDefault();
            this.close();
            break;

          case 'Tab':
            if (this.isOpen) {
              this.close();
            }
            break;
        }
      });

      // Click outside to close
      document.addEventListener('click', (e) => {
        if (!this.container.contains(e.target)) {
          this.close();
        }
      });
    }

    open() {
      if (this.isOpen || this.disabled) return;

      this.isOpen = true;
      this.elements.list.style.display = 'block';
      this.elements.input.setAttribute('aria-expanded', 'true');
      this.container.classList.add('dropdown-open');
      
      // Reset filter if searchable
      if (this.searchable && this.elements.input.value) {
        this.elements.input.select();
      }
    }

    close() {
      if (!this.isOpen) return;

      this.isOpen = false;
      this.elements.list.style.display = 'none';
      this.elements.input.setAttribute('aria-expanded', 'false');
      this.container.classList.remove('dropdown-open');
      this.highlightedIndex = -1;

      // Restore selected value display
      const selectedOption = this.options.find(opt => opt.value === this.value);
      if (selectedOption) {
        this.elements.input.value = selectedOption.label;
      } else if (this.searchable) {
        this.elements.input.value = '';
      }

      this.renderOptions();
    }

    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    select(value, label) {
      this.value = value;
      this.elements.hidden.value = value;
      this.elements.input.value = label;
      
      // Update selected state
      this.elements.list.querySelectorAll('.dropdown-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === value);
        opt.setAttribute('aria-selected', opt.dataset.value === value ? 'true' : 'false');
      });

      // Show/hide clear button
      if (this.allowClear) {
        if (value && !this.elements.clearBtn) {
          this.render();
        } else if (!value && this.elements.clearBtn) {
          this.render();
        }
      }

      this.close();
      this.onChange(value, label);
    }

    clear() {
      this.select('', '');
    }

    highlightNext() {
      if (this.filteredOptions.length === 0) return;

      this.highlightedIndex = (this.highlightedIndex + 1) % this.filteredOptions.length;
      this.updateHighlight();
    }

    highlightPrevious() {
      if (this.filteredOptions.length === 0) return;

      this.highlightedIndex = this.highlightedIndex <= 0 
        ? this.filteredOptions.length - 1 
        : this.highlightedIndex - 1;
      this.updateHighlight();
    }

    updateHighlight() {
      this.elements.list.querySelectorAll('.dropdown-option').forEach((opt, index) => {
        opt.classList.toggle('highlighted', index === this.highlightedIndex);
      });

      // Scroll highlighted option into view
      const highlighted = this.elements.list.querySelector('.dropdown-option.highlighted');
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' });
      }
    }

    setOptions(options) {
      this.options = options;
      this.filteredOptions = [...options];
      this.renderOptions();
    }

    setValue(value) {
      const option = this.options.find(opt => opt.value === value);
      if (option) {
        this.select(value, option.label);
      }
    }

    disable() {
      this.disabled = true;
      this.elements.input.disabled = true;
      this.close();
    }

    enable() {
      this.disabled = false;
      this.elements.input.disabled = false;
    }

    destroy() {
      this.container.innerHTML = '';
    }

    injectStyles() {
      if (document.getElementById('dropdown-styles')) return;

      const style = document.createElement('style');
      style.id = 'dropdown-styles';
      style.textContent = `
        .dropdown-wrapper {
          position: relative;
          width: 100%;
        }

        .dropdown-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .dropdown-input {
          width: 100%;
          padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
          padding-right: 60px;
          background: var(--bg-input, #fff);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: var(--radius-md, 8px);
          color: var(--text-primary, #111827);
          font-size: var(--font-size-sm, 14px);
          cursor: pointer;
          transition: all 0.15s;
        }

        .dropdown-input:focus {
          outline: none;
          border-color: var(--color-accent-black, #111111);
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
        }

        .dropdown-input:disabled {
          background: var(--bg-secondary, #f3f4f6);
          cursor: not-allowed;
          opacity: 0.6;
        }

        .dropdown-input[readonly] {
          cursor: pointer;
        }

        .dropdown-clear {
          position: absolute;
          right: 32px;
          background: none;
          border: none;
          color: var(--text-muted, #9ca3af);
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 4px;
          border-radius: var(--radius-sm, 4px);
          transition: all 0.15s;
        }

        .dropdown-clear:hover {
          color: var(--text-primary, #111827);
          background: var(--hover-bg, rgba(0,0,0,0.05));
        }

        .dropdown-arrow {
          position: absolute;
          right: 12px;
          color: var(--text-muted, #9ca3af);
          font-size: 10px;
          pointer-events: none;
          transition: transform 0.2s;
        }

        .dropdown-open .dropdown-arrow {
          transform: rotate(180deg);
        }

        .dropdown-list {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          max-height: 250px;
          overflow-y: auto;
          background: var(--bg-panel, #fff);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: var(--radius-md, 8px);
          box-shadow: var(--shadow-lg);
          z-index: var(--z-dropdown, 100);
          animation: dropdownSlideIn 0.2s ease;
        }

        @keyframes dropdownSlideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dropdown-option {
          padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
          cursor: pointer;
          color: var(--text-primary, #111827);
          font-size: var(--font-size-sm, 14px);
          transition: background 0.1s;
        }

        .dropdown-option:hover,
        .dropdown-option.highlighted {
          background: var(--hover-bg, rgba(0,0,0,0.05));
        }

        .dropdown-option.selected {
          background: var(--color-accent-black, #111111);
          color: white;
        }

        .dropdown-option.selected:hover {
          background: var(--color-accent-black-dark, #333333);
        }

        .dropdown-empty {
          padding: var(--spacing-md, 16px);
          text-align: center;
          color: var(--text-muted, #9ca3af);
          font-size: var(--font-size-sm, 14px);
          font-style: italic;
        }

        /* Dark theme */
        html[data-theme="dark"] .dropdown-input {
          background: var(--bg-input, #2a2a2a);
          border-color: var(--border-color, #3a3a3a);
          color: var(--text-primary, #fff);
        }

        html[data-theme="dark"] .dropdown-list {
          background: var(--bg-panel, #1a1a1a);
          border-color: var(--border-color, #3a3a3a);
        }

        html[data-theme="dark"] .dropdown-option {
          color: var(--text-primary, #fff);
        }

        /* Scrollbar styling */
        .dropdown-list::-webkit-scrollbar {
          width: 8px;
        }

        .dropdown-list::-webkit-scrollbar-track {
          background: var(--bg-secondary, #f3f4f6);
        }

        .dropdown-list::-webkit-scrollbar-thumb {
          background: var(--border-color, #e5e7eb);
          border-radius: 4px;
        }

        .dropdown-list::-webkit-scrollbar-thumb:hover {
          background: var(--border-dark, #d1d5db);
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Expose globally
  window.Dropdown = Dropdown;
})();
