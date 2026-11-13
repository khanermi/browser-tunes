// ==UserScript==
// @name         AniList List Cards
// @namespace    local
// @version      1.6
// @description  Список аниме/манги AniList, вид карточками: обложка чистая, название, прогресс и оценка — под ней, а не плашкой поверх картинки; обложка — ссылка на тайтл, как название; смайлики оценки — зелёный/жёлтый/красный; «+» серии прямо в счётчике, сохранение через 3 с без кликов.
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
  const CHIP = 'tm-progress-chip';
  const ALWAYS = 'tm-plus-always';
  const DEBOUNCE_MS = 3000;
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

    /* «+ серия» прямо в счётчике (1.6). Счётчик с «+» сайта — чип, «+»
       виден всегда у Watching/Rewatching (у остальных — по наведению, как у
       сайта). Клик по всему чипу добавляет серию локально, сохранение — через
       ${DEBOUNCE_MS / 1000} с тишины (см. flush ниже). Пока ждём —
       своё число из data-tm-pending (текст Vue прячем font-size: 0, чтобы не
       бороться с его перерисовкой) и полоска-обратный отсчёт снизу. */
    html body .medialist.cards .entry-card > .progress.${CHIP} {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin: 4px 0 0;
      padding: 2px 4px 2px 7px;
      border-radius: 10px;
      background: rgba(var(--color-blue), 0.08);
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }
    html body .medialist.cards .entry-card > .progress.${CHIP}:hover {
      background: rgba(var(--color-blue), 0.18);
    }
    html body .medialist.cards .entry-card > .progress.${CHIP} > .plus-progress {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgba(var(--color-blue), 0.2);
      color: rgb(var(--color-blue));
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
      visibility: hidden;
    }
    html body .medialist.cards .entry-card > .progress.${CHIP}.${ALWAYS} > .plus-progress,
    html body .medialist.cards .entry-card:hover > .progress.${CHIP} > .plus-progress,
    html body .medialist.cards .entry-card > .progress.${CHIP}[data-tm-pending] > .plus-progress {
      visibility: visible;
    }
    html body .medialist.cards .entry-card > .progress.${CHIP}[data-tm-pending] {
      font-size: 0;
      background: rgba(var(--color-blue), 0.3);
    }
    html body .medialist.cards .entry-card > .progress.${CHIP}[data-tm-pending]::before {
      content: attr(data-tm-pending);
      font-size: 12px;
      font-weight: 600;
      color: rgb(var(--color-text-bright)); /* --color-blue на профиле = акцент, как у прогресса */
    }
    html body .medialist.cards .entry-card > .progress.${CHIP}[data-tm-tick]::after {
      content: '';
      position: absolute;
      left: 7px;
      right: 7px;
      bottom: 0;
      height: 2px;
      border-radius: 1px;
      background: rgb(var(--color-blue));
      transform-origin: left;
    }
    /* Две одинаковые анимации: смена имени перезапускает отсчёт на каждый клик. */
    html body .medialist.cards .entry-card > .progress.${CHIP}[data-tm-tick="a"]::after {
      animation: tm-drain-a ${DEBOUNCE_MS}ms linear forwards;
    }
    html body .medialist.cards .entry-card > .progress.${CHIP}[data-tm-tick="b"]::after {
      animation: tm-drain-b ${DEBOUNCE_MS}ms linear forwards;
    }
    html body .medialist.cards .entry-card > .progress.${CHIP}[data-tm-tick="saving"]::after {
      transform: scaleX(1);
      opacity: 0.4;
    }
    @keyframes tm-drain-a { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    @keyframes tm-drain-b { from { transform: scaleX(1); } to { transform: scaleX(0); } }
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
      syncProgress(card);
    }
  }

  // «+ серия» без открытия «…» (1.6). У сайта .progress = «11/13» + span
  // .plus-progress (display: none до наведения), клик по нему —
  // card.__vue__.plusProgress('progress'): на КАЖДЫЙ клик
  // $store.dispatch('medialistEditor/save', {mediaId, progress: entry.progress + 1}).
  // .plus-progress есть у всех статусов, кроме Completed.
  // Мы перехватываем клик по всему счётчику в capture и копим серии
  // локально (pending по mediaId: Vue переиспользует карточки при смене
  // фильтра, поэтому состояние не в DOM, а в Map), а сохраняем тем же
  // действием сайта, когда DEBOUNCE_MS не было кликов. Пока идёт запрос,
  // новые клики продолжают копиться и уходят следующим запросом.
  // __vue__ — page-world expando: работает, потому что @grant none (как в
  // anilist-cover-score). Предел — media.episodes/chapters (у онгоингов null).
  const pending = new Map(); // mediaId -> {target, timer, saving, tick}

  function cardVm(card) {
    const vm = card.__vue__;
    return vm && typeof vm.plusProgress === 'function' && vm.entry && vm.media ? vm : null;
  }

  function maxOf(vm) {
    const n = vm.type === 'MANGA' ? vm.media.chapters : vm.media.episodes;
    return n > 0 ? n : null;
  }

  function label(vm, value) {
    const max = maxOf(vm);
    return max ? `${value}/${max}` : String(value);
  }

  function syncProgress(card) {
    const p = card.querySelector(':scope > .progress');
    if (!p) return;
    const vm = cardVm(card);
    const has = !!(vm && p.querySelector(':scope > .plus-progress'));
    p.classList.toggle(CHIP, has);
    const st = vm?.entry.status;
    p.classList.toggle(ALWAYS, has && (st === 'CURRENT' || st === 'REPEATING'));
    const s = has ? pending.get(vm.media.id) : null;
    setAttr(p, 'data-tm-pending', s ? label(vm, s.target) : null);
    setAttr(p, 'data-tm-tick', s ? (s.saving ? 'saving' : s.tick) : null);
    if (has) p.title = 'Клик — +1 серия (сохранится через 3 с без кликов)';
    else p.removeAttribute('title');
  }

  function setAttr(el, name, value) {
    if (value == null) el.removeAttribute(name);
    else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  function refresh(mediaId) {
    for (const card of document.querySelectorAll('.medialist.cards .entry-card')) {
      if (cardVm(card)?.media.id === mediaId) syncProgress(card);
    }
  }

  function arm(mediaId, s) {
    clearTimeout(s.timer);
    s.tick = s.tick === 'a' ? 'b' : 'a';
    s.timer = setTimeout(() => flush(mediaId), DEBOUNCE_MS);
  }

  async function flush(mediaId) {
    const s = pending.get(mediaId);
    if (!s || s.saving) return;
    clearTimeout(s.timer);
    s.saving = true;
    s.sent = s.target;
    refresh(mediaId);
    try {
      await s.store.dispatch('medialistEditor/save', { mediaId, progress: s.sent });
    } catch (err) {
      console.warn('[anilist-list-cards] не сохранилось', mediaId, err);
      pending.delete(mediaId);
      refresh(mediaId);
      return;
    }
    s.saving = false;
    if (s.target === s.sent) pending.delete(mediaId);
    else arm(mediaId, s); // пока сохраняли, накликали ещё
    refresh(mediaId);
  }

  document.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    const p = e.target.closest?.('.medialist.cards .entry-card > .progress.' + CHIP);
    if (!p) return;
    const vm = cardVm(p.parentElement);
    if (!vm) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // родной plusProgress не зовём
    const id = vm.media.id;
    let s = pending.get(id);
    if (!s) {
      s = { target: vm.entry.progress || 0, store: vm.$store, tick: 'b' };
      pending.set(id, s);
    }
    const max = maxOf(vm);
    if (max == null || s.target < max) s.target++;
    arm(id, s);
    refresh(id);
  }, true);

  // Уходим со страницы/вкладки — сохраняем накопленное сразу.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') for (const id of pending.keys()) flush(id);
  });

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
