// ==UserScript==
// @name         KinoGo AllPlay Episode Nav
// @namespace    local
// @version      1.2
// @description  Ctrl+Left/Right — next/previous episode в Плеере 3 (AllPlay) на kinogo.ec. F9 — псевдо-fullscreen плеера (Esc — выход). Работает и когда фокус внутри iframe плеера (postMessage-мост).
// @match        *://kinogo.ec/*
// @match        *://*.stravers.live/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/kinogo-allplay-episode-nav.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/kinogo-allplay-episode-nav.user.js
// ==/UserScript==

(function () {
  'use strict';

  const NAV_MESSAGE = 'kinogo-allplay-nav';
  const FS_MESSAGE = 'kinogo-allplay-fullscreen';
  const SITE_HOST = /(^|\.)kinogo\.ec$/;

  function isRealTextInput(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    if (el.readOnly || el.disabled) return false;
    return true;
  }

  // Кнопки плеера AllPlay: <button data-allplay="next"> / <button data-allplay="prev">
  function clickButton(dir) {
    const btn = document.querySelector(`button[data-allplay="${dir}"]`);
    if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
    btn.click();
    return true;
  }

  // ==================== Внутри плеера (AllPlay, cross-origin iframe) ====================
  //
  // Плеер отдаётся с домена *.stravers.live, поэтому из верхнего документа
  // (kinogo.ec) кнопки недостижимы (cross-origin) — этот домен стоит в @match
  // ради этой ветки. Он используется и другими встраивающими сайтами, поэтому
  // собственный хоткей внутри фрейма включаем только когда referrer — kinogo.ec;
  // с чужих сайтов сюда прилетают только форварднутые сообщения.
  if (window.top !== window.self) {
    let embedder = '';
    try {
      embedder = new URL(document.referrer).hostname;
    } catch (e) {
      /* referrer пустой/битый — считаем, что встроены не kinogo */
    }
    const trustedEmbed = SITE_HOST.test(embedder);

    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== NAV_MESSAGE) return;
      clickButton(e.data.dir);
    });

    if (trustedEmbed) {
      document.addEventListener(
        'keydown',
        (e) => {
          if (isRealTextInput(e.target)) return;

          // Псевдо-fullscreen делает верхний документ (растягивает контейнер
          // этого iframe) — отсюда только просим. Esc не глушим: плееру он
          // может быть нужен самому (закрыть диалог и т.п.).
          if (e.key === 'F9') {
            e.preventDefault();
            e.stopPropagation();
            window.parent.postMessage({ type: FS_MESSAGE, action: 'toggle' }, '*');
            return;
          }
          if (e.key === 'Escape') {
            window.parent.postMessage({ type: FS_MESSAGE, action: 'exit' }, '*');
            return;
          }

          if (!e.ctrlKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
          if (clickButton(e.key === 'ArrowRight' ? 'next' : 'prev')) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
        true
      );
    }
    return;
  }

  // ==================== Верхний документ (kinogo.ec) ====================
  //
  // Фокус чаще всего остаётся на странице (клик по серии/озвучке был снаружи),
  // поэтому хоткей ловим тут и пробрасываем в iframe плеера сообщением.
  //
  // Все вкладки плееров ("Смотреть онлайн" / "Плеер 1" / "Плеер 3") — это один
  // и тот же iframe.lazy, сайт меняет ему только src.
  function playerFrame() {
    return document.querySelector('iframe.lazy');
  }

  // ==================== Псевдо-fullscreen ====================
  //
  // До <video> плеера отсюда не дотянуться (cross-origin), поэтому на весь
  // viewport растягиваем контейнер iframe: сам iframe в нём absolute с inset 0
  // и тянется следом. Контейнер переживает смену вкладки плеера и серии, так что
  // режим не слетает после Ctrl+←/→. Предков с transform/filter/contain, которые
  // сломали бы position: fixed, у контейнера нет — проверено на живой странице.
  let fsContainer = null;
  let savedStyle = null;

  function enterFullscreen() {
    const container = document.querySelector('.kg-video-container');
    if (!container) return;

    savedStyle = container.getAttribute('style');
    Object.assign(container.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      margin: '0',
      zIndex: '2147483647',
    });
    document.documentElement.style.overflow = 'hidden';
    fsContainer = container;
  }

  function exitFullscreen() {
    if (!fsContainer) return;
    if (savedStyle === null) fsContainer.removeAttribute('style');
    else fsContainer.setAttribute('style', savedStyle);
    document.documentElement.style.overflow = '';
    fsContainer = null;
  }

  function toggleFullscreen() {
    fsContainer ? exitFullscreen() : enterFullscreen();
  }

  // F9/Esc, нажатые при фокусе внутри плеера, приходят оттуда сообщением.
  // Принимаем только от нашего iframe, а не от любого фрейма на странице.
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== FS_MESSAGE) return;
    const frame = playerFrame();
    if (!frame || e.source !== frame.contentWindow) return;
    e.data.action === 'exit' ? exitFullscreen() : toggleFullscreen();
  });

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

      if (e.key === 'Escape' && fsContainer) {
        exitFullscreen();
        return;
      }

      if (!e.ctrlKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;

      const frame = playerFrame();
      if (!frame || !frame.contentWindow) return;

      e.preventDefault();
      e.stopPropagation();
      frame.contentWindow.postMessage(
        { type: NAV_MESSAGE, dir: e.key === 'ArrowRight' ? 'next' : 'prev' },
        '*'
      );
    },
    true
  );
})();
