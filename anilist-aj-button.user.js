// ==UserScript==
// @name         AniList → AJ
// @namespace    local
// @version      1.1
// @description  Кнопка «AJ» — поиск тайтла на otakujoy.fun (AnimeJoy): колонка справа в списке аниме (вид строками), кнопка над «…» на обложке (вид карточками) и кнопка под обложкой на странице тайтла. Открывает в новой вкладке главную AJ с #al=<id AniList> — там animejoy-title-ui сам берёт ромадзи/английское название и ищет.
// @match        *://anilist.co/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/anilist-aj-button.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/anilist-aj-button.user.js
// ==/UserScript==

(function () {
  'use strict';

  const CELL = 'tm-aj';
  const PAGE_BTN = 'tm-aj-open';
  const CARD_BTN = 'tm-aj-card';

  // Поиск делает animejoy-title-ui на главной AJ: по id он запрашивает у
  // GraphQL AniList ромадзи и английское название и пробует их по очереди;
  // t — запасное название (то, что видно здесь), если AniList не ответит.
  function ajUrl(id, title) {
    return 'https://otakujoy.fun/#' + new URLSearchParams({ al: id, t: title }).toString();
  }

  function animeId(href) {
    const m = /\/anime\/(\d+)/.exec(href || '');
    return m ? m[1] : null;
  }

  const style = document.createElement('style');
  style.textContent = `
    .list-head .${CELL}, .entry .${CELL} {
      flex: none;
      width: 52px;
      text-align: center;
    }
    .${CELL} a {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      background: rgba(115, 80, 255, 0.16);
      color: #b9a8ff;
      font-size: 1.2rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.4;
      transition: background 0.15s, color 0.15s;
    }
    .${CELL} a:hover {
      background: #7350ff;
      color: #fff;
    }
    /* Вид карточками: над кнопкой «…» (.edit, 30×30, right 10px; в
       anilist-list-cards перенесена вниз — bottom 10px), так же по наведению. */
    .medialist.cards .entry-card .cover > .${CARD_BTN} {
      position: absolute;
      right: 10px;
      bottom: 46px;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      background: #7350ff;
      color: #fff;
      font-size: 1.2rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      opacity: 0;
      transition: opacity 0.2s, filter 0.15s;
    }
    .medialist.cards .entry-card:hover .cover > .${CARD_BTN} {
      opacity: 1;
    }
    .medialist.cards .entry-card .cover > .${CARD_BTN}:hover {
      filter: brightness(1.15);
    }
    .header .actions .${PAGE_BTN} {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 35px;
      border-radius: 3px;
      background: #7350ff;
      color: #fff;
      font-size: 1.4rem;
      font-weight: 600;
      transition: filter 0.15s;
    }
    .header .actions .${PAGE_BTN}:hover {
      filter: brightness(1.12);
    }
    .header .actions .${PAGE_BTN} b {
      font-weight: 800;
      letter-spacing: -0.03em;
    }
  `;
  document.head.appendChild(style);

  function makeLink(className) {
    const a = document.createElement('a');
    if (className) a.className = className;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = 'Искать в AJ (otakujoy.fun)';
    // строка списка/шапка — Vue-компоненты, клик не должен до них доходить
    a.addEventListener('click', (e) => e.stopPropagation());
    return a;
  }

  function setLink(a, id, title) {
    const url = ajUrl(id, title);
    if (a.href !== url) a.href = url;
  }

  // Список (вид строками): .list-head.row / .entry.row — flex-строки
  // (cover, title, score, progress, status, format, span.release-status).
  // Vue переиспользует строки при сортировке/фильтре, поэтому ссылку
  // сверяем с текущим .title a на каждом проходе.
  function syncList() {
    for (const head of document.querySelectorAll('.list-head')) {
      if (!head.querySelector(':scope > .format') || head.querySelector(':scope > .' + CELL)) continue;
      // только в списке аниме (у манги та же разметка, кнопки там нет)
      if (!head.parentElement?.querySelector('.entry .title a[href*="/anime/"]')) continue;
      const cell = document.createElement('div');
      cell.className = CELL;
      cell.textContent = 'AJ';
      head.appendChild(cell);
    }
    for (const row of document.querySelectorAll('.entry')) {
      const link = row.querySelector(':scope > .title a[href]');
      const id = link && animeId(link.getAttribute('href'));
      let cell = row.querySelector(':scope > .' + CELL);
      if (!id || !row.querySelector(':scope > .format')) {
        cell?.remove();
        continue;
      }
      if (!cell) {
        cell = document.createElement('div');
        cell.className = CELL;
        const a = makeLink();
        a.textContent = 'AJ';
        cell.appendChild(a);
        row.appendChild(cell);
      }
      setLink(cell.firstChild, id, link.textContent.trim());
    }
  }

  // Список (вид карточками): .entry-card > .cover (.edit «…» + .image),
  // название — .entry-card > .title a[href=/anime/<id>/…]. Кнопка — в .cover,
  // чтобы стоять на обложке над «…». Vue переиспользует карточки — как и
  // со строками, href сверяем на каждом проходе.
  function syncCards() {
    for (const card of document.querySelectorAll('.entry-card')) {
      const cover = card.querySelector(':scope > .cover');
      const link = card.querySelector(':scope > .title a[href]');
      const id = link && animeId(link.getAttribute('href'));
      let btn = cover?.querySelector(':scope > .' + CARD_BTN);
      if (!cover || !id) {
        btn?.remove();
        continue;
      }
      if (!btn) {
        btn = makeLink(CARD_BTN);
        btn.textContent = 'AJ';
        cover.appendChild(btn);
      }
      setLink(btn, id, link.textContent.trim());
    }
  }

  // Страница тайтла /anime/<id>/…: под «Add to List» и сердечком
  // (.header .cover-wrap-inner .actions — грид 165px 35px) отдельной строкой.
  function syncPage() {
    const actions = document.querySelector('.header .cover-wrap-inner .actions');
    const id = animeId(location.pathname);
    let btn = actions?.querySelector(':scope > .' + PAGE_BTN);
    if (!actions || !id) {
      btn?.remove();
      return;
    }
    if (!btn) {
      btn = makeLink(PAGE_BTN);
      btn.innerHTML = 'Искать в <b>AJ</b>';
      actions.appendChild(btn);
    }
    const title = document.querySelector('.header h1')?.textContent.trim() || '';
    setLink(btn, id, title);
  }

  function sync() {
    syncList();
    syncCards();
    syncPage();
  }

  // SPA: пересчёт раз в кадр на любые мутации. Свои записи (href) тоже будят
  // observer, но пишем только при расхождении — цикл затухает за проход.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sync();
    });
  }).observe(document.body, { childList: true, subtree: true });

  sync();
})();
