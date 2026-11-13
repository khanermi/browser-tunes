// ==UserScript==
// @name         AniList List Filters
// @namespace    local
// @version      1.3
// @description  Список аниме/манги AniList: фильтры не колонкой слева, а панелью сверху (вкладки списков, «Finished», сортировка; остальное — за кнопкой «Advanced»), список — на всю ширину.
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
  // .filters и группа Filters — display: contents: всё становится
  // flex-элементами одной панели, строки задаёт order:
  //   1-я — поиск, вкладки;
  //   2-я — «Finished», кнопка «Advanced», Sort (справа);
  //   3-я — (только при открытом Advanced) Format, Status, Genres & Tags,
  //         Country, Year, случайный тайтл.
  // Перенос на 3-ю строку: Sort с flex-basis calc(100% - 300px) забирает
  // остаток 2-й строки, следующему элементу места не остаётся. Выпадашки
  // el-select — поппер в body, от раскладки не зависят.
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
        flex: 1 1 calc(100% - 240px);
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

      /* 2-я строка: «Finished» (внутри группы Filters), «Advanced», Sort */
      ${P} .filter-group:nth-child(2) { display: contents; }
      ${P} .filter-group:nth-child(2) > .group-header { display: none; }
      ${P} .${TOGGLE} { order: 3; }
      ${P} .${ADV} { order: 4; }
      ${P} .filter-group:nth-child(4) {
        order: 5;
        flex: 1 1 calc(100% - 300px);
        justify-content: flex-end;
      }

      /* 3-я строка — Advanced */
      ${P} .filter-group:nth-child(2) > .el-select,
      ${P} .filter-group:nth-child(3),
      ${P} .random-btn { order: 7; margin: 0; }
      ${P}:not(.${ADV_OPEN}) .filter-group:nth-child(2) > .el-select,
      ${P}:not(.${ADV_OPEN}) .filter-group:nth-child(3),
      ${P}:not(.${ADV_OPEN}) .random-btn { display: none; }
      /* «Genres & Tags» — длиннее остальных */
      ${P} .filter-group .el-select { width: 124px; margin: 0; }
      ${P} .filter-group .el-select.is-multiple,
      ${P} .filter-group .el-select:has(.el-select__tags) { width: 140px; }
      ${P} .filter-group .el-slider { width: 100px; margin: 0 6px; }
      ${P} .filter-group .el-slider__runway { background: rgb(var(--color-background)); }
      ${P} .filter-group:nth-child(4) .el-select { width: 140px; }

      /* Переключатель «Finished» — после селекта Status */
      ${P} .${TOGGLE}, ${P} .${ADV} {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 32px;
        padding: 0 12px;
        border-radius: 8px;
        background: rgb(var(--color-background));
        color: rgb(var(--color-text-lighter));
        font-size: 1.3rem;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        transition: color 0.15s, background 0.15s;
      }
      ${P} .${ADV} { border: 0; font-family: inherit; }
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
      ${P} .${ADV}::after { /* шеврон */
        content: '';
        width: 6px;
        height: 6px;
        margin: -3px 0 0 2px;
        border: solid currentColor;
        border-width: 0 1.5px 1.5px 0;
        transform: rotate(45deg);
        transition: transform 0.15s, margin 0.15s;
      }
      ${P}.${ADV_OPEN} .${ADV} { color: rgb(var(--color-text)); }
      ${P}.${ADV_OPEN} .${ADV}::after { transform: rotate(-135deg); margin-top: 3px; }
      ${P} .${ADV} .tm-adv-count {
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: rgb(var(--color-blue));
        color: rgb(var(--color-white));
        font-size: 1.1rem;
        font-weight: 600;
        line-height: 18px;
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

  // «Advanced» — показать/скрыть 3-ю строку (класс на .filters-wrap,
  // состояние — localStorage). Счётчик на кнопке — сколько фильтров из
  // спрятанных задано, чтобы при закрытой строке было видно, почему список
  // короче: селекты группы Filters с непустым значением (Status = FINISHED
  // не считаем — его видно по «Finished») и год, если слайдер не на минимуме
  // (минимум 1950 = «любой»).
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

  function sync() {
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
      btn.title = 'Format, Status, Genres & Tags, Country, Year, случайный тайтл';
      btn.innerHTML = 'Advanced<span class="tm-adv-count"></span>';
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
