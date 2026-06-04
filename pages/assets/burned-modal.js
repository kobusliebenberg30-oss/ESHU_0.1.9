/**
 * Burned Item Modal Module
 * Displays a modal for burned items with voting and comment functionality
 * Includes data persistence for votes and comments across all entity types
 */
const BURNED_MODAL = (function() {
  let modalElement = null;
  let currentItem = null;
  let currentPanel = null;
  let onCloseCallback = null;

  // ===== DATA LAYER =====
  const STORAGE_KEY = 'burned_records';

  /**
   * Generate a unique composite key for an item
   * @param {string} type - Entity type (games, creations, groups, comments)
   * @param {string} id - Item ID
   * @returns {string} Composite key
   */
  function getRecordKey(type, id) {
    return `${type}_${id}`;
  }

  /**
   * Get all burned records from storage
   * @returns {Object} All burned records keyed by composite key
   */
  function getAllRecords() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn('[BURNED_MODAL] Failed to parse storage:', e);
      return {};
    }
  }

  /**
   * Save all records to storage
   * @param {Object} records - All burned records
   */
  function saveAllRecords(records) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.error('[BURNED_MODAL] Failed to save to storage:', e);
    }
  }

  /**
   * Get or create a burned record for a specific item
   * @param {string} type - Entity type
   * @param {string} id - Item ID
   * @returns {Object} Burned record
   */
  function getRecord(type, id) {
    const records = getAllRecords();
    const key = getRecordKey(type, id);
    
    if (!records[key]) {
      records[key] = {
        id: id,
        type: type,
        burnedAt: Date.now(),
        votes: { keep: 0, restore: 0 },
        comments: []
      };
      saveAllRecords(records);
    }
    
    return records[key];
  }

  /**
   * Update a burned record
   * @param {string} type - Entity type
   * @param {string} id - Item ID
   * @param {Object} updates - Partial updates to apply
   * @returns {Object} Updated record
   */
  function updateRecord(type, id, updates) {
    const records = getAllRecords();
    const key = getRecordKey(type, id);
    
    if (!records[key]) {
      records[key] = {
        id: id,
        type: type,
        burnedAt: Date.now(),
        votes: { keep: 0, restore: 0 },
        comments: []
      };
    }
    
    // Merge updates
    Object.assign(records[key], updates);
    saveAllRecords(records);
    
    return records[key];
  }

  /**
   * Add a vote and optional comment to a burned record
   * @param {string} type - Entity type
   * @param {string} id - Item ID
   * @param {string} voteType - 'keep' or 'restore'
   * @param {string} commentText - Optional comment text
   * @returns {Object} Updated record
   */
  function addVote(type, id, voteType, commentText) {
    const records = getAllRecords();
    const key = getRecordKey(type, id);
    
    if (!records[key]) {
      records[key] = {
        id: id,
        type: type,
        burnedAt: Date.now(),
        votes: { keep: 0, restore: 0 },
        comments: []
      };
    }
    
    // Increment vote count
    if (voteType === 'keep' || voteType === 'restore') {
      records[key].votes[voteType] = (records[key].votes[voteType] || 0) + 1;
    }
    
    // Add comment if provided
    if (commentText && commentText.trim()) {
      records[key].comments.push({
        id: 'comment_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        voteType: voteType,
        text: commentText.trim(),
        timestamp: Date.now()
      });
    }
    
    saveAllRecords(records);
    console.log('[BURNED_MODAL] Vote recorded:', { type, id, voteType, commentText });
    
    return records[key];
  }

  // ===== UI LAYER =====

  // Create modal HTML structure
  function createModal() {
    if (modalElement) return modalElement;

    const overlay = document.createElement('div');
    overlay.id = 'burnedItemModalOverlay';
    overlay.className = 'burned-modal-overlay';
    overlay.innerHTML = `
      <div class="burned-modal" role="dialog" aria-modal="true" aria-labelledby="burnedModalTitle">
        <div class="burned-modal-header">
          <h2 id="burnedModalTitle">Burned Item Review</h2>
          <button class="burned-modal-close" aria-label="Close modal">&times;</button>
        </div>
        <div class="burned-modal-body">
          <div class="burned-item-content">
            <span class="burned-item-label">Burned</span>
            <div class="burned-item-name"></div>
            <div class="burned-item-details"></div>
          </div>
          <div class="burned-vote-stats"></div>
          <div class="burned-modal-voting">
            <h3>Cast Your Vote</h3>
            <div class="voting-buttons">
              <button class="vote-btn vote-keep" data-vote="keep">
                <span class="vote-icon">🔥</span>
                <span class="vote-label">Keep Burned</span>
                <span class="vote-count" data-vote-count="keep"></span>
              </button>
              <button class="vote-btn vote-restore" data-vote="restore">
                <span class="vote-icon">↩️</span>
                <span class="vote-label">Restore / Not Appropriate Burn</span>
                <span class="vote-count" data-vote-count="restore"></span>
              </button>
            </div>
          </div>
          <div class="burned-comments-section"></div>
          <div class="burned-modal-comment">
            <h3>Add a Comment <span class="optional-label">(optional)</span></h3>
            <textarea class="burned-comment-input" placeholder="Why do you think this item should be kept burned or restored?" rows="3"></textarea>
          </div>
          <div class="burned-modal-actions">
            <button class="burned-submit-btn" disabled>Submit Vote</button>
          </div>
          <div class="burned-modal-feedback"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    modalElement = overlay;

    // Bind events
    bindModalEvents();

    return modalElement;
  }

  function bindModalEvents() {
    const overlay = modalElement;
    const modal = overlay.querySelector('.burned-modal');
    const closeBtn = overlay.querySelector('.burned-modal-close');
    const voteButtons = overlay.querySelectorAll('.vote-btn');
    const submitBtn = overlay.querySelector('.burned-submit-btn');
    const commentInput = overlay.querySelector('.burned-comment-input');

    // Close on X button
    closeBtn.addEventListener('click', close);

    // Close on overlay click (outside modal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Close on Escape key
    function handleEscape(e) {
      if (e.key === 'Escape' && modalElement.style.display === 'flex') {
        close();
      }
    }
    document.addEventListener('keydown', handleEscape);

    // Store reference for cleanup
    overlay._escapeHandler = handleEscape;

    // Vote button selection
    voteButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        voteButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        submitBtn.disabled = false;
      });
    });

    // Submit vote
    submitBtn.addEventListener('click', handleSubmit);

    // Prevent clicks inside modal from closing it
    modal.addEventListener('click', (e) => e.stopPropagation());
  }

  function handleSubmit() {
    const selectedVote = modalElement.querySelector('.vote-btn.selected');
    if (!selectedVote) return;

    const voteType = selectedVote.dataset.vote;
    const comment = modalElement.querySelector('.burned-comment-input').value.trim();
    const feedback = modalElement.querySelector('.burned-modal-feedback');

    // Store vote using the new data layer
    const itemId = currentItem?.id || null;
    const itemType = currentPanel || 'unknown';
    
    if (itemId) {
      const updatedRecord = addVote(itemType, itemId, voteType, comment);
      
      // Update vote counts in UI immediately
      updateVoteCountsUI(updatedRecord);
      updateCommentsUI(updatedRecord);
    }

    // Show feedback
    feedback.innerHTML = `<div class="feedback-success">✓ Vote submitted successfully!</div>`;
    feedback.style.display = 'block';

    // Disable submit to prevent double submission
    modalElement.querySelector('.burned-submit-btn').disabled = true;
    modalElement.querySelectorAll('.vote-btn').forEach(b => b.disabled = true);

    // Auto-close after brief delay
    setTimeout(() => {
      close();
    }, 1500);
  }

  /**
   * Update vote count displays in the modal
   * @param {Object} record - Burned record with votes
   */
  function updateVoteCountsUI(record) {
    if (!modalElement || !record) return;
    
    const keepCount = modalElement.querySelector('[data-vote-count="keep"]');
    const restoreCount = modalElement.querySelector('[data-vote-count="restore"]');
    
    if (keepCount) {
      keepCount.textContent = record.votes.keep > 0 ? `(${record.votes.keep})` : '';
    }
    if (restoreCount) {
      restoreCount.textContent = record.votes.restore > 0 ? `(${record.votes.restore})` : '';
    }
  }

  /**
   * Update comments section in the modal
   * @param {Object} record - Burned record with comments
   */
  function updateCommentsUI(record) {
    if (!modalElement || !record) return;
    
    const commentsSection = modalElement.querySelector('.burned-comments-section');
    if (!commentsSection) return;
    
    if (!record.comments || record.comments.length === 0) {
      commentsSection.innerHTML = '';
      commentsSection.style.display = 'none';
      return;
    }
    
    // Sort comments by timestamp (newest first)
    const sortedComments = [...record.comments].sort((a, b) => b.timestamp - a.timestamp);
    
    let html = '<h3>Previous Comments</h3><div class="burned-comments-list">';
    
    sortedComments.slice(0, 10).forEach(comment => {
      const voteLabel = comment.voteType === 'keep' ? '🔥 Keep' : '↩️ Restore';
      const timeStr = new Date(comment.timestamp).toLocaleString();
      html += `
        <div class="burned-comment-item ${comment.voteType}">
          <div class="comment-meta">
            <span class="comment-vote-type">${voteLabel}</span>
            <span class="comment-time">${timeStr}</span>
          </div>
          <div class="comment-text">${escapeHtml(comment.text)}</div>
        </div>
      `;
    });
    
    if (record.comments.length > 10) {
      html += `<p class="comments-more">+ ${record.comments.length - 10} more comments</p>`;
    }
    
    html += '</div>';
    commentsSection.innerHTML = html;
    commentsSection.style.display = 'block';
  }

  function open(item, panel, callback) {
    if (!item || item.status !== 'burned') return;

    currentItem = item;
    currentPanel = panel;
    onCloseCallback = callback;

    const modal = createModal();

    // Populate content
    const nameEl = modal.querySelector('.burned-item-name');
    const detailsEl = modal.querySelector('.burned-item-details');

    nameEl.textContent = item.name || item.text || 'Unnamed Item';

    // Build details based on item type
    let detailsHtml = '';
    if (item.description) {
      detailsHtml += `<p><strong>Description:</strong> ${escapeHtml(item.description)}</p>`;
    }
    if (item.text && item.text !== item.name) {
      detailsHtml += `<p>${escapeHtml(item.text)}</p>`;
    }
    if (item.devices) {
      detailsHtml += `<p><strong>Devices:</strong> ${escapeHtml(item.devices)}</p>`;
    }
    if (item.tags) {
      detailsHtml += `<p><strong>Tags:</strong> ${escapeHtml(item.tags)}</p>`;
    }
    if (item.dateMade) {
      detailsHtml += `<p><strong>Date Made:</strong> ${escapeHtml(item.dateMade)}</p>`;
    }
    if (item.type) {
      detailsHtml += `<p><strong>Type:</strong> ${escapeHtml(item.type)}</p>`;
    }
    if (item.timestamp) {
      detailsHtml += `<p><strong>Created:</strong> ${new Date(item.timestamp).toLocaleString()}</p>`;
    }
    if (!detailsHtml) {
      detailsHtml = '<p><em>No additional details available.</em></p>';
    }
    detailsEl.innerHTML = detailsHtml;

    // Reset state
    modal.querySelectorAll('.vote-btn').forEach(b => {
      b.classList.remove('selected');
      b.disabled = false;
    });
    modal.querySelector('.burned-comment-input').value = '';
    modal.querySelector('.burned-submit-btn').disabled = true;
    modal.querySelector('.burned-modal-feedback').style.display = 'none';
    modal.querySelector('.burned-modal-feedback').innerHTML = '';

    // Load existing data for this item
    if (item.id && panel) {
      const record = getRecord(panel, item.id);
      updateVoteCountsUI(record);
      updateCommentsUI(record);
    }

    // Show modal (set display on overlay, not inner modal)
    modalElement.style.display = 'flex';

    // Focus management
    modal.querySelector('.burned-modal-close').focus();
  }

  function close() {
    if (modalElement) {
      modalElement.style.display = 'none';
    }
    if (onCloseCallback && typeof onCloseCallback === 'function') {
      onCloseCallback();
    }
    currentItem = null;
    currentPanel = null;
    onCloseCallback = null;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Public API
  return {
    open: open,
    close: close,
    isOpen: function() {
      return modalElement && modalElement.style.display === 'flex';
    }
  };
})();
