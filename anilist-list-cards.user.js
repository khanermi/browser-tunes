// ==UserScript==
// @name         AniList List Cards
// @namespace    local
// @version      1.5
// @description  Список аниме/манги AniList, вид карточками: обложка чистая, название, прогресс и оценка — под ней, а не плашкой поверх картинки; обложка — ссылка на тайтл, как название; смайлики оценки — зелёный/жёлтый/красный.
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
  // Кнопка «…» (.cover > .edit, у сайта top/right 10px, 30×30) — в правый
  // нижний угол обложки; над ней anilist-aj-button ставит кнопку AJ.
  // CSS ждёт .medialist.cards, переходы внутри SPA не важны.
  const COVER_LINK = 'tm-cover-link';
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
    html body .medialist.cards .entry-card .cover > .${COVER_LINK} {
      position: absolute;
      inset: 0;
      border-radius: 3px;
    }
    html body .medialist.cards .entry-card .cover > .edit {
      top: auto;
      bottom: 10px;
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
    /* Оценка смайликами (формат POINT_3): у сайта все три — оранжевые, как
       прогресс. Красим по data-icon из Font Awesome цветами палитры сайта
       (те же --color-green/--color-red, что у бейджа anilist-cover-score,
       и тема их подхватывает). Без .cards — в виде строками тоже. */
    html body .medialist .score > svg[data-icon="smile"] { color: rgb(var(--color-green)); }
    html body .medialist .score > svg[data-icon="meh"] { color: rgb(var(--color-yellow)); }
    html body .medialist .score > svg[data-icon="frown"] { color: rgb(var(--color-red)); }
  `;

  const style = document.createElement('style');
  style.id = 'tm-anilist-list-cards';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  // Обложка — ссылка, как название. У сайта ссылка только .title a
  // (router-link), .cover > .image — просто div с фоном. Кладём в .cover
  // первым ребёнком <a href> на весь размер: средняя кнопка, Ctrl+клик и
  // «Открыть в новой вкладке» работают сами. Обычный левый клик отдаём
  // .title a — Vue-роутер открывает тайтл без перезагрузки страницы.
  // Ссылка первая и без z-index: «…» (.edit), бейдж рейтинга и кнопка AJ
  // (позиционированы, идут после неё) рисуются поверх и кликаются как раньше.
  // Vue переиспользует карточки — href сверяем на каждом проходе.
  function titleLink(card) {
    return card.querySelector(':scope > .title a[href]');
  }

  function sync() {
    for (const card of document.querySelectorAll('.medialist.cards .entry-card')) {
      const cover = card.querySelector(':scope > .cover');
      if (!cover) continue;
      const href = titleLink(card)?.getAttribute('href');
      let a = cover.querySelector(':scope > .' + COVER_LINK);
      if (!href) {
        a?.remove();
        continue;
      }
      if (!a) {
        a = document.createElement('a');
        a.className = COVER_LINK;
        a.tabIndex = -1; // с клавиатуры — по названию, дубль не нужен
        a.setAttribute('aria-hidden', 'true');
        a.addEventListener('click', (e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          const link = titleLink(a.closest('.entry-card'));
          if (!link) return;
          e.preventDefault();
          link.click();
        });
      }
      if (cover.firstElementChild !== a) cover.prepend(a);
      if (a.getAttribute('href') !== href) a.setAttribute('href', href);
    }
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sync();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
