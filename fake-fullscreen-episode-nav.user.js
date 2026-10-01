// ==UserScript==
// @name         Fake Fullscreen + Episode Nav
// @namespace    local
// @version      6.3
// @description  PiP-кнопка запускает псевдо-fullscreen плеера (F не трогаем), F9 — тоже. Ctrl+Left/Right переключают эпизод и переносят фокус на плеер.
// @match        *://rezka.ag/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/fake-fullscreen-episode-nav.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/fake-fullscreen-episode-nav.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==================== Site profiles ====================
  //
  // Профиль отвечает только за серии:
  //   getItems()   -> массив элементов-серий в порядке 1..N
  //   isActive(el) -> активна ли эта серия сейчас
  //   select(el)   -> переключиться на серию
  //
  // Псевдо-fullscreen и хоткеи ниже общие для всех сайтов, профилей не касаются.

  // rezka.ag: на части страниц (URL вида .../1-season/3-episode.html) серии —
  // не <li>, а <a href>. Обработчик сайта ('click.player_episode' на #player)
  // такие пропускает, и клик по <a> — полная перезагрузка страницы: вылет из
  // fullscreen и потеря фокуса. Поэтому для <a> подсовываем сайту временный
  // скрытый <li> с теми же data-* — он грузит серию аяксом, как на обычных
  // страницах, — а после успеха возвращаем active на настоящую <a>.
  const REZKA_PROXY_ATTR = 'data-ffen-proxy';
  let rezkaPending = false;

  function rezkaHasAjaxHandler() {
    const player = document.getElementById('player');
    const $ = window.jQuery;
    if (!player || !$ || !$._data) return false;
    const events = $._data(player, 'events');
    return !!(events && events.click && events.click.some((h) => h.namespace === 'player_episode'));
  }

  function rezkaSelectViaProxy(link) {
    const proxy = document.createElement('li');
    proxy.className = 'b-simple_episode__item';
    proxy.setAttribute(REZKA_PROXY_ATTR, '');
    for (const [k, v] of Object.entries(link.dataset)) proxy.dataset[k] = v;
    proxy.style.display = 'none';
    link.after(proxy);

    rezkaPending = true;
    const startedAt = Date.now();
    const finish = (ok) => {
      clearInterval(poll);
      proxy.remove();
      rezkaPending = false;
      if (!ok) return;
      document
        .querySelectorAll('.b-simple_episode__item.active')
        .forEach((el) => el.classList.remove('active'));
      link.classList.add('active');
      // Адрес — как у выбранной серии: перезагрузка/закладка откроют её же.
      history.replaceState(history.state, '', link.href);
      focusVideo();
    };
    const poll = setInterval(() => {
      if (proxy.classList.contains('active')) finish(true);
      // Ошибка аякса: сайт снимает disabled, а active так и не ставит.
      else if (Date.now() - startedAt > 15000) finish(false);
    }, 100);

    proxy.click();
  }

  const profiles = [
    {
      match: (host) => host.endsWith('rezka.ag'),
      getItems() {
        const activeItem = document.querySelector(`.b-simple_episode__item.active:not([${REZKA_PROXY_ATTR}])`);
        if (!activeItem) return [];
        const seasonId = activeItem.dataset.season_id;
        return [...document.querySelectorAll(`.b-simple_episode__item:not([${REZKA_PROXY_ATTR}])`)]
          .filter((el) => el.dataset.season_id === seasonId)
          .sort((a, b) => parseInt(a.dataset.episode_id, 10) - parseInt(b.dataset.episode_id, 10));
      },
      isActive: (el) => el.classList.contains('active'),
      // Пока сайт грузит серию, он вешает на список disabled — повторные
      // нажатия в это время игнорируем, как и его собственный обработчик.
      isBusy: () => rezkaPending || !!document.querySelector('.b-simple_episode__item.disabled'),
      select(el) {
        if (el.tagName === 'A' && rezkaHasAjaxHandler()) rezkaSelectViaProxy(el);
        else el.click();
      },
    },
  ];

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
    if (profile.isBusy && profile.isBusy()) return;

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

  // ==================== Хоткеи ====================

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // F9 — псевдо-fullscreen. F не трогаем — родной hotkey плеера работает как обычно.
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

      // Ctrl+Left/Right — переключение эпизода. stopPropagation обязателен,
      // иначе плеер тоже поймает стрелку как перемотку (он не проверяет ctrlKey).
      if (e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        e.stopPropagation();
        switchEpisode(e.key === 'ArrowRight' ? 1 : -1);
      }
    },
    true
  );
})();
