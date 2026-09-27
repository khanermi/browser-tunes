// ==UserScript==
// @name         AnimeJoy (ajsubs) Episode Nav
// @namespace    local
// @version      1.3
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
  const ARM_POLL_TRIES = 60; // ~15 с — первый "клик" по плееру после загрузки

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
          armPlayer();
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

    installHoverArming();
    installSpaceFallback();
  }

  // Родные хоткеи Playerjs ("Наш плеер") закрыты двумя разными внутренними
  // флагами, и оба ставятся мышью, а не фокусом — после Ctrl+←/→ мышь обычно
  // над списком серий, и хоткеи молчат:
  //  - Space / F / M пускает флаг "мышь над плеером" (в коде `o.4C`), его
  //    ставит mouseenter/mouseover — синхронно;
  //  - стрелки (перемотка ←/→, громкость ↑/↓) смотрят только на флаг "был
  //    клик по плееру" (`o.6N`), его ставит mouseup по плееру — и не сразу, а
  //    отложенным таймером (проверено: через 50 мс ещё нет, через ~650 мс уже
  //    есть). При этом любой mouseup, всплывший до документа плеера, сначала
  //    синхронно сбрасывает этот флаг и только потом таймер ставит его снова.
  // Поэтому "наведение" шлём синхронно на каждое нажатие (capture на window —
  // раньше обработчиков плеера), а "клик" (голый mouseup, без mousedown —
  // так плеер не считает это кликом по видео и play/pause не трогает;
  // проверено) — ТОЛЬКО заранее: когда в плеере появился <video> и когда после
  // переключения серии ставим фокус. "Клик" на каждое нажатие ломает стрелки:
  // mouseup обнуляет флаг ровно в момент, когда плеер проверяет эту же
  // клавишу (проверено — громкость переставала меняться). mouseenter/
  // pointerenter не всплывают, поэтому шлём их на всю цепочку предков — какой
  // из элементов плеер слушает, снаружи не видно.
  function playerCenter() {
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    const el = document.elementFromPoint(x, y);
    return el ? { el, init: { clientX: x, clientY: y, view: window } } : null;
  }

  function armPlayerHover() {
    const c = playerCenter();
    if (!c) return;
    const { el, init } = c;

    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.push(n);
    for (const n of chain.reverse()) {
      n.dispatchEvent(new PointerEvent('pointerenter', { ...init, bubbles: false }));
      n.dispatchEvent(new MouseEvent('mouseenter', { ...init, bubbles: false }));
    }
    el.dispatchEvent(new PointerEvent('pointerover', { ...init, bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { ...init, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointermove', { ...init, bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousemove', { ...init, bubbles: true }));
  }

  function armPlayerClick() {
    const c = playerCenter();
    if (!c) return;
    const init = { ...c.init, bubbles: true, button: 0 };
    c.el.dispatchEvent(new PointerEvent('pointerup', init));
    c.el.dispatchEvent(new MouseEvent('mouseup', init));
  }

  function armPlayer() {
    armPlayerHover();
    armPlayerClick();
  }

  function installHoverArming() {
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (isRealTextInput(e.target)) return;
        if (!document.querySelector('video')) return;
        armPlayerHover();
      },
      true
    );

    // Первый "клик" — как только плеер построился, чтобы стрелки работали уже
    // с первого нажатия, даже если серию не переключали хоткеем.
    let tries = 0;
    (function waitForVideo() {
      if (document.querySelector('video')) {
        armPlayer();
        return;
      }
      if (++tries < ARM_POLL_TRIES) setTimeout(waitForVideo, VIDEO_POLL_MS);
    })();
  }

  // Страховка для Space поверх installHoverArming (добавлена в 1.1, до того как
  // нашёлся способ с наведением; оставлена на случай, если плеер всё-таки
  // проигнорирует нажатие). Фокус на <video> стоит, но Playerjs ("Наш плеер")
  // хоткеи слушает только когда считает плеер "своим": в его keydown стоит
  // проверка глобального флага "активный плеер" + "мышь над плеером", которые
  // выставляются наведением/кликом, а не фокусом. Имя флага обфусцировано —
  // выставлять его руками хрупко. Поэтому страхуемся по факту: если за
  // SPACE_CHECK_MS после Space состояние плеера не поменялось, значит плеер
  // нажатие проигнорировал — переключаем play/pause сами. Если плеер Space
  // обработал (мышь над ним), состояние уже другое, и мы ничего не делаем.
  //
  // У Playerjs переключаем через его API (window.playerjs — так его называет
  // сама страница animejoya.ru/player/playerjs.html; @grant none → мы в
  // контексте страницы): до первого запуска src у <video> ещё не выставлен,
  // и голый video.play() падает с AbortError. Для остальных плееров —
  // напрямую через <video>.
  const SPACE_CHECK_MS = 150;

  function playerjsApi() {
    const p = window.playerjs;
    return p && typeof p.api === 'function' ? p : null;
  }

  function isPlaying(video) {
    const pjs = playerjsApi();
    if (pjs) {
      try {
        return !!pjs.api('playing');
      } catch (e) {
        /* упадём на <video> */
      }
    }
    return !video.paused;
  }

  function togglePlayback(video) {
    const pjs = playerjsApi();
    if (pjs) {
      try {
        pjs.api('toggle');
        return;
      } catch (e) {
        /* упадём на <video> */
      }
    }
    if (video.paused) {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      video.pause();
    }
  }

  function installSpaceFallback() {
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== ' ' || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
        if (isRealTextInput(e.target)) return;

        const video = document.querySelector('video');
        if (!video) return;
        const wasPlaying = isPlaying(video);

        setTimeout(() => {
          if (!video.isConnected || isPlaying(video) !== wasPlaying) return;
          togglePlayback(video);
        }, SPACE_CHECK_MS);
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
