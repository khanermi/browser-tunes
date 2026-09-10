// ==UserScript==
// @name         KinoGo AllPlay Episode Nav
// @namespace    local
// @version      1.1
// @description  Ctrl+Left/Right — next/previous episode в Плеере 3 (AllPlay) на kinogo.ec. Работает и когда фокус внутри iframe плеера (postMessage-мост). Автоклик «Продолжить просмотр», чтобы сессия подхватывалась без пробела (пробел сбрасывает её).
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
          if (!e.ctrlKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
          if (isRealTextInput(e.target)) return;
          if (clickButton(e.key === 'ArrowRight' ? 'next' : 'prev')) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
        true
      );

      // После релоада плеера (в т.ч. после переключения серии нашим же
      // Ctrl+←/→) всплывает диалог «Продолжить просмотр» с сохранённой
      // позиции. Жать тут пробел нельзя: это долетает до самого плеера как
      // play/pause и сбрасывает сохранённую сессию/озвучку, а не жмёт кнопку
      // диалога. Поэтому просто кликаем её сами, как только она появится.
      const clickResumeIfPresent = () => {
        const btn = document.querySelector('button.time_save__btn');
        if (btn) btn.click();
      };
      new MutationObserver(clickResumeIfPresent).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      clickResumeIfPresent(); // вдруг кнопка уже в DOM к моменту запуска скрипта
    }
    return;
  }

  // ==================== Верхний документ (kinogo.ec) ====================
  //
  // Фокус чаще всего остаётся на странице (клик по серии/озвучке был снаружи),
  // поэтому хоткей ловим тут и пробрасываем в iframe плеера сообщением.
  function playerFrame() {
    return document.querySelector('iframe.lazy');
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (!e.ctrlKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      if (isRealTextInput(e.target)) return;

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
