// ==UserScript==
// @name         AniList List Filters
// @namespace    local
// @version      1.1
// @description  Список аниме/манги AniList: фильтры не колонкой слева, а панелью сверху (вкладки списков, выпадашки в строку), список — на всю ширину.
// @match        *://anilist.co/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/anilist-list-filters.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/anilist-list-filters.user.js
// ==/UserScript==

(function () {
  'use strict';

  // .medialist — грид «180px фильтры | списки» (column-gap 40px). Внутри
  // .filters-wrap: поиск .filter-mobile-wrap и .filters с детьми
  //   1 .filter-group «Lists»   — span'ы All/Watching/… со span.count,
  //                               в заголовке .action (сортировка списков,
  //                               opacity 0 до наведения на группу);
  //   2 .filter-group «Filters» — 4 el-select (Format, Status, Genres & Tags,
  //                               Country);
  //   3 .filter-group «Year»    — el-slider;
  //   4 .filter-group «Sort»    — el-select;
  //   5 .random-btn.
  // .filters делаем display: contents — всё это становится flex-элементами
  // одной панели: 1-я строка — поиск, вкладки, случайный тайтл; 2-я —
  // фильтры, год, сортировка (справа). Выпадашки el-select — поппер в body,
  // от раскладки не зависят.
  // Правила сайта scoped (.medialist[data-v-…], .filter-group[data-v-…]) —
  // атрибут весит как класс, и стиль с document-start стоит раньше стилей
  // сайта. Отсюда префикс html:not(#tm): вес id перебивает любые их классы.
  // До 760px у сайта своя мобильная раскладка (фильтры за кнопкой) — её не
  // трогаем.
  const P = 'html:not(#tm) .medialist > .filters-wrap';
  const css = `
    @media (min-width: 761px) {
      html:not(#tm) .medialist {
        grid-template-columns: minmax(0, 1fr);
        row-gap: 0;
      }
      ${P} {
        height: auto;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 14px 10px;
        margin-bottom: 44px;
        padding: 16px 18px;
        border-radius: 6px;
        background: rgb(var(--color-foreground));
      }
      ${P} > .filter-mobile-wrap { order: 0; flex: 0 0 220px; }
      ${P} .filters { display: contents; }
      ${P} .filter-group {
        order: 3;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      ${P} .filter-group > .group-header { margin: 0; white-space: nowrap; }

      /* Lists — вкладки-пилюли */
      ${P} .filter-group:first-child {
        order: 1;
        flex: 1 1 calc(100% - 290px);
        flex-wrap: wrap;
        gap: 6px;
      }
      ${P} .filter-group:first-child > .group-header {
        order: 99;
        margin-left: auto;
        font-size: 0; /* слово «Lists»; иконка .action остаётся */
      }
      ${P} .filter-group:first-child > .group-header .action {
        display: inline-flex;
        padding: 7px 9px;
        border-radius: 16px;
        background: rgb(var(--color-background));
      }
      ${P} .filter-group:first-child > .group-header svg { font-size: 1.3rem; }
      ${P} .filter-group:first-child > span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        padding: 7px 12px;
        border-radius: 16px;
        background: rgb(var(--color-background));
        font-size: 1.3rem;
        text-transform: capitalize; /* «all» */
      }
      ${P} .filter-group:first-child > span:hover {
        color: rgb(var(--color-text));
        background: rgba(var(--color-background), 0.7);
      }
      ${P} .filter-group:first-child > span.active {
        background: rgb(var(--color-blue)); /* акцент профиля */
        color: rgb(var(--color-white));
      }
      ${P} .filter-group:first-child > span .count { opacity: 0.7; font-size: 1.15rem; }
      ${P} .random-btn { order: 2; margin: 0; }

      /* Filters / Year / Sort — одна строка */
      ${P} .filter-group:nth-child(2) { gap: 10px; }
      ${P} .filter-group:nth-child(2) > .group-header { display: none; }
      ${P} .filter-group .el-select { width: 140px; margin: 0; }
      ${P} .filter-group .el-slider { width: 130px; margin: 0 6px; }
      ${P} .filter-group .el-slider__runway { background: rgb(var(--color-background)); }
      ${P} .filter-group:nth-child(4) { margin-left: auto; }
      ${P} .filter-group:nth-child(4) .el-select { width: 160px; }

      /* Поля (поиск, выпадашки) у сайта цвета --color-foreground — того же,
         что фон панели, и сливались с ним. Подложка как у вкладок, без рамок;
         при наведении/фокусе — чуть светлее и ярче текст. */
      ${P} .el-input__inner {
        background: rgb(var(--color-background));
        border-radius: 8px;
        transition: color 0.15s, background 0.15s;
      }
      ${P} .el-input:hover .el-input__inner,
      ${P} .el-input__inner:focus {
        color: rgb(var(--color-text));
        background: rgba(var(--color-background), 0.7);
      }
      ${P} > .filter-mobile-wrap .el-input__inner { height: 34px; line-height: 34px; }
      ${P} > .filter-mobile-wrap .el-input__icon { line-height: 34px; }
    }
  `;

  const style = document.createElement('style');
  style.id = 'tm-anilist-list-filters';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();
