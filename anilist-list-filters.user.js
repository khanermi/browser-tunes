// ==UserScript==
// @name         AniList List Filters
// @namespace    local
// @version      1.5
// @description  Список аниме/манги AniList: фильтры не колонкой слева, а компактной панелью сверху (поиск, вкладки списков, «Finished», «Advanced» и сортировка иконками; остальное — за «Advanced»), список — на всю ширину.
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
  //                               в заголовке .action «Reorder List
  //                               Sections» (opacity 0 до наведения);
  //   2 .filter-group «Filters» — 4 el-select (Format, Status, Genres & Tags,
  //                               Country);
  //   3 .filter-group «Year»    — el-slider;
  //   4 .filter-group «Sort»    — el-select;
  //   5 .random-btn.
  // .filters и группы Lists/Filters — display: contents: вкладки, селекты,
  // заголовок Lists — отдельные flex-элементы панели, строки задаёт order:
  //   основная — поиск, вкладки, «Finished», иконка «Advanced», Sort
  //              иконкой справа. Поиск гибкий (120–220px, добирает
  //              свободное место), вкладки поплотнее — строка влезает уже
  //              при ширине окна ~1320px CSS (Chrome у пользователя ×1.3);
  //   Advanced — (только открытая) Format, Status, Genres & Tags, Country,
  //              Year, случайный тайтл, «Reorder List Sections».
  // Перенос перед Advanced — псевдоэлемент ::after с flex-basis 100% и
  // нулевой высотой. Чтобы его пустая строка не добавляла лишний gap, у
  // панели row-gap 0, а расстояние между строками — margin-block 7px у
  // каждого элемента (padding панели на 7px меньше). Выпадашки el-select —
  // поппер в body, от раскладки не зависят.
  // Правила сайта scoped (.medialist[data-v-…], .filter-group[data-v-…]) —
  // атрибут весит как класс, и стиль с document-start стоит раньше стилей
  // сайта. Отсюда префикс html:not(#tm): вес id перебивает любые их классы.
  // До 760px у сайта своя мобильная раскладка (фильтры за кнопкой) — её не
  // трогаем.
  const P = 'html:not(#tm) .medialist > .filters-wrap';
  const TOGGLE = 'tm-finished';
  const ADV = 'tm-adv';
  const ADV_OPEN = 'tm-adv-open';
  const ADV_KEY = 'tm-anilist-filters-advanced';
  const FINISHED = 'FINISHED';
  const LISTS = `${P} .filter-group:nth-child(1)`;
  const FILTERS = `${P} .filter-group:nth-child(2)`;
  const YEAR = `${P} .filter-group:nth-child(3)`;
  const SORT = `${P} .filter-group:nth-child(4)`;
  // Значок сортировки (стрелки вверх/вниз) — data-URL для mask.
  const SORT_ICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M7 20V4M3.5 7.5 7 4l3.5 3.5M17 4v16M13.5 16.5 17 20l3.5-3.5"/></svg>');
  const css = `
    .${ADV} { display: none; }
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
        gap: 0 10px;
        margin-bottom: 44px;
        padding: 9px 18px;
        border-radius: 6px;
        background: rgb(var(--color-foreground));
      }
      ${P} .filters,
      ${LISTS},
      ${FILTERS} { display: contents; }
      ${LISTS} > .group-header,
      ${FILTERS} > .group-header { display: none; }

      /* flex-элементы панели: отступ между строками */
      ${P} > .filter-mobile-wrap,
      ${LISTS} > span,
      ${LISTS} > .group-header,
      ${FILTERS} > *,
      ${YEAR},
      ${SORT},
      ${P} .random-btn { margin-block: 7px; }

      /* основная строка */
      ${P} > .filter-mobile-wrap { order: 0; flex: 1 1 120px; min-width: 120px; max-width: 220px; }
      ${LISTS} > span {
        order: 1;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-inline: 0 -4px; /* 10px gap панели → 6px между вкладками */
        padding: 7px 9px;
        border-radius: 16px;
        background: rgb(var(--color-background));
        font-size: 1.3rem;
        text-transform: capitalize; /* «all» */
      }
      ${LISTS} > span:hover {
        color: rgb(var(--color-text));
        background: rgba(var(--color-background), 0.7);
      }
      ${LISTS} > span.active {
        background: rgb(var(--color-blue)); /* акцент профиля */
        color: rgb(var(--color-white));
      }
      ${LISTS} > span .count { opacity: 0.7; font-size: 1.15rem; }
      ${P} .${TOGGLE} { order: 2; margin-left: 4px; }
      ${P} .${ADV} { order: 3; }
      /* Sort — иконкой: слово «Sort» прячем, у селекта прозрачный текст и
         без стрелки, сверху — значок через mask (цвет — background, чтобы
         подсвечивался при наведении). Клик — по самому input, выпадашка
         сайта как была; текущая сортировка — в подсказке (title из JS). */
      ${SORT} { order: 4; margin-left: auto; }
      ${SORT} > .group-header { display: none; }
      ${SORT} .el-select { display: block; width: 36px; margin: 0; }
      ${SORT} .el-input__inner {
        height: 32px;
        padding: 0;
        color: transparent;
        cursor: pointer;
      }
      ${SORT} .el-input__suffix { display: none; }
      ${SORT} .el-select::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 1;
        margin: auto;
        width: 16px;
        height: 16px;
        background: rgb(var(--color-text-lighter));
        -webkit-mask: url("${SORT_ICON}") center / contain no-repeat;
        mask: url("${SORT_ICON}") center / contain no-repeat;
        pointer-events: none;
        transition: background 0.15s;
      }
      ${SORT} .el-select:hover::before,
      ${SORT} .el-select:has(.is-focus)::before { background: rgb(var(--color-text)); }

      /* строка Advanced */
      ${P}.${ADV_OPEN}::after {
        content: '';
        order: 6;
        flex-basis: 100%;
        height: 0;
      }
      ${FILTERS} > .el-select,
      ${YEAR},
      ${P} .random-btn { order: 7; }
      ${LISTS} > .group-header { order: 8; } /* «Reorder» — в конец строки */
      ${P}:not(.${ADV_OPEN}) ${FILTERS.slice(P.length)} > .el-select,
      ${P}:not(.${ADV_OPEN}) ${YEAR.slice(P.length)},
      ${P}:not(.${ADV_OPEN}) .random-btn { display: none; }
      ${P}.${ADV_OPEN} ${LISTS.slice(P.length)} > .group-header { display: block; }
      ${FILTERS} > .el-select { width: 124px; margin-inline: 0; }
      ${FILTERS} > .el-select.is-multiple,
      ${FILTERS} > .el-select:has(.el-select__tags) { width: 140px; }
      ${YEAR} { display: flex; align-items: center; gap: 8px; }
      ${YEAR} > .group-header { margin: 0; white-space: nowrap; }
      ${YEAR} .el-slider { width: 100px; margin: 0 6px; }
      ${YEAR} .el-slider__runway { background: rgb(var(--color-background)); }
      ${P} .random-btn { margin-inline: 0; }
      /* «Reorder List Sections» — иконка сайта; слово «Lists» прячем */
      ${LISTS} > .group-header { font-size: 0; }
      ${LISTS} > .group-header .action {
        display: inline-flex;
        margin: 0;
        padding: 9px 11px;
        border-radius: 8px;
        background: rgb(var(--color-background));
        opacity: 1;
      }
      ${LISTS} > .group-header svg { font-size: 1.3rem; }

      /* «Finished» и «Advanced» */
      ${P} .${TOGGLE}, ${P} .${ADV} {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 32px;
        padding: 0 12px;
        border: 0;
        border-radius: 8px;
        background: rgb(var(--color-background));
        color: rgb(var(--color-text-lighter));
        font-family: inherit;
        font-size: 1.3rem;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        transition: color 0.15s, background 0.15s;
      }
      ${P} .${ADV} { gap: 7px; padding: 0 10px; }
      ${P} .${TOGGLE}:hover, ${P} .${ADV}:hover {
        color: rgb(var(--color-text));
        background: rgba(var(--color-background), 0.7);
      }
      ${P} .${TOGGLE} input { position: absolute; opacity: 0; pointer-events: none; }
      ${P} .${TOGGLE} .tm-box {
        width: 14px;
        height: 14px;
        border-radius: 4px;
        background: rgba(var(--color-text-lighter), 0.25);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }
      ${P} .${TOGGLE} .tm-box::after {
        content: '';
        width: 4px;
        height: 8px;
        margin-top: -2px;
        border: solid rgb(var(--color-white));
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
        opacity: 0;
      }
      ${P} .${TOGGLE}:has(input:checked) { color: rgb(var(--color-text)); }
      ${P} .${TOGGLE}:has(input:checked) .tm-box { background: rgb(var(--color-blue)); }
      ${P} .${TOGGLE}:has(input:checked) .tm-box::after { opacity: 1; }
      ${P} .${ADV} svg { width: 15px; height: 15px; }
      ${P} .${ADV}::after { /* шеврон */
        content: '';
        width: 6px;
        height: 6px;
        margin-top: -3px;
        border: solid currentColor;
        border-width: 0 1.5px 1.5px 0;
        transform: rotate(45deg);
        transition: transform 0.15s, margin 0.15s;
      }
      ${P}.${ADV_OPEN} .${ADV} { color: rgb(var(--color-text)); }
      ${P}.${ADV_OPEN} .${ADV}::after { transform: rotate(-135deg); margin-top: 3px; }
      ${P} .${ADV} .tm-adv-count {
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        border-radius: 8px;
        background: rgb(var(--color-blue));
        color: rgb(var(--color-white));
        font-size: 1rem;
        font-weight: 700;
        line-height: 16px;
        text-align: center;
      }
      ${P} .${ADV} .tm-adv-count:empty { display: none; }
      ${P} .${ADV}:focus-visible,
      ${P} .${TOGGLE}:has(input:focus-visible) {
        outline: 2px solid rgba(var(--color-blue), 0.6);
        outline-offset: 2px;
      }

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

  // Иконка «Advanced» — ползунки (как «настройки фильтра»), рисуется
  // currentColor, поэтому подсвечивается вместе с текстом кнопки.
  const ADV_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/>' +
    '<circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>';

  // «Finished» — быстрый переключатель Status: Finished ⇄ все (null).
  // Status — el-select (Element UI) с v-model, ищем его по опции FINISHED
  // (классы у селектов перепутаны: у Status — .format, у Country — .status).
  // Значение ставим $emit('input', …) на его Vue-компоненте — родитель
  // обновляет фильтр как при выборе мышью (проверено: 108 → только
  // FINISHED, null — обратно все). Галочка следует за селектом, если
  // статус поменяли в нём самом. Нужен мир страницы (__vue__) — @grant none.
  function statusSelect() {
    for (const el of document.querySelectorAll('.medialist .filters .el-select')) {
      if (el.__vue__?.options?.some((o) => o.value === FINISHED)) return el;
    }
    return null;
  }

  // «Advanced» — показать/скрыть строку спрятанных фильтров (класс на
  // .filters-wrap, состояние — localStorage). Счётчик на иконке — сколько
  // фильтров из спрятанных задано, чтобы при закрытой строке было видно,
  // почему список короче: селекты группы Filters с непустым значением
  // (Status = FINISHED не считаем — его видно по «Finished») и год, если
  // слайдер не на минимуме (минимум 1950 = «любой»).
  function advOpen() {
    try {
      return localStorage.getItem(ADV_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setAdvOpen(open) {
    try {
      localStorage.setItem(ADV_KEY, open ? '1' : '0');
    } catch {}
  }

  function hiddenActive(group) {
    let n = 0;
    for (const el of group.querySelectorAll(':scope > .el-select')) {
      const v = el.__vue__?.value;
      if (v == null || v === '' || v === FINISHED) continue;
      if (Array.isArray(v) && !v.length) continue;
      n++;
    }
    const slider = group.parentElement.querySelector('.el-slider')?.__vue__;
    if (slider && slider.value > slider.min) n++;
    return n;
  }

  // Подсказка у иконки Sort — текущая сортировка (её текст в input).
  function syncSortTitle() {
    const sel = document.querySelector('.medialist .filters .filter-group:nth-child(4) .el-select');
    const v = sel?.querySelector('.el-input__inner')?.value;
    if (!sel || !v) return;
    const t = 'Sort: ' + v;
    if (sel.title !== t) sel.title = t;
  }

  function sync() {
    syncSortTitle();
    const el = statusSelect();
    if (!el) return;
    let label = el.parentElement.querySelector(':scope > .' + TOGGLE);
    if (!label) {
      label = document.createElement('label');
      label.className = TOGGLE;
      label.title = 'Только завершённые (Status: Finished)';
      label.innerHTML = '<input type="checkbox"><span class="tm-box"></span>Finished';
      label.firstChild.addEventListener('change', (e) => {
        statusSelect()?.__vue__.$emit('input', e.target.checked ? FINISHED : null);
      });
    }
    if (el.nextElementSibling !== label) el.after(label);
    const checked = el.__vue__.value === FINISHED;
    if (label.firstChild.checked !== checked) label.firstChild.checked = checked;

    const wrap = el.closest('.filters-wrap');
    let btn = el.parentElement.querySelector(':scope > .' + ADV);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = ADV;
      btn.title = 'Advanced: Format, Status, Genres & Tags, Country, Year, случайный тайтл, порядок разделов';
      btn.setAttribute('aria-label', 'Advanced filters');
      btn.innerHTML = ADV_ICON + '<span class="tm-adv-count"></span>';
      btn.addEventListener('click', () => {
        const open = !btn.closest('.filters-wrap').classList.contains(ADV_OPEN);
        setAdvOpen(open);
        btn.closest('.filters-wrap').classList.toggle(ADV_OPEN, open);
        btn.setAttribute('aria-expanded', String(open));
      });
    }
    if (label.nextElementSibling !== btn) label.after(btn);
    const open = advOpen();
    if (wrap.classList.contains(ADV_OPEN) !== open) wrap.classList.toggle(ADV_OPEN, open);
    if (btn.getAttribute('aria-expanded') !== String(open)) btn.setAttribute('aria-expanded', String(open));
    const n = hiddenActive(el.parentElement);
    const count = btn.lastChild;
    if (count.textContent !== (n ? String(n) : '')) count.textContent = n ? String(n) : '';
  }

  // SPA + Vue: пересчёт раз в кадр на любые мутации (смена значения
  // селекта меняет текст его input — это тоже мутация).
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sync();
    });
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'value'] });
  sync();
})();
