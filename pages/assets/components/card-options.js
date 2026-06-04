(function() {
  'use strict';

  /**
   * CARD_OPTIONS — reusable options modal for Game, Creation and Group cards.
   * Usage: CARD_OPTIONS.open(entity, 'game'|'creation'|'group', activeProfileId, saveFn, rerenderFn)
   */
  function open(entity, entityType, activeProfileId, saveFn, rerenderFn) {
    if (!entity || !activeProfileId) return;
    const isLiked = (entity.likedBy || []).includes(activeProfileId);
    const isFollowed = (entity.followedBy || []).includes(activeProfileId);

    let modal = document.getElementById('cardOptionsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'cardOptionsModal';
      modal.className = 'comment-options-modal';
      document.body.appendChild(modal);
    }

    const typeLabel = entityType === 'game' ? 'Game' :
                      entityType === 'creation' ? 'Creation' :
                      entityType === 'group' ? 'Group' : 'Options';

    modal.innerHTML = `
      <div class="comment-options-panel">
        <div class="comment-options-title">${typeLabel} Options</div>
        <div class="comment-options-list">
          <button type="button" class="comment-option-btn" data-action="like">
            <span class="opt-icon">${isLiked ? '♥' : '♡'}</span> ${isLiked ? 'Unlike' : 'Like'}
          </button>
          <button type="button" class="comment-option-btn" data-action="follow">
            <span class="opt-icon">${isFollowed ? '★' : '☆'}</span> ${isFollowed ? 'Unfollow' : 'Follow'}
          </button>
        </div>
        <button type="button" class="comment-options-close">Close</button>
      </div>
    `;

    modal.classList.add('open');
    modal.querySelector('.comment-options-close').onclick = () => modal.classList.remove('open');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };

    modal.querySelectorAll('.comment-option-btn').forEach(optBtn => {
      optBtn.onclick = () => {
        const action = optBtn.dataset.action;
        if (action === 'like') {
          entity.likedBy = entity.likedBy || [];
          if (isLiked) {
            entity.likedBy = entity.likedBy.filter(id => id !== activeProfileId);
          } else {
            entity.likedBy.push(activeProfileId);
          }
        } else if (action === 'follow') {
          entity.followedBy = entity.followedBy || [];
          if (isFollowed) {
            entity.followedBy = entity.followedBy.filter(id => id !== activeProfileId);
          } else {
            entity.followedBy.push(activeProfileId);
          }
        }
        if (saveFn) saveFn();
        modal.classList.remove('open');
        if (rerenderFn) rerenderFn();
      };
    });
  }

  window.CARD_OPTIONS = { open: open };
})();
