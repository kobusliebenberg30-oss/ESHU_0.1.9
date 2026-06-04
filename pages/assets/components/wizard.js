/**
 * Multi-Step Wizard Component
 * Guides users through complex forms with validation and progress tracking
 */
(function() {
  'use strict';

  class Wizard {
    constructor(options = {}) {
      this.steps = options.steps || [];
      this.currentStepIndex = 0;
      this.data = {};
      this.onComplete = options.onComplete || (() => {});
      this.onStepChange = options.onStepChange || (() => {});
      this.container = null;
      this.allowSkip = options.allowSkip !== false;
    }

    /**
     * Render wizard into container
     * @param {HTMLElement} container - Container element
     */
    render(container) {
      this.container = container;
      this.container.innerHTML = '';
      this.container.className = 'wizard-container';

      const wizard = document.createElement('div');
      wizard.className = 'wizard';

      // Progress indicator
      wizard.appendChild(this.renderProgress());

      // Current step content
      wizard.appendChild(this.renderStep());

      // Navigation buttons
      wizard.appendChild(this.renderNavigation());

      this.container.appendChild(wizard);
      this.injectStyles();
    }

    renderProgress() {
      const progress = document.createElement('div');
      progress.className = 'wizard-progress';
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-valuenow', this.currentStepIndex + 1);
      progress.setAttribute('aria-valuemin', '1');
      progress.setAttribute('aria-valuemax', this.steps.length);

      this.steps.forEach((step, index) => {
        const stepIndicator = document.createElement('div');
        stepIndicator.className = 'wizard-step-indicator';
        
        if (index < this.currentStepIndex) {
          stepIndicator.classList.add('completed');
        } else if (index === this.currentStepIndex) {
          stepIndicator.classList.add('active');
        }

        stepIndicator.innerHTML = `
          <div class="wizard-step-number">${index + 1}</div>
          <div class="wizard-step-title">${step.title || `Step ${index + 1}`}</div>
        `;

        progress.appendChild(stepIndicator);

        // Add connector line
        if (index < this.steps.length - 1) {
          const connector = document.createElement('div');
          connector.className = 'wizard-step-connector';
          if (index < this.currentStepIndex) {
            connector.classList.add('completed');
          }
          progress.appendChild(connector);
        }
      });

      return progress;
    }

    renderStep() {
      const step = this.steps[this.currentStepIndex];
      const stepContainer = document.createElement('div');
      stepContainer.className = 'wizard-step-content';
      stepContainer.setAttribute('role', 'region');
      stepContainer.setAttribute('aria-label', step.title || `Step ${this.currentStepIndex + 1}`);

      if (step.description) {
        const desc = document.createElement('p');
        desc.className = 'wizard-step-description';
        desc.textContent = step.description;
        stepContainer.appendChild(desc);
      }

      // Render step content
      if (typeof step.render === 'function') {
        const content = step.render(this.data);
        if (content instanceof HTMLElement) {
          stepContainer.appendChild(content);
        } else if (typeof content === 'string') {
          stepContainer.innerHTML += content;
        }
      }

      return stepContainer;
    }

    renderNavigation() {
      const nav = document.createElement('div');
      nav.className = 'wizard-navigation';

      const isFirstStep = this.currentStepIndex === 0;
      const isLastStep = this.currentStepIndex === this.steps.length - 1;

      // Back button
      if (!isFirstStep) {
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'wizard-btn wizard-btn-back';
        backBtn.textContent = 'Back';
        backBtn.addEventListener('click', () => this.goBack());
        nav.appendChild(backBtn);
      }

      // Skip button
      if (this.allowSkip && !isLastStep) {
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'wizard-btn wizard-btn-skip';
        skipBtn.textContent = 'Skip';
        skipBtn.addEventListener('click', () => this.skip());
        nav.appendChild(skipBtn);
      }

      // Next/Complete button
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'wizard-btn wizard-btn-next';
      nextBtn.textContent = isLastStep ? 'Complete' : 'Next';
      nextBtn.addEventListener('click', () => this.goNext());
      nav.appendChild(nextBtn);

      return nav;
    }

    async goNext() {
      const step = this.steps[this.currentStepIndex];

      // Validate current step
      if (step.validate) {
        try {
          const isValid = await step.validate(this.data);
          if (!isValid) {
            if (window.TOAST) {
              TOAST.error('Please fix the errors before continuing', 'Validation Error');
            }
            return;
          }
        } catch (err) {
          console.error('Validation error:', err);
          if (window.TOAST) {
            TOAST.error(err.message || 'Validation failed', 'Error');
          }
          return;
        }
      }

      // Save step data
      if (step.getData) {
        const stepData = step.getData();
        this.data = { ...this.data, ...stepData };
      }

      // Check if last step
      if (this.currentStepIndex === this.steps.length - 1) {
        this.complete();
        return;
      }

      // Move to next step
      this.currentStepIndex++;
      this.onStepChange(this.currentStepIndex, this.data);
      this.render(this.container);
    }

    goBack() {
      if (this.currentStepIndex > 0) {
        this.currentStepIndex--;
        this.onStepChange(this.currentStepIndex, this.data);
        this.render(this.container);
      }
    }

    skip() {
      if (this.currentStepIndex < this.steps.length - 1) {
        this.currentStepIndex++;
        this.onStepChange(this.currentStepIndex, this.data);
        this.render(this.container);
      }
    }

    complete() {
      this.onComplete(this.data);
    }

    reset() {
      this.currentStepIndex = 0;
      this.data = {};
      if (this.container) {
        this.render(this.container);
      }
    }

    injectStyles() {
      if (document.getElementById('wizard-styles')) return;

      const style = document.createElement('style');
      style.id = 'wizard-styles';
      style.textContent = `
        .wizard-container {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
        }

        .wizard {
          background: var(--bg-panel, #fff);
          border-radius: var(--radius-lg, 12px);
          padding: var(--spacing-xl, 32px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .wizard-progress {
          display: flex;
          align-items: center;
          margin-bottom: var(--spacing-xl, 32px);
          position: relative;
        }

        .wizard-step-indicator {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          position: relative;
          z-index: 2;
        }

        .wizard-step-number {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--bg-secondary, #f3f4f6);
          border: 2px solid var(--border-color, #e5e7eb);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          color: var(--text-muted, #9ca3af);
          transition: all 0.3s;
        }

        .wizard-step-indicator.active .wizard-step-number {
          background: var(--accent-black, #111111);
          border-color: var(--accent-black, #111111);
          color: white;
        }

        .wizard-step-indicator.completed .wizard-step-number {
          background: var(--accent-black, #111111);
          border-color: var(--accent-black, #111111);
          color: white;
        }

        .wizard-step-indicator.completed .wizard-step-number::after {
          content: '✓';
          font-size: 18px;
        }

        .wizard-step-title {
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
          text-align: center;
          font-weight: 500;
        }

        .wizard-step-indicator.active .wizard-step-title {
          color: var(--text-primary, #111827);
          font-weight: 600;
        }

        .wizard-step-connector {
          flex: 1;
          height: 2px;
          background: var(--border-color, #e5e7eb);
          margin: 0 -8px;
          position: relative;
          top: -28px;
          z-index: 1;
          transition: background 0.3s;
        }

        .wizard-step-connector.completed {
          background: var(--accent-black, #111111);
        }

        .wizard-step-content {
          min-height: 300px;
          margin-bottom: var(--spacing-xl, 32px);
        }

        .wizard-step-description {
          color: var(--text-secondary, #6b7280);
          margin-bottom: var(--spacing-lg, 24px);
          font-size: 15px;
        }

        .wizard-navigation {
          display: flex;
          justify-content: space-between;
          gap: var(--spacing-md, 16px);
          padding-top: var(--spacing-lg, 24px);
          border-top: 1px solid var(--border-color, #e5e7eb);
        }

        .wizard-btn {
          padding: 12px 24px;
          border-radius: var(--radius-md, 8px);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .wizard-btn-back {
          background: var(--bg-secondary, #f3f4f6);
          color: var(--text-primary, #111827);
        }

        .wizard-btn-back:hover {
          background: var(--hover-bg, #e5e7eb);
        }

        .wizard-btn-skip {
          background: transparent;
          color: var(--text-secondary, #6b7280);
          margin-left: auto;
        }

        .wizard-btn-skip:hover {
          color: var(--text-primary, #111827);
        }

        .wizard-btn-next {
          background: var(--accent-black, #111111);
          color: white;
          margin-left: auto;
        }

        .wizard-btn-next:hover {
          background: var(--accent-black-dark, #333333);
        }

        /* Dark theme */
        html[data-theme="dark"] .wizard {
          background: var(--bg-panel, #1a1a1a);
        }

        html[data-theme="dark"] .wizard-step-number {
          background: var(--bg-secondary, #2a2a2a);
          border-color: var(--border-color, #3a3a3a);
          color: var(--text-muted, #9ca3af);
        }

        html[data-theme="dark"] .wizard-btn-back {
          background: var(--bg-secondary, #2a2a2a);
          color: var(--text-primary, #fff);
        }

        /* Mobile responsive */
        @media (max-width: 640px) {
          .wizard {
            padding: var(--spacing-lg, 24px);
          }

          .wizard-step-title {
            font-size: 11px;
          }

          .wizard-step-number {
            width: 32px;
            height: 32px;
            font-size: 14px;
          }

          .wizard-navigation {
            flex-wrap: wrap;
          }

          .wizard-btn {
            flex: 1;
            min-width: 100px;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Expose globally
  window.Wizard = Wizard;
})();
