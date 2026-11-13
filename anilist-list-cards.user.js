// ==UserScript==
// @name         AniList List Cards
// @namespace    local
// @version      1.2
// @description  Список аниме/манги AniList, вид карточками: обложка чистая, название, прогресс и оценка — под ней, а не плашкой поверх картинки.
// @match        *://anilist.co/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/anilist-list-cards.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/anilist-list-cards.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Вид «карточки» = .medialist.cards. Карточка .entry-card — 150×210
  // (height в CSS сайта), всё внутри absolute: .cover (картинка + кнопка «…»
  // .edit), .title (плашка снизу, padding-bottom 35px под строку цифр),
  // .progress (слева, «+» по наведению) и .score (справа, смайлик/оценка).
  // Список — грид с grid-template-rows: repeat(auto-fill, 210px), поэтому
  // строки грида тоже надо отпустить, иначе подписи налезают на следующий ряд.
  // .release-status (точка «выходит»), .repeat, .notes остаются absolute
  // от top — к новой высоте карточки не привязаны.
  // Колонки — minmax(150px, 1fr) вместо фиксированных 150px: сетка тянется на
  // всю ширину (особенно с anilist-list-filters, где колонки фильтров нет), а
  // обложка держит пропорцию 150:210 через aspect-ratio (.image — height 100%).
  // Только CSS: правила ждут .medialist.cards, переходы внутри SPA не важны.
  const css = `
    html body .medialist.cards .list-section .list-entries {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      grid-template-rows: none;
      grid-auto-rows: auto;
    }
    html body .medialist.cards .entry-card {
      height: auto;
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto auto;
      align-items: center;
      box-shadow: none;
    }
    html body .medialist.cards .entry-card > .cover {
      position: relative;
      grid-area: 1 / 1 / 2 / 3;
      height: auto;
      aspect-ratio: 150 / 210;
      box-shadow: rgba(49, 54, 68, 0.2) 0 2px 20px;
    }
    html body .medialist.cards .entry-card > .title {
      position: static;
      grid-area: 2 / 1 / 3 / 3;
      align-self: start;
      background: none !important; /* у сайта — полупрозрачный цвет обложки */
      border-radius: 0;
      padding: 8px 2px 0;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
    html body .medialist.cards .entry-card > .progress,
    html body .medialist.cards .entry-card > .score {
      position: static;
      width: auto;
      height: auto;
      padding: 4px 2px 0;
    }
    html body .medialist.cards .entry-card > .progress {
      grid-area: 3 / 1;
      justify-self: start;
    }
    html body .medialist.cards .entry-card > .score {
      grid-area: 3 / 2;
      justify-self: end;
    }
  `;

  const style = document.createElement('style');
  style.id = 'tm-anilist-list-cards';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();
