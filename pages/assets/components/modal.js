/**
 * Modal Component
 * Reusable modal dialogs with accessibility and animations
 */
(function() {
  'use strict';

  class Modal {
    constructor(options = {}) {
      this.id = options.id || `modal-${Date.now()}`;
      this.title = options.title || '';
      this.content = options.content || '';
      this.size = options.size || 'md'; // sm, md, lg, xl
      this.closeOnBackdrop = options.closeOnBackdrop !== false;
      this.closeOnEscape = options.closeOnEscape !== false;
      this.showClose = options.showClose !== false;
      this.buttons = options.buttons || [];
      this.onOpen = options.onOpen || (() => {});
      this.onClose = options.onClose || (() => {});
      this.container = null;
      this.backdrop = null;
      this.focusedElementBeforeModal = null;
    }

    open() {
      if (this.container) {
        this.container.classList.add('modal-open');
        return;
      }

      this.focusedElementBeforeModal = document.activeElement;
      this.render();
      this.attachEvents();
      
      // Trigger animation
      requestAnimationFrame(() => {
        this.backdrop.classList.add('modal-backdrop-open');
        this.container.classList.add('modal-open');
      });

      // Trap focus
      this.trapFocus();
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      this.onOpen();
    }

    close() {
      this.backdrop.classList.remove('modal-backdrop-open');
      this.container.classList.remove('modal-open');

      setTimeout(() => {
        if (this.backdrop && this.backdrop.parentNode) {
          this.backdrop.parentNode.removeChild(this.backdrop);
        }
        this.backdrop = null;
        this.container = null;
        
        // Restore body scroll
        document.body.style.overflow = '';
        
        // Restore focus
        if (this.focusedElementBeforeModal) {
          this.focusedElementBeforeModal.focus();
        }
        
        this.onClose();
      }, 300);
    }

    render() {
      // Create backdrop
      this.backdrop = document.createElement('div');
      this.backdrop.className = 'modal-backdrop';
      this.backdrop.setAttribute('aria-hidden', 'true');

      // Create modal container
      this.container = document.createElement('div');
      this.container.className = `modal-container modal-${this.size}`;
      this.container.setAttribute('role', 'dialog');
      this.container.setAttribute('aria-modal', 'true');
      this.container.setAttribute('aria-labelledby', `${this.id}-title`);

      // Modal content
      const modal = document.createElement('div');
      modal.className = 'modal-inner';

      // Header
      if (this.title || this.showClose) {
        const header = document.createElement('div');
        header.className = 'modal-header';
        
        if (this.title) {
          const title = document.createElement('h2');
          title.id = `${this.id}-title`;
          title.className = 'modal-title';
          title.textContent = this.title;
          header.appendChild(title);
        }

        if (this.showClose) {
          const closeBtn = document.createElement('button');
          closeBtn.className = 'modal-close';
          closeBtn.setAttribute('aria-label', 'Close modal');
          closeBtn.innerHTML = '×';
          closeBtn.addEventListener('click', () => this.close());
          header.appendChild(closeBtn);
        }

        modal.appendChild(header);
      }

      // Body
      const body = document.createElement('div');
      body.className = 'modal-body';
      
      if (typeof this.content === 'string') {
        body.innerHTML = this.content;
      } else if (this.content instanceof HTMLElement) {
        body.appendChild(this.content);
      }
      
      modal.appendChild(body);

      // Footer with buttons
      if (this.buttons.length > 0) {
        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        this.buttons.forEach(btn => {
          const button = document.createElement('button');
          button.className = `modal-btn ${btn.className || ''}`;
          button.textContent = btn.label;
          button.addEventListener('click', () => {
            if (btn.onClick) btn.onClick();
            if (btn.closeOnClick !== false) this.close();
          });
          footer.appendChild(button);
        });

        modal.appendChild(footer);
      }

      this.container.appendChild(modal);
      this.backdrop.appendChild(this.container);
      document.body.appendChild(this.backdrop);

      this.injectStyles();
    }

    attachEvents() {
      // Close on backdrop click
      if (this.closeOnBackdrop) {
        this.backdrop.addEventListener('click', (e) => {
          if (e.target === this.backdrop || e.target === this.container) {
            this.close();
          }
        });
      }

      // Close on Escape key
      if (this.closeOnEscape) {
        this.escapeHandler = (e) => {
          if (e.key === 'Escape') {
            this.close();
          }
        };
        document.addEventListener('keydown', this.escapeHandler);
      }
    }

    trapFocus() {
      const focusableElements = this.container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      firstElement.focus();

      this.tabHandler = (e) => {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      };

      this.container.addEventListener('keydown', this.tabHandler);
    }

    injectStyles() {
      if (document.getElementById('modal-styles')) return;

      const style = document.createElement('style');
      style.id = 'modal-styles';
      style.textContent = `
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: var(--z-modal-backdrop, 400);
          transition: background 0.3s ease;
          padding: var(--spacing-lg, 24px);
        }

        .modal-backdrop-open {
          background: rgba(0, 0, 0, 0.5);
        }

        .modal-container {
          background: var(--bg-panel, #fff);
          border-radius: var(--radius-lg, 12px);
          box-shadow: var(--shadow-2xl);
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          opacity: 0;
          transform: scale(0.9) translateY(-20px);
          transition: all 0.3s ease;
          z-index: var(--z-modal, 500);
        }

        .modal-container.modal-open {
          opacity: 1;
          transform: scale(1) translateY(0);
        }

        .modal-container.modal-sm { max-width: 400px; width: 100%; }
        .modal-container.modal-md { max-width: 600px; width: 100%; }
        .modal-container.modal-lg { max-width: 800px; width: 100%; }
        .modal-container.modal-xl { max-width: 1000px; width: 100%; }

        .modal-inner {
          display: flex;
          flex-direction: column;
          max-height: 90vh;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--spacing-lg, 24px);
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .modal-title {
          margin: 0;
          font-size: var(--font-size-xl, 20px);
          font-weight: var(--font-weight-semibold, 600);
          color: var(--text-primary, #111827);
        }

        .modal-close {
          width: 28px;
          height: 28px;
          min-width: 28px;
          min-height: 28px;
          padding: 0;
          border-radius: 0;
          background: var(--accent-black, #111);
          border: 1px solid var(--accent-black, #111);
          cursor: pointer;
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.15s, border-color 0.15s;
          line-height: 1;
        }

        .modal-close:hover {
          background: #333;
          border-color: #333;
        }

        .modal-body {
          padding: var(--spacing-lg, 24px);
          overflow-y: auto;
          flex: 1;
          color: var(--text-secondary, #6b7280);
        }

        .modal-footer {
          display: flex;
          gap: var(--spacing-sm, 8px);
          justify-content: flex-end;
          padding: var(--spacing-lg, 24px);
          border-top: 1px solid var(--border-color, #e5e7eb);
        }

        .modal-btn {
          padding: 10px 20px;
          border-radius: var(--radius-md, 8px);
          font-size: var(--font-size-sm, 14px);
          font-weight: var(--font-weight-semibold, 600);
          cursor: pointer;
          transition: all 0.15s;
          border: none;
        }

        .modal-btn.btn-primary {
          background: var(--color-accent-black, #111111);
          color: white;
        }

        .modal-btn.btn-primary:hover {
          background: var(--color-accent-black-dark, #333333);
        }

        .modal-btn.btn-secondary {
          background: var(--bg-secondary, #f3f4f6);
          color: var(--text-primary, #111827);
        }

        .modal-btn.btn-secondary:hover {
          background: var(--bg-tertiary, #e5e7eb);
        }

        .modal-btn.btn-danger {
          background: var(--accent-coral, #e53935);
          color: white;
        }

        .modal-btn.btn-danger:hover {
          background: var(--accent-coral-dark, #dc2626);
        }

        /* Dark theme */
        html[data-theme="dark"] .modal-container {
          background: var(--bg-panel, #1a1a1a);
        }

        html[data-theme="dark"] .modal-title {
          color: var(--text-primary, #fff);
        }

        html[data-theme="dark"] .modal-btn.btn-secondary {
          background: var(--bg-secondary, #2a2a2a);
          color: var(--text-primary, #fff);
        }

        /* Mobile responsive */
        @media (max-width: 640px) {
          .modal-backdrop {
            padding: var(--spacing-sm, 8px);
          }

          .modal-container {
            max-height: 95vh;
          }

          .modal-header,
          .modal-body,
          .modal-footer {
            padding: var(--spacing-md, 16px);
          }

          .modal-footer {
            flex-direction: column;
          }

          .modal-btn {
            width: 100%;
          }
        }

        /* Animations */
        @media (prefers-reduced-motion: reduce) {
          .modal-backdrop,
          .modal-container {
            transition: none;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Helper functions for common modals
  const ModalHelpers = {
    confirm(options = {}) {
      return new Promise((resolve) => {
        const modal = new Modal({
          title: options.title || 'Confirm',
          content: options.message || 'Are you sure?',
          size: options.size || 'sm',
          buttons: [
            {
              label: options.cancelLabel || 'Cancel',
              className: 'btn-secondary',
              onClick: () => resolve(false)
            },
            {
              label: options.confirmLabel || 'Confirm',
              className: options.danger ? 'btn-danger' : 'btn-primary',
              onClick: () => resolve(true)
            }
          ]
        });
        modal.open();
      });
    },

    alert(options = {}) {
      return new Promise((resolve) => {
        const modal = new Modal({
          title: options.title || 'Alert',
          content: options.message || '',
          size: options.size || 'sm',
          buttons: [
            {
              label: options.buttonLabel || 'OK',
              className: 'btn-primary',
              onClick: () => resolve(true)
            }
          ]
        });
        modal.open();
      });
    },

    prompt(options = {}) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'modal-input';
        input.value = options.defaultValue || '';
        input.placeholder = options.placeholder || '';
        input.style.cssText = `
          width: 100%;
          padding: 10px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: var(--font-size-sm);
          margin-top: var(--spacing-sm);
        `;

        const content = document.createElement('div');
        if (options.message) {
          const message = document.createElement('p');
          message.textContent = options.message;
          message.style.marginTop = '0';
          content.appendChild(message);
        }
        content.appendChild(input);

        const modal = new Modal({
          title: options.title || 'Input',
          content: content,
          size: options.size || 'sm',
          buttons: [
            {
              label: 'Cancel',
              className: 'btn-secondary',
              onClick: () => resolve(null)
            },
            {
              label: 'OK',
              className: 'btn-primary',
              onClick: () => resolve(input.value)
            }
          ],
          onOpen: () => input.focus()
        });
        modal.open();
      });
    }
  };

  // Expose globally
  window.Modal = Modal;
  window.MODAL = ModalHelpers;
})();
