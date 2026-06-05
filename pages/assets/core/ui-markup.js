(function () {
  'use strict';

  function escapeAttr(value) {
    return String(value || '').replace(/"/g, '&quot;');
  }

  function diamondImage(imageUrl) {
    const safeUrl = escapeAttr(imageUrl);
    return `
      <div class="diamond-image-frame">
        <img class="diamond-image-inner" src="${safeUrl}" alt="" />
        <svg class="diamond-image-overlay" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="none" stroke="#000" stroke-linejoin="miter" stroke-linecap="butt">
            <polyline points="215,470 512,174 809,470" stroke-width="78" />
            <polygon points="512,312 790,590 512,868 234,590" stroke-width="44" />
          </g>
        </svg>
      </div>
    `;
  }

  function hexImage(imageUrl) {
    const safeUrl = escapeAttr(imageUrl);
    return `
      <div class="hex-image-svg hex-image-frame">
        <img class="hex-image-inner" src="${safeUrl}" alt="" />
        <svg class="hex-image-overlay" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="none" stroke="#000" stroke-linejoin="miter" stroke-linecap="butt">
            <polyline points="184,450 316,220 708,220 840,450" stroke-width="78" />
            <polygon points="792,560 652,318 372,318 232,560 372,802 652,802" stroke-width="44" />
          </g>
        </svg>
      </div>
    `;
  }

  function diamondPlaceholder(className = 'game-placeholder-logo') {
    return `<img src="assets/images/diamond-logo.svg" alt="" class="${escapeAttr(className)}">`;
  }

  function hexPlaceholder(className = 'group-placeholder-logo') {
    return `<img src="assets/images/hex-logo-v2.svg" alt="" class="${escapeAttr(className)}">`;
  }

  window.ESHU_UI_MARKUP = {
    diamondImage,
    hexImage,
    diamondPlaceholder,
    hexPlaceholder,
  };
})();
