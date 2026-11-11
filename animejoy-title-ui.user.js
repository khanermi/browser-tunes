// ==UserScript==
// @name         AnimeJoy Title UI
// @namespace    local
// @version      1.6
// @description  Страница тайтла otakujoy.fun / animejoy.ru в своём тёмном интерфейсе: только названия (с исправленной подмешанной латиницей, копируются кликом), постер, части франшизы без спойлера, плеер 16:9 и сетка серий рядом с ним вместо горизонтальной ленты-слайдера. При смене плеера остаётся та же серия. Поиск по сайту в верхней панели (/ — фокус): постеры, название, год, серии. Главная otakujoy.fun/ — только поиск и 3 последних открытых тайтла с серией (лента сайта — /index.php); #q=… и #al=<id AniList> — поиск по ссылке. «Обычный вид» возвращает страницу сайта. Совместим с ajsubs-episode-nav (Ctrl+←/→, F9).
// @match        *://otakujoy.fun/*
// @match        *://animejoy.ru/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/animejoy-title-ui.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/animejoy-title-ui.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window) return;
  // Страница тайтла DLE: /<раздел>/<id>-<slug>.html (tv-serialy, anime-films…).
  // Новости выглядят так же — их отсеивает проверка на .playlists-ajax в build().
  // Главная (/) — свой поиск «как Google» (лента сайта остаётся на /index.php).
  const IS_HOME = location.pathname === '/';
  if (!IS_HOME && !/^\/[^/]+\/\d+-[^/]+\.html$/.test(location.pathname)) return;

  const OFF_KEY = 'ojx-off'; // '1' — пользователь вернул обычный вид сайта
  // Недавно смотрел: [{path, title, poster, ep, t}], свежие первыми. Пишет
  // страница тайтла (и в «Обычном виде» — без серии), читает главная.
  // localStorage своего домена: animejoy.ru и otakujoy.fun — разные списки.
  const RECENT_KEY = 'ojx-recent';
  const RECENT_MAX = 12;
  const RECENT_SHOWN = 3;

  // ==================== Стили ====================
  //
  // Сайт держит всё в body > .page — её прячем, свой интерфейс (#ojx) кладём
  // рядом. Плейлист сайта (.playlists-ajax) не копируется, а переносится в #ojx
  // целиком: его обработчики делегированы на body, а ajsubs-episode-nav ищет
  // те же .playlists-videos li.visible / .playlists-iframe.
  //
  // Предкам .playlists-iframe нельзя transform/filter/backdrop-filter/contain:
  // псевдо-fullscreen ajsubs-episode-nav ставит ему position: fixed, и такие
  // предки стали бы его containing block. Оформление плеера — только в
  // :not([style*="fixed"]), чтобы не спорить с инлайн-стилями режима F9.
  const STYLES = `
html.ojx, html.ojx body { background: #0d0f14 !important; }
html.ojx body { margin: 0 !important; min-width: 0 !important; }
/* место под полосу прокрутки — не прыгать при открытии поиска (overflow: hidden) */
html.ojx { scrollbar-gutter: stable; }
html.ojx body > .page { display: none !important; }

#ojx {
  --bg: #0d0f14; --surface: #151821; --surface-2: #1c202b; --surface-3: #272c39;
  --border: #252a36; --text: #e8eaf0; --muted: #98a0b2; --faint: #666e80;
  --accent: #8b6cff; --accent-strong: #7350ff; --accent-soft: rgba(139, 108, 255, .15);
  --ok: #3fcf8e; --radius: 12px; --side: 300px;
  box-sizing: border-box; max-width: 1480px; margin: 0 auto; padding: 6px 24px 48px;
  color: var(--text); font: 400 14px/1.45 "Golos Text", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; text-align: left;
}
#ojx *, #ojx *::before, #ojx *::after { box-sizing: border-box; }
#ojx a { color: inherit; text-decoration: none; }
#ojx button { font: inherit; color: inherit; }
#ojx button:focus-visible, #ojx a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

#ojx .ojx-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px; margin-bottom: 4px; }
#ojx .ojx-crumbs { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; white-space: nowrap; font-size: 13px; color: var(--muted); }
#ojx .ojx-crumbs a { color: var(--muted); transition: color .12s; }
#ojx .ojx-crumbs a:hover { color: var(--text); }
#ojx .ojx-crumbs .ojx-home { color: var(--text); font-weight: 600; }
#ojx .ojx-sep { color: var(--faint); }
#ojx .ojx-btn { appearance: none; flex: none; padding: 5px 12px; border: 1px solid var(--border); border-radius: 999px; background: transparent; color: var(--muted); font-size: 12.5px; white-space: nowrap; cursor: pointer; transition: color .12s, background .12s; }
#ojx .ojx-btn:hover { color: var(--text); background: var(--surface); }

#ojx .ojx-search { position: relative; flex: 1 1 360px; max-width: 460px; margin: 0 auto; }
#ojx .ojx-search-input { width: 100%; height: 32px; padding: 0 34px 0 14px; border: 1px solid var(--border); border-radius: 999px; outline: none; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; transition: border-color .12s, background .12s; }
#ojx .ojx-search-input::placeholder { color: var(--faint); }
#ojx .ojx-search-input:focus { border-color: var(--accent); background: var(--surface-2); }
#ojx .ojx-search-input::-webkit-search-cancel-button { display: none; }
#ojx .ojx-search kbd { position: absolute; top: 50%; right: 10px; transform: translateY(-50%); padding: 1px 6px; border: 1px solid var(--border); border-radius: 5px; color: var(--faint); font-size: 11px; line-height: 1.4; pointer-events: none; }
#ojx .ojx-search-input:focus + kbd { display: none; }

html.ojx.ojx-sr-open body { overflow: hidden; }
#ojx .ojx-sr { position: fixed; inset: 0; z-index: 900; display: flex; justify-content: center; align-items: flex-start; padding: 56px 16px 24px; background: rgba(5, 6, 10, .72); }
#ojx .ojx-sr[hidden] { display: none; }
#ojx .ojx-sr-panel { display: flex; flex-direction: column; width: min(1180px, 100%); max-height: 100%; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: 0 24px 64px rgba(0, 0, 0, .55); }
#ojx .ojx-sr-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 10px 20px; }
#ojx .ojx-sr-title { font-size: 15px; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
#ojx .ojx-sr-close { appearance: none; flex: none; width: 32px; height: 32px; border: 0; border-radius: 50%; background: none; color: var(--muted); font-size: 14px; cursor: pointer; }
#ojx .ojx-sr-close:hover { background: var(--surface-2); color: var(--text); }
#ojx .ojx-sr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 18px 14px; padding: 6px 20px 4px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--surface-3) transparent; }
#ojx .ojx-sr-foot { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 52px; padding: 10px 20px 14px; color: var(--muted); font-size: 13px; }
#ojx .ojx-sr-status:empty { display: none; }
#ojx .ojx-card { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 6px; border-radius: 12px; transition: background .12s; }
#ojx .ojx-card:hover { background: var(--surface-2); }
#ojx .ojx-card.is-current { box-shadow: inset 0 0 0 1px var(--accent); }
#ojx .ojx-card-img { aspect-ratio: 250 / 354; margin-bottom: 4px; overflow: hidden; border-radius: 8px; background: var(--surface-2); }
#ojx .ojx-card-img picture, #ojx .ojx-card-img img { display: block; width: 100%; height: 100%; object-fit: cover; }
#ojx .ojx-card-t { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: 13.5px; font-weight: 600; line-height: 1.3; }
#ojx .ojx-card-m { font-size: 12px; color: var(--muted); }
#ojx .ojx-card-img { position: relative; }
#ojx .ojx-card.is-match { box-shadow: inset 0 0 0 1px rgba(63, 207, 142, .55); }
#ojx .ojx-card-flag { position: absolute; top: 6px; left: 6px; padding: 2px 7px; border-radius: 999px; background: rgba(13, 15, 20, .85); color: var(--ok); font-size: 11px; font-weight: 600; }

/* Главная: логотип + поле по центру; после поиска поле уезжает наверх */
#ojx.ojx-home-page { max-width: 1240px; min-height: 100vh; padding: 0 24px 48px; }
#ojx .ojx-home-hero { display: flex; flex-direction: column; align-items: center; gap: 22px; padding-top: 24vh; transition: padding-top .25s ease, gap .25s ease; }
html.ojx-has-results #ojx .ojx-home-hero { padding-top: 28px; gap: 14px; }
#ojx .ojx-logo { display: flex; font-size: 76px; font-weight: 800; line-height: 1; letter-spacing: -.06em; user-select: none; transition: font-size .25s ease; }
html.ojx-has-results #ojx .ojx-logo { font-size: 40px; }
#ojx .ojx-logo-a { color: #ff2d46; }
#ojx .ojx-logo-j { color: #7350ff; }
#ojx .ojx-search.ojx-search-big { flex: none; width: min(680px, 100%); max-width: none; margin: 0; }
#ojx .ojx-search-big .ojx-search-input { height: 52px; padding: 0 22px; font-size: 16px; box-shadow: 0 10px 34px rgba(0, 0, 0, .4); }
#ojx .ojx-home-links { display: flex; gap: 18px; font-size: 13px; }
#ojx .ojx-home-links a { color: var(--faint); transition: color .12s; }
#ojx .ojx-home-links a:hover { color: var(--text); }
#ojx .ojx-home-results { margin-top: 26px; }
/* Недавно смотрел — под полем поиска, пока нет результатов */
#ojx .ojx-recent { width: min(680px, 100%); margin-top: 6px; }
#ojx .ojx-recent[hidden], html.ojx-has-results #ojx .ojx-recent { display: none; }
#ojx .ojx-recent-head { margin: 0 0 8px 4px; color: var(--faint); font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
#ojx .ojx-recent-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
#ojx .ojx-recent-item { position: relative; display: flex; gap: 10px; min-width: 0; padding: 8px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); transition: background .12s, border-color .12s; }
#ojx .ojx-recent-item:hover { background: var(--surface-2); border-color: var(--surface-3); }
#ojx .ojx-recent-img { flex: none; width: 46px; aspect-ratio: 250 / 354; overflow: hidden; border-radius: 6px; background: var(--surface-2); }
#ojx .ojx-recent-img img { display: block; width: 100%; height: 100%; object-fit: cover; }
#ojx .ojx-recent-body { display: flex; flex-direction: column; justify-content: center; gap: 4px; min-width: 0; padding-right: 14px; }
#ojx .ojx-recent-t { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: 13px; font-weight: 600; line-height: 1.3; }
#ojx .ojx-recent-m { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; color: var(--muted); }
#ojx .ojx-recent-x { appearance: none; position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--faint); font-size: 11px; line-height: 1; cursor: pointer; opacity: 0; transition: opacity .12s, background .12s, color .12s; }
#ojx .ojx-recent-item:hover .ojx-recent-x, #ojx .ojx-recent-x:focus-visible { opacity: 1; }
#ojx .ojx-recent-x:hover { background: var(--surface-3); color: var(--text); }
@media (max-width: 640px) {
  #ojx .ojx-recent-list { grid-template-columns: minmax(0, 1fr); }
  #ojx .ojx-recent-x { opacity: 1; }
}
#ojx .ojx-home-results .ojx-sr-head { padding: 0 6px 12px; }
#ojx .ojx-home-results .ojx-sr-grid { padding: 0; overflow: visible; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }

/* Шапка: постер | названия | части. Уже 1200px — части под названиями.
   Высота шапки ≈ высоте постера, чтобы плеер ниже влезал в окно целиком. */
#ojx .ojx-hero { display: grid; grid-template-columns: 140px minmax(0, 1fr); grid-template-rows: auto 1fr; gap: 12px 22px; align-items: start; margin-bottom: 16px; }
#ojx .ojx-hero.ojx-noposter { grid-template-columns: 0 minmax(0, 1fr); }
#ojx .ojx-poster { grid-column: 1; grid-row: 1 / span 2; }
#ojx .ojx-poster picture { display: block; }
#ojx .ojx-poster img { display: block; width: 100%; height: auto; aspect-ratio: 250 / 354; object-fit: cover; border-radius: 10px; background: var(--surface); box-shadow: 0 10px 30px rgba(0, 0, 0, .45), 0 0 0 1px rgba(255, 255, 255, .05); }
#ojx .ojx-info { grid-column: 2; grid-row: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
#ojx .ojx-titlerow { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; }
#ojx .ojx-title { margin: 0; font-size: 26px; font-weight: 700; line-height: 1.2; letter-spacing: -.01em; color: var(--text); }
#ojx .ojx-badge { flex: none; padding: 3px 10px; border-radius: 999px; background: var(--accent-soft); color: #cdc1ff; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
#ojx .ojx-copy { appearance: none; margin: 0 -4px; padding: 0 4px; border: 0; border-radius: 6px; background: none; text-align: left; cursor: copy; transition: background .12s; }
#ojx .ojx-copy:hover { background: rgba(255, 255, 255, .06); }
#ojx .ojx-romaji { align-self: flex-start; font-size: 15.5px; color: #c9cedb; }
#ojx .ojx-alt { align-self: flex-start; font-size: 13.5px; color: var(--muted); }
#ojx .ojx-upd { margin-top: 4px; font-size: 12.5px; color: var(--faint); }

#ojx .ojx-parts { grid-column: 2; grid-row: 2; min-width: 0; }
#ojx .ojx-sect { display: flex; align-items: center; gap: 8px; margin: 0 0 4px 10px; font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }
#ojx .ojx-parts-list { display: flex; flex-direction: column; gap: 1px; max-width: 920px; margin: 0; padding: 0; list-style: none; }
#ojx .ojx-part { margin: 0; padding: 0; list-style: none; }
#ojx .ojx-part > a, #ojx .ojx-part > span { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 4px 10px; border-radius: 8px; transition: background .12s; }
#ojx .ojx-part > a:hover { background: var(--surface-2); }
#ojx .ojx-part-n { font-size: 12px; text-align: right; color: var(--faint); font-variant-numeric: tabular-nums; }
#ojx .ojx-part-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
#ojx .ojx-dim { color: var(--muted); }
#ojx .ojx-part-meta { font-size: 12px; white-space: nowrap; color: var(--muted); }
#ojx .ojx-part.is-current > span { background: rgba(139, 108, 255, .2); box-shadow: inset 2px 0 0 var(--accent); color: #fff; }
#ojx .ojx-part.is-current .ojx-part-n { color: var(--accent); }
#ojx .ojx-part.is-current .ojx-dim, #ojx .ojx-part.is-current .ojx-part-meta { color: #c3c8d6; }
#ojx .ojx-part.is-missing > span { opacity: .5; }
#ojx .ojx-parts-list:not(.ojx-open) > .ojx-fold { display: none; }
#ojx .ojx-more { appearance: none; margin-top: 2px; padding: 3px 10px; border: 0; border-radius: 8px; background: none; color: var(--accent); font-size: 12.5px; cursor: pointer; }
#ojx .ojx-more:hover { background: var(--surface-2); }
@media (min-width: 1200px) {
  #ojx .ojx-hero.ojx-has-parts { grid-template-columns: 140px minmax(0, 1fr) minmax(0, 1.3fr); }
  #ojx .ojx-hero.ojx-has-parts.ojx-noposter { grid-template-columns: 0 minmax(0, 1fr) minmax(0, 1.3fr); }
  #ojx .ojx-hero .ojx-parts { grid-column: 3; grid-row: 1 / span 2; }
}

/* Просмотр: плеер слева, справа одна панель — плееры сайта, «Серии», сетка.
   .playlists-ajax/.playlists-player — display: contents, их дети (списки,
   iframe, серии) становятся ячейками этого грида без переноса из DOM сайта. */
#ojx .ojx-watch { display: grid; grid-template-columns: minmax(0, 1fr) var(--side); grid-template-rows: auto auto minmax(0, 1fr); grid-template-areas: "frame lists" "frame ehead" "frame eps"; column-gap: 12px; }
#ojx .ojx-watch .playlists-ajax, #ojx .ojx-watch .playlists-player { display: contents; }
#ojx .ojx-watch.ojx-loading::before { content: 'Загрузка плеера…'; grid-area: frame; display: flex; align-items: center; justify-content: center; aspect-ratio: 16 / 9; max-height: calc(100vh - 24px); border-radius: var(--radius); background: #000; color: var(--faint); }
#ojx .ojx-watch.ojx-loading .ojx-ehead { visibility: hidden; }

#ojx .playlists-items { position: relative; overflow: visible !important; }
#ojx .playlists-items ul { width: auto !important; margin: 0; padding: 0; list-style: none; transform: none !important; }
#ojx .playlists-prev, #ojx .playlists-next { display: none !important; }

#ojx .playlists-lists { grid-area: lists; display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--border); border-bottom: 0; border-radius: var(--radius) var(--radius) 0 0; background: var(--surface); }
#ojx .playlists-lists ul { display: flex !important; flex-wrap: wrap; gap: 6px; }
#ojx .playlists-lists .playlists-items li { display: none !important; }
#ojx .playlists-lists .playlists-items li.visible { display: inline-flex !important; align-items: center; width: auto !important; height: 28px; margin: 0; padding: 0 11px; border-radius: 999px; background: var(--surface-2); color: var(--muted); font-family: inherit; font-size: 12.5px; font-weight: 500; line-height: 1; cursor: pointer; user-select: none; transition: background .12s, color .12s; }
#ojx .playlists-lists .playlists-items li.visible:hover { background: var(--surface-3); color: var(--text); }
#ojx .playlists-lists .playlists-items li.visible.active { background: var(--accent-strong); color: #fff; font-weight: 600; }
#ojx .playlists-lists .playlists-items + .playlists-items li.visible { height: 24px; padding: 0 9px; font-size: 12px; }
#ojx .playlists-lists .playlists-items + .playlists-items li.visible.active { background: var(--accent-soft); color: var(--text); box-shadow: inset 0 0 0 1px var(--accent); }
/* Уровень диапазонов «1101-1110» не показываем — его серии все в сетке. */
#ojx .playlists-lists .playlists-items[data-ojx-ranges] { display: none !important; }
#ojx .playlists-lists li[data-ojx-rank="1"] { order: -2; }
#ojx .playlists-lists li[data-ojx-rank="2"] { order: -1; }
#ojx .playlists-lists .playlists-items[data-ojx-cap]::before { content: attr(data-ojx-cap); display: block; margin: 0 0 5px 2px; color: var(--faint); font-size: 10.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
#ojx .playlists-lists .playlists-items[data-ojx-cap] + .playlists-items[data-ojx-cap] { margin-top: 4px; }

#ojx .playlists-iframe { grid-area: frame; align-self: start; margin: 0; background: #000; }
#ojx .playlists-iframe:not([style*="fixed"]) { height: auto; aspect-ratio: 16 / 9; max-height: calc(100vh - 24px); border-radius: var(--radius); overflow: hidden; box-shadow: 0 0 0 1px var(--border); }
#ojx .playlists-iframe iframe { display: block; width: 100%; height: 100%; border: 0; }

#ojx .ojx-ehead { grid-area: ehead; padding: 10px 12px 8px; border: 1px solid var(--border); border-bottom: 0; background: var(--surface); }
#ojx .ojx-watch:not(:has(.playlists-lists)) .ojx-ehead { border-radius: var(--radius) var(--radius) 0 0; }
#ojx .ojx-ehead-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
#ojx .ojx-ehead-title { font-weight: 600; }
#ojx .ojx-count { padding: 1px 7px; border-radius: 999px; background: var(--surface-3); color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
#ojx .ojx-now { margin-left: auto; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12.5px; color: var(--muted); }
#ojx .ojx-now:not(:empty)::before { content: '▶ '; color: var(--accent); }
#ojx .ojx-enote { margin-top: 6px; font-size: 12px; color: var(--muted); }

/* contain: size — сетка серий не растягивает грид, а занимает остаток высоты плеера */
#ojx .playlists-videos { grid-area: eps; contain: size; overflow-y: auto; overscroll-behavior: contain; padding: 4px 10px 10px; border: 1px solid var(--border); border-top: 0; border-radius: 0 0 var(--radius) var(--radius); background: var(--surface); scrollbar-width: thin; scrollbar-color: var(--surface-3) transparent; }
#ojx .playlists-videos ul { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(var(--ojx-cell, 48px), 1fr)); gap: 6px; }
#ojx .playlists-videos .playlists-items li { display: none !important; }
#ojx .playlists-videos .playlists-items li[data-ojx-show] { display: flex !important; align-items: center; justify-content: center; position: relative; width: auto !important; height: 40px; margin: 0; padding: 0 6px; overflow: hidden; border-radius: 8px; background: var(--surface-2); color: var(--text); font-family: inherit; font-size: 0; font-weight: 500; line-height: 1; text-align: center; cursor: pointer; user-select: none; transition: background .12s, color .12s, box-shadow .12s; }
#ojx .playlists-videos .playlists-items li[data-ojx-show]::before { content: attr(data-ojx-label); max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 14px; font-variant-numeric: tabular-nums; }
#ojx .playlists-videos .playlists-items li[data-ojx-extra]:not(.active)::before { font-size: 12.5px; color: var(--muted); }
#ojx .playlists-videos .playlists-items li[data-ojx-show]:hover { background: var(--surface-3); }
#ojx .playlists-videos .playlists-items li[data-ojx-show].active { background: var(--accent-strong); color: #fff; font-weight: 700; box-shadow: 0 4px 14px rgba(115, 80, 255, .35); }
#ojx .playlists-videos .playlists-items li[data-ojx-show]:has(.playlists-view.watched):not(.active) { color: var(--muted); }
#ojx .playlists-videos li[data-ojx-span="2"] { grid-column-end: span 2; }
#ojx .playlists-videos li[data-ojx-span="3"] { grid-column-end: span 3; }
#ojx .playlists-videos li[data-ojx-span="full"] { grid-column: 1 / -1; }
#ojx .playlists-videos li[data-ojx-br] { grid-column-start: 1; }
#ojx .playlists-videos .playlists-view { position: absolute; top: 4px; right: 4px; bottom: auto; left: auto; width: 14px; height: 14px; border-radius: 50%; background: none !important; box-shadow: inset 0 0 0 1.5px var(--faint); opacity: 0; cursor: pointer; transition: opacity .12s, box-shadow .12s; }
#ojx .playlists-videos .playlists-view::after { content: ''; position: absolute; inset: -5px; }
#ojx .playlists-videos li:hover .playlists-view { opacity: 1; }
#ojx .playlists-videos .playlists-view:hover { box-shadow: inset 0 0 0 1.5px var(--text); }
#ojx .playlists-videos .playlists-view.watched { opacity: 1; box-shadow: none; background: var(--ok) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.6 6.3l2.2 2.2 4.6-4.9' fill='none' stroke='%230d0f14' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 10px no-repeat !important; }

/* У каждого плеера по одному пункту (фильм) — сетка серий не нужна, справа
   остаются только плееры. Плеер на всю ширину не влез бы в окно по высоте. */
#ojx .ojx-watch.ojx-single .ojx-ehead, #ojx .ojx-watch.ojx-single .playlists-videos { display: none !important; }
@media (min-width: 1001px) {
  #ojx .ojx-watch.ojx-single .playlists-lists { align-self: start; border-bottom: 1px solid var(--border); border-radius: var(--radius); }
}

#ojx .ojx-toast { position: fixed; left: 50%; bottom: 24px; z-index: 1000; max-width: calc(100vw - 32px); padding: 8px 14px; border-radius: 999px; background: var(--surface-3); color: var(--text); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 8px 24px rgba(0, 0, 0, .45); opacity: 0; pointer-events: none; transform: translate(-50%, 8px); transition: opacity .15s, transform .15s; }
#ojx .ojx-toast.is-on { opacity: 1; transform: translate(-50%, 0); }

@media (max-width: 1000px) {
  #ojx { padding: 4px 14px 32px; }
  #ojx .ojx-watch { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-template-areas: "lists" "frame" "ehead" "eps"; }
  #ojx .playlists-lists { padding: 0 0 10px; border: 0; background: none; }
  #ojx .ojx-ehead { margin-top: 14px; border-radius: var(--radius) var(--radius) 0 0; }
  #ojx .playlists-videos { contain: none; max-height: 46vh; }
}
@media (max-width: 640px) {
  #ojx .ojx-bar { flex-wrap: wrap; padding-bottom: 6px; }
  #ojx .ojx-search { order: 3; flex-basis: 100%; max-width: none; }
  #ojx .ojx-sr { padding: 8px; }
  #ojx .ojx-sr-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); padding: 4px 12px; }
  #ojx .ojx-hero { grid-template-columns: 96px minmax(0, 1fr); gap: 14px; }
  #ojx .ojx-title { font-size: 20px; }
  #ojx .ojx-part-meta { display: none; }
}
`;

  // ==================== Утилиты ====================

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {
      /* хранилище недоступно — переключатель просто не запомнится */
    }
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  }

  // Кнопки не забирают фокус при клике мышью: ajsubs-episode-nav переносит
  // фокус в плеер, только если он на body (focusIsOurs), — кнопка с фокусом
  // сломала бы Ctrl+←/→ → Space с геймпада.
  function button(attrs, onClick) {
    const node = el('button', Object.assign({ type: 'button' }, attrs));
    node.addEventListener('mousedown', (e) => e.preventDefault());
    node.addEventListener('click', onClick);
    return node;
  }

  function cleanText(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  // ---- Подмешанная латиница ----
  //
  // Сайт в h1/h2 и списке частей заменяет часть букв двойниками из другого
  // алфавита: «Rе:Zеrо. Жизнь c нyля в aльтepнaтивнoм миpe» (е/о в Re:Zero —
  // кириллица, c/y/a/e/p/o в русских словах — латиница). Глазом не видно, но
  // скопированное название не находится поиском. Для каждого слова решаем
  // алфавит по однозначным буквам (у которых нет двойника), при ничьей — по
  // строке целиком, и переводим двойники в этот алфавит.
  const LAT2CYR = {
    a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к',
    A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
  };
  const CYR2LAT = Object.fromEntries(Object.entries(LAT2CYR).map(([lat, cyr]) => [cyr, lat]));
  const LAT = /[A-Za-z]/;
  const CYR = /[\u0400-\u04FF]/;

  // > 0 — латиница, < 0 — кириллица, 0 — не понять
  function scriptBias(text) {
    let bias = 0;
    for (const ch of text) {
      if (LAT.test(ch) && !(ch in LAT2CYR)) bias++;
      else if (CYR.test(ch) && !(ch in CYR2LAT)) bias--;
    }
    return bias;
  }

  function fixMixed(text) {
    if (!text) return '';
    const lineBias = scriptBias(text);
    return text.replace(/[A-Za-z\u0400-\u04FF]+/g, (word) => {
      const bias = scriptBias(word) || lineBias;
      if (bias > 0) return word.replace(/[\u0400-\u04FF]/g, (ch) => CYR2LAT[ch] || ch);
      if (bias < 0) return word.replace(/[A-Za-z]/g, (ch) => LAT2CYR[ch] || ch);
      return word;
    });
  }

  // ==================== Обычный вид ====================

  // «Обычный вид» — только для страниц тайтла: главная — это поиск, ссылка с
  // AniList должна работать всегда.
  if (!IS_HOME && storageGet(OFF_KEY) === '1') {
    onReady(() => {
      const story = document.querySelector('article.fullstory');
      if (!story || !story.querySelector('.playlists-ajax')) return;
      recentTouch(storyEntry(story));
      const back = el('button', { type: 'button', text: 'Новый вид', title: 'Включить интерфейс AnimeJoy Title UI' });
      back.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:2147483646;padding:8px 14px;border:0;border-radius:999px;' +
        'background:#7350ff;color:#fff;font:600 13px/1 "Golos Text",system-ui,sans-serif;cursor:pointer;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.45)';
      back.addEventListener('click', () => {
        storageSet(OFF_KEY, null);
        location.reload();
      });
      document.body.append(back);
    });
    return;
  }

  // ==================== Сборка интерфейса ====================

  let toastNode = null;
  let toastTimer = null;

  function toast(text) {
    if (!toastNode) return;
    toastNode.textContent = text;
    toastNode.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('is-on'), 1600);
  }

  function copyText(text) {
    const done = () => toast('Скопировано: ' + text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => toast('Не удалось скопировать'));
    }
  }

  function copyable(text, className, tag) {
    const node = button({ class: 'ojx-copy ' + className, title: 'Скопировать', text }, () => copyText(text));
    return tag ? el(tag, { class: className }, node) : node;
  }

  function buildBar() {
    const crumbs = el('nav', { class: 'ojx-crumbs' }, el('a', { class: 'ojx-home', href: '/', text: location.hostname }));
    // .speedbar: «otakujoy.fun » TV сериалы » <тайтл>» — берём раздел.
    const section = [...document.querySelectorAll('.speedbar a[href]')].find((a) => {
      try {
        return new URL(a.href).pathname !== '/';
      } catch (e) {
        return false;
      }
    });
    if (section) crumbs.append(el('span', { class: 'ojx-sep', text: '/' }), el('a', { href: section.href, text: cleanText(section) }));

    const classic = button(
      { class: 'ojx-btn', title: 'Вернуть оформление сайта (обратно — кнопкой «Новый вид»)', text: 'Обычный вид' },
      () => {
        storageSet(OFF_KEY, '1');
        location.reload();
      }
    );
    return el('header', { class: 'ojx-bar' }, crumbs, buildSearch('overlay'), classic);
  }

  // ==================== Поиск ====================
  //
  // Тот же запрос, что шлёт форма сайта #fullsearch: POST /index.php?do=search
  // (do, subaction=search, story, search_start = номер страницы, result_from =
  // (N-1)*10+1), ответ — обычная HTML-страница, по 10 на страницу. Результаты —
  // article.shortstory: .ntitle a («Название [21 из 21]» + ссылка), picture
  // (постер), .blkdesc p с .timpact «Количество серий:» («ТВ (21 эп.), 25 мин.»,
  // «полнометражный фильм, 120 мин.»), «Дата выпуска:» («c 05.10.2025»),
  // «Сезон:» («осень-2025»). Всего найдено — .search_result_num «найдено 12
  // ответов». Ничего не нашлось — просто ни одной статьи, без сообщения.
  const SEARCH_PAGE_SIZE = 10;
  // year — год тайтла с AniList: такие карточки подсвечиваются
  const search = { query: '', page: 0, total: 0, shown: 0, controller: null, year: '', note: '' };
  let searchUi = null;

  // mode: 'overlay' — поле в панели страницы тайтла, результаты поверх неё;
  // 'inline' — главная: большое поле, результаты под ним.
  function buildSearch(mode) {
    const inline = mode === 'inline';
    const input = el('input', {
      type: 'search',
      class: 'ojx-search-input',
      placeholder: inline ? 'Название аниме — по-русски, ромадзи или по-английски' : 'Поиск по сайту',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'Поиск по сайту',
    });
    const form = el('form', { class: 'ojx-search' + (inline ? ' ojx-search-big' : ''), role: 'search' }, input, !inline && el('kbd', { text: '/' }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = input.value.trim();
      if (!query) return;
      if (inline) setHash({ q: query });
      if (!inline && query === search.query && search.shown) openResults();
      else runSearch(query, 1);
    });

    const grid = el('div', { class: 'ojx-sr-grid' });
    const status = el('div', { class: 'ojx-sr-status' });
    const more = button({ class: 'ojx-btn ojx-sr-more', text: 'Показать ещё', hidden: true }, () => runSearch(search.query, search.page + 1));
    const title = el('div', { class: 'ojx-sr-title' });
    const head = el('div', { class: 'ojx-sr-head' }, title);
    const foot = el('div', { class: 'ojx-sr-foot' }, status, more);
    searchUi = { input, grid, status, more, title, layer: null, results: null };

    if (inline) {
      searchUi.results = el('section', { class: 'ojx-home-results', hidden: true, 'aria-label': 'Результаты поиска' }, head, grid, foot);
    } else {
      head.append(button({ class: 'ojx-sr-close', title: 'Закрыть (Esc)', 'aria-label': 'Закрыть', text: '✕' }, closeResults));
      const panel = el('div', { class: 'ojx-sr-panel', role: 'dialog', 'aria-label': 'Результаты поиска' }, head, grid, foot);
      const layer = el('div', { class: 'ojx-sr', hidden: true }, panel);
      layer.addEventListener('mousedown', (e) => {
        if (e.target === layer) closeResults();
      });
      searchUi.layer = layer;
      // Вернулись в поле с тем же запросом — показываем уже найденное.
      input.addEventListener('focus', () => {
        if (search.shown && input.value.trim() === search.query) openResults();
      });
    }

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && searchUi.layer && !searchUi.layer.hidden) {
          e.stopPropagation();
          closeResults();
          return;
        }
        // «/» — к поиску, если не печатаем в другом поле (code — та же клавиша
        // и на русской раскладке, где она «.»)
        const slash = e.key === '/' || (e.code === 'Slash' && !e.shiftKey);
        if (slash && !e.ctrlKey && !e.altKey && !e.metaKey && !isTyping(e.target)) {
          e.preventDefault();
          input.focus();
          input.select();
        }
      },
      true
    );
    return form;
  }

  function isTyping(target) {
    return !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }

  function openResults() {
    if (!searchUi) return;
    if (searchUi.layer) {
      searchUi.layer.hidden = false;
      root.classList.add('ojx-sr-open');
    } else {
      searchUi.results.hidden = false;
      root.classList.add('ojx-has-results');
    }
  }

  // Фокус уходит на body: иначе ajsubs-episode-nav считает его «чужим»
  // (focusIsOurs) и не переносит в плеер после Ctrl+←/→.
  function closeResults() {
    if (!searchUi || !searchUi.layer) return;
    searchUi.layer.hidden = true;
    root.classList.remove('ojx-sr-open');
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  function searchField(article, name) {
    const p = [...article.querySelectorAll('.blkdesc p')].find((x) => cleanText(x.querySelector('.timpact')).startsWith(name));
    return p ? cleanText(p).slice(name.length).trim() : '';
  }

  function parseResults(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const num = cleanText(doc.querySelector('.search_result_num'));
    const total = Number((num.match(/найдено\s+(\d+)/i) || [])[1] || 0);
    const items = [...doc.querySelectorAll('article.shortstory')]
      .map((article) => {
        const link = article.querySelector('.ntitle a[href]');
        if (!link) return null;
        const raw = cleanText(link);
        const m = raw.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
        // «[08 из 08]» → «8 из 8»
        const badge = m ? m[2].replace(/\b0+(\d)/g, '$1') : '';
        // «ТВ (21 эп.), 25 мин.» / «полнометражный фильм, 120 мин.» / «OVA (2 эп.), 30 мин.»
        const count = searchField(article, 'Количество серий:');
        const [first = '', second = ''] = count.split(',').map((s) => s.trim());
        const kind = first.replace(/\s*\(.*\)\s*/, '').replace(/^полнометражный\s+/i, '');
        const eps = (first.match(/\((\d+)\s*эп/) || [])[1];
        const isFilm = /фильм/i.test(kind);
        const amount = badge || (eps ? eps + ' эп.' : isFilm ? second : '');
        const year = ((searchField(article, 'Дата выпуска:') + ' ' + searchField(article, 'Сезон:')).match(/(?:19|20)\d\d/) || [])[0] || '';
        const picture = article.querySelector('.text picture') || article.querySelector('.text img');
        return {
          href: new URL(link.getAttribute('href'), location.href).href,
          title: fixMixed(m ? m[1] : raw),
          year,
          meta: [year, kind, amount].filter(Boolean).join(' · '),
          picture: picture ? document.importNode(picture, true) : null,
        };
      })
      .filter(Boolean);
    return { total: total || items.length, items };
  }

  function resultCard(item) {
    const img = item.picture && (item.picture.tagName === 'IMG' ? item.picture : item.picture.querySelector('img'));
    if (img) {
      img.removeAttribute('style');
      img.removeAttribute('class');
      img.removeAttribute('title');
      img.alt = '';
      img.loading = 'lazy';
    }
    let current = false;
    try {
      current = new URL(item.href).pathname === location.pathname;
    } catch (e) {
      /* битая ссылка */
    }
    const match = !!search.year && item.year === search.year;
    return el(
      'a',
      { class: 'ojx-card' + (current ? ' is-current' : '') + (match ? ' is-match' : ''), href: item.href, title: item.title },
      el('div', { class: 'ojx-card-img' }, item.picture, match && el('span', { class: 'ojx-card-flag', text: 'AniList · ' + item.year })),
      el('div', { class: 'ojx-card-t', text: item.title }),
      item.meta && el('div', { class: 'ojx-card-m', text: item.meta })
    );
  }

  // Возвращает число найденных на странице (null — запрос отменён/упал).
  async function runSearch(query, page, opts) {
    if (!searchUi) return null;
    const ui = searchUi;
    if (search.controller) search.controller.abort();
    const controller = new AbortController();
    search.controller = controller;
    if (page === 1) {
      const o = opts || {};
      Object.assign(search, { query, page: 0, total: 0, shown: 0, year: o.year || '', note: o.note || '' });
      ui.grid.replaceChildren();
      ui.title.textContent = '«' + query + '»';
      ui.input.value = query;
    }
    ui.more.hidden = true;
    ui.status.textContent = 'Ищу…';
    openResults();

    try {
      const body = new URLSearchParams({
        do: 'search',
        subaction: 'search',
        search_start: String(page),
        full_search: '0',
        result_from: String((page - 1) * SEARCH_PAGE_SIZE + 1),
        story: query,
      });
      const res = await fetch('/index.php?do=search', { method: 'POST', body, credentials: 'same-origin', signal: controller.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { total, items } = parseResults(await res.text());
      if (controller !== search.controller) return null;
      search.page = page;
      search.total = Math.max(total, search.shown + items.length);
      search.shown += items.length;
      ui.grid.append(...items.map(resultCard));
      ui.title.textContent = '«' + query + '» · ' + search.total + (search.note ? ' · ' + search.note : '');
      ui.status.textContent = search.shown ? (search.shown < search.total ? 'Показано ' + search.shown + ' из ' + search.total : '') : 'Ничего не найдено';
      ui.more.hidden = !(items.length && search.shown < search.total);
      return items.length;
    } catch (e) {
      if (e.name === 'AbortError') return null;
      ui.status.textContent = 'Поиск не удался: ' + e.message;
      return null;
    } finally {
      if (controller === search.controller) search.controller = null;
    }
  }

  // ==================== Главная: поиск «как Google» ====================
  //
  // otakujoy.fun/ — только логотип и поле поиска (лента сайта — /index.php,
  // скрипт её не трогает). Запрос живёт в hash, чтобы на него можно было
  // сослаться (кнопка AJ на AniList — anilist-aj-button.user.js):
  //   #q=<запрос>              — обычный поиск;
  //   #al=<id AniList>&t=<название> — названия берём из GraphQL AniList
  //     (graphql.anilist.co отвечает с CORS) и ищем по очереди: ромадзи,
  //     английское, t, они же до двоеточия — пока что-то не найдётся. Поиск
  //     AJ находит и по ромадзи, и по английскому (Tetsunabe no Jan / Iron
  //     Wok Jan → «Железный котелок Жана!»). Карточки того же года, что у
  //     тайтла на AniList, подсвечиваются.

  function setHash(params) {
    history.replaceState(null, '', '#' + new URLSearchParams(params).toString());
  }

  function cleanQuery(text) {
    return String(text || '')
      .replace(/[!?！？。、「」『』"“”]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function aniListTitles(id) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: 'query($id:Int){Media(id:$id){title{romaji english} seasonYear startDate{year}}}',
        variables: { id: Number(id) },
      }),
    });
    if (!res.ok) throw new Error('AniList HTTP ' + res.status);
    const media = ((await res.json()).data || {}).Media;
    if (!media) throw new Error('AniList: нет тайтла ' + id);
    return {
      titles: [media.title.romaji, media.title.english],
      year: String(media.seasonYear || (media.startDate && media.startDate.year) || ''),
    };
  }

  let hashRun = 0;

  async function applyHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const run = ++hashRun;
    const q = params.get('q');
    if (q) {
      runSearch(q, 1);
      return;
    }
    const al = params.get('al');
    if (!al || !/^\d+$/.test(al)) return;
    const fallback = params.get('t') || '';
    let titles = [fallback];
    let year = '';
    searchUi.input.value = fallback;
    searchUi.title.textContent = fallback ? '«' + fallback + '»' : 'AniList ' + al;
    searchUi.status.textContent = 'Беру названия с AniList…';
    openResults();
    try {
      ({ titles, year } = await aniListTitles(al));
      titles.push(fallback);
    } catch (e) {
      /* без AniList — ищем по названию из ссылки */
    }
    if (run !== hashRun) return;
    const full = titles.map(cleanQuery).filter(Boolean);
    const short = full.filter((t) => t.includes(':')).map((t) => t.split(':')[0].trim()).filter((t) => t.length >= 3);
    const candidates = [...new Set([...full, ...short])];
    for (const query of candidates) {
      const found = await runSearch(query, 1, { year, note: 'с AniList' });
      if (run !== hashRun || found === null) return;
      if (found > 0) return;
    }
    if (candidates.length > 1) searchUi.status.textContent = 'Ничего не найдено. Пробовал: ' + candidates.join(' / ');
  }

  // ==================== Недавно смотрел ====================

  function recentLoad() {
    try {
      const list = JSON.parse(storageGet(RECENT_KEY) || '[]');
      return Array.isArray(list) ? list.filter((x) => x && typeof x.path === 'string' && x.path.startsWith('/')) : [];
    } catch (e) {
      return [];
    }
  }

  function recentSave(list) {
    storageSet(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  }

  // entry без ep не стирает запомненную серию (повторный заход, «Обычный вид»).
  function recentTouch(entry) {
    const list = recentLoad();
    const prev = list.find((x) => x.path === entry.path) || {};
    const next = Object.assign({}, prev, entry, { t: Date.now() });
    recentSave([next, ...list.filter((x) => x.path !== entry.path)]);
  }

  function storyEntry(story) {
    const img = story.querySelector('.text > picture img');
    const og = document.querySelector('meta[property="og:image"]');
    return {
      path: location.pathname,
      title: storyTitle(story).title,
      poster: (img && img.src) || (og && og.content) || '',
    };
  }

  function relDay(t) {
    const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((day(new Date()) - day(new Date(t))) / 864e5);
    if (days <= 0) return 'сегодня';
    if (days === 1) return 'вчера';
    if (days < 7) return days + ' дн. назад';
    return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function buildRecent() {
    const box = el('section', { class: 'ojx-recent', 'aria-label': 'Недавно смотрел' });

    function item(x) {
      const remove = button({ class: 'ojx-recent-x', title: 'Убрать из списка', 'aria-label': 'Убрать из списка', text: '✕' }, (e) => {
        e.preventDefault();
        e.stopPropagation();
        recentSave(recentLoad().filter((y) => y.path !== x.path));
        render();
      });
      return el(
        'a',
        { class: 'ojx-recent-item', href: x.path, title: x.title },
        el('div', { class: 'ojx-recent-img' }, x.poster && el('img', { src: x.poster, alt: '', loading: 'lazy' })),
        el(
          'div',
          { class: 'ojx-recent-body' },
          el('div', { class: 'ojx-recent-t', text: x.title || x.path }),
          el('div', { class: 'ojx-recent-m', text: [x.ep, x.t && relDay(x.t)].filter(Boolean).join(' · ') })
        ),
        remove
      );
    }

    function render() {
      const list = recentLoad().slice(0, RECENT_SHOWN);
      box.hidden = !list.length;
      box.replaceChildren(
        el('div', { class: 'ojx-recent-head', text: 'Недавно смотрел' }),
        el('div', { class: 'ojx-recent-list' }, ...list.map(item))
      );
    }

    render();
    // список поменялся в другой вкладке; «Назад» на главную из bfcache
    window.addEventListener('storage', (e) => e.key === RECENT_KEY && render());
    window.addEventListener('pageshow', (e) => e.persisted && render());
    return box;
  }

  function buildHome() {
    if (!document.body) return false;
    const form = buildSearch('inline');
    const logo = el(
      'a',
      { class: 'ojx-logo', href: '/', title: 'otakujoy.fun' },
      el('span', { class: 'ojx-logo-a', text: 'A' }),
      el('span', { class: 'ojx-logo-j', text: 'J' })
    );
    const links = el(
      'nav',
      { class: 'ojx-home-links' },
      el('a', { href: '/index.php', text: 'Лента сайта' }),
      el('a', { href: 'https://anilist.co/', text: 'AniList' })
    );
    toastNode = el('div', { class: 'ojx-toast', role: 'status' });
    const shell = el('div', { id: 'ojx', class: 'ojx-home-page' }, el('section', { class: 'ojx-home-hero' }, logo, form, links, buildRecent()), searchUi.results, toastNode);
    document.body.prepend(shell);
    window.addEventListener('hashchange', applyHash);
    if (location.hash.length > 1) applyHash();
    else searchUi.input.focus();
    return true;
  }

  function buildPoster(story) {
    let node = null;
    const picture = story.querySelector('.text > picture');
    if (picture) {
      node = picture.cloneNode(true);
    } else {
      const og = document.querySelector('meta[property="og:image"]');
      if (og && og.content) node = el('img', { src: og.content });
    }
    if (!node) return null;
    const img = node.tagName === 'IMG' ? node : node.querySelector('img');
    if (img) {
      img.removeAttribute('style');
      img.removeAttribute('class');
      img.removeAttribute('title');
      img.alt = '';
    }
    return el('div', { class: 'ojx-poster' }, node);
  }

  // «Синий экзорцист [ТВ-1] - ТВ (25 эп. + спэшлы), адаптация манги, 2011»
  function splitPart(text) {
    const at = text.search(/\s[-–—]\s/);
    const name = at > 0 ? text.slice(0, at).trim() : text;
    const details = at > 0 ? text.slice(at + 3).trim() : '';
    const year = (details.match(/(?:^|\D)((?:19|20)\d\d)\s*$/) || [])[1] || '';
    let kind = details.split(',')[0].trim();
    if (kind === year) kind = '';
    kind = kind.replace(/^п\/ф(?=$|[\s(])/, 'фильм'); // \b в JS-регэкспах не видит кириллицу
    return { name, meta: [kind, year].filter(Boolean).join(' · ') };
  }

  // Общее начало названий (по словам) — его рисуем приглушённо, чтобы глаз
  // цеплялся за отличие: [ТВ-1] / (фильм) / [ТВ-2]…
  function commonPrefix(names) {
    if (names.length < 2) return '';
    const words = names.map((n) => n.split(' '));
    let k = 0;
    while (words.every((w) => k < w.length && w[k] === words[0][k])) k++;
    return words[0].slice(0, k).join(' ');
  }

  const PARTS_LIMIT = 8;
  const PARTS_WINDOW = 7;

  function buildParts(story) {
    // DLE-спойлер «Это аниме состоит из:» — заголовок .title_spoiler, тело
    // .text_spoiler с id из ShowOrHide('…'), внутри <ol> со ссылками; текущая
    // часть — li.rfa. Частей, которых нет на сайте, бывают без ссылки.
    const head = [...story.querySelectorAll('.title_spoiler')].find((t) => /состоит из/i.test(t.textContent));
    if (!head) return null;
    let body = null;
    const link = head.querySelector('a[href*="ShowOrHide"]');
    const idMatch = link && link.getAttribute('href').match(/ShowOrHide\('([^']+)'\)/);
    if (idMatch) body = document.getElementById(idMatch[1]);
    if (!body) body = head.nextElementSibling;
    if (!body || !body.classList.contains('text_spoiler')) return null;

    const parts = [...body.querySelectorAll('li')]
      .map((li) => {
        const a = li.querySelector('a[href]');
        let current = li.classList.contains('rfa');
        if (!current && a) {
          try {
            current = new URL(a.href, location.href).pathname === location.pathname;
          } catch (e) {
            /* битая ссылка — не текущая */
          }
        }
        return Object.assign(splitPart(fixMixed(cleanText(li))), { href: a ? a.href : null, current });
      })
      .filter((p) => p.name);
    if (!parts.length) return null;

    const prefix = commonPrefix(parts.map((p) => p.name));
    const list = el('ol', { class: 'ojx-parts-list' });
    parts.forEach((part, i) => {
      const name = el('span', { class: 'ojx-part-name', title: part.name });
      if (prefix && part.name.startsWith(prefix + ' ')) {
        name.append(el('span', { class: 'ojx-dim', text: prefix }), part.name.slice(prefix.length));
      } else {
        name.textContent = part.name;
      }
      const cells = [el('span', { class: 'ojx-part-n', text: String(i + 1) }), name, el('span', { class: 'ojx-part-meta', text: part.meta })];
      const row = part.href && !part.current ? el('a', { href: part.href }, ...cells) : el('span', null, ...cells);
      list.append(el('li', { class: 'ojx-part' + (part.current ? ' is-current' : '') + (part.href ? '' : ' is-missing') }, row));
    });

    const section = el('div', { class: 'ojx-parts' }, el('div', { class: 'ojx-sect', text: 'Части · ' + parts.length }), list);

    // Длинную франшизу сворачиваем до окна вокруг текущей части.
    if (parts.length > PARTS_LIMIT) {
      const cur = Math.max(0, parts.findIndex((p) => p.current));
      const from = Math.max(0, Math.min(cur - 3, parts.length - PARTS_WINDOW));
      [...list.children].forEach((li, i) => {
        if (i < from || i >= from + PARTS_WINDOW) li.classList.add('ojx-fold');
      });
      const more = button({ class: 'ojx-more', text: 'Показать все (' + parts.length + ')' }, () => {
        const open = list.classList.toggle('ojx-open');
        more.textContent = open ? 'Свернуть' : 'Показать все (' + parts.length + ')';
      });
      section.append(more);
    }
    return section;
  }

  // «Синий экзорцист (4 сезон) [24 из 24]» — счётчик серий отдельно
  function storyTitle(story) {
    const h1 = story.querySelector('h1');
    const rawTitle = h1 ? cleanText(h1) : document.title;
    const m = rawTitle.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    return { title: fixMixed(m ? m[1] : rawTitle), badge: m ? fixMixed(m[2]) : '' };
  }

  function buildHero(story) {
    const { title, badge } = storyTitle(story);
    const romaji = fixMixed(cleanText(story.querySelector('.titleup h2, h2.romanji')));
    const alt = fixMixed(cleanText(story.querySelector('[itemprop="alternativeHeadline"]')).replace(/;\s*$/, ''));
    const upd = fixMixed(cleanText(story.querySelector('.editdate')))
      .replace(/^Аниме обновлено:\s*/i, 'Обновлено ')
      .replace(/\s+-\s+/, ' — ');

    const info = el(
      'div',
      { class: 'ojx-info' },
      el('div', { class: 'ojx-titlerow' }, copyable(title, 'ojx-title', 'h1'), badge && el('span', { class: 'ojx-badge', text: badge })),
      romaji && copyable(romaji, 'ojx-romaji'),
      alt && copyable(alt, 'ojx-alt'),
      upd && el('div', { class: 'ojx-upd', text: upd })
    );
    // copyable(…, 'h1') кладёт класс и на h1, и на кнопку — кнопке он не нужен
    const titleBtn = info.querySelector('h1 > .ojx-copy');
    if (titleBtn) titleBtn.classList.remove('ojx-title');

    const poster = buildPoster(story);
    const parts = buildParts(story);
    const cls = 'ojx-hero' + (poster ? '' : ' ojx-noposter') + (parts ? ' ojx-has-parts' : '');
    return el('section', { class: cls }, poster, info, parts);
  }

  function buildEpisodesHead() {
    return el(
      'div',
      { class: 'ojx-ehead' },
      el(
        'div',
        { class: 'ojx-ehead-row' },
        el('span', { class: 'ojx-ehead-title', text: 'Серии' }),
        el('span', { class: 'ojx-count' }),
        el('span', { class: 'ojx-now' })
      ),
      el('div', { class: 'ojx-enote', hidden: true, text: 'Серии переключаются в самом плеере' })
    );
  }

  // Где плейлист стоял на странице сайта — чтобы вернуть его, если сборка упала.
  let ajaxOrigin = null;

  function build() {
    const story = document.querySelector('article.fullstory');
    const ajax = story && story.querySelector('.playlists-ajax');
    if (!ajax) return false;

    const head = buildEpisodesHead();
    const watch = el('section', { class: 'ojx-watch ojx-loading' }, head);
    toastNode = el('div', { class: 'ojx-toast', role: 'status' });
    const shell = el('div', { id: 'ojx' }, buildBar(), buildHero(story), watch, toastNode);
    if (searchUi && searchUi.layer) shell.append(searchUi.layer);

    // Age-gate (на animejoy был #modal) не прячем вместе со страницей.
    const modal = document.getElementById('modal');
    if (modal && modal.closest('body > .page')) document.body.append(modal);

    // Плейлист переносим, а не копируем: обработчики сайта делегированы на
    // body, ajax-ответ сайт пишет в этот же элемент (_self.html()). Переносим
    // последним — всё, что может упасть, уже собрано.
    ajaxOrigin = { ajax, parent: ajax.parentNode, next: ajax.nextSibling };
    watch.prepend(ajax);
    document.body.prepend(shell);

    recentTouch(storyEntry(story));
    observePlaylist(ajax, watch, head);
    installClickHelpers();
    return true;
  }

  function start() {
    let ok = false;
    try {
      ok = IS_HOME ? buildHome() : build();
    } catch (e) {
      console.error('[ojx]', e);
      if (ajaxOrigin && ajaxOrigin.parent.isConnected) {
        ajaxOrigin.parent.insertBefore(ajaxOrigin.ajax, ajaxOrigin.next && ajaxOrigin.next.parentNode === ajaxOrigin.parent ? ajaxOrigin.next : null);
      }
      const shell = document.getElementById('ojx');
      if (shell) shell.remove();
    }
    if (!ok) {
      root.classList.remove('ojx');
      styleNode.remove();
    }
  }

  // ==================== Плейлист ====================
  //
  // Разметка (ответ /engine/ajax/playlists.php, логика —
  // templates/AnimeJoy/playlists/player.js):
  //   .playlists-player
  //     .playlists-lists > .playlists-items × 1–3 > ul > li[data-id]   плееры, диапазоны «1-10»…
  //     .playlists-iframe > iframe                                     пересоздаётся на каждый клик
  //     .playlists-videos > .playlists-items > ul > li[data-id][data-file]  серии ВСЕХ плееров
  // Видимые — li.visible, выбранные — li.active (ставит jQuery синхронно).
  // Каждый .playlists-items сайт превращает в горизонтальный Sly-слайдер.

  // Sly снимаем: со слайдером сетка не работает — он ловит колесо над лентой
  // (preventDefault, пока «есть куда листать»), тащит её мышью и пишет
  // transform. Его destroy() снимает .active с элемента, который он сам
  // считает активным (rel.activeItem, обычно первый li, не тот, что выбрал
  // сайт), — поэтому .active запоминаем и возвращаем. Повторные
  // .sly('reload'/'toCenter') сайта и ajsubs-episode-nav без экземпляра — no-op.
  function destroySly(ajax) {
    const $ = window.jQuery;
    if (!$ || !$.fn || !$.fn.sly) return;
    const frames = [...ajax.querySelectorAll('.playlists-items')].filter((f) => $.data(f, 'sly'));
    if (!frames.length) return;
    const active = [...ajax.querySelectorAll('li.active')];
    $(frames).sly(false);
    for (const li of active) li.classList.add('active');
  }

  // Подпись плитки: «12 серия» → «12», «3 спэшл» → «SP 3», «2 ova» → «OVA 2».
  // Пункт Kodik «на весь сезон» подписан «~» или «`».
  function shortLabel(text) {
    let m;
    if ((m = text.match(/^(\d+(?:\s*[-–]\s*\d+)?)\s*серия$/i))) return m[1].replace(/\s+/g, '');
    if ((m = text.match(/^серия\s*(\d+)$/i))) return m[1];
    if ((m = text.match(/^(\d+)\s*(?:спэшл|спешл|sp)$/i))) return 'SP ' + m[1];
    if ((m = text.match(/^(\d+)\s*(ova|ona)$/i))) return m[2].toUpperCase() + ' ' + m[1];
    if ((m = text.match(/^(\d+)\s*часть$/i))) return 'Часть ' + m[1];
    if (!/[\p{L}\p{N}]/u.test(text)) return 'Все серии';
    return text;
  }

  function decorate(li) {
    if (li.dataset.ojxText !== undefined) return;
    const text = fixMixed(cleanText(li));
    const label = shortLabel(text);
    const len = [...label].length;
    li.dataset.ojxText = text;
    li.dataset.ojxLabel = label;
    li.dataset.ojxKind = text.replace(/\d+/g, '#');
    li.dataset.ojxSpan = len <= 4 ? '1' : len <= 9 ? '2' : len <= 15 ? '3' : 'full';
    if (label !== text && !/^\d/.test(label)) li.title = text;
    // не номер серии («Спэшл», «SP 3», «Все серии») — тише, чтобы среди номеров не сливалось
    if (!/^\d+(-\d+)?$/.test(label)) li.dataset.ojxExtra = '';
  }

  // Восстановление выбора сайтом при загрузке (loadPlaylistSelected) ломается
  // на двух уровнях списков: для плеера без поддиапазонов он сохраняет индекс
  // -1, а -1 истинно — и сайт «кликает» последний диапазон чужого плеера.
  // Итог (Стальной алхимик: Братство, Alloha): играет Alloha, а видимы и в
  // ленте серии 61–64 + OVA от Sibnet, ни одна не выбрана. Правда — то, что
  // загружено в iframe: делаем видимыми серии того же data-id.
  function repairSelection(ajax, all) {
    if (all.some((li) => li.classList.contains('visible') && li.classList.contains('active'))) return;
    const frame = ajax.querySelector('.playlists-iframe iframe');
    const src = frame && frame.getAttribute('src');
    const playing =
      all.find((li) => li.classList.contains('active') && (!src || li.getAttribute('data-file') === src)) ||
      (src && all.find((li) => li.getAttribute('data-file') === src));
    if (!playing) return;
    for (const li of all) {
      li.classList.toggle('visible', li.dataset.id === playing.dataset.id);
      li.classList.toggle('active', li === playing);
    }
  }

  // Уровни .playlists-lists: озвучка → плеер → диапазон «1101-1110» (у
  // Ван-Писа все три; у большинства тайтлов — только плееры, иногда +
  // диапазоны). data-id вложенные: озвучка 0_1, плеер 0_1_2, диапазон
  // 0_1_2_3; data-id серии = data-id пункта нижнего уровня. Подписи уровней —
  // по содержимому: все пункты «N-M» — диапазоны, есть имя плеера — «Плеер»,
  // иначе «Озвучка».
  const RANGE_RE = /^\s*\d+\s*[-–]\s*\d+\s*$/;
  const PLAYER_NAME_RE = /наш плеер|allvideo|alloha|sibnet|dzen|matreshka|mail|cda|kodik|\bvk\b|\bok\b|rutube|youtube/i;

  function listLevels(ajax) {
    return [...ajax.querySelectorAll('.playlists-lists .playlists-items')];
  }

  function rangeLevel(ajax) {
    return (
      listLevels(ajax).find((level) => {
        const items = [...level.querySelectorAll('li')];
        return items.length > 0 && items.every((li) => RANGE_RE.test(li.textContent));
      }) || null
    );
  }

  // Серии в сетке: при уровне диапазонов — все серии выбранного плеера
  // (видимые пункты-диапазоны), иначе — то, что показал сайт (li.visible).
  function shownEpisodes(ajax, all) {
    const visible = all.filter((li) => li.classList.contains('visible'));
    const ranges = rangeLevel(ajax);
    if (!ranges) return visible;
    const ids = new Set([...ranges.querySelectorAll('li.visible')].map((li) => li.getAttribute('data-id')));
    if (!ids.size) return visible;
    return all.filter((li) => ids.has(li.getAttribute('data-id')));
  }

  // Порядок плееров в панели: AllVideo, Alloha, дальше — как у сайта.
  // Только CSS order (ul — flex): DOM сайта и его индексы выбора не трогаем.
  const PLAYER_RANK = [/allvideo/i, /alloha/i];

  function rankPlayers(level) {
    for (const li of level.querySelectorAll('li')) {
      const i = PLAYER_RANK.findIndex((re) => re.test(li.textContent));
      if (i < 0) delete li.dataset.ojxRank;
      else li.dataset.ojxRank = String(i + 1);
    }
  }

  function labelLevels(ajax) {
    const ranges = rangeLevel(ajax);
    const levels = listLevels(ajax);
    const shown = levels.filter((level) => level !== ranges);
    for (const level of levels) {
      if (level !== ranges && PLAYER_NAME_RE.test(level.textContent)) rankPlayers(level);
      setFlag(level, 'data-ojx-ranges', level === ranges);
      const cap = shown.length < 2 || level === ranges ? null : PLAYER_NAME_RE.test(level.textContent) ? 'Плеер' : 'Озвучка';
      if (cap) level.dataset.ojxCap = cap;
      else delete level.dataset.ojxCap;
    }
  }

  function setFlag(node, attr, on) {
    if (on === node.hasAttribute(attr)) return;
    if (on) node.setAttribute(attr, '');
    else node.removeAttribute(attr);
  }

  // Прокручиваем только саму панель серий, не страницу.
  function scrollEpisodeIntoView(li, behavior) {
    const box = li.closest('.playlists-videos');
    if (!box || box.scrollHeight <= box.clientHeight) return;
    const b = box.getBoundingClientRect();
    const r = li.getBoundingClientRect();
    if (r.top >= b.top + 6 && r.bottom <= b.bottom - 6) return;
    box.scrollTo({ top: box.scrollTop + (r.top - b.top) - (box.clientHeight - r.height) / 2, behavior });
  }

  function observePlaylist(ajax, watch, head) {
    const count = head.querySelector('.ojx-count');
    const now = head.querySelector('.ojx-now');
    const note = head.querySelector('.ojx-enote');
    let scheduled = false;
    let lastActive = null;

    function run() {
      scheduled = false;
      destroySly(ajax);
      const all = [...ajax.querySelectorAll('.playlists-videos li')];
      watch.classList.toggle('ojx-loading', !all.length);
      if (!all.length) return;

      repairSelection(ajax, all);
      const perPlayer = {};
      for (const li of all) {
        decorate(li);
        perPlayer[li.dataset.id] = (perPlayer[li.dataset.id] || 0) + 1;
      }
      watch.classList.toggle('ojx-single', Object.values(perPlayer).every((n) => n < 2));

      labelLevels(ajax);
      const visible = shownEpisodes(ajax, all);
      const shownSet = new Set(visible);
      for (const li of all) setFlag(li, 'data-ojx-show', shownSet.has(li));

      // Смена вида пункта («серия» → «спэшл», арки Kodik) — с новой строки,
      // но одиночный пункт среди серий («Спэшл» между 1108 и 1109 у
      // Ван-Писа) строку не рвёт: перенос только между сериями длиной ≥ 2.
      const runs = [];
      for (const li of visible) {
        const last = runs[runs.length - 1];
        if (last && last.kind === li.dataset.ojxKind) last.items.push(li);
        else runs.push({ kind: li.dataset.ojxKind, items: [li] });
      }
      runs.forEach((r, i) => {
        const prev = runs[i - 1];
        r.items.forEach((li, j) => setFlag(li, 'data-ojx-br', j === 0 && !!prev && prev.items.length > 1 && r.items.length > 1));
      });

      // Ширина колонки — по самой длинной подписи в одну плитку: «1101» у
      // Ван-Писа в 48px не влезала, и жирная активная плитка становилась «11…».
      const longest = Math.max(0, ...visible.filter((li) => li.dataset.ojxSpan === '1').map((li) => [...li.dataset.ojxLabel].length));
      watch.style.setProperty('--ojx-cell', Math.max(48, 18 + 10 * longest) + 'px');

      const active = visible.find((li) => li.classList.contains('active')) || null;
      count.textContent = String(visible.length);
      // «~»/«`» у Kodik — показываем подпись плитки («Все серии»)
      now.textContent = !active ? '' : /[\p{L}\p{N}]/u.test(active.dataset.ojxText) ? active.dataset.ojxText : active.dataset.ojxLabel;
      // Первый .active в .playlists-lists — выбранный плеер (верхний уровень).
      const player = ajax.querySelector('.playlists-lists li.active');
      note.hidden = !(player && /kodik|alloha/i.test(player.textContent));

      if (active && active !== lastActive) {
        // Kodik/Alloha: серия выбирается в самом плеере — её номер не знаем.
        recentTouch({ path: location.pathname, ep: note.hidden ? now.textContent : '' });
        scrollEpisodeIntoView(active, lastActive && lastActive.isConnected ? 'smooth' : 'auto');
        lastActive = active;
      }
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      setTimeout(run, 0);
    }

    // Только class: наши data-* атрибуты наблюдатель не будят.
    new MutationObserver(schedule).observe(ajax, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    schedule();
  }

  // Смена плеера: сайт всегда включает его первую серию — возвращаем ту же
  // серию, что смотрели, если она у нового плеера есть (в том числе в другом
  // диапазоне «11-20»). Только для настоящих кликов: восстановление выбора
  // при загрузке сайт делает через .trigger('click').
  function keepEpisode(chip) {
    const current = document.querySelector('#ojx .playlists-videos li.visible.active');
    if (!current || current.dataset.ojxText === undefined) return;
    const text = current.dataset.ojxText;
    const chipId = String(chip.dataset.id);
    setTimeout(() => {
      const ajax = document.querySelector('#ojx .playlists-ajax');
      const all = ajax ? [...ajax.querySelectorAll('.playlists-videos li')] : [];
      // Сначала среди серий выбранного плеера (все его диапазоны): иначе
      // при смене озвучки нашлась бы та же серия у другого плеера, а сайт
      // уже включил первый.
      let target = shownEpisodes(ajax, all).find((li) => li.dataset.ojxText === text);
      if (target && !target.classList.contains('visible')) {
        const range = document.querySelector('#ojx .playlists-lists li[data-id="' + cssEscape(target.dataset.id) + '"]');
        if (range) range.click();
        else target = null;
      }
      if (!target) {
        const other = [...document.querySelectorAll('#ojx .playlists-videos li')].find(
          (li) => li.dataset.ojxText === text && String(li.dataset.id).startsWith(chipId + '_')
        );
        const range = other && document.querySelector('#ojx .playlists-lists li[data-id="' + cssEscape(other.dataset.id) + '"]');
        if (range) {
          range.click();
          target = other;
        }
      }
      if (target && !target.classList.contains('active')) target.click();
    }, 0);
  }

  function cssEscape(value) {
    return window.CSS && window.CSS.escape ? window.CSS.escape(value) : String(value).replace(/"/g, '\\"');
  }

  // После выбора серии мышью плеер целиком в кадр (если он ушёл за край).
  // Ctrl+←/→ из ajsubs-episode-nav — синтетический click, его не трогаем.
  function revealPlayer() {
    const frame = document.querySelector('#ojx .playlists-iframe');
    if (!frame || frame.style.position === 'fixed') return;
    const r = frame.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    window.scrollBy({ top: r.top - 12, behavior: 'smooth' });
  }

  function installClickHelpers() {
    // capture на document — раньше делегированного обработчика сайта на body
    document.addEventListener(
      'click',
      (e) => {
        if (!e.isTrusted || !(e.target instanceof Element)) return;
        const chip = e.target.closest('#ojx .playlists-lists li');
        if (chip) {
          keepEpisode(chip);
          return;
        }
        const episode = e.target.closest('#ojx .playlists-videos li');
        // клик по отметке «просмотрено» (span внутри) сайт серией не считает
        if (episode && e.target === episode) {
          // Серия из другого диапазона (в сетке все диапазоны плеера):
          // сначала диапазон — сайт покажет его серии и запомнит выбор, —
          // а этот же клик дальше дойдёт до обработчика сайта на body.
          if (!episode.classList.contains('visible')) {
            const range = document.querySelector('#ojx .playlists-lists li[data-id="' + cssEscape(episode.dataset.id) + '"]');
            if (range) range.click();
          }
          setTimeout(revealPlayer, 0);
        }
      },
      true
    );
  }

  // ==================== Запуск ====================
  //
  // Страницу сайта прячем сразу (document-start), чтобы она не мелькала до
  // сборки интерфейса; если это не страница тайтла, start() всё вернёт.
  // Стоит в самом конце: start() может выполниться синхронно (документ уже
  // загружен — Tampermonkey иногда запускает скрипт поздно), и все let/const
  // выше к этому моменту должны быть инициализированы.
  const root = document.documentElement;
  root.classList.add('ojx');
  const styleNode = el('style', { id: 'ojx-style' });
  styleNode.textContent = STYLES;
  (document.head || root).append(styleNode);
  onReady(start);
})();
