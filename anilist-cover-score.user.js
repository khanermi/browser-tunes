// ==UserScript==
// @name         AniList Cover Score
// @namespace    local
// @version      1.0
// @description  Рейтинг тайтла (averageScore, %) бейджем поверх обложки в сетке карточек AniList (поиск/Browse) — без наведения. Цвет как у смайлика в hover-попапе.
// @match        *://anilist.co/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/anilist-cover-score.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/anilist-cover-score.user.js
// ==/UserScript==

(function () {
  'use strict';

  const BADGE_CLASS = 'tm-cover-score';

  // Hover-попап карточки (.media-card > .hover-data) рендерится Vue сразу,
  // а не по наведению — CSS его просто прячет. Значит рейтинг уже лежит в DOM:
  // .hover-data .score .percentage ("83%") + svg[color] смайлика
  // ("rgb(var(--color-green|orange|red))"). У тайтлов без оценки .score нет.
  const style = document.createElement('style');
  style.textContent = `
    .media-card .cover .${BADGE_CLASS} {
      position: absolute;
      top: 6px;
      left: 6px;
      z-index: 5;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.72);
      font-size: 1.3rem;
      font-weight: 700;
      line-height: 1.5;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);

  // Vue переиспользует карточки при смене фильтров (патчит текст на месте),
  // поэтому не помечаем карточку «готовой», а каждый проход сверяем бейдж
  // с текущим .percentage.
  function sync() {
    for (const card of document.querySelectorAll('.media-card')) {
      const cover = card.querySelector(':scope > .cover');
      if (!cover) continue;
      const score = card.querySelector('.hover-data .score');
      const text = score?.querySelector('.percentage')?.textContent.trim() || '';
      const color = score?.querySelector('svg')?.getAttribute('color') || '';
      let badge = cover.querySelector(':scope > .' + BADGE_CLASS);
      if (!text) {
        badge?.remove();
        continue;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = BADGE_CLASS;
        cover.appendChild(badge);
      }
      if (badge.textContent !== text) badge.textContent = text;
      if (badge.style.color !== color) badge.style.color = color;
    }
  }

  // Бесконечная прокрутка + SPA-навигация: пересчёт раз в кадр на любые мутации.
  // Наши собственные записи в бейдж тоже будят observer, но sync() пишет
  // только при расхождении, так что цикл затухает за один проход.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sync();
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  sync();
})();
