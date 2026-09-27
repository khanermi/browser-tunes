// ==UserScript==
// @name         AnimeJoy (ajsubs) Episode Nav
// @namespace    local
// @version      1.0
// @description  Ctrl+Left/Right — переключение серии на ajsubs.ru (AnimeJoy). Работает и когда фокус внутри iframe плеера (postMessage-мост), после переключения фокус ставится на <video> внутри плеера.
// @match        *://ajsubs.ru/*
// @match        *://animejoya.ru/player/*
// @match        *://fsst.online/embed/*
// @match        *://video.sibnet.ru/shell.php*
// @match        *://kodikplayer.com/*
// @match        *://*.kodikres.com/*
// @match        *://vkvideo.ru/video_ext.php*
// @match        *://dzen.ru/embed/*
// @match        *://matreshka.tv/embed/*
// @match        *://ok.ru/videoembed/*
// @match        *://my.mail.ru/video/embed/*
// @match        *://ebd.cda.pl/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/ajsubs-episode-nav.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/ajsubs-episode-nav.user.js
// ==/UserScript==

(function () {
  'use strict';

  const NAV_MESSAGE = 'ajsubs-episode-nav';
  const FOCUS_MESSAGE = 'ajsubs-episode-nav-focus-video';
  const FOCUS_ACK = 'ajsubs-episode-nav-video-focused';
  const SITE_HOST = /(^|\.)ajsubs\.ru$/;

  // Внутри плеера: серия грузится асинхронно, <video> появляется в документе
  // позже, чем прилетает просьба его сфокусировать — поэтому опрашиваем.
  const VIDEO_POLL_MS = 250;
  const VIDEO_POLL_TRIES = 24; // ~6 с

  // В топ-документе: клик по серии пересоздаёт <iframe>, так что первая
  // просьба почти всегда уходит в ещё не загруженный документ. Шлём серией,
  // пока плеер не подтвердит (FOCUS_ACK) или не истечёт окно.
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

  function isNavKey(e) {
    return e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft');
  }

  // ==================== Фокус на <video> внутри плеера ====================
  //
  // Схема та же, что в yummyani-episode-nav: топ может сфокусировать только
  // сам <iframe>, а Space надёжно работает лишь при фокусе на <video> внутри
  // документа плеера. Дотянуться туда из топа нельзя (cross-origin), поэтому
  // фокус ставит эта ветка по просьбе сверху и отвечает наверх — всегда, а не
  // только при удаче, чтобы было чем отлаживать.
  function installVideoFocusBridge() {
    let tries = 0;
    let timer = null;

    function report(focused) {
      try {
        window.top.postMessage(
          {
            type: FOCUS_ACK,
            focused,
            host: location.hostname,
            hasVideo: !!document.querySelector('video'),
            nested: document.querySelectorAll('iframe').length
          },
          '*'
        );
      } catch (e) {
        /* топ недоступен — ничего не поделать */
      }
    }

    function focusVideo() {
      timer = null;
      if (isRealTextInput(document.activeElement)) return;

      const video = document.querySelector('video');
      if (video) {
        if (!video.hasAttribute('tabindex')) video.setAttribute('tabindex', '-1');
        try {
          video.focus({ preventScroll: true });
        } catch (e) {
          /* не критично: фокус останется на самом <iframe> */
        }
        if (document.activeElement === video) {
          report(true);
          return;
        }
      }

      if (++tries < VIDEO_POLL_TRIES) timer = setTimeout(focusVideo, VIDEO_POLL_MS);
    }

    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== FOCUS_MESSAGE) return;

      // Просьба пришла по нашей цепочке — значит фрейм точно внутри ajsubs,
      // даже если referrer уже домен плеера (вложенный kodikres и т.п.).
      installKeyBridge();

      for (let i = 0; i < window.frames.length; i++) {
        try {
          window.frames[i].postMessage({ type: FOCUS_MESSAGE }, '*');
        } catch (err) {
          /* чужой фрейм закрыт/недоступен */
        }
      }

      report(false);
      tries = 0;
      clearTimeout(timer);
      focusVideo();
    });
  }

  // Хоткей внутри плеера: список серий отсюда недостижим, пробрасываем
  // нажатие наверх. Ловим на window в capture и глушим stopImmediatePropagation:
  // голые стрелки у плееров (Playerjs у "Наш плеер" и др.) — перемотка, и Ctrl
  // они не проверяют.
  let keyBridgeInstalled = false;

  function installKeyBridge() {
    if (keyBridgeInstalled) return;
    keyBridgeInstalled = true;

    window.addEventListener(
      'keydown',
      (e) => {
        if (!isNavKey(e) || isRealTextInput(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        window.top.postMessage(
          { type: NAV_MESSAGE, delta: e.key === 'ArrowRight' ? 1 : -1 },
          '*'
        );
      },
      true
    );
  }

  // ==================== Ветка внутри iframe плеера ====================
  //
  // Домены плееров используются и другими сайтами, поэтому хоткей включаем
  // только если нас встроил ajsubs (по referrer). Мост фокуса гейта не требует:
  // он лишь ждёт нашего сообщения.
  if (window.top !== window.self) {
    installVideoFocusBridge();

    let embedder = '';
    try {
      embedder = new URL(document.referrer).hostname;
    } catch (e) {
      /* referrer пустой/битый — считаем, что встроены не нами */
    }
    if (SITE_HOST.test(embedder)) installKeyBridge();
    return;
  }

  // ==================== Список серий ====================
  //
  // Плейлист сайта (templates/AnimeJoy/playlists/player.js) держит ВСЕ серии
  // всех озвучек и плееров в одном .playlists-videos; серии текущего выбора
  // помечены .visible, текущая серия — .active. Классы выставляет jQuery
  // синхронно в обработчике клика, так что состояние после нашего клика сразу
  // актуально — "оптимистичный" указатель, как на yummyani, не нужен.
  //
  // У Kodik в плейлисте один пункт "~" (сериал целиком, серии внутри самого
  // плеера) — меньше двух пунктов считаем "списка нет" и хоткей не трогаем.

  function visibleEpisodes() {
    return [...document.querySelectorAll('.playlists-videos li.visible')];
  }

  function playerFrame() {
    return document.querySelector('.playlists-iframe iframe');
  }

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
      /* не критично */
    }
  }

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
        /* фрейм ещё пересоздаётся — повторим */
      }
    }
    focusTimer = setTimeout(pingVideoFocus, FOCUS_PING_MS);
  }

  function requestVideoFocus() {
    focusDeadline = Date.now() + FOCUS_WINDOW_MS;
    if (focusTimer === null) pingVideoFocus();
  }

  // Лента серий — горизонтальный Sly-слайдер: без прокрутки выбранная серия
  // может уехать за край. Скрипт работает в контексте страницы (@grant none),
  // так что используем её же jQuery/Sly; если что-то не так — не страшно.
  function scrollStripTo(target) {
    try {
      window.jQuery('.playlists-videos .playlists-items').sly('toCenter', target);
    } catch (e) {
      /* лента не прокрутится, переключение от этого не зависит */
    }
  }

  // 'switched' / 'boundary' / 'unavailable' (списка нет — хоткей не наш)
  function switchEpisode(delta) {
    const items = visibleEpisodes();
    if (items.length < 2) return 'unavailable';

    const idx = items.findIndex((li) => li.classList.contains('active'));
    if (idx === -1) return 'unavailable';

    const target = items[idx + delta];
    if (!target) return 'boundary';

    // Обработчик сайта требует event.target именно <li> (клик по значку
    // "просмотрено" внутри он игнорирует) — .click() на самом li это даёт.
    target.click();
    scrollStripTo(target);

    focusPlayer();
    requestVideoFocus();
    setTimeout(focusPlayer, 1200);
    return 'switched';
  }

  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data) return;

    if (data.type === FOCUS_ACK) {
      if (data.focused === true) {
        focusDeadline = 0;
        clearTimeout(focusTimer);
        focusTimer = null;
      }
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
      if (!isNavKey(e) || isRealTextInput(e.target)) return;
      if (switchEpisode(e.key === 'ArrowRight' ? 1 : -1) !== 'unavailable') {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
})();
