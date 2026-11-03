// ==UserScript==
// @name         KinoGo AllPlay Episode Nav
// @namespace    local
// @version      1.6
// @description  Ctrl+Left/Right — next/previous episode в Плеере 3 (AllPlay) и во вкладке "Смотреть онлайн" (Playerjs, cinemar.cc) на kinogo.ec. F9 — псевдо-fullscreen плеера (Esc — выход). У AllPlay вычищает из субтитров остатки ASS (маски "m 20 73 l ...", теги {…}), Shift+↑/↓ — размер субтитров AllPlay. Работает и когда фокус внутри iframe плеера (postMessage-мост).
// @match        *://kinogo.ec/*
// @match        *://*.stravers.live/*
// @match        *://cinemar.cc/*
// @match        *://*.cinemar.cc/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/kinogo-allplay-episode-nav.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/kinogo-allplay-episode-nav.user.js
// ==/UserScript==

(function () {
  'use strict';

  const NAV_MESSAGE = 'kinogo-allplay-nav';
  const FS_MESSAGE = 'kinogo-allplay-fullscreen';
  // Топ → плеер: Shift+↑/↓ — шаг размера субтитров (AllPlay).
  const CAPTION_SIZE_MESSAGE = 'kinogo-allplay-caption-size';
  const SITE_HOST = /(^|\.)kinogo\.ec$/;

  function isRealTextInput(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    if (el.readOnly || el.disabled) return false;
    return true;
  }

  // Кнопки серий у плееров разных вкладок:
  // - AllPlay ("Плеер 3"): <button data-allplay="next|prev">
  // - Playerjs ("Смотреть онлайн", cinemar.cc): <button class="playlist-next|playlist-prev">
  //   в .playlist-nav; у крайней серии кнопка стоит с disabled.
  const BUTTON_SELECTORS = {
    next: 'button[data-allplay="next"], button.playlist-next',
    prev: 'button[data-allplay="prev"], button.playlist-prev',
  };

  function clickButton(dir) {
    const btn = document.querySelector(BUTTON_SELECTORS[dir]);
    if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
    btn.click();
    return true;
  }

  // ==================== Внутри плеера (cross-origin iframe) ====================
  //
  // Плееры отдаются с чужих доменов (*.stravers.live — AllPlay, cinemar.cc —
  // Playerjs), поэтому из верхнего документа (kinogo.ec) кнопки недостижимы
  // (cross-origin) — эти домены стоят в @match ради этой ветки. Их встраивают
  // и другие сайты, поэтому собственный хоткей внутри фрейма включаем только
  // когда referrer — kinogo.ec; с чужих сайтов сюда прилетают только
  // форварднутые сообщения.
  // Размер субтитров Alloha (AllPlay) — Shift+↑/↓, с геймпада ✕ + D-pad ↑/↓
  // (комбо в input-remapper). Своих хоткеев на это у AllPlay нет, только меню
  // «Субтитры → Параметры → Размер текста» (50/75/100/125/150/200/300/400 %).
  // Его пункты — скрытые <button role=menuitemradio value="150%"> в
  // div#allplay-settings-NNNN-fontSize, по возрастанию, выбранный —
  // aria-checked="true". .click() без открытия меню применяет размер на лету
  // (AllPlay пишет px в отдельный <style> `.allplay__caption{font-size}`, так
  // что меняется и реплика на экране; px считаются от базового размера на
  // момент выбора и при ресайзе не пересчитываются), ставит галочку в меню и
  // сохраняет выбор в localStorage.allplay (captionParam.fontSize) — переживает
  // перезагрузку. Нажатие ловим в плеере (window, capture — раньше AllPlay),
  // с верхнего документа его присылают сообщением CAPTION_SIZE_MESSAGE.
  function isCaptionSizeKey(e) {
    return (
      e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown')
    );
  }

  function captionSizeButtons() {
    return [
      ...document.querySelectorAll(
        '[id^="allplay-settings-"][id$="-fontSize"] button[role="menuitemradio"]'
      ),
    ];
  }

  let captionToastTimer = null;

  // Подсказка «Субтитры 150%» внутри .allplay — видна и в родном fullscreen
  // плеера, и в псевдо-fullscreen.
  function showCaptionToast(text) {
    const host = document.querySelector('.allplay');
    if (!host) return;
    let el = host.querySelector(':scope > .bt-caption-size-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'bt-caption-size-toast';
      el.style.cssText =
        'position:absolute;top:8%;left:50%;transform:translateX(-50%);' +
        'z-index:2147483647;padding:6px 14px;border-radius:6px;' +
        'background:rgba(0,0,0,.75);color:#fff;font:600 18px/1.3 sans-serif;' +
        'pointer-events:none;transition:opacity .3s;opacity:0;';
      host.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(captionToastTimer);
    captionToastTimer = setTimeout(() => {
      el.style.opacity = '0';
    }, 1200);
  }

  // false — это не AllPlay (или меню ещё не построено), хоткей не наш.
  function stepCaptionSize(delta) {
    const btns = captionSizeButtons();
    if (!btns.length) return false;
    let idx = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    if (idx === -1) idx = btns.findIndex((b) => b.value === '100%');
    if (idx === -1) idx = 0;
    const next = Math.max(0, Math.min(btns.length - 1, idx + delta));
    if (next !== idx) btns[next].click();
    const edge = next === idx ? (delta > 0 ? ' (максимум)' : ' (минимум)') : '';
    showCaptionToast(`Субтитры ${btns[next].value}${edge}`);
    return true;
  }

  function installCaptionSizeKeys() {
    window.addEventListener(
      'keydown',
      (e) => {
        if (!isCaptionSizeKey(e)) return;
        if (isRealTextInput(e.composedPath()[0])) return;
        if (!stepCaptionSize(e.key === 'ArrowUp' ? 1 : -1)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true
    );
    window.addEventListener('message', (e) => {
      const data = e.data;
      if (!data || data.type !== CAPTION_SIZE_MESSAGE) return;
      if (e.source !== window.parent) return;
      if (data.delta !== 1 && data.delta !== -1) return;
      stepCaptionSize(data.delta);
    });
  }

  // Alloha (AllPlay) отдаёт субтитры как <track> .vtt, криво сконвертированные
  // из ASS: реплики-маски "m 20 73 l 13 218 ..." (\p1) и огрызки тегов
  // "{=4}<b>текст</b>". AllPlay рисует cue.text сам (дорожка в mode=hidden),
  // поэтому чистим реплики в TextTrack на load у <track>. Тот же код, что в
  // ajsubs-episode-nav (installAssCueCleaner, 1.9) — факты там и в CLAUDE.md.
  const ASS_DRAWING = /^\s*m\s+-?\d+(\.\d+)?\s+-?\d+(\.\d+)?(\s+[mnlbspc]?\s*-?\d+(\.\d+)?)+\s*$/i;

  // Слои одной надписи совпадают по времени до мс; куски анимированной
  // надписи идут через 40 мс — их порог отсекать не должен.
  const CUE_DUP_EPS = 0.002; // с

  function cleanAssCues(track) {
    if (!track || !track.cues) return;
    for (const cue of Array.from(track.cues)) {
      if (typeof cue.text !== 'string') continue;
      if (ASS_DRAWING.test(cue.text)) {
        track.removeCue(cue);
        continue;
      }
      const text = cue.text
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\[Nn]/g, '\n')
        .replace(/\\h/g, ' ');
      if (text !== cue.text) cue.text = text;
    }
    // Дубли: ASS рисует надпись несколькими слоями (тень/обводка/заливка) с
    // одним текстом и временем, конвертер теги срезал — в .vtt остаются N
    // одинаковых реплик, и AllPlay рисует их столбиком (Братство, 2-я серия,
    // 02:55 — 4 × «День, когда всё началось»). Оставляем одну. Тот же текст
    // в другое время (повтор фразы, надпись, нарезанная по 40 мс) не трогаем.
    // cues отсортированы по startTime, поэтому сравниваем со скользящим окном.
    const recent = [];
    for (const cue of Array.from(track.cues)) {
      while (recent.length && cue.startTime - recent[0].startTime > CUE_DUP_EPS) recent.shift();
      const dup = recent.some(
        (c) => c.text === cue.text && Math.abs(c.endTime - cue.endTime) <= CUE_DUP_EPS
      );
      if (dup) track.removeCue(cue);
      else recent.push(cue);
    }
  }

  function installAssCueCleaner() {
    document.addEventListener(
      'load',
      (e) => {
        if (e.target && e.target.tagName === 'TRACK') cleanAssCues(e.target.track);
      },
      true
    );
    // Мост мог включиться позже (по нашему сообщению) — дочистить уже загруженное.
    document.querySelectorAll('track').forEach((t) => cleanAssCues(t.track));
  }

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
      installAssCueCleaner();
      installCaptionSizeKeys();
      // На window в capture-фазе — раньше любых обработчиков плеера на document.
      window.addEventListener(
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
            // Голые стрелки у плееров — перемотка, и Ctrl они не проверяют:
            // глушим до их обработчиков, иначе серия переключится с перемоткой.
            e.preventDefault();
            e.stopImmediatePropagation();
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

      if (isCaptionSizeKey(e)) {
        // Размер субтитров меняет сам плеер (Alloha) — пробрасываем ему.
        const frame = playerFrame();
        if (!frame || !frame.contentWindow) return;
        e.preventDefault();
        e.stopPropagation();
        frame.contentWindow.postMessage(
          { type: CAPTION_SIZE_MESSAGE, delta: e.key === 'ArrowUp' ? 1 : -1 },
          '*'
        );
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
