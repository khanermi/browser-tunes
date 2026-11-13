// ==UserScript==
// @name         AniList Cover Score
// @namespace    local
// @version      1.1
// @description  Рейтинг тайтла (averageScore, %) бейджем поверх обложки в сетке карточек AniList (поиск/Browse) и в списке аниме/манги видом карточками — без наведения. Цвет как у смайлика в hover-попапе.
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
  //
  // В списке пользователя (вид карточками, .entry-card) попапа нет. Рейтинг
  // есть только в данных: Vue-компонент карточки держит entry.media — это id,
  // а сам тайтл лежит в Vuex entities.media[id]; averageScore там под именем
  // weightedScore (сверено с API на 8 тайтлах). У анонсов его нет — без бейджа.
  // Читаем через card.__vue__: с @grant none Tampermonkey выполняет скрипт
  // в мире страницы. Цвет — по порогам scoreIcon сайта: >74 зелёный, >59
  // оранжевый, иначе красный.
  const style = document.createElement('style');
  style.textContent = `
    :is(.media-card, .entry-card) .cover > .${BADGE_CLASS} {
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
    /* Иконки «заметки»/«пересмотр» списка стоят в том же углу (top 12px). */
    .entry-card:has(> .cover > .${BADGE_CLASS}) > :is(.notes, .repeat) {
      top: 38px;
    }
  `;
  document.head.appendChild(style);

  // Vue переиспользует карточки при смене фильтров (патчит текст на месте),
  // поэтому не помечаем карточку «готовой», а каждый проход сверяем бейдж
  // с текущим .percentage.
  function setBadge(cover, text, color) {
    let badge = cover.querySelector(':scope > .' + BADGE_CLASS);
    if (!text) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      cover.appendChild(badge);
    }
    if (badge.textContent !== text) badge.textContent = text;
    if (badge.style.color !== color) badge.style.color = color;
  }

  function scoreColor(score) {
    const name = score > 74 ? 'green' : score > 59 ? 'orange' : 'red';
    return `rgb(var(--color-${name}))`;
  }

  function sync() {
    for (const card of document.querySelectorAll('.media-card')) {
      const cover = card.querySelector(':scope > .cover');
      if (!cover) continue;
      const score = card.querySelector('.hover-data .score');
      const text = score?.querySelector('.percentage')?.textContent.trim() || '';
      const color = score?.querySelector('svg')?.getAttribute('color') || '';
      setBadge(cover, text, color);
    }
    for (const card of document.querySelectorAll('.entry-card')) {
      const cover = card.querySelector(':scope > .cover');
      if (!cover) continue;
      const vm = card.__vue__;
      const score = vm?.$store?.state.entities?.media?.[vm.entry?.media]?.weightedScore;
      if (score == null) setBadge(cover, '', '');
      else setBadge(cover, score + '%', scoreColor(score));
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
