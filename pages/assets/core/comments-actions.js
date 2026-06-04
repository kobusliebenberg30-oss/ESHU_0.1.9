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
          await toggleLike({ comment, comments, idx, threadId, target, card, button: btn });
        } else if (commentsStore && comment.id) {
          await commentsStore.toggleLike(comment.id, target);
        }
        if (typeof onLikeToggled === 'function') onLikeToggled({ comment, comments, idx, threadId, target, card, button: btn });
        return;
      }

      if (btn.classList.contains('u-card-follow-btn')) {
        btn.classList.toggle('active');
        const followedInd = card.querySelector('.u-card-ind.followed');
        if (followedInd) followedInd.classList.toggle('active', btn.classList.contains('active'));
        if (typeof toggleFollow === 'function') {
          await toggleFollow({ comment, comments, idx, threadId, target, card, button: btn });
        } else if (commentsStore && comment.id) {
          await commentsStore.toggleFollow(comment.id, target);
        }
        if (typeof onFollowToggled === 'function') onFollowToggled({ comment, comments, idx, threadId, target, card, button: btn });
        return;
      }

      const action = btn.dataset.action;
      if (action === 'burn') {
        const confirmed = await confirmBurn();
        if (!confirmed) return;
        if (typeof applyStatus === 'function') {
          await applyStatus({ action, comment, comments, idx, threadId, target, card, button: btn });
        } else if (commentsStore && comment.id) {
          await commentsStore.remove(comment.id, 'burned', target);
        }
      } else if (action === 'clear') {
        if (typeof applyStatus === 'function') {
          await applyStatus({ action, comment, comments, idx, threadId, target, card, button: btn });
        } else if (commentsStore && comment.id) {
          await commentsStore.remove(comment.id, 'deleted', target);
        }
      } else if (action === 'boot') {
        if (typeof applyStatus === 'function') {
          await applyStatus({ action, comment, comments, idx, threadId, target, card, button: btn });
        } else if (commentsStore && comment.id) {
          await commentsStore.update(comment.id, { status: 'active' }, target);
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
