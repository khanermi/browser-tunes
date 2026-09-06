// ==UserScript==
// @name         YummyAnime Episode Nav
// @namespace    local
// @version      1.0
// @description  Ctrl+Left/Right — переключение серии на old.yummyani.me. Работает и когда фокус внутри iframe плеера (postMessage-мост).
// @match        *://old.yummyani.me/*
// @match        *://ru.yummyani.me/*
// @match        *://kodikplayer.com/*
// @match        *://video.sibnet.ru/*
// @match        *://alloha.yani.tv/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/yummyani-episode-nav.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/yummyani-episode-nav.user.js
// ==/UserScript==

(function () {
  'use strict';

  const NAV_MESSAGE = 'yummyani-episode-nav';
  const SITE_HOST = /(^|\.)yummyani\.me$/;

  // Плеер успевает перекрасить активную серию только через ~1-1.5 с после клика
  // (класс-маркер переезжает за ~0.4 с, фон — заметно позже). Пока фон не догнал,
  // считаем активной ту серию, которую выбрали мы сами, иначе быстрые повторные
  // Ctrl+Right читают устаревшее состояние и топчутся на месте.
  const PENDING_MS = 4000;

  function isRealTextInput(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    if (el.readOnly || el.disabled) return false;
    const style = getComputedStyle(el);
    if (parseFloat(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return false;
    return true;
  }

  // ==================== Ветка внутри iframe плеера ====================
  //
  // Плеер — cross-origin iframe (kodikplayer.com, video.sibnet.ru, alloha.yani.tv,
  // CVH отдаётся с ru.yummyani.me), поэтому из него не достать DOM списка серий.
  // Единственная задача этой ветки — пробросить хоткей наверх через postMessage;
  // window.top долетает напрямую с любой глубины вложенности.
  //
  // Домены плееров стоят в @match ради этой ветки, но они используются и другими
  // сайтами, поэтому гейтим по referrer: вне страниц yummyani скрипт полностью
  // инертен и чужие Ctrl+Left/Right не перехватывает.
  if (window.top !== window.self) {
    let embedder = '';
    try {
      embedder = new URL(document.referrer).hostname;
    } catch (e) {
      /* referrer пустой/битый — считаем, что встроены не нами */
    }
    if (!SITE_HOST.test(embedder)) return;

    document.addEventListener(
      'keydown',
      (e) => {
        if (!e.ctrlKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
        if (isRealTextInput(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        window.top.postMessage(
          { type: NAV_MESSAGE, delta: e.key === 'ArrowRight' ? 1 : -1 },
          '*'
        );
      },
      true
    );
    return;
  }

  // ==================== Поиск списка серий ====================
  //
  // Классы списка — перегенерируемые хэши (Y56k / Yqy0 / WYvA / gRQ9), поэтому
  // ищем структурно: видимый контейнер внутри #video, у которого большинство
  // детей — чистый номер серии. Это работает в обоих вариантах вёрстки
  // ("Новый дизайн" в настройках плеера вкл/выкл): при выключенном тумблере
  // список лежит внутри выбранной строки озвучки (.WYvA > .gRQ9), при
  // включенном — рядом с .selectors. В обоих случаях подходящий контейнер на
  // странице ровно один, поэтому тумблер трогать не нужно.
  //
  // Списки невыбранных озвучек/плееров в DOM не висят: он рендерится лениво
  // только для текущего выбора — поэтому пересечься с чужим списком нельзя.

  function looksLikeEpisodeList(el) {
    const kids = el.children;
    if (kids.length < 2) return 0;
    let numeric = 0;
    for (const kid of kids) {
      if (/^\d+$/.test((kid.textContent || '').trim())) numeric++;
    }
    return numeric > kids.length / 2 ? numeric : 0;
  }

  function findEpisodesContainer() {
    const scope = document.querySelector('#video') || document.body;
    if (!scope) return null;
    let best = null;
    let bestCount = 0;
    for (const el of scope.querySelectorAll('*')) {
      if (el.offsetParent === null) continue;
      const count = looksLikeEpisodeList(el);
      if (count > bestCount) {
        best = el;
        bestCount = count;
      }
    }
    return best;
  }

  // Активную серию нельзя опознать по классу: у пункта три визуальных состояния
  // (не просмотрено / просмотрено / активно), и у "просмотрено" тоже свой
  // класс-маркер. Зато активная — единственная с цветным фоном (зелёный
  // rgb(60,206,123)), остальные состояния — нейтральные серые rgb(34,34,34) и
  // rgb(75,75,75), где R≈G≈B.
  function isChromatic(color) {
    const parts = (color || '').match(/[\d.]+/g);
    if (!parts) return false;
    const [r, g, b, a] = parts.map(Number);
    if (a === 0) return false;
    return Math.max(r, g, b) - Math.min(r, g, b) > 15;
  }

  function findActive(items) {
    const chromatic = items.filter((el) => isChromatic(getComputedStyle(el).backgroundColor));
    return chromatic.length === 1 ? chromatic[0] : null;
  }

  // ==================== Переключение серий ====================

  let pending = null;

  function currentIndex(items) {
    const active = findActive(items);
    if (pending && Date.now() - pending.at < PENDING_MS) {
      if (active === pending.el) {
        pending = null;
        return items.indexOf(active);
      }
      const idx = items.indexOf(pending.el);
      if (idx !== -1) return idx;
    }
    pending = null;
    return active ? items.indexOf(active) : -1;
  }

  function focusPlayer() {
    // Отложенный вызов не должен выдёргивать фокус, если пользователь за эту
    // секунду успел кликнуть в комментарии или в поиск.
    if (isRealTextInput(document.activeElement)) return;
    const frame = document.querySelector('#video iframe');
    if (frame) {
      try {
        frame.focus({ preventScroll: true });
      } catch (e) {
        /* не критично: фокус останется на странице */
      }
    }
  }

  // 'switched'    — серия переключена
  // 'boundary'    — список найден, но это первая/последняя серия
  // 'unavailable' — списка серий на странице нет, хоткей не наш
  function switchEpisode(delta) {
    const container = findEpisodesContainer();
    if (!container) return 'unavailable';

    const items = [...container.children];
    if (items.length < 2) return 'unavailable';

    const idx = currentIndex(items);
    if (idx === -1) return 'unavailable';

    const target = items[idx + delta];
    if (!target) return 'boundary';

    target.click();
    pending = { el: target, at: Date.now() };

    // Сразу после клика сайт пересоздаёт iframe плеера, поэтому фокусим дважды:
    // текущий кадр и тот, что появится после перерисовки.
    focusPlayer();
    setTimeout(focusPlayer, 1200);
    return 'switched';
  }

  // Ctrl+Left/Right, нажатый внутри iframe плеера, прилетает сюда сообщением.
  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || data.type !== NAV_MESSAGE) return;
    if (data.delta !== 1 && data.delta !== -1) return;
    switchEpisode(data.delta);
  });

  // ==================== Хоткеи ====================

  document.addEventListener(
    'keydown',
    (e) => {
      if (!e.ctrlKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      if (isRealTextInput(e.target)) return;

      // preventDefault/stopPropagation обязательны: плеер ловит стрелку как
      // перемотку и ctrlKey не проверяет. Но глушим только когда список серий
      // реально найден, иначе на остальных страницах сайта Ctrl+Left/Right
      // остаётся штатным браузерным/страничным хоткеем.
      if (switchEpisode(e.key === 'ArrowRight' ? 1 : -1) !== 'unavailable') {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
})();
