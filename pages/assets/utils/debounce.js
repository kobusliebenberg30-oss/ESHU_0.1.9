/**
 * Performance Utilities
 * Debounce, throttle, and other optimization helpers
 */
(function() {
  'use strict';

  const Utils = {
    /**
     * Debounce function calls
     * @param {Function} fn - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(fn, delay = 300) {
      let timeoutId = null;
      
      return function debounced(...args) {
        const context = this;
        
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        timeoutId = setTimeout(() => {
          fn.apply(context, args);
          timeoutId = null;
        }, delay);
      };
    },

    /**
     * Throttle function calls
     * @param {Function} fn - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} Throttled function
     */
    throttle(fn, limit = 300) {
      let inThrottle = false;
      let lastResult;
      
      return function throttled(...args) {
        const context = this;
        
        if (!inThrottle) {
          lastResult = fn.apply(context, args);
          inThrottle = true;
          
          setTimeout(() => {
            inThrottle = false;
          }, limit);
        }
        
        return lastResult;
      };
    },

    /**
     * Request animation frame wrapper
     * @param {Function} fn - Function to call
     * @returns {Function} RAF-wrapped function
     */
    raf(fn) {
      let rafId = null;
      
      return function rafWrapped(...args) {
        const context = this;
        
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
        
        rafId = requestAnimationFrame(() => {
          fn.apply(context, args);
          rafId = null;
        });
      };
    },

    /**
     * Batch DOM updates
     * @param {Function} fn - Function with DOM updates
     */
    batchDOM(fn) {
      requestAnimationFrame(() => {
        fn();
      });
    },

    /**
     * Memoize function results
     * @param {Function} fn - Function to memoize
     * @param {Function} keyFn - Optional key generator
     * @returns {Function} Memoized function
     */
    memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
      const cache = new Map();
      
      return function memoized(...args) {
        const key = keyFn(...args);
        
        if (cache.has(key)) {
          return cache.get(key);
        }
        
        const result = fn.apply(this, args);
        cache.set(key, result);
        return result;
      };
    },

    /**
     * Create a cancelable promise
     * @param {Promise} promise - Promise to wrap
     * @returns {Object} { promise, cancel }
     */
    makeCancelable(promise) {
      let isCanceled = false;

      const wrappedPromise = new Promise((resolve, reject) => {
        promise
          .then(value => (isCanceled ? reject({ isCanceled }) : resolve(value)))
          .catch(error => (isCanceled ? reject({ isCanceled }) : reject(error)));
      });

      return {
        promise: wrappedPromise,
        cancel() {
          isCanceled = true;
        }
      };
    },

    /**
     * Retry a function with exponential backoff
     * @param {Function} fn - Async function to retry
     * @param {Object} options - Retry options
     * @returns {Promise} Result
     */
    async retry(fn, options = {}) {
      const {
        maxAttempts = 3,
        delay = 1000,
        backoff = 2,
        onRetry = null
      } = options;

      let lastError;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error;

          if (attempt < maxAttempts) {
            const waitTime = delay * Math.pow(backoff, attempt - 1);
            
            if (onRetry) {
              onRetry(attempt, waitTime, error);
            }

            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      throw lastError;
    }
  };

  // Expose globally
  window.UTILS = Utils;
})();
