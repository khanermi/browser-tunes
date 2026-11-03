// ==UserScript==
// @name         KinoGo AllPlay Episode Nav
// @namespace    local
// @version      1.8
// @description  Ctrl+Left/Right — next/previous episode в Плеере 3 (AllPlay) и во вкладке "Смотреть онлайн" (Playerjs, cinemar.cc) на kinogo.ec. F9 — псевдо-fullscreen плеера (Esc — выход). У AllPlay вычищает из субтитров остатки ASS (маски "m 20 73 l ...", теги {…}, дубли-слои; кнопка-метла в панели плеера вкл/выкл), Shift+↑/↓ — размер субтитров AllPlay. Работает и когда фокус внутри iframe плеера (postMessage-мост).
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

  // Реплики «стыкуются», если следующая начинается не позже чем через
  // столько после конца предыдущей (округление таймингов при конвертации).
  const CUE_DUP_EPS = 0.002; // с

  // Чистку можно выключить кнопкой-метлой в панели AllPlay (рядом с «CC»).
  // Флаг — в localStorage домена плеера (у Alloha на animejoy домен
  // ротируется — тогда флаг сбрасывается на «вкл»). Выключение откатывает
  // правки: для каждой дорожки помним убранные реплики и исходный текст
  // изменённых (WeakMap — забывается вместе с дорожкой), removeCue/addCue
  // и запись cue.text обратимы.
  const ASS_CLEANER_KEY = 'bt-ass-cleaner';
  const assCleanerEdits = new WeakMap(); // TextTrack → { removed: [cue], texts: Map(cue → text), ends: Map(cue → endTime) }

  function assCleanerEnabled() {
    try {
      return localStorage.getItem(ASS_CLEANER_KEY) !== '0';
    } catch (e) {
      return true;
    }
  }

  function editsOf(track) {
    let edits = assCleanerEdits.get(track);
    if (!edits) {
      edits = { removed: [], texts: new Map(), ends: new Map() };
      assCleanerEdits.set(track, edits);
    }
    return edits;
  }

  function removeCueTracked(track, edits, cue) {
    edits.removed.push(cue);
    track.removeCue(cue);
  }

  function cleanAssCues(track) {
    if (!track || !track.cues || !assCleanerEnabled()) return;
    const edits = editsOf(track);
    for (const cue of Array.from(track.cues)) {
      if (typeof cue.text !== 'string') continue;
      if (ASS_DRAWING.test(cue.text)) {
        removeCueTracked(track, edits, cue);
        continue;
      }
      const text = cue.text
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\[Nn]/g, '\n')
        .replace(/\\h/g, ' ');
      if (text !== cue.text) {
        if (!edits.texts.has(cue)) edits.texts.set(cue, cue.text);
        cue.text = text;
      }
    }
    // Дубли: ASS рисует надпись несколькими слоями (тень/обводка/заливка),
    // конвертер теги срезал — в .vtt остаются одинаковые реплики, и AllPlay
    // рисует их столбиком. Слои бывают с одним временем (Братство, 2-я серия,
    // 02:55 — 4 × «День, когда всё началось» 175.53–178.53) и анимированные,
    // со сдвигом (3-я серия, 00:46 — 6 × «Стальной Алхимик»: 45.90–50.28,
    // 45.90–49.82, 46.06–50.36, …). Поэтому реплики с одинаковым текстом,
    // которые перекрываются или стыкуются, сливаем в одну: первую по началу
    // растягиваем до самого позднего конца, остальные убираем. Надпись,
    // нарезанная по 40 мс, при этом склеивается в одну без дыр. Тот же текст
    // после паузы (повтор фразы) не трогаем. cues отсортированы по startTime.
    const lastByText = new Map(); // текст → оставленная реплика
    for (const cue of Array.from(track.cues)) {
      const kept = lastByText.get(cue.text);
      if (kept && cue.startTime <= kept.endTime + CUE_DUP_EPS) {
        if (cue.endTime > kept.endTime) {
          if (!edits.ends.has(kept)) edits.ends.set(kept, kept.endTime);
          kept.endTime = cue.endTime;
        }
        removeCueTracked(track, edits, cue);
      } else {
        lastByText.set(cue.text, cue);
      }
    }
    refreshCaptions(track);
  }

  function restoreAssCues(track) {
    const edits = assCleanerEdits.get(track);
    if (!edits) return;
    assCleanerEdits.delete(track);
    for (const [cue, end] of edits.ends) cue.endTime = end;
    for (const [cue, text] of edits.texts) cue.text = text;
    for (const cue of edits.removed) track.addCue(cue);
    refreshCaptions(track);
  }

  // AllPlay перерисовывает .allplay__captions по cuechange — без него
  // реплика на экране поменялась бы только на следующей.
  function refreshCaptions(track) {
    if (track.mode !== 'disabled') track.dispatchEvent(new Event('cuechange'));
  }

  function allTextTracks() {
    return Array.from(document.querySelectorAll('track'), (t) => t.track);
  }

  function setAssCleaner(enabled) {
    try {
      localStorage.setItem(ASS_CLEANER_KEY, enabled ? '1' : '0');
    } catch (e) {
      /* без хранилища — работает до перезагрузки */
    }
    allTextTracks().forEach(enabled ? cleanAssCues : restoreAssCues);
    syncAssCleanerButton();
  }

  // Кнопка — в самой панели (.allplay__controls), с классами и разметкой
  // родных кнопок AllPlay (иконки icon--pressed/--not-pressed, подсказки
  // label--pressed/--not-pressed): прячется и показывается вместе с
  // интерфейсом, в том числе в fullscreen, и выглядит как своя. Панель
  // AllPlay пересоздаёт при каждой смене серии (корневой .allplay живёт) —
  // поэтому вставляем заново по loadstart и по смене детей .allplay.
  const ASS_BTN_CLASS = 'bt-ass-cleaner-btn';
  const BROOM =
    '<path d="M16.6 1.4a.9.9 0 0 0-1.3 0L9.7 7l1.3 1.3 5.6-5.6a.9.9 0 0 0 0-1.3z"/>' +
    '<path d="M8.6 7.6 6.9 9.3l1.8 1.8 1.7-1.7zM6.2 10 1 13.2c1 1.6 2.2 2.8 3.8 3.8L8 11.8z"/>';
  const SLASH = '<path d="M1.6.3 17.7 16.4l-1.3 1.3L.3 1.6z"/>';

  function syncAssCleanerButton() {
    const btn = document.querySelector('.' + ASS_BTN_CLASS);
    if (!btn) return;
    const on = assCleanerEnabled();
    btn.classList.toggle('allplay__control--pressed', on);
    btn.setAttribute('aria-pressed', String(on));
  }

  function ensureAssCleanerButton() {
    const captionsBtn = document.querySelector('.allplay__controls button[data-allplay="captions"]');
    if (!captionsBtn || document.querySelector('.' + ASS_BTN_CLASS)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `allplay__controls__item allplay__control ${ASS_BTN_CLASS}`;
    btn.innerHTML =
      `<svg class="icon--pressed" viewBox="0 0 18 18" aria-hidden="true">${BROOM}</svg>` +
      `<svg class="icon--not-pressed" viewBox="0 0 18 18" aria-hidden="true" style="opacity:.6">${BROOM}${SLASH}</svg>` +
      '<span class="label--pressed allplay__tooltip">Чистка субтитров: вкл</span>' +
      '<span class="label--not-pressed allplay__tooltip">Чистка субтитров: выкл</span>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setAssCleaner(!assCleanerEnabled());
    });
    captionsBtn.after(btn);
    syncAssCleanerButton();
  }

  let assRootObserved = null;

  function watchAllplayRoot() {
    ensureAssCleanerButton();
    const root = document.querySelector('.allplay');
    if (!root || root === assRootObserved) return;
    assRootObserved = root;
    // Только прямые дети: панель — ребёнок .allplay; subtree не нужен.
    new MutationObserver(ensureAssCleanerButton).observe(root, { childList: true });
  }

  function installAssCueCleaner() {
    document.addEventListener(
      'load',
      (e) => {
        if (!e.target || e.target.tagName !== 'TRACK') return;
        // Новая загрузка — новые реплики, старые правки к ним не относятся.
        assCleanerEdits.delete(e.target.track);
        cleanAssCues(e.target.track);
        watchAllplayRoot();
      },
      true
    );
    // loadstart не всплывает — capture; приходит сразу после пересборки панели.
    document.addEventListener('loadstart', watchAllplayRoot, true);
    // Мост мог включиться позже (по нашему сообщению) — дочистить уже загруженное.
    allTextTracks().forEach(cleanAssCues);
    watchAllplayRoot();
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
