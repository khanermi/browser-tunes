// ==UserScript==
// @name         Fake Fullscreen + Episode Nav
// @namespace    local
// @version      6.1
// @description  PiP-кнопка / F9 — псевдо-fullscreen плеера. Ctrl+Left/Right — переключение серии, работает даже когда фокус внутри iframe плеера.
// @match        *://rezka.ag/*
// @match        *://old.yummyani.me/*
// @match        *://ru.yummyani.me/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/fake-fullscreen-episode-nav.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/fake-fullscreen-episode-nav.user.js
// ==/UserScript==

(function () {
  'use strict';

  const NAV_MESSAGE = 'userscript-episode-nav';

  function isRealTextInput(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    if (el.readOnly || el.disabled) return false;
    const style = getComputedStyle(el);
    if (parseFloat(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return false;
    return true;
  }

  // Внутри iframe плеера (любой вложенности, если её домен добавлен в @match) —
  // только пробрасываем Ctrl+Left/Right наверх через postMessage. Своей DOM-логики
  // серий/fullscreen здесь нет: до топ-страницы нет доступа (cross-origin), а
  // postMessage(window.top, ...) долетает напрямую независимо от глубины вложенности,
  // так что не важно, на каком именно уровне окажется фокус плеера.
  if (window.top !== window.self) {
    document.addEventListener(
      'keydown',
      (e) => {
        if (isRealTextInput(e.target)) return;
        if (e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
          e.preventDefault();
          e.stopPropagation();
          window.top.postMessage({ type: NAV_MESSAGE, delta: e.key === 'ArrowRight' ? 1 : -1 }, '*');
        }
      },
      true
    );
    return;
  }

  // ==================== Site profiles ====================
  //
  // Профиль отвечает только за серии:
  //   getItems()   -> массив элементов-серий в порядке 1..N
  //   isActive(el) -> активна ли эта серия сейчас
  //   select(el)   -> переключиться на серию
  //
  // Псевдо-fullscreen и хоткеи ниже общие для всех сайтов, профилей не касаются.

  const profiles = [
    {
      match: (host) => host.endsWith('rezka.ag'),
      getItems() {
        const activeItem = document.querySelector('.b-simple_episode__item.active');
        if (!activeItem) return [];
        const seasonId = activeItem.dataset.season_id;
        return [...document.querySelectorAll('.b-simple_episode__item')]
          .filter((el) => el.dataset.season_id === seasonId)
          .sort((a, b) => parseInt(a.dataset.episode_id, 10) - parseInt(b.dataset.episode_id, 10));
      },
      isActive: (el) => el.classList.contains('active'),
      select: (el) => el.click(),
    },
    {
      match: (host) => host.endsWith('yummyani.me'),
      // Серии — плоский список <div> с текстом-номером, в контейнере сразу
      // после блока .selectors (переключатели озвучки/плеера). Хэш-классы
      // (типа "Y56k", "Yqy0") перегенерируются при пересборке сайта, поэтому
      // контейнер ищем от стабильных id="video" + class="selectors".
      // Активную серию нельзя определить по "уникальному классу": у сайта
      // есть minimum 3 визуальных состояния пункта (не просмотрено /
      // просмотрено / активно сейчас), и просмотренные серии получают свой
      // отдельный класс-маркер, из-за чего уникальных className/токенов может
      // быть больше одного. Зато активная серия — единственная, чей фон
      // цветной (зелёный), у остальных состояний (не просмотрено/просмотрено)
      // фон всегда оттенок серого (R≈G≈B) — это и берём как признак.
      getItems() {
        const container = findEpisodesContainer();
        return container ? [...container.children] : [];
      },
      isActive(el) {
        return findActiveByColor(this.getItems()) === el;
      },
      select: (el) => el.click(),
    },
  ];

  function findEpisodesContainer() {
    const selectors = document.querySelector('#video .selectors');
    if (!selectors) return null;
    let node = selectors.nextElementSibling;
    for (let i = 0; i < 3 && node; i++) {
      if (looksLikeEpisodeList(node)) return node;
      node = node.children.length === 1 ? node.firstElementChild : null;
    }
    return null;
  }

  function looksLikeEpisodeList(el) {
    const kids = [...el.children];
    if (kids.length < 2) return false;
    const numeric = kids.filter((k) => /^\d+$/.test(k.textContent.trim()));
    return numeric.length > kids.length / 2;
  }

  function isChromatic(rgbString) {
    const m = rgbString.match(/\d+/g);
    if (!m) return false;
    const [r, g, b] = m.map(Number);
    return Math.max(r, g, b) - Math.min(r, g, b) > 15;
  }

  function findActiveByColor(items) {
    const chromatic = items.filter((el) => isChromatic(getComputedStyle(el).backgroundColor));
    return chromatic.length === 1 ? chromatic[0] : null;
  }

  function getActiveProfile() {
    return profiles.find((p) => p.match(location.hostname)) || null;
  }

  // ==================== Псевдо-fullscreen ====================

  let active = false;
  let root = null;
  let savedStyle = '';

  function getPlayerRoot(video) {
    let el = video.parentElement;
    while (el && getComputedStyle(el).position !== 'relative') {
      el = el.parentElement;
    }
    return el;
  }

  function resizeToViewport() {
    if (!root) return;
    root.style.width = window.innerWidth + 'px';
    root.style.height = window.innerHeight + 'px';
  }

  function enterFullscreen() {
    const video = document.querySelector('video');
    if (!video) return;
    root = getPlayerRoot(video);
    if (!root) return;

    savedStyle = root.getAttribute('style') || '';

    root.style.position = 'fixed';
    root.style.top = '0';
    root.style.left = '0';
    root.style.margin = '0';
    root.style.zIndex = '2147483647';
    resizeToViewport();

    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('resize', resizeToViewport);
    active = true;
  }

  function exitFullscreen() {
    if (!root) return;
    root.setAttribute('style', savedStyle);
    document.documentElement.style.overflow = '';
    window.removeEventListener('resize', resizeToViewport);
    active = false;
    root = null;
  }

  function toggleFullscreen() {
    active ? exitFullscreen() : enterFullscreen();
  }

  function hijackPip(video) {
    video.addEventListener('enterpictureinpicture', () => {
      document.exitPictureInPicture().catch((err) => {
        console.warn('[fake-fullscreen] exitPictureInPicture failed:', err);
      });
      toggleFullscreen();
    });
  }

  const pipPoll = setInterval(() => {
    const video = document.querySelector('video');
    if (video) {
      hijackPip(video);
      clearInterval(pipPoll);
    }
  }, 500);

  // ==================== Переключение эпизодов ====================

  function switchEpisode(delta) {
    const profile = getActiveProfile();
    if (!profile) return;

    const items = profile.getItems();
    if (!items.length) return;

    const idx = items.findIndex((el) => profile.isActive(el));
    if (idx === -1) return;

    const target = items[idx + delta];
    if (!target) return;

    profile.select(target);
    focusVideo();
  }

  function focusVideo() {
    const video = document.querySelector('video');
    if (video) {
      video.setAttribute('tabindex', '0');
      video.focus({ preventScroll: true });
    }
  }

  // Ctrl+Left/Right, нажатый внутри iframe плеера, прилетает сюда как сообщение
  // (см. ветку "window.top !== window.self" в начале файла).
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === NAV_MESSAGE) {
      switchEpisode(e.data.delta);
    }
  });

  // ==================== Хоткеи ====================

  document.addEventListener(
    'keydown',
    (e) => {
      if (isRealTextInput(e.target)) return;

      if (e.key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
        return;
      }

      if (e.key === 'Escape' && active) {
        exitFullscreen();
        return;
      }

      if (e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        e.stopPropagation();
        switchEpisode(e.key === 'ArrowRight' ? 1 : -1);
      }
    },
    true
  );
})();
