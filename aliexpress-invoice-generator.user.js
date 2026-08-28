// ==UserScript==
// @name         AliExpress Faktura PL Generator
// @namespace    local
// @version      1.0.1
// @description  Generuje fakturę PDF (PL) na podstawie zamówienia AliExpress — bez osobnego rozszerzenia
// @author       khanermi
// @match        *://*.aliexpress.com/p/order/detail*
// @match        *://aliexpress.com/p/order/detail*
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.3.3/pdfmake.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.3.3/vfs_fonts.js
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/aliexpress-invoice-generator.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/aliexpress-invoice-generator.user.js
// ==/UserScript==

(function () {
  "use strict";

  const BUYER_CONFIG_KEY = "ig_buyer_config";

  const ALIEXPRESS_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="57.573334mm" height="13.387917mm" viewBox="0 0 57.573334 13.387917"><style type="text/css">.st0{fill:#E43225;} .st1{fill:#F7971D;}</style><g transform="translate(-76.290715,-142.89532)"><g transform="matrix(0.26458333,0,0,0.26458333,38.931549,83.337617)"><g><path class="st0" d="m 195.5,262.8 v -33.5 h 19.8 v 4.2 h -15.7 v 10.3 h 14.1 v 4.2 h -14.1 v 10.5 h 16.8 v 4.2 h -20.9 z"/><path class="st0" d="m 237.2,262.8 -6.8,-8.9 -6.8,8.9 h -4.8 l 9.3,-11.9 -9.8,-12.3 h 5.4 l 6.7,9.2 6.8,-9.2 h 5.3 l -9.3,12.3 8.8,11.9 z"/><path class="st0" d="m 248.6,259.2 v 16.5 h -4.1 V 251 c 0,-6.3 4.8,-13 12.3,-13 7.6,0 13.3,4.8 13.3,12.7 0,7.7 -5.8,13 -12.4,13 -3.2,0 -7.5,-1.4 -9.1,-4.5 z m 17.2,-8.5 c 0,-5.4 -3.5,-8.6 -9.7,-8.3 -3,0.1 -7.6,2.3 -7.2,10 0.1,2.5 2.7,7.2 8.4,7.2 4.9,0 8.5,-2.8 8.5,-8.9 z"/><path class="st0" d="m 273.6,262.8 v -24.2 h 4.1 v 2.6 c 2,-2.3 5.1,-3.1 8.4,-3.1 v 4.4 c -0.5,-0.1 -5.4,-0.7 -8.4,5.7 v 14.7 h -4.1 z"/><path class="st0" d="m 287.2,250.7 c 0,-7 5,-12.7 11.9,-12.7 8.6,0 11.8,5.7 11.8,13 v 2 h -19.2 c 0.3,4.6 4.4,7 8.2,6.9 2.8,-0.1 4.7,-0.9 6.7,-2.9 l 2.7,2.8 c -2.5,2.4 -5.7,4 -9.6,4 -7.3,-0.1 -12.5,-5.5 -12.5,-13.1 z m 11.6,-8.6 c -3.9,0 -6.9,3.4 -7.1,7.1 h 14.9 c 0,-3.6 -2.6,-7.1 -7.8,-7.1 z"/><path class="st0" d="m 313,259.4 c 0,0 3,-2.7 3,-2.7 -0.1,0 1.5,1.6 1.7,1.7 0.7,0.6 1.4,1 2.3,1.2 2.6,0.7 7.3,0.5 7.7,-3.1 0.2,-2 -1.3,-3.1 -3,-3.8 -2.2,-0.8 -4.6,-1.1 -6.8,-2.1 -2.5,-1.1 -4.1,-3 -4.1,-5.8 0,-7.3 10.4,-8.5 15.1,-5.1 0.2,0.2 2.5,2.3 2.4,2.3 l -3,2.4 c -1.5,-1.8 -2.9,-2.7 -6.1,-2.7 -1.6,0 -3.8,0.7 -4.2,2.4 -0.6,2.4 2.1,3.3 3.9,3.8 2.4,0.6 5,1 7.1,2.3 2.9,1.8 3.6,5.7 2.5,8.7 -1.2,3.3 -4.8,4.6 -8,4.7 -3.8,0.2 -7.1,-1 -9.8,-3.7 -0.2,0 -0.7,-0.5 -0.7,-0.5 z"/><path class="st0" d="m 334.1,259.4 c 0,0 3,-2.7 3,-2.7 -0.1,0 1.5,1.6 1.7,1.7 0.7,0.6 1.4,1 2.3,1.2 2.6,0.7 7.3,0.5 7.7,-3.1 0.2,-2 -1.3,-3.1 -3,-3.8 -2.2,-0.8 -4.6,-1.1 -6.8,-2.1 -2.5,-1.1 -4.1,-3 -4.1,-5.8 0,-7.3 10.4,-8.5 15.1,-5.1 0.2,0.2 2.5,2.3 2.4,2.3 l -3,2.4 c -1.5,-1.8 -2.9,-2.7 -6.1,-2.7 -1.6,0 -3.8,0.7 -4.2,2.4 -0.6,2.4 2.1,3.3 3.9,3.8 2.4,0.6 5,1 7.1,2.3 2.9,1.8 3.6,5.7 2.5,8.7 -1.2,3.3 -4.8,4.6 -8,4.7 -3.8,0.2 -7.1,-1 -9.8,-3.7 -0.2,0 -0.7,-0.5 -0.7,-0.5 z"/><g><path class="st0" d="M 353.6,238.6 V 236 h -0.9 v -0.5 h 2.4 v 0.5 h -0.9 v 2.6 z"/><path class="st0" d="m 358.1,238.6 v -2.4 l -0.9,2.4 H 357 l -0.9,-2.4 v 2.4 h -0.5 v -3.1 h 0.8 l 0.8,2.1 0.8,-2.1 h 0.8 v 3.1 z"/></g></g><g><path class="st1" d="m 167.7,262.8 -3,-8 h -16.2 l -3,8 h -4.3 l 13,-33.5 h 4.7 l 12.9,33.5 z m -11.3,-28.7 -6.1,16.6 H 163 Z"/><path class="st1" d="m 174.5,262.8 v -33.5 h 4.2 v 33.5 z"/><path class="st1" d="m 185,262.8 v -23.7 h 4.2 v 23.7 z"/><path class="st1" d="m 193.2,231.4 c 0,-0.1 0,-0.1 0,-0.2 0,-0.1 0,-0.1 0,-0.2 -3.2,-0.1 -5.8,-2.7 -5.9,-5.9 -0.1,0 -0.2,0 -0.3,0 -0.1,0 -0.2,0 -0.3,0 -0.1,3.2 -2.7,5.8 -5.9,5.9 0,0.1 0,0.1 0,0.2 0,0.1 0,0.1 0,0.2 3.2,0.1 5.8,2.7 5.9,5.9 0.1,0 0.2,0 0.3,0 0.1,0 0.2,0 0.3,0 0.1,-3.2 2.7,-5.8 5.9,-5.9 z"/></g></g></g></svg>`;

  // ---------------------------------------------------------------------
  // 1. СТИЛИ (всё скопировано под #ig-backdrop, чтобы не течь на страницу)
  // ---------------------------------------------------------------------
  GM_addStyle(`
    #ig-backdrop, #ig-ai-backdrop, #ig-settings-backdrop {
      display: flex; align-items: flex-start; justify-content: center;
      position: fixed; inset: 0; z-index: 999999;
      background: rgba(0,0,0,0.5); overflow-y: auto; padding: 30px 15px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    #ig-ai-backdrop, #ig-settings-backdrop { z-index: 1000000; align-items: center; }
    #ig-backdrop .ig-box { width: 750px; max-width: 100%; }
    #ig-ai-backdrop .ig-box { width: 520px; max-width: 100%; }
    #ig-settings-backdrop .ig-box { width: 480px; max-width: 100%; }
    #ig-backdrop .ig-container, #ig-ai-backdrop .ig-container, #ig-settings-backdrop .ig-container {
      background: white; padding: 25px; border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25); position: relative; box-sizing: border-box;
    }
    #ig-backdrop h2, #ig-ai-backdrop h3, #ig-settings-backdrop h2 {
      margin-top: 0; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;
    }
    #ig-backdrop *, #ig-ai-backdrop *, #ig-settings-backdrop * { box-sizing: border-box; }
    .ig-close { position: absolute; top: 15px; right: 20px; font-size: 24px; font-weight: bold; color: #aaa; cursor: pointer; }
    .ig-close:hover { color: #000; }
    .ig-header-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px; }
    .ig-form-group label { display: block; font-size: 12px; color: #666; margin-bottom: 5px; }
    .ig-form-group input, .ig-form-group textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; }
    .ig-parties-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .ig-seller-box { display: flex; flex-direction: column; gap: 10px; }
    .ig-seller-box input, .ig-seller-box textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; }
    .ig-seller-box textarea { height: 80px; resize: vertical; }
    .ig-seller-actions { display: flex; gap: 10px; margin-top: 5px; }
    .ig-ai-btn { display: inline-flex; align-items: center; justify-content: center; padding: 8px 12px; background-color: #4285F4; color: white; border: none; cursor: pointer; font-size: 13px; border-radius: 4px; width: 100%; }
    .ig-ai-btn:hover { background-color: #3367d6; }
    .ig-ai-btn svg { width: 16px; height: 16px; margin-right: 8px; }
    .ig-buyer-area { width: 100%; height: 100%; min-height: 180px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; font-family: inherit; }
    .ig-items-section { margin-bottom: 20px; }
    #ig-backdrop table { width: 100%; border-collapse: collapse; font-size: 13px; }
    #ig-backdrop th { text-align: left; padding: 8px; background: #f0f0f0; border-bottom: 2px solid #ddd; }
    #ig-backdrop td { padding: 5px; border-bottom: 1px solid #eee; vertical-align: middle; }
    #ig-backdrop td input { width: 100%; padding: 5px; border: 1px solid transparent; background: transparent; }
    #ig-backdrop td input:focus { border-color: #aaa; background: white; }
    #ig-backdrop td input.ig-qty { text-align: center; width: 40px; }
    #ig-backdrop td input.ig-price { text-align: right; width: 80px; }
    .ig-link-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; color: #666; text-decoration: none; border-radius: 4px; }
    .ig-link-icon:hover { background-color: #eee; color: #000; }
    .ig-link-icon svg { width: 16px; height: 16px; }
    .ig-totals-section { display: flex; justify-content: flex-end; margin-top: 20px; }
    .ig-totals-table { width: 300px; font-size: 14px; }
    .ig-totals-table td { padding: 5px; text-align: right; border-bottom: 1px solid #eee; }
    .ig-totals-table input { text-align: right; width: 100px; border: 1px solid #ddd; border-radius: 4px; padding: 4px; background: #fff; }
    .ig-total-final { font-weight: bold; font-size: 16px; }
    .ig-actions { margin-top: 20px; text-align: right; border-top: 1px solid #eee; padding-top: 20px; }
    #ig-backdrop button, #ig-ai-backdrop button, #ig-settings-backdrop button { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .ig-btn-primary { background: #d32f2f; color: white; }
    .ig-btn-primary:hover { background: #b71c1c; }
    .ig-source-link { display: block; margin-top: 10px; font-size: 11px; color: #999; text-decoration: none; }
    .ig-ai-step { margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px; }
    .ig-ai-step:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .ig-ai-step h4 { margin: 0 0 8px 0; color: #4285F4; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .ig-ai-step p { font-size: 13px; color: #555; margin: 5px 0 10px 0; line-height: 1.4; }
    .ig-prompt-container { position: relative; background: #f4f4f4; border-radius: 4px; border: 1px solid #e0e0e0; }
    .ig-prompt-text { display: block; padding: 12px 40px 12px 12px; font-family: 'Consolas', monospace; font-size: 11px; color: #333; word-break: break-all; }
    .ig-copy-btn { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #757575; padding: 5px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
    .ig-copy-btn:hover { background-color: #e0e0e0; color: #333; }
    .ig-copy-btn svg { width: 18px; height: 18px; }
    .ig-store-btn { display: inline-flex; align-items: center; padding: 8px 16px; background-color: #ff9100; color: white; text-decoration: none; font-size: 13px; border-radius: 4px; margin-top: 5px; font-weight: 500; }
    .ig-store-btn:hover { background-color: #e65100; }
    .ig-store-btn svg { width: 16px; height: 16px; margin-left: 6px; }
    .ig-gemini-link { display: inline-flex; align-items: center; color: #4285F4; font-weight: bold; text-decoration: none; font-size: 13px; }
    .ig-gemini-link:hover { text-decoration: underline; }
    .ig-add-item-row { display: flex; gap: 8px; margin: 12px 0 8px 0; align-items: center; }
    .ig-add-item-row input[type="text"] { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
    .ig-add-item-row input.ig-qty { width: 70px; padding: 8px; }
    .ig-add-item-row input.ig-price { width: 100px; padding: 8px; }
    .ig-btn-add { background: #2e7d32; color: #fff; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
    .ig-btn-add:hover { background: #1b5e20; }
    .ig-json-input { width: 100%; height: 100px; font-family: 'Consolas', monospace; font-size: 12px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px; background-color: #fafafa; }
    .ig-modal-actions { text-align: right; margin-top: 15px; }
    .ig-btn-apply { background-color: #2e7d32; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; }
    .ig-btn-apply:hover { background-color: #1b5e20; }
    .ig-btn-save { background: #2E7D32; color: white; border: none; padding: 12px 24px; font-size: 15px; cursor: pointer; }
    .ig-btn-save:hover { background: #1B5E20; }
    #ig-settings-backdrop textarea { width: 100%; margin-bottom: 10px; padding: 8px; border: 1px solid #ccc; }
    #my-faktura-btn { margin-left: 10px; background-color: #2e7d32; color: white; border-color: #2e7d32; }
  `);

  // ---------------------------------------------------------------------
  // 2. ПАРСИНГ СТРАНИЦЫ ЗАКАЗА (без изменений в логике)
  // ---------------------------------------------------------------------
  function scrapeLineItems() {
    const items = [];
    const itemContainers = document.querySelectorAll(".order-detail-item-content");

    itemContainers.forEach((container) => {
      try {
        const titleLink = container.querySelector(".item-title a");
        const titleEl = titleLink || container.querySelector(".item-title");

        const description = titleEl ? titleEl.innerText.trim() : "Towar AliExpress";
        const productUrl = titleLink ? titleLink.href : null;

        const priceEl = container.querySelector(".es--wrap--1Hlfkoj") || container.querySelector(".item-price");
        let rawPrice = "0";
        if (priceEl) {
          rawPrice = priceEl.innerText.replace(/[^\d.,]/g, "").replace(",", ".");
        }
        const grossUnitPrice = parseFloat(rawPrice) || 0;

        const qtyEl = container.querySelector(".item-price-quantity");
        let quantity = 1;
        if (qtyEl) {
          const qtyText = qtyEl.innerText.toLowerCase().replace("x", "").trim();
          quantity = parseInt(qtyText) || 1;
        }

        items.push({
          description,
          productUrl,
          quantity,
          grossUnitPrice,
          vatRate: 0,
          totalGrossPrice: grossUnitPrice * quantity,
        });
      } catch (e) {
        console.error("[IG] Błąd parsowania towaru:", e);
      }
    });

    return items;
  }

  function getSalesDateFromHTML() {
    try {
      const dateLabel = document.querySelector('[data-pl="order_detail_gray_date"]');
      if (!dateLabel) return null;

      const fullText = dateLabel.parentElement.textContent.trim();
      const monthsPL = {
        sty: "01", lut: "02", mar: "03", kwi: "04", maj: "05", cze: "06",
        lip: "07", sie: "08", wrz: "09", paź: "10", lis: "11", gru: "12",
      };

      const match = fullText.match(/(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})/i);
      if (match) {
        const day = match[1].padStart(2, "0");
        const monthStr = match[2].toLowerCase();
        const year = match[3];
        const month = monthsPL[monthStr];
        if (day && month && year) return `${year}-${month}-${day}`;
      }
    } catch (e) {
      console.error("[IG] Błąd daty:", e);
    }
    return null;
  }

  function getSellerInfo() {
    const storeEl = document.querySelector(".order-detail-item-store");
    let name = "AliExpress Seller";
    let url = "";

    if (storeEl) {
      const linkEl = storeEl.querySelector("a");
      if (linkEl) {
        url = linkEl.getAttribute("href");
        if (url && url.startsWith("//")) url = "https:" + url;
      }
    }
    return { name, url };
  }

  function parseVatFromDom() {
    try {
      const hintContents = document.querySelectorAll(".popover-hint-content, .comet-popover-content");
      for (const container of hintContents) {
        const text = container.textContent || "";
        if (text.includes("Podatek VAT")) {
          const match = text.match(/Podatek VAT:\s*([\d,.\s]+)/);
          if (match) {
            const cleanPrice = match[1].replace(/[^\d.,]/g, "").replace(",", ".");
            return parseFloat(cleanPrice) || 0;
          }
        }
      }
    } catch (e) {
      console.error("[IG]", e);
    }
    return 0;
  }

  async function getVatAmountAsync() {
    let vatVal = parseVatFromDom();
    if (vatVal > 0) return vatVal;

    const allSpans = Array.from(document.querySelectorAll("span"));
    const vatLabel = allSpans.find((s) => s.textContent && s.textContent.includes("Wliczono podatek VAT"));

    if (vatLabel) {
      let icon = vatLabel.querySelector(".comet-icon-help");
      if (!icon) icon = vatLabel.nextElementSibling?.querySelector(".comet-icon-help") || vatLabel.nextElementSibling;

      if (icon) {
        icon.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
        icon.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));

        await new Promise((resolve) => setTimeout(resolve, 500));

        vatVal = parseVatFromDom();

        icon.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      }
    }
    return vatVal || 0;
  }

  async function scrapeData() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get("orderId") || "---";

    let totalOrderPrice = "0";
    try {
      const targetPriceEls = document.querySelectorAll(".rightPriceClass");
      if (targetPriceEls.length > 0) {
        totalOrderPrice = targetPriceEls[targetPriceEls.length - 1].innerText;
      } else {
        const fallbackEls = document.querySelectorAll(".order-price-bold");
        if (fallbackEls.length > 0) totalOrderPrice = fallbackEls[fallbackEls.length - 1].innerText;
      }
    } catch (e) {
      console.error("[IG]", e);
    }

    const parsedDate = getSalesDateFromHTML();
    const sellerInfo = getSellerInfo();
    const parsedVat = await getVatAmountAsync();

    return {
      orderId,
      saleDate: parsedDate || new Date().toISOString().slice(0, 10),
      seller: { name: sellerInfo.name, storeUrl: sellerInfo.url },
      lineItems: scrapeLineItems(),
      parsedTotalStr: totalOrderPrice,
      totalVat: parsedVat,
      url: window.location.href,
    };
  }

  // ---------------------------------------------------------------------
  // 3. КНОПКА НА СТРАНИЦЕ ЗАКАЗА
  // ---------------------------------------------------------------------
  function injectButton() {
    const targetContainer = document.querySelector(".order-status.order-block");
    if (!targetContainer || document.getElementById("my-faktura-btn")) return;

    const btn = document.createElement("button");
    btn.id = "my-faktura-btn";
    btn.type = "button";
    btn.className = "comet-btn";

    const span = document.createElement("span");
    span.innerText = "Faktura (PDF)";
    btn.appendChild(span);

    btn.onclick = async () => {
      const originalText = span.innerText;
      span.innerText = "Pobieranie...";
      btn.disabled = true;

      try {
        const data = await scrapeData();
        openGenerator(data);
      } catch (e) {
        console.error("[IG] Błąd przy zbieraniu danych:", e);
        span.innerText = "Błąd!";
        setTimeout(() => {
          span.innerText = originalText;
          btn.disabled = false;
        }, 2000);
        return;
      }
      span.innerText = originalText;
      btn.disabled = false;
    };

    targetContainer.appendChild(btn);
  }

  const observer = new MutationObserver(() => injectButton());
  observer.observe(document.body, { childList: true, subtree: true });
  injectButton();

  // ---------------------------------------------------------------------
  // 4. ОБЩИЙ ХЕЛПЕР ДЛЯ МОДАЛОК
  // ---------------------------------------------------------------------
  function openModal(backdropId, innerHtml) {
    closeModal(backdropId);
    const backdrop = document.createElement("div");
    backdrop.id = backdropId;
    backdrop.innerHTML = `<div class="ig-box"><div class="ig-container">${innerHtml}</div></div>`;
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdropId);
    });

    const closeEl = backdrop.querySelector(".ig-close");
    if (closeEl) closeEl.addEventListener("click", () => closeModal(backdropId));

    return backdrop;
  }

  function closeModal(backdropId) {
    const el = document.getElementById(backdropId);
    if (el) el.remove();
  }

  // ---------------------------------------------------------------------
  // 5. ГЕНЕРАТОР ФАКТУРЫ (модалка вместо отдельной страницы)
  // ---------------------------------------------------------------------
  function openGenerator(parsedData) {
    const buyerConfig = GM_getValue(BUYER_CONFIG_KEY, { name: "", taxId: "", addressFull: "" });

    let calculatedItems = (parsedData.lineItems || []).map((item) => ({
      ...item,
      productUrl: item.productUrl || null,
      totalGross: item.grossUnitPrice * item.quantity,
    }));

    const itemsSum = calculatedItems.reduce((acc, item) => acc + item.totalGross, 0);
    const totalOrderPrice =
      parseFloat((parsedData.parsedTotalStr || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || 0;

    const difference = totalOrderPrice - itemsSum;
    if (Math.abs(difference) > 0.01) {
      const desc = difference > 0 ? "Koszt dostawy (Shipping)" : "Rabat / Kupon (Discount)";
      calculatedItems.push({
        description: desc,
        productUrl: null,
        quantity: 1,
        grossUnitPrice: difference,
        totalGross: difference,
      });
    }

    const initialDate = parsedData.saleDate || new Date().toISOString().slice(0, 10);
    const sellerName = parsedData.seller?.name || "AliExpress Seller";
    const sellerUrl = parsedData.seller?.storeUrl || "";
    const sellerAddress = "";
    const sellerTaxId = "";
    const initialSellerRaw = `${sellerName}\nVAT ID: ${sellerTaxId}\n${sellerAddress}`;

    const data = {
      invoiceHeader: {
        invoiceNumber: parsedData.orderId ? `FV-${parsedData.orderId}` : `FV-${Date.now()}`,
        orderId: parsedData.orderId || "---",
        issueDate: initialDate,
        saleDate: initialDate,
      },
      seller: {
        name: sellerName,
        taxId: sellerTaxId,
        addressFull: sellerAddress,
        storeUrl: sellerUrl,
        rawText: initialSellerRaw,
      },
      buyer: {
        ...buyerConfig,
        rawText: `${buyerConfig.name}\nNIP: ${buyerConfig.taxId}\n${buyerConfig.addressFull}`,
      },
      lineItems: calculatedItems,
      totalVatAmount: parsedData.totalVat || 0,
      sourceUrl: parsedData.url,
    };

    const html = `
      <span class="ig-close">&times;</span>
      <h2>Edytor Faktury</h2>

      <div class="ig-header-grid">
        <div class="ig-form-group"><label>Numer faktury</label><input type="text" id="ig-invoiceNumber"></div>
        <div class="ig-form-group"><label>Data wystawienia</label><input type="date" id="ig-issueDate"></div>
        <div class="ig-form-group"><label>Data sprzedaży</label><input type="date" id="ig-saleDate"></div>
        <div class="ig-form-group"><label>ID Zamówienia</label><input type="text" id="ig-orderId"></div>
      </div>

      <div class="ig-parties-grid">
        <div class="ig-form-group">
          <label>Sprzedawca (Seller)</label>
          <div class="ig-seller-box">
            <input type="text" id="ig-sellerName" placeholder="Nazwa sklepu (Sold by)">
            <input type="text" id="ig-sellerTaxId" placeholder="VAT ID / NIP (np. CZ123...)">
            <textarea id="ig-sellerAddress" placeholder="Pełny adres (ulica, miasto, kraj)"></textarea>
            <div class="ig-seller-actions">
              <button id="ig-openAiModalBtn" class="ig-ai-btn" type="button">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 10.5V8h-2.5v2.5H19zM19 13v2.5h-2.5V13H19zM13 10.5V8h-2.5v2.5H13zM13 13v2.5h-2.5V13H13zM7 13v2.5H4.5V13H7zM7 10.5V8H4.5v2.5H7zM21 5c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H3c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2h18zM3 17h18V7H3v10z"/></svg>
                Uzupełnij dane sprzedawcy (AI)
              </button>
            </div>
          </div>
        </div>
        <div class="ig-form-group">
          <label>Nabywca (Buyer)</label>
          <textarea id="ig-buyerData" class="ig-buyer-area"></textarea>
        </div>
      </div>

      <div class="ig-items-section">
        <label style="font-size:12px; color:#666;">Pozycje na fakturze:</label>
        <div class="ig-add-item-row">
          <input type="text" id="ig-newItemDescription" placeholder="Nazwa towaru / usługi" />
          <input type="number" id="ig-newItemQty" class="ig-qty" value="1" min="0" />
          <input type="number" id="ig-newItemPrice" class="ig-price" step="0.01" value="0.00" />
          <button id="ig-addItemBtn" class="ig-btn-add" type="button">Dodaj pozycję</button>
        </div>
        <table id="ig-itemsTable">
          <thead>
            <tr>
              <th style="width: 30px;"></th>
              <th style="width: 50%">Nazwa towaru / usługi</th>
              <th style="width: 10%; text-align: center;">Il.</th>
              <th style="width: 20%; text-align: right;">Cena Brutto</th>
              <th style="width: 20%; text-align: right;">Wartość Brutto</th>
            </tr>
          </thead>
          <tbody id="ig-itemsList"></tbody>
        </table>

        <div class="ig-totals-section">
          <table class="ig-totals-table">
            <tr><td>Suma Netto:</td><td><span id="ig-displayNet">0.00</span> PLN</td></tr>
            <tr><td>Kwota VAT:</td><td><input type="number" id="ig-inputVat" step="0.01"> PLN</td></tr>
            <tr class="ig-total-final"><td>RAZEM (Brutto):</td><td><span id="ig-displayGross">0.00</span> PLN</td></tr>
          </table>
        </div>
      </div>

      <div class="ig-actions">
        <button id="ig-generatePdfBtn" class="ig-btn-primary" type="button">Pobierz PDF</button>
      </div>

      <input type="hidden" id="ig-sourceUrl">
      <a href="#" id="ig-sourceLinkVisible" class="ig-source-link" target="_blank" rel="noopener"></a>
    `;

    const backdrop = openModal("ig-backdrop", html);
    const root = backdrop;
    initGeneratorUI(root, data);
  }

  function initGeneratorUI(root, data) {
    const qs = (id) => root.querySelector("#" + id);

    function bindInput(id, initialValue, updateCallback) {
      const el = qs(id);
      if (el) {
        el.value = initialValue;
        el.addEventListener("input", (e) => updateCallback(e.target.value));
      }
    }

    bindInput("ig-invoiceNumber", data.invoiceHeader.invoiceNumber, (val) => (data.invoiceHeader.invoiceNumber = val));
    bindInput("ig-issueDate", data.invoiceHeader.issueDate, (val) => (data.invoiceHeader.issueDate = val));
    bindInput("ig-saleDate", data.invoiceHeader.saleDate, (val) => (data.invoiceHeader.saleDate = val));
    bindInput("ig-orderId", data.invoiceHeader.orderId, (val) => (data.invoiceHeader.orderId = val));

    function updateSellerRawText() {
      const s = data.seller;
      const taxLine = s.taxId ? `VAT ID: ${s.taxId}` : "";
      s.rawText = [s.name, taxLine, s.addressFull].filter(Boolean).join("\n");
    }

    bindInput("ig-sellerName", data.seller.name, (val) => { data.seller.name = val; updateSellerRawText(); });
    bindInput("ig-sellerTaxId", data.seller.taxId, (val) => { data.seller.taxId = val; updateSellerRawText(); });
    bindInput("ig-sellerAddress", data.seller.addressFull, (val) => { data.seller.addressFull = val; updateSellerRawText(); });

    bindInput("ig-buyerData", data.buyer.rawText, (val) => (data.buyer.rawText = val));

    qs("ig-sourceUrl").value = data.sourceUrl;
    const linkEl = qs("ig-sourceLinkVisible");
    linkEl.href = data.sourceUrl;
    linkEl.innerText = `Źródło zamówienia: ${data.sourceUrl.substring(0, 40)}...`;

    const inputVat = qs("ig-inputVat");
    inputVat.value = data.totalVatAmount.toFixed(2);
    inputVat.addEventListener("input", (e) => {
      data.totalVatAmount = parseFloat(e.target.value) || 0;
      updateTotalDisplay();
    });

    function renderItemsTable() {
      const tbody = qs("ig-itemsList");
      tbody.innerHTML = "";

      data.lineItems.forEach((item) => {
        const tr = document.createElement("tr");

        const tdLink = document.createElement("td");
        tdLink.style.textAlign = "center";
        if (item.productUrl) {
          const a = document.createElement("a");
          a.href = item.productUrl;
          a.target = "_blank";
          a.rel = "noopener";
          a.className = "ig-link-icon";
          a.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
          tdLink.appendChild(a);
        }
        tr.appendChild(tdLink);

        const tdName = document.createElement("td");
        const inputName = document.createElement("input");
        inputName.value = item.description;
        inputName.oninput = (e) => { item.description = e.target.value; };
        tdName.appendChild(inputName);
        tr.appendChild(tdName);

        const tdQty = document.createElement("td");
        const inputQty = document.createElement("input");
        inputQty.type = "number";
        inputQty.className = "ig-qty";
        inputQty.value = item.quantity;
        inputQty.oninput = (e) => { item.quantity = parseFloat(e.target.value) || 0; recalculateRow(item); };
        tdQty.appendChild(inputQty);
        tr.appendChild(tdQty);

        const tdPrice = document.createElement("td");
        const inputPrice = document.createElement("input");
        inputPrice.type = "number";
        inputPrice.className = "ig-price";
        inputPrice.step = "0.01";
        inputPrice.value = item.grossUnitPrice.toFixed(2);
        inputPrice.oninput = (e) => { item.grossUnitPrice = parseFloat(e.target.value) || 0; recalculateRow(item); };
        tdPrice.appendChild(inputPrice);
        tr.appendChild(tdPrice);

        const tdTotal = document.createElement("td");
        const inputTotal = document.createElement("input");
        inputTotal.className = "ig-price";
        inputTotal.disabled = true;
        inputTotal.value = item.totalGross.toFixed(2);
        item._domTotal = inputTotal;
        tdTotal.appendChild(inputTotal);
        tr.appendChild(tdTotal);

        tbody.appendChild(tr);
      });
    }

    function recalculateRow(item) {
      item.totalGross = item.quantity * item.grossUnitPrice;
      if (item._domTotal) item._domTotal.value = item.totalGross.toFixed(2);
      updateTotalDisplay();
    }

    function updateTotalDisplay() {
      const totalGross = data.lineItems.reduce((acc, item) => acc + item.totalGross, 0);
      const vatAmount = data.totalVatAmount;
      const totalNet = totalGross - vatAmount;

      data.totals = { totalNet, totalVat: vatAmount, totalGross };

      qs("ig-displayGross").innerText = totalGross.toFixed(2);
      qs("ig-displayNet").innerText = totalNet.toFixed(2);
    }

    renderItemsTable();
    updateTotalDisplay();

    // --- Добавление позиции ---
    const descEl = qs("ig-newItemDescription");
    const qtyEl = qs("ig-newItemQty");
    const priceEl = qs("ig-newItemPrice");
    const addBtn = qs("ig-addItemBtn");
    addBtn.addEventListener("click", () => {
      const desc = descEl.value ? descEl.value.trim() : "";
      const qty = parseFloat(qtyEl.value || 0) || 0;
      const price = parseFloat(priceEl.value || 0) || 0;
      if (!desc) {
        alert("Proszę podać nazwę pozycji.");
        return;
      }

      data.lineItems.push({
        description: desc,
        productUrl: null,
        quantity: qty,
        grossUnitPrice: price,
        totalGross: qty * price,
      });

      renderItemsTable();
      updateTotalDisplay();

      descEl.value = "";
      qtyEl.value = "1";
      priceEl.value = "0.00";
    });

    // --- AI-модалка для данных продавца ---
    qs("ig-openAiModalBtn").addEventListener("click", () => openAiModal(data, updateSellerRawText, root));

    // --- Генерация PDF ---
    qs("ig-generatePdfBtn").addEventListener("click", () => generatePdf(data));
  }

  function openAiModal(data, updateSellerRawText, generatorRoot) {
    const html = `
      <span class="ig-close">&times;</span>
      <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">Dane sprzedawcy ze zrzutu ekranu</h3>

      <div class="ig-ai-step">
        <h4>1. Otwórz sklep i zrób zrzut ekranu</h4>
        <p>Kliknij poniżej, aby otworzyć profil sklepu. Zrób wycinek (Win+Shift+S) z danymi firmy (Business Information).</p>
        <a href="#" id="ig-sellerStoreLink" target="_blank" rel="noopener" class="ig-store-btn">
          Otwórz profil sklepu
          <svg viewBox="0 0 1024 1024" fill="currentColor"><path d="M318 1024l-64-64 448-448-448-448 64-64 512 512z"/></svg>
        </a>
      </div>

      <div class="ig-ai-step">
        <h4>2. Zapytaj Gemini</h4>
        <p>Otwórz Gemini w nowej karcie, aby przygotować się do wklejenia danych.</p>
        <a href="https://gemini.google.com/app" target="_blank" rel="noopener" class="ig-gemini-link">Otwórz Gemini (gemini.google.com) &rarr;</a>
      </div>

      <div class="ig-ai-step">
        <h4>3. Skopiuj ten Prompt</h4>
        <p>Wklej ten prompt do Gemini razem ze zrzutem ekranu.</p>
        <div class="ig-prompt-container">
          <span id="ig-aiPromptText" class="ig-prompt-text">Extract seller data from this image. Return ONLY raw JSON (no markdown) with these keys: "name" (string), "taxId" (string, e.g. VAT/NIP), "address" (string, full address). If value is missing, use empty string.</span>
          <button class="ig-copy-btn" id="ig-copyPromptBtn" type="button" title="Skopiuj do schowka">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>

      <div class="ig-ai-step">
        <h4>4. Wklej wynik (JSON)</h4>
        <textarea id="ig-aiJsonInput" class="ig-json-input" placeholder='{"name": "...", "taxId": "...", "address": "..."}'></textarea>
        <div class="ig-modal-actions">
          <button id="ig-applyAiDataBtn" class="ig-btn-apply" type="button">Wypełnij formularz</button>
        </div>
      </div>
    `;

    const backdrop = openModal("ig-ai-backdrop", html);
    const qs = (id) => backdrop.querySelector("#" + id);

    const storeBtn = qs("ig-sellerStoreLink");
    if (data.seller.storeUrl) {
      storeBtn.href = data.seller.storeUrl;
    } else {
      storeBtn.style.display = "none";
    }

    qs("ig-copyPromptBtn").addEventListener("click", () => {
      const promptText = qs("ig-aiPromptText").innerText;
      try {
        GM_setClipboard(promptText);
      } catch (e) {
        navigator.clipboard?.writeText(promptText);
      }
      const btn = qs("ig-copyPromptBtn");
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
    });

    qs("ig-applyAiDataBtn").addEventListener("click", () => {
      const rawJson = qs("ig-aiJsonInput").value.trim();
      if (!rawJson) return;

      try {
        const cleanJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanJson);

        if (parsed.name) data.seller.name = parsed.name;
        if (parsed.taxId) data.seller.taxId = parsed.taxId;
        if (parsed.address) data.seller.addressFull = parsed.address;

        const gRoot = generatorRoot;
        gRoot.querySelector("#ig-sellerName").value = data.seller.name;
        gRoot.querySelector("#ig-sellerTaxId").value = data.seller.taxId;
        gRoot.querySelector("#ig-sellerAddress").value = data.seller.addressFull;

        updateSellerRawText();
        closeModal("ig-ai-backdrop");
      } catch (e) {
        console.error(e);
        alert("Błąd parsowania JSON! Sprawdź czy skopiowałeś poprawny format z Gemini.");
      }
    });
  }

  // ---------------------------------------------------------------------
  // 6. ГЕНЕРАЦИЯ PDF (pdfMake / vfs_fonts подключены через @require)
  // ---------------------------------------------------------------------
  function generatePdf(data) {
    const discountWords = ["coupon", "kupon", "rabat"];
    const isDiscountItem = (item) => {
      const desc = (item && item.description) || "";
      return discountWords.some((w) => desc.toLowerCase().includes(w));
    };
    const orderedItems = (data.lineItems || [])
      .slice()
      .filter((i) => !isDiscountItem(i))
      .concat((data.lineItems || []).slice().filter((i) => isDiscountItem(i)));

    const tableBody = [
      [
        { text: "Nazwa towaru / usługi", style: "tableHeader" },
        { text: "Il.", style: "tableHeader", alignment: "center" },
        { text: "Cena Brutto", style: "tableHeader", alignment: "right" },
        { text: "Wartość Brutto", style: "tableHeader", alignment: "right" },
      ],
    ];

    orderedItems.forEach((item) => {
      tableBody.push([
        { text: item.description, fontSize: 9 },
        { text: item.quantity.toString(), alignment: "center" },
        { text: item.grossUnitPrice.toFixed(2), alignment: "right" },
        { text: item.totalGross.toFixed(2), alignment: "right", bold: true },
      ]);
    });

    const parseAddressBox = (rawText) => {
      const lines = (rawText || "").split("\n");
      const name = lines[0] || "";
      const rest = lines.slice(1).join("\n");
      return { name, rest };
    };
    const sellerInfo = parseAddressBox(data.seller.rawText);
    const buyerInfo = parseAddressBox(data.buyer.rawText);

    const docDefinition = {
      content: [
        {
          columns: [
            { svg: ALIEXPRESS_LOGO_SVG, width: 150, margin: [0, 0, 0, 0] },
            {
              width: "*",
              stack: [
                { text: "FAKTURA", style: "header", alignment: "right" },
                { text: `Nr: ${data.invoiceHeader.invoiceNumber}`, alignment: "right", bold: true },
                { text: `Data wystawienia: ${data.invoiceHeader.issueDate}`, alignment: "right", fontSize: 10 },
                { text: `Data sprzedaży: ${data.invoiceHeader.saleDate}`, alignment: "right", margin: [0, 0, 0, 20], fontSize: 10 },
              ],
            },
          ],
          columnGap: 10,
        },
        {
          columns: [
            { width: "*", text: [{ text: "Sprzedawca:\n", style: "label" }, { text: sellerInfo.name + "\n", bold: true }, sellerInfo.rest] },
            { width: "*", text: [{ text: "Nabywca:\n", style: "label" }, { text: buyerInfo.name + "\n", bold: true }, buyerInfo.rest], alignment: "right" },
          ],
        },
        { text: "\n\n" },
        { table: { headerRows: 1, widths: ["*", "auto", "auto", "auto"], body: tableBody }, layout: "lightHorizontalLines" },
        { text: "\n" },
        {
          columns: [
            { width: "*", text: "" },
            {
              width: "auto",
              table: {
                widths: ["auto", "auto"],
                body: [
                  [{ text: "Suma Netto:", alignment: "right" }, { text: `${data.totals.totalNet.toFixed(2)} PLN`, alignment: "right" }],
                  [{ text: "Kwota VAT:", alignment: "right" }, { text: `${data.totals.totalVat.toFixed(2)} PLN`, alignment: "right" }],
                  [
                    { text: "RAZEM (Brutto):", bold: true, alignment: "right", fillColor: "#f0f0f0" },
                    { text: `${data.totals.totalGross.toFixed(2)} PLN`, bold: true, fontSize: 12, alignment: "right", fillColor: "#f0f0f0" },
                  ],
                ],
              },
              layout: "noBorders",
            },
          ],
        },
        { text: `\nID Zamówienia: ${data.invoiceHeader.orderId}`, fontSize: 9, color: "gray", margin: [0, 20, 0, 0] },
        { text: `Źródło: ${data.sourceUrl}`, fontSize: 8, color: "gray", link: data.sourceUrl },
      ],
      styles: {
        header: { fontSize: 22, bold: true },
        label: { fontSize: 10, color: "gray", italics: true },
        tableHeader: { bold: true, fontSize: 11, fillColor: "#f0f0f0" },
      },
      defaultStyle: { fontSize: 10 },
    };

    try {
      pdfMake.createPdf(docDefinition).download(`Faktura_${data.invoiceHeader.invoiceNumber}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Błąd generowania PDF!");
    }
  }

  // ---------------------------------------------------------------------
  // 7. НАСТРОЙКИ ПОКУПАТЕЛЯ (замена options.html)
  // ---------------------------------------------------------------------
  function openSettings() {
    const cfg = GM_getValue(BUYER_CONFIG_KEY, { name: "", taxId: "", addressFull: "" });

    const html = `
      <span class="ig-close">&times;</span>
      <h2>Dane Nabywcy (Buyer / Twoja Firma)</h2>
      <p>Wprowadź dane swojej firmy. Zostaną one automatycznie wstawione do sekcji "Invoice to".</p>

      <div class="ig-form-group">
        <label for="ig-set-buyerName">Nazwa firmy (Buyer Name):</label>
        <input type="text" id="ig-set-buyerName" placeholder="np. Moja Firma Sp. z o.o.">
      </div>
      <div class="ig-form-group">
        <label for="ig-set-buyerTaxId">NIP / VAT ID (Buyer Tax ID):</label>
        <input type="text" id="ig-set-buyerTaxId" placeholder="np. PL5250001234">
      </div>
      <div class="ig-form-group">
        <label for="ig-set-buyerAddress">Pełny adres (Buyer Address Full):</label>
        <textarea id="ig-set-buyerAddress" rows="4" placeholder="np. ul. Prosta 10&#10;00-001 Warszawa&#10;Polska"></textarea>
      </div>

      <hr>
      <button id="ig-set-saveBtn" class="ig-btn-save" type="button">Zapisz ustawienia</button>
      <p id="ig-set-status" style="color: green; margin-top: 10px; font-weight: bold;"></p>
    `;

    const backdrop = openModal("ig-settings-backdrop", html);
    const qs = (id) => backdrop.querySelector("#" + id);

    qs("ig-set-buyerName").value = cfg.name || "";
    qs("ig-set-buyerTaxId").value = cfg.taxId || "";
    qs("ig-set-buyerAddress").value = cfg.addressFull || "";

    qs("ig-set-saveBtn").addEventListener("click", () => {
      const buyerData = {
        name: qs("ig-set-buyerName").value,
        taxId: qs("ig-set-buyerTaxId").value,
        addressFull: qs("ig-set-buyerAddress").value,
      };
      GM_setValue(BUYER_CONFIG_KEY, buyerData);
      const status = qs("ig-set-status");
      status.innerText = "Zapisano pomyślnie!";
      setTimeout(() => { status.innerText = ""; }, 2000);
    });
  }

  GM_registerMenuCommand("⚙️ Ustawienia nabywcy (Faktura)", openSettings);
})();
