// ==UserScript==
// @name         Fake Fullscreen + Episode Nav
// @namespace    local
// @version      6.2
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
