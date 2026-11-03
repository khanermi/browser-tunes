// ==UserScript==
// @name         YummyAnime Episode Nav
// @namespace    local
// @version      1.11
// @description  Ctrl+Left/Right — переключение серии на old.yummyani.me. F9 — псевдо-fullscreen плеера (Esc — выход), кнопка PiP плеера Alloha включает его же. У Alloha вычищает из субтитров остатки ASS (маски "m 20 73 l ...", теги {…}, дубли-слои; кнопка-метла в панели плеера вкл/выкл), Shift+↑/↓ — размер субтитров Alloha. Работает и когда фокус внутри iframe плеера (postMessage-мост), после переключения фокус ставится на <video> внутри плеера.
// @match        *://old.yummyani.me/*
// @match        *://ru.yummyani.me/*
// @match        *://kodikplayer.com/*
// @match        *://*.kodikres.com/*
// @match        *://video.sibnet.ru/*
// @match        *://alloha.yani.tv/*
// @match        *://player.cdnvideohub.com/*
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
  const FS_MESSAGE = 'yummyani-episode-nav-fullscreen';
  // Топ → плеер: Shift+↑/↓ — шаг размера субтитров (Alloha).
  const CAPTION_SIZE_MESSAGE = 'yummyani-episode-nav-caption-size';
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
  // серией, пока плеер не подтвердит (FOCUS_ACK) или не истечёт окно. Окно с
  // запасом: Alloha пересоздаёт iframe через ~2 с после клика и ещё раз через
  // ~3 с.
  const FOCUS_PING_MS = 400;
  const FOCUS_WINDOW_MS = 10000;

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

  // Плеер CVH (ru.yummyani.me/iframeCVH.html) прячет всё в shadow DOM: там
  // <video-player> с открытым shadowRoot, а в нём iframe
  // player.cdnvideohub.com, у которого <video> тоже за shadow root. Обычный
  // querySelector туда не заглядывает, поэтому ищем с заходом в открытые
  // shadow root.
  function deepQueryAll(root, selector, acc = []) {
    for (const el of root.querySelectorAll('*')) {
      if (el.matches(selector)) acc.push(el);
      if (el.shadowRoot) deepQueryAll(el.shadowRoot, selector, acc);
    }
    return acc;
  }

  // document.activeElement для элемента в shadow DOM — это его хост.
  function deepActiveElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
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

    // Отвечаем наверх всегда, а не только при удаче: иначе «плеер меня не
    // слышит» и «плеер слышит, но <video> у него не на этом уровне»
    // неотличимы снаружи — из топа в чужой origin не заглянуть, и отладка
    // упирается в стену. В ответе — что именно видит эта ветка.
    function report(focused) {
      const nested = deepQueryAll(document, 'iframe').map((f) => {
        try {
          return new URL(f.src, location.href).hostname;
        } catch (e) {
          return '(no src)';
        }
      });
      try {
        window.top.postMessage(
          {
            type: FOCUS_ACK,
            focused,
            host: location.hostname,
            hasVideo: deepQueryAll(document, 'video').length > 0,
            nested
          },
          '*'
        );
      } catch (e) {
        /* топ недоступен — ничего не поделать */
      }
    }

    function focusVideo() {
      timer = null;
      if (isRealTextInput(deepActiveElement())) return;

      const video = deepQueryAll(document, 'video')[0];
      if (video) {
        // <video> без controls штатно не фокусируется вовсе; -1 (а не 0), чтобы
        // не менять порядок обхода табом внутри плеера.
        if (!video.hasAttribute('tabindex')) video.setAttribute('tabindex', '-1');
        try {
          video.focus({ preventScroll: true });
        } catch (e) {
          /* не критично: фокус останется на самом <iframe>, как было до 1.1 */
        }
        if (deepActiveElement() === video) {
          report(true);
          return;
        }
      } else {
        // <video> уровнем ниже (Kodik, CVH) — фокус должен стоять на самом
        // вложенном <iframe>, иначе нажатия до него не долетят. На <video>
        // внутри него фокус поставит уже та ветка.
        const inner = deepQueryAll(document, 'iframe')[0];
        if (inner && deepActiveElement() !== inner) {
          try {
            inner.focus({ preventScroll: true });
          } catch (e) {
            /* не критично */
          }
        }
      }

      if (++tries < VIDEO_POLL_TRIES) timer = setTimeout(focusVideo, VIDEO_POLL_MS);
    }

    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== FOCUS_MESSAGE) return;

      // Просьба пришла сверху по нашей же цепочке — значит этот фрейм
      // действительно внутри страницы yummyani, даже если его referrer уже
      // домен плеера, а не сайта. Для вложенных уровней это единственный
      // способ включить и хоткей тоже (referrer-гейт там не проходит).
      installKeyBridge();

      // Если плеер вложил ещё один iframe, <video> лежит там — просто
      // пробрасываем просьбу на уровень глубже; ответит тот уровень, где
      // видео действительно есть. Сообщение идёт только вниз, так что
      // зациклиться не может. iframe внутри shadow DOM (CVH) в window.frames
      // может не попасть — их contentWindow добавляем явно.
      const targets = new Set();
      for (let i = 0; i < window.frames.length; i++) targets.add(window.frames[i]);
      for (const f of deepQueryAll(document, 'iframe')) if (f.contentWindow) targets.add(f.contentWindow);
      for (const w of targets) {
        try {
          w.postMessage({ type: FOCUS_MESSAGE }, '*');
        } catch (err) {
          /* чужой фрейм закрыт/недоступен — не наша забота */
        }
      }

      report(false); // снимок состояния: жив, вот что вижу прямо сейчас
      tries = 0;
      clearTimeout(timer);
      focusVideo();
    });
  }

  // Хоткей внутри плеера: сам список серий отсюда недостижим (cross-origin),
  // поэтому просто пробрасываем нажатие наверх — window.top долетает напрямую
  // с любой глубины вложенности.
  let keyBridgeInstalled = false;

  function installKeyBridge() {
    if (keyBridgeInstalled) return;
    keyBridgeInstalled = true;

    // window + capture — раньше любых обработчиков плеера (тот может слушать
    // тоже в capture на window). Цель берём из composedPath: у CVH поля ввода
    // и <video> за shadow root, а e.target — уже их хост.
    window.addEventListener(
      'keydown',
      (e) => {
        if (isRealTextInput(e.composedPath()[0])) return;

        // Псевдо-fullscreen делает верхний документ (растягивает сам <iframe>
        // плеера) — отсюда только просим. Esc не глушим: плееру он может быть
        // нужен самому.
        if (e.key === 'F9') {
          e.preventDefault();
          e.stopImmediatePropagation();
          window.top.postMessage({ type: FS_MESSAGE, action: 'toggle' }, '*');
          return;
        }
        if (e.key === 'Escape') {
          window.top.postMessage({ type: FS_MESSAGE, action: 'exit' }, '*');
          return;
        }

        if (!e.ctrlKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        window.top.postMessage(
          { type: NAV_MESSAGE, delta: e.key === 'ArrowRight' ? 1 : -1 },
          '*'
        );
      },
      true
    );

    installPipIntercept();
    installAssCueCleaner();
    installCaptionSizeKeys();
  }

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

  // Чистку можно выключить кнопкой-метлой в панели AllPlay (рядом с «CC»).
  // Флаг — в localStorage домена плеера (у Alloha на animejoy домен
  // ротируется — тогда флаг сбрасывается на «вкл»). Выключение откатывает
  // правки: для каждой дорожки помним убранные реплики и исходный текст
  // изменённых (WeakMap — забывается вместе с дорожкой), removeCue/addCue
  // и запись cue.text обратимы.
  const ASS_CLEANER_KEY = 'bt-ass-cleaner';
  const assCleanerEdits = new WeakMap(); // TextTrack → { removed: [cue], texts: Map(cue → text) }

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
      edits = { removed: [], texts: new Map() };
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
      if (dup) removeCueTracked(track, edits, cue);
      else recent.push(cue);
    }
    refreshCaptions(track);
  }

  function restoreAssCues(track) {
    const edits = assCleanerEdits.get(track);
    if (!edits) return;
    assCleanerEdits.delete(track);
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

  // Кнопка PiP плеера Alloha (AllPlay — форк Plyr) вместо нативного
  // Picture-in-Picture включает псевдо-fullscreen, как на rezka. Plyr вешает
  // обработчик прямо на кнопку, так что capture на window срабатывает раньше,
  // а stopImmediatePropagation не даёт ему вызвать requestPictureInPicture
  // вовсе (проверено: с перехватом вызовов 0) — PiP-окно даже не мигает.
  function installPipIntercept() {
    window.addEventListener(
      'click',
      (e) => {
        if (!e.target.closest || !e.target.closest('button[data-allplay="pip"]')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        window.top.postMessage({ type: FS_MESSAGE, action: 'toggle' }, '*');
      },
      true
    );
  }

  // ==================== Ветка внутри iframe плеера ====================
  //
  // Плеер — cross-origin iframe (kodikplayer.com + его вложенный kodikres.com,
  // video.sibnet.ru, alloha.yani.tv, CVH отдаётся с ru.yummyani.me), поэтому из
  // него не достать DOM списка серий. Задача этой ветки — пробросить хоткей
  // наверх и по просьбе сверху забрать фокус на <video>.
  //
  // Домены плееров стоят в @match ради этой ветки, но они используются и другими
  // сайтами, поэтому гейтим по referrer: вне страниц yummyani скрипт хоткеи не
  // перехватывает. Мост фокуса гейта не требует (он молча ждёт сообщения,
  // которое на чужом сайте некому послать), и хоткей на вложенном уровне
  // включается как раз по факту такого сообщения — у вложенного фрейма referrer
  // уже домен плеера, гейт бы его не пропустил.
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
  //
  // Подтверждение — от конкретного кадра (focusedFrame), а не «вообще»: старый
  // кадр, который сайт ещё не снёс, отвечает focused:true сразу же, а через
  // ~2 с его заменяют новым, и фокус вместе с удалённым <iframe> падает на
  // body — Space тогда листает страницу. Поэтому тики идут всё окно, и как
  // только текущий кадр не тот, что подтвердил, — фокусим и просим заново.
  let focusDeadline = 0;
  let focusTimer = null;
  let focusedFrame = null;

  function pingVideoFocus() {
    focusTimer = null;
    if (Date.now() > focusDeadline || !focusIsOurs()) return;

    const frame = playerFrame();
    if (frame && frame !== focusedFrame) {
      if (document.activeElement !== frame) focusPlayer();
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
    focusedFrame = null;
    if (focusTimer === null) pingVideoFocus();
  }

  // ==================== Псевдо-fullscreen ====================
  //
  // До <video> плеера отсюда не дотянуться (cross-origin), поэтому на весь
  // viewport растягиваем сам <iframe>. Сайт пересоздаёт iframe вместе с его
  // родителем на каждую серию, поэтому не инлайн-стили на элемент, а
  // вставленный <style> по селектору — он подхватит и новый кадр.
  //
  // position: fixed здесь не ломают transform-предки (их нет), но предки
  // .wKBD (z-index 2) и .content-block (z-index 1) — свои stacking context'ы:
  // шапка сайта и список серий оказываются поверх плеера. Поэтому предкам с
  // z-index на время режима ставим максимальный z-index через атрибут-маркер.
  // .wKBD при смене серии живёт дальше, но у другой озвучки он свой — отсюда
  // переразметка по MutationObserver.
  const FS_STYLE_ID = 'yummyani-episode-nav-fs';
  const FS_STACK_ATTR = 'data-yummyani-episode-nav-fs';
  const FS_CSS = `
    #video iframe {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      margin: 0 !important;
      border-radius: 0 !important;
      z-index: 2147483647 !important;
    }
    [${FS_STACK_ATTR}] { z-index: 2147483647 !important; }
    html { overflow: hidden !important; }
  `;
  let fsObserver = null;

  function fsActive() {
    return !!document.getElementById(FS_STYLE_ID);
  }

  function markStack() {
    const frame = playerFrame();
    for (let el = frame && frame.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      if (el.hasAttribute(FS_STACK_ATTR)) continue;
      if (getComputedStyle(el).zIndex !== 'auto') el.setAttribute(FS_STACK_ATTR, '');
    }
  }

  function unmarkStack() {
    for (const el of document.querySelectorAll(`[${FS_STACK_ATTR}]`)) el.removeAttribute(FS_STACK_ATTR);
  }

  function enterFullscreen() {
    if (!playerFrame()) return;
    const style = document.createElement('style');
    style.id = FS_STYLE_ID;
    style.textContent = FS_CSS;
    document.head.appendChild(style);
    markStack();

    const scope = document.querySelector('#video');
    if (scope) {
      fsObserver = new MutationObserver(markStack);
      fsObserver.observe(scope, { childList: true, subtree: true });
    }
    focusPlayer();
  }

  function exitFullscreen() {
    const style = document.getElementById(FS_STYLE_ID);
    if (!style) return;
    style.remove();
    unmarkStack();
    if (fsObserver) fsObserver.disconnect();
    fsObserver = null;
  }

  function toggleFullscreen() {
    fsActive() ? exitFullscreen() : enterFullscreen();
  }

  // Сообщение принимаем только из нашего плеера — в том числе из вложенного в
  // него фрейма (у Kodik <video> на уровень глубже).
  function fromPlayer(source) {
    const frame = playerFrame();
    if (!frame || !source) return false;
    for (let w = source, i = 0; w && i < 5; w = w.parent, i++) {
      if (w === frame.contentWindow) return true;
      if (w === w.parent) break;
    }
    return false;
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

    // Сайт пересоздаёт iframe плеера уже после клика — новый кадр подхватывают
    // тики requestVideoFocus, они же ставят фокус на <video> внутри.
    focusPlayer();
    requestVideoFocus();
    return 'switched';
  }

  // Ctrl+Left/Right, нажатый внутри iframe плеера, прилетает сюда сообщением;
  // им же плеер подтверждает, что забрал фокус на <video>.
  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data) return;

    // Плеер отвечает на каждую просьбу; засчитываем только focused:true и
    // только от текущего кадра (в том числе из вложенного в него фрейма).
    // Пинги при этом не обрываем — см. pingVideoFocus: кадр ещё могут заменить.
    if (data.type === FOCUS_ACK) {
      if (data.focused === true && fromPlayer(e.source)) focusedFrame = playerFrame();
      return;
    }


    if (data.type === FS_MESSAGE) {
      if (!fromPlayer(e.source)) return;
      data.action === 'exit' ? exitFullscreen() : toggleFullscreen();
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
      if (isRealTextInput(e.target)) return;

      if (e.key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
        return;
      }
      if (e.key === 'Escape' && fsActive()) {
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
