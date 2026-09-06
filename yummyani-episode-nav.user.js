// ==UserScript==
// @name         YummyAnime Episode Nav
// @namespace    local
// @version      1.1
// @description  Ctrl+Left/Right — переключение серии на old.yummyani.me. Работает и когда фокус внутри iframe плеера (postMessage-мост), после переключения фокус ставится на <video> внутри плеера.
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
  const FOCUS_MESSAGE = 'yummyani-episode-nav-focus-video';
  const FOCUS_ACK = 'yummyani-episode-nav-video-focused';
  const SITE_HOST = /(^|\.)yummyani\.me$/;

  // Плеер успевает перекрасить активную серию только через ~1-1.5 с после клика
  // (класс-маркер переезжает за ~0.4 с, фон — заметно позже). Пока фон не догнал,
  // считаем активной ту серию, которую выбрали мы сами, иначе быстрые повторные
  // Ctrl+Right читают устаревшее состояние и топчутся на месте.
  const PENDING_MS = 4000;

  // Внутри плеера: серия грузится асинхронно, <video> появляется в документе
  // позже, чем прилетает просьба его сфокусировать — поэтому опрашиваем.
  const VIDEO_POLL_MS = 250;
  const VIDEO_POLL_TRIES = 24; // ~6 с

  // В топ-документе: после клика по серии сайт пересоздаёт <iframe>, так что
  // первая просьба почти всегда уходит в ещё не загруженный документ. Шлём
  // серией, пока плеер не подтвердит (FOCUS_ACK) или не истечёт окно.
  const FOCUS_PING_MS = 400;
  const FOCUS_WINDOW_MS = 6000;

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

  // ==================== Фокус на <video> внутри плеера ====================
  //
  // Топ-документ умеет сфокусировать только сам элемент <iframe>, а это не то же
  // самое, что фокус на <video> внутри документа плеера: Space (play/pause)
  // тогда срабатывает через раз — куда он долетит, зависит от того, что успел
  // перехватить JS самого плеера. Достучаться до <video> из топа нельзя
  // (cross-origin), поэтому фокус ставит код, исполняющийся внутри плеера,
  // по просьбе сверху — вот эта функция.
  //
  // Слушатель ставится независимо от referrer-гейта ниже: он реагирует только
  // на наше собственное сообщение и ничего не перехватывает, зато так же
  // работает и во вложенном плеере (плеер внутри плеера), куда referrer уже не
  // домен yummyani.
  function installVideoFocusBridge() {
    let tries = 0;
    let timer = null;

    function focusVideo() {
      timer = null;
      if (isRealTextInput(document.activeElement)) return;

      const video = document.querySelector('video');
      if (video) {
        // <video> без controls штатно не фокусируется вовсе; -1 (а не 0), чтобы
        // не менять порядок обхода табом внутри плеера.
        if (!video.hasAttribute('tabindex')) video.setAttribute('tabindex', '-1');
        try {
          video.focus({ preventScroll: true });
        } catch (e) {
          /* не критично: фокус останется на самом <iframe>, как было до 1.1 */
        }
        if (document.activeElement === video) {
          window.top.postMessage({ type: FOCUS_ACK }, '*');
          return;
        }
      }

      if (++tries < VIDEO_POLL_TRIES) timer = setTimeout(focusVideo, VIDEO_POLL_MS);
    }

    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== FOCUS_MESSAGE) return;

      // Если плеер вложил ещё один iframe, <video> лежит там — просто
      // пробрасываем просьбу на уровень глубже; ответит (FOCUS_ACK) тот
      // уровень, где видео действительно есть. Сообщение идёт только вниз,
      // так что зациклиться не может.
      for (let i = 0; i < window.frames.length; i++) {
        try {
          window.frames[i].postMessage({ type: FOCUS_MESSAGE }, '*');
        } catch (err) {
          /* чужой фрейм закрыт/недоступен — не наша забота */
        }
      }

      tries = 0;
      clearTimeout(timer);
      focusVideo();
    });
  }

  // ==================== Ветка внутри iframe плеера ====================
  //
  // Плеер — cross-origin iframe (kodikplayer.com, video.sibnet.ru, alloha.yani.tv,
  // CVH отдаётся с ru.yummyani.me), поэтому из него не достать DOM списка серий.
  // Единственная задача этой ветки — пробросить хоткей наверх через postMessage;
  // window.top долетает напрямую с любой глубины вложенности.
  //
  // Домены плееров стоят в @match ради этой ветки, но они используются и другими
  // сайтами, поэтому гейтим по referrer: вне страниц yummyani скрипт ничего не
  // перехватывает и чужие Ctrl+Left/Right не трогает (мост фокуса выше гейта не
  // требует — он молча ждёт сообщения, которое там некому послать).
  if (window.top !== window.self) {
    installVideoFocusBridge();

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

  function playerFrame() {
    return document.querySelector('#video iframe');
  }

  // «Наш» фокус — это body или сам плеер. Отложенные вызовы не должны выдёргивать
  // фокус, если пользователь за эту секунду успел кликнуть в комментарии, в поиск
  // или просто в другой элемент страницы.
  function focusIsOurs() {
    const el = document.activeElement;
    return !el || el === document.body || el === document.documentElement || el === playerFrame();
  }

  function focusPlayer() {
    if (!focusIsOurs()) return;
    const frame = playerFrame();
    if (!frame) return;
    try {
      frame.focus({ preventScroll: true });
    } catch (e) {
      /* не критично: фокус останется на странице */
    }
  }

  // Фокус на <iframe> (focusPlayer) обязателен — без него keydown вообще не
  // долетает до плеера. Но Space надёжно работает, только когда внутри плеера
  // сфокусирован <video>, а это может сделать лишь код внутри его документа
  // (см. installVideoFocusBridge). Просим его об этом, пока не подтвердит.
  let focusDeadline = 0;
  let focusTimer = null;

  function pingVideoFocus() {
    focusTimer = null;
    if (Date.now() > focusDeadline || !focusIsOurs()) return;

    const frame = playerFrame();
    if (frame && frame.contentWindow) {
      try {
        frame.contentWindow.postMessage({ type: FOCUS_MESSAGE }, '*');
      } catch (e) {
        /* фрейм ещё пересоздаётся — повторим на следующем тике */
      }
    }
    focusTimer = setTimeout(pingVideoFocus, FOCUS_PING_MS);
  }

  function requestVideoFocus() {
    focusDeadline = Date.now() + FOCUS_WINDOW_MS;
    if (focusTimer === null) pingVideoFocus();
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
    // текущий кадр и тот, что появится после перерисовки. Фокус на <video>
    // внутри плеера ставится отдельно — сообщениями, до подтверждения.
    focusPlayer();
    requestVideoFocus();
    setTimeout(focusPlayer, 1200);
    return 'switched';
  }

  // Ctrl+Left/Right, нажатый внутри iframe плеера, прилетает сюда сообщением;
  // им же плеер подтверждает, что забрал фокус на <video>.
  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data) return;

    if (data.type === FOCUS_ACK) {
      focusDeadline = 0;
      clearTimeout(focusTimer);
      focusTimer = null;
      return;
    }

    if (data.type !== NAV_MESSAGE) return;
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
