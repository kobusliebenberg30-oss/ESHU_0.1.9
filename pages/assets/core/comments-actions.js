(function () {
  'use strict';

  function getActionButton(start, container) {
    if (!start || !container) return null;
    const selector = '.u-card-like-btn, .u-card-follow-btn, [data-action="clear"], [data-action="boot"], [data-action="burn"]';
    const btn = start.closest(selector);
    return btn && container.contains(btn) ? btn : null;
  }

  async function confirmBurn() {
    if (typeof MODAL !== 'undefined' && typeof MODAL.confirm === 'function') {
      return MODAL.confirm({
        title: 'Burn Comment',
        message: 'Delete (burn) this comment permanently?',
        danger: true,
        confirmLabel: 'Burn',
      });
    }
    return window.confirm('Delete (burn) this comment permanently?');
  }

  function bindThreadCardActions(options) {
    const containerEl = options && options.containerEl;
    const getThreadIdFromCard = options && options.getThreadIdFromCard;
    const loadThreadComments = options && options.loadThreadComments;
    const makeTarget = options && options.makeTarget;
    const onStatusChanged = options && options.onStatusChanged;
    const onLikeToggled = options && options.onLikeToggled;
    const onFollowToggled = options && options.onFollowToggled;
    const toggleLike = options && options.toggleLike;
    const toggleFollow = options && options.toggleFollow;
    const applyStatus = options && options.applyStatus;

    if (!containerEl || typeof getThreadIdFromCard !== 'function' || typeof loadThreadComments !== 'function' || typeof makeTarget !== 'function') {
      return function noop() {};
    }

    const onClick = async (event) => {
      const btn = getActionButton(event.target, containerEl);
      if (!btn) return;

      event.stopPropagation();

      const card = btn.closest('.u-card');
      if (!card) return;

      const idx = parseInt(card.dataset.commentIdx, 10);
      if (!Number.isInteger(idx) || idx < 0) return;

      const threadId = getThreadIdFromCard(card);
      if (!threadId) return;

      const comments = loadThreadComments(threadId);
      const comment = Array.isArray(comments) ? comments[idx] : null;
      if (!comment) return;

      const target = makeTarget(threadId, card);
      const commentsStore = window.ESHU_COMMENTS;

      if (btn.classList.contains('u-card-like-btn')) {
        btn.classList.toggle('active');
        const likedInd = card.querySelector('.u-card-ind.liked');
        if (likedInd) likedInd.classList.toggle('active', btn.classList.contains('active'));
        if (typeof toggleLike === 'function') {
          Promise.resolve(toggleLike({ comment, comments, idx, threadId, target, card, button: btn })).catch((err) => console.warn('[comments-actions] like failed:', err));
        } else if (commentsStore && comment.id) {
          Promise.resolve(commentsStore.toggleLike(comment.id, target)).catch((err) => console.warn('[comments-actions] like failed:', err));
        }
        if (typeof onLikeToggled === 'function') onLikeToggled({ comment, comments, idx, threadId, target, card, button: btn });
        return;
      }

      if (btn.classList.contains('u-card-follow-btn')) {
        btn.classList.toggle('active');
        const followedInd = card.querySelector('.u-card-ind.followed');
        if (followedInd) followedInd.classList.toggle('active', btn.classList.contains('active'));
        if (typeof toggleFollow === 'function') {
          Promise.resolve(toggleFollow({ comment, comments, idx, threadId, target, card, button: btn })).catch((err) => console.warn('[comments-actions] follow failed:', err));
        } else if (commentsStore && comment.id) {
          Promise.resolve(commentsStore.toggleFollow(comment.id, target)).catch((err) => console.warn('[comments-actions] follow failed:', err));
        }
        if (typeof onFollowToggled === 'function') onFollowToggled({ comment, comments, idx, threadId, target, card, button: btn });
        return;
      }

      const action = btn.dataset.action;
      if (action === 'burn') {
        const confirmed = await confirmBurn();
        if (!confirmed) return;
        if (typeof applyStatus === 'function') {
          Promise.resolve(applyStatus({ action, comment, comments, idx, threadId, target, card, button: btn })).catch((err) => console.warn('[comments-actions] burn failed:', err));
        } else if (commentsStore && comment.id) {
          Promise.resolve(commentsStore.remove(comment.id, 'burned', target)).catch((err) => console.warn('[comments-actions] burn failed:', err));
        }
      } else if (action === 'clear') {
        if (typeof applyStatus === 'function') {
          Promise.resolve(applyStatus({ action, comment, comments, idx, threadId, target, card, button: btn })).catch((err) => console.warn('[comments-actions] clear failed:', err));
        } else if (commentsStore && comment.id) {
          Promise.resolve(commentsStore.remove(comment.id, 'deleted', target)).catch((err) => console.warn('[comments-actions] clear failed:', err));
        }
      } else if (action === 'boot') {
        if (typeof applyStatus === 'function') {
          Promise.resolve(applyStatus({ action, comment, comments, idx, threadId, target, card, button: btn })).catch((err) => console.warn('[comments-actions] restore failed:', err));
        } else if (commentsStore && comment.id) {
          Promise.resolve(commentsStore.update(comment.id, { status: 'active' }, target)).catch((err) => console.warn('[comments-actions] restore failed:', err));
        }
      } else {
        return;
      }

      if (typeof onStatusChanged === 'function') onStatusChanged(action, card, comment);
    };

    containerEl.addEventListener('click', onClick);
    return function unbind() {
      containerEl.removeEventListener('click', onClick);
    };
  }

  window.ESHU_COMMENT_ACTIONS = {
    bindThreadCardActions,
  };
})();
