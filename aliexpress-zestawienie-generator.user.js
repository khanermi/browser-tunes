// ==UserScript==
// @name         AliExpress Zestawienie PL Generator
// @namespace    local
// @version      1.1.2
// @description  Generuje zestawienie własne (PDF, PL) na podstawie zamówienia AliExpress — dokument pomocniczy do paragonu/dowodu zapłaty, NIE faktura wystawiona przez sprzedawcę
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
// @updateURL    https://raw.githubusercontent.com/khanermi/browser-tunes/main/aliexpress-zestawienie-generator.user.js
// @downloadURL  https://raw.githubusercontent.com/khanermi/browser-tunes/main/aliexpress-zestawienie-generator.user.js
// ==/UserScript==

(function () {
  "use strict";

  const BUYER_CONFIG_KEY = "zg_buyer_config";

  // ---------------------------------------------------------------------
  // 1. СТИЛИ (всё скопировано под #zg-backdrop, чтобы не течь на страницу)
  // ---------------------------------------------------------------------
  GM_addStyle(`
    #zg-backdrop, #zg-ai-backdrop, #zg-settings-backdrop {
      display: flex; align-items: flex-start; justify-content: center;
      position: fixed; inset: 0; z-index: 999999;
      background: rgba(0,0,0,0.5); overflow-y: auto; padding: 30px 15px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    #zg-ai-backdrop, #zg-settings-backdrop { z-index: 1000000; align-items: center; }
    #zg-backdrop .zg-box { width: 750px; max-width: 100%; }
    #zg-ai-backdrop .zg-box { width: 520px; max-width: 100%; }
    #zg-settings-backdrop .zg-box { width: 480px; max-width: 100%; }
    #zg-backdrop .zg-container, #zg-ai-backdrop .zg-container, #zg-settings-backdrop .zg-container {
      background: white; padding: 25px; border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25); position: relative; box-sizing: border-box;
    }
    #zg-backdrop h2, #zg-ai-backdrop h3, #zg-settings-backdrop h2 {
      margin-top: 0; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;
    }
    #zg-backdrop *, #zg-ai-backdrop *, #zg-settings-backdrop * { box-sizing: border-box; }
    .zg-close { position: absolute; top: 15px; right: 20px; font-size: 24px; font-weight: bold; color: #aaa; cursor: pointer; }
    .zg-close:hover { color: #000; }
    .zg-header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
    .zg-form-group label { display: block; font-size: 12px; color: #666; margin-bottom: 5px; }
    .zg-form-group input, .zg-form-group textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; }
    .zg-parties-block { display: flex; flex-direction: column; gap: 20px; margin-bottom: 20px; }
    .zg-seller-box { display: flex; flex-direction: column; gap: 10px; }
    .zg-seller-box input, .zg-seller-box textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; }
    .zg-seller-box textarea { height: 80px; resize: vertical; }
    .zg-seller-actions { display: flex; gap: 10px; margin-top: 5px; }
    .zg-ai-btn { display: inline-flex; align-items: center; justify-content: center; padding: 8px 12px; background-color: #4285F4; color: white; border: none; cursor: pointer; font-size: 13px; border-radius: 4px; width: 100%; }
    .zg-ai-btn:hover { background-color: #3367d6; }
    .zg-ai-btn svg { width: 16px; height: 16px; margin-right: 8px; }
    .zg-buyer-area { width: 100%; height: 100%; min-height: 120px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; font-family: inherit; }
    .zg-items-section { margin-bottom: 20px; }
    #zg-backdrop table { width: 100%; border-collapse: collapse; font-size: 13px; }
    #zg-backdrop th { text-align: left; padding: 8px; background: #f0f0f0; border-bottom: 2px solid #ddd; }
    #zg-backdrop td { padding: 5px; border-bottom: 1px solid #eee; vertical-align: middle; }
    #zg-backdrop td input { width: 100%; padding: 5px; border: 1px solid transparent; background: transparent; }
    #zg-backdrop td input:focus { border-color: #aaa; background: white; }
    #zg-backdrop td input.zg-qty { text-align: center; width: 40px; }
    #zg-backdrop td input.zg-price { text-align: right; width: 80px; }
    .zg-link-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; color: #666; text-decoration: none; border-radius: 4px; }
    .zg-link-icon:hover { background-color: #eee; color: #000; }
    .zg-link-icon svg { width: 16px; height: 16px; }
    .zg-totals-section { display: flex; justify-content: flex-end; margin-top: 20px; }
    .zg-totals-table { width: 260px; font-size: 14px; }
    .zg-totals-table td { padding: 5px; text-align: right; border-bottom: 1px solid #eee; }
    .zg-total-final { font-weight: bold; font-size: 16px; }
    .zg-actions { margin-top: 20px; text-align: right; border-top: 1px solid #eee; padding-top: 20px; }
    #zg-backdrop button, #zg-ai-backdrop button, #zg-settings-backdrop button { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .zg-btn-primary { background: #d32f2f; color: white; }
    .zg-btn-primary:hover { background: #b71c1c; }
    .zg-source-link { display: block; margin-top: 10px; font-size: 11px; color: #999; text-decoration: none; }
    .zg-ai-step { margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px; }
    .zg-ai-step:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .zg-ai-step h4 { margin: 0 0 8px 0; color: #4285F4; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .zg-ai-step p { font-size: 13px; color: #555; margin: 5px 0 10px 0; line-height: 1.4; }
    .zg-prompt-container { position: relative; background: #f4f4f4; border-radius: 4px; border: 1px solid #e0e0e0; }
    .zg-prompt-text { display: block; padding: 12px 40px 12px 12px; font-family: 'Consolas', monospace; font-size: 11px; color: #333; word-break: break-all; }
    .zg-copy-btn { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #757575; padding: 5px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
    .zg-copy-btn:hover { background-color: #e0e0e0; color: #333; }
    .zg-copy-btn svg { width: 18px; height: 18px; }
    .zg-store-btn { display: inline-flex; align-items: center; padding: 8px 16px; background-color: #ff9100; color: white; text-decoration: none; font-size: 13px; border-radius: 4px; margin-top: 5px; font-weight: 500; }
    .zg-store-btn:hover { background-color: #e65100; }
    .zg-store-btn svg { width: 16px; height: 16px; margin-left: 6px; }
    .zg-gemini-link { display: inline-flex; align-items: center; color: #4285F4; font-weight: bold; text-decoration: none; font-size: 13px; }
    .zg-gemini-link:hover { text-decoration: underline; }
    .zg-add-item-row { display: flex; gap: 8px; margin: 12px 0 8px 0; align-items: center; }
    .zg-add-item-row input[type="text"] { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
    .zg-add-item-row input.zg-qty { width: 70px; padding: 8px; }
    .zg-add-item-row input.zg-price { width: 100px; padding: 8px; }
    .zg-btn-add { background: #2e7d32; color: #fff; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
    .zg-btn-add:hover { background: #1b5e20; }
    .zg-json-input { width: 100%; height: 100px; font-family: 'Consolas', monospace; font-size: 12px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; margin-top: 5px; background-color: #fafafa; }
    .zg-modal-actions { text-align: right; margin-top: 15px; }
    .zg-btn-apply { background-color: #2e7d32; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; }
    .zg-btn-apply:hover { background-color: #1b5e20; }
    .zg-btn-save { background: #2E7D32; color: white; border: none; padding: 12px 24px; font-size: 15px; cursor: pointer; }
    .zg-btn-save:hover { background: #1B5E20; }
    #zg-settings-backdrop textarea { width: 100%; margin-bottom: 10px; padding: 8px; border: 1px solid #ccc; }
    #my-zestawienie-btn { margin-left: 10px; background-color: #2e7d32; color: white; border-color: #2e7d32; }
  `);

  // ---------------------------------------------------------------------
  // 2. ПАРСИНГ СТРАНИЦЫ ЗАКАЗА
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
          totalGrossPrice: grossUnitPrice * quantity,
        });
      } catch (e) {
        console.error("[ZG] Błąd parsowania towaru:", e);
      }
    });

    return items;
  }

  function getOrderDateFromHTML() {
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
      console.error("[ZG] Błąd daty:", e);
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

  function scrapeData() {
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
      console.error("[ZG]", e);
    }

    const parsedDate = getOrderDateFromHTML();
    const sellerInfo = getSellerInfo();

    return {
      orderId,
      orderDate: parsedDate || new Date().toISOString().slice(0, 10),
      seller: { name: sellerInfo.name, storeUrl: sellerInfo.url },
      lineItems: scrapeLineItems(),
      parsedTotalStr: totalOrderPrice,
      url: window.location.href,
    };
  }

  // ---------------------------------------------------------------------
  // 3. КНОПКА НА СТРАНИЦЕ ЗАКАЗА
  // ---------------------------------------------------------------------
  function injectButton() {
    const targetContainer = document.querySelector(".order-status.order-block");
    if (!targetContainer || document.getElementById("my-zestawienie-btn")) return;

    const btn = document.createElement("button");
    btn.id = "my-zestawienie-btn";
    btn.type = "button";
    btn.className = "comet-btn";

    const span = document.createElement("span");
    span.innerText = "Zestawienie (PDF)";
    btn.appendChild(span);

    btn.onclick = () => {
      try {
        const data = scrapeData();
        openGenerator(data);
      } catch (e) {
        console.error("[ZG] Błąd przy zbieraniu danych:", e);
      }
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
    backdrop.innerHTML = `<div class="zg-box"><div class="zg-container">${innerHtml}</div></div>`;
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdropId);
    });

    const closeEl = backdrop.querySelector(".zg-close");
    if (closeEl) closeEl.addEventListener("click", () => closeModal(backdropId));

    return backdrop;
  }

  function closeModal(backdropId) {
    const el = document.getElementById(backdropId);
    if (el) el.remove();
  }

  // ---------------------------------------------------------------------
  // 5. ГЕНЕРАТОР ZESTAWIENIA (модалка вместо отдельной страницы)
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

    const initialDate = parsedData.orderDate || new Date().toISOString().slice(0, 10);
    const sellerName = parsedData.seller?.name || "AliExpress Seller";
    const sellerUrl = parsedData.seller?.storeUrl || "";
    const sellerAddress = "";
    const sellerTaxId = "";
    const initialSellerRaw = `${sellerName}\nVAT ID: ${sellerTaxId}\n${sellerAddress}`;

    const data = {
      header: {
        orderId: parsedData.orderId || "---",
        date: initialDate,
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
      sourceUrl: parsedData.url,
    };

    const html = `
      <span class="zg-close">&times;</span>
      <h2>Edytor Zestawienia</h2>

      <div class="zg-header-grid">
        <div class="zg-form-group"><label>Data zamówienia</label><input type="date" id="zg-orderDate"></div>
        <div class="zg-form-group"><label>Nr zamówienia</label><input type="text" id="zg-orderId"></div>
      </div>

      <div class="zg-parties-block">
        <div class="zg-form-group">
          <label>Sprzedawca (dane orientacyjne z profilu sklepu, nie wystawca dokumentu)</label>
          <div class="zg-seller-box">
            <input type="text" id="zg-sellerName" placeholder="Nazwa sklepu (Sold by)">
            <input type="text" id="zg-sellerTaxId" placeholder="VAT ID / NIP (np. CZ123...)">
            <textarea id="zg-sellerAddress" placeholder="Pełny adres (ulica, miasto, kraj)"></textarea>
            <div class="zg-seller-actions">
              <button id="zg-openAiModalBtn" class="zg-ai-btn" type="button">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 10.5V8h-2.5v2.5H19zM19 13v2.5h-2.5V13H19zM13 10.5V8h-2.5v2.5H13zM13 13v2.5h-2.5V13H13zM7 13v2.5H4.5V13H7zM7 10.5V8H4.5v2.5H7zM21 5c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H3c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2h18zM3 17h18V7H3v10z"/></svg>
                Uzupełnij dane sprzedawcy przez Gemini (ze zrzutu ekranu)
              </button>
            </div>
          </div>
        </div>
        <div class="zg-form-group">
          <label>Nabywca (Twoja firma)</label>
          <textarea id="zg-buyerData" class="zg-buyer-area"></textarea>
        </div>
      </div>

      <div class="zg-items-section">
        <label style="font-size:12px; color:#666;">Pozycje zamówienia:</label>
        <div class="zg-add-item-row">
          <input type="text" id="zg-newItemDescription" placeholder="Nazwa towaru / usługi" />
          <input type="number" id="zg-newItemQty" class="zg-qty" value="1" min="0" />
          <input type="number" id="zg-newItemPrice" class="zg-price" step="0.01" value="0.00" />
          <button id="zg-addItemBtn" class="zg-btn-add" type="button">Dodaj pozycję</button>
        </div>
        <table id="zg-itemsTable">
          <thead>
            <tr>
              <th style="width: 30px;"></th>
              <th style="width: 50%">Nazwa towaru / usługi</th>
              <th style="width: 10%; text-align: center;">Il.</th>
              <th style="width: 20%; text-align: right;">Cena Brutto</th>
              <th style="width: 20%; text-align: right;">Wartość Brutto</th>
            </tr>
          </thead>
          <tbody id="zg-itemsList"></tbody>
        </table>

        <div class="zg-totals-section">
          <table class="zg-totals-table">
            <tr class="zg-total-final"><td>RAZEM (zapłacono):</td><td><span id="zg-displayGross">0.00</span> PLN</td></tr>
          </table>
        </div>
      </div>

      <div class="zg-actions">
        <button id="zg-generatePdfBtn" class="zg-btn-primary" type="button">Pobierz PDF + Paragon</button>
      </div>

      <input type="hidden" id="zg-sourceUrl">
      <a href="#" id="zg-sourceLinkVisible" class="zg-source-link" target="_blank" rel="noopener"></a>
    `;

    const backdrop = openModal("zg-backdrop", html);
    initGeneratorUI(backdrop, data);
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

    bindInput("zg-orderDate", data.header.date, (val) => (data.header.date = val));
    bindInput("zg-orderId", data.header.orderId, (val) => (data.header.orderId = val));

    function updateSellerRawText() {
      const s = data.seller;
      const taxLine = s.taxId ? `VAT ID: ${s.taxId}` : "";
      s.rawText = [s.name, taxLine, s.addressFull].filter(Boolean).join("\n");
    }

    bindInput("zg-sellerName", data.seller.name, (val) => { data.seller.name = val; updateSellerRawText(); });
    bindInput("zg-sellerTaxId", data.seller.taxId, (val) => { data.seller.taxId = val; updateSellerRawText(); });
    bindInput("zg-sellerAddress", data.seller.addressFull, (val) => { data.seller.addressFull = val; updateSellerRawText(); });

    bindInput("zg-buyerData", data.buyer.rawText, (val) => (data.buyer.rawText = val));

    qs("zg-sourceUrl").value = data.sourceUrl;
    const linkEl = qs("zg-sourceLinkVisible");
    linkEl.href = data.sourceUrl;
    linkEl.innerText = `Źródło zamówienia: ${data.sourceUrl.substring(0, 40)}...`;

    function renderItemsTable() {
      const tbody = qs("zg-itemsList");
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
          a.className = "zg-link-icon";
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
        inputQty.className = "zg-qty";
        inputQty.value = item.quantity;
        inputQty.oninput = (e) => { item.quantity = parseFloat(e.target.value) || 0; recalculateRow(item); };
        tdQty.appendChild(inputQty);
        tr.appendChild(tdQty);

        const tdPrice = document.createElement("td");
        const inputPrice = document.createElement("input");
        inputPrice.type = "number";
        inputPrice.className = "zg-price";
        inputPrice.step = "0.01";
        inputPrice.value = item.grossUnitPrice.toFixed(2);
        inputPrice.oninput = (e) => { item.grossUnitPrice = parseFloat(e.target.value) || 0; recalculateRow(item); };
        tdPrice.appendChild(inputPrice);
        tr.appendChild(tdPrice);

        const tdTotal = document.createElement("td");
        const inputTotal = document.createElement("input");
        inputTotal.className = "zg-price";
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
      data.totals = { totalGross };
      qs("zg-displayGross").innerText = totalGross.toFixed(2);
    }

    renderItemsTable();
    updateTotalDisplay();

    // --- Добавление позиции ---
    const descEl = qs("zg-newItemDescription");
    const qtyEl = qs("zg-newItemQty");
    const priceEl = qs("zg-newItemPrice");
    const addBtn = qs("zg-addItemBtn");
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

    // --- AI-модалка для данных продавца (явно Gemini) ---
    qs("zg-openAiModalBtn").addEventListener("click", () => openAiModal(data, updateSellerRawText, root));

    // --- Генерация PDF + oryginalny paragon (dwa pliki, jeden klik) ---
    const generateBtn = qs("zg-generatePdfBtn");
    generateBtn.addEventListener("click", async () => {
      const originalLabel = generateBtn.textContent;
      generateBtn.disabled = true;
      generateBtn.textContent = "Pobieranie...";

      // Zestawienie idzie pierwsze i zaraz po kliknięciu — Chrome blokuje drugie
      // (i kolejne) automatyczne pobieranie z tej samej strony bez zgody użytkownika
      // ("Allow multiple downloads"), więc ważniejszy plik ma iść, zanim to ryzyko
      // w ogóle się pojawi; paragon jako drugi jest tym, który może ewentualnie
      // utknąć za tym promptem.
      generatePdf(data);

      try {
        const receiptDataUri = await capturePLReceiptPng();
        if (receiptDataUri) {
          downloadDataUri(receiptDataUri, `Paragon_${data.header.orderId}.png`);
        }
      } catch (e) {
        console.error("[ZG] Błąd pobierania oryginalnego paragonu:", e);
      }

      generateBtn.textContent = originalLabel;
      generateBtn.disabled = false;
    });
  }

  // ---------------------------------------------------------------------
  // 5b. ZAŁĄCZENIE ORYGINALNEGO PARAGONU (PNG generowany przez sam AliExpress)
  // ---------------------------------------------------------------------
  // "Paragon" renderuje się w osobnym iframe tego samego originu. Kliknięcie jego
  // własnego przycisku "Pobierz" tworzy <a download> z href="data:image/png;...” —
  // czysto po stronie klienta (canvas), bez żadnego zapytania sieciowego. Łapiemy
  // tę samą data-URI, żeby pobrać kopię oryginału obok zestawienia — nic w niej nie
  // zmieniamy, to plik wygenerowany przez samego sprzedawcę/AliExpress.
  function waitFor(conditionFn, timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        let result;
        try {
          result = conditionFn();
        } catch (e) {
          result = null;
        }
        if (result) {
          clearInterval(interval);
          resolve(result);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 150);
    });
  }

  function findNativeButtonByText(text) {
    const container = document.querySelector(".order-status.order-block");
    if (!container) return null;
    const spans = Array.from(container.querySelectorAll("span"));
    const span = spans.find((s) => s.children.length === 0 && s.textContent.trim() === text);
    if (!span) return null;
    return span.closest(".comet-btn") || span;
  }

  function closeParagonModal(iframe) {
    try {
      // Krzyżyk zamykający jest częścią treści samego iframe'u (ten sam origin), nie
      // opakowania modala na stronie głównej.
      const closeEl = iframe.contentDocument?.querySelector('[class*="close" i]');
      if (closeEl) closeEl.click();
    } catch (e) {
      console.error("[ZG] Nie udało się zamknąć modalu Paragon:", e);
    }
  }

  function downloadDataUri(dataUri, filename) {
    const a = document.createElement("a");
    a.href = dataUri;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function capturePLReceiptPng() {
    const paragonBtn = findNativeButtonByText("Paragon");
    if (!paragonBtn) {
      console.error("[ZG] Nie znaleziono przycisku 'Paragon' — pomijam załączanie oryginału.");
      return null;
    }
    paragonBtn.click();

    const iframe = await waitFor(() => document.querySelector("iframe.invoice-iframe-container"), 4000);
    if (!iframe) {
      console.error("[ZG] Iframe paragonu się nie pojawił.");
      return null;
    }

    const downloadBtn = await waitFor(
      () => iframe.contentDocument && iframe.contentDocument.querySelector("#download-receipt"),
      4000
    );
    if (!downloadBtn) {
      console.error("[ZG] Przycisk pobierania wewnątrz paragonu się nie pojawił.");
      return null;
    }

    const win = iframe.contentWindow;
    const originalClick = win.HTMLAnchorElement.prototype.click;
    let capturedHref = null;
    win.HTMLAnchorElement.prototype.click = function () {
      // Świadomie NIE wywołujemy originalClick — bez tego AliExpress zapisze swój
      // własny plik ("OrderSummary...") obok naszego Paragon_{orderId}.png, czyli
      // dokładnie ten sam obrazek pod dwiema nazwami. Skoro i tak pobieramy tę samą
      // data-URI pod własną, przewidywalną nazwą, ich pobranie jest zbędne.
      if (this.href && this.href.startsWith("data:")) capturedHref = this.href;
    };

    downloadBtn.click();

    await waitFor(() => capturedHref !== null, 4000);
    win.HTMLAnchorElement.prototype.click = originalClick;

    closeParagonModal(iframe);

    return capturedHref;
  }

  function openAiModal(data, updateSellerRawText, generatorRoot) {
    const html = `
      <span class="zg-close">&times;</span>
      <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">Dane sprzedawcy ze zrzutu ekranu (Gemini)</h3>

      <div class="zg-ai-step">
        <h4>1. Otwórz licencję sprzedawcy i zrób zrzut ekranu</h4>
        <p>Kliknij poniżej — otworzy się strona z licencją firmy (dane są renderowane jako obrazek, dlatego potrzebny zrzut). AliExpress może poprosić o przesunięcie suwaka ("slide to verify") — zrób to ręcznie, to zwykłe zabezpieczenie strony. Potem zrób wycinek (Win+Shift+S) z danymi firmy.</p>
        <a href="#" id="zg-sellerStoreLink" target="_blank" rel="noopener" class="zg-store-btn">
          Otwórz licencję sprzedawcy
          <svg viewBox="0 0 1024 1024" fill="currentColor"><path d="M318 1024l-64-64 448-448-448-448 64-64 512 512z"/></svg>
        </a>
      </div>

      <div class="zg-ai-step">
        <h4>2. Zapytaj Gemini</h4>
        <p>Otwórz Gemini w nowej karcie, aby przygotować się do wklejenia danych.</p>
        <a href="https://gemini.google.com/app" target="_blank" rel="noopener" class="zg-gemini-link">Otwórz Gemini (gemini.google.com) &rarr;</a>
      </div>

      <div class="zg-ai-step">
        <h4>3. Skopiuj ten Prompt</h4>
        <p>Wklej ten prompt do Gemini razem ze zrzutem ekranu.</p>
        <div class="zg-prompt-container">
          <span id="zg-aiPromptText" class="zg-prompt-text">Extract seller data from this image. Return ONLY raw JSON (no markdown) with these keys: "name" (string), "taxId" (string, e.g. VAT/NIP), "address" (string, full address). If value is missing, use empty string.</span>
          <button class="zg-copy-btn" id="zg-copyPromptBtn" type="button" title="Skopiuj do schowka">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>

      <div class="zg-ai-step">
        <h4>4. Wklej wynik (JSON)</h4>
        <textarea id="zg-aiJsonInput" class="zg-json-input" placeholder='{"name": "...", "taxId": "...", "address": "..."}'></textarea>
        <div class="zg-modal-actions">
          <button id="zg-applyAiDataBtn" class="zg-btn-apply" type="button">Wypełnij formularz</button>
        </div>
      </div>
    `;

    const backdrop = openModal("zg-ai-backdrop", html);
    const qs = (id) => backdrop.querySelector("#" + id);

    const storeBtn = qs("zg-sellerStoreLink");
    if (data.seller.storeUrl) {
      // storeNum for the credential page is the same numeric id AliExpress puts in the
      // seller-store link href (/store/<id>?spm=...) on the order page itself — the spm=
      // part is just tracking noise and can be dropped.
      const storeNumMatch = data.seller.storeUrl.match(/\/store\/(\d+)/);
      storeBtn.href = storeNumMatch
        ? `https://shoprenderview.aliexpress.com/credential/showcredential.htm?storeNum=${storeNumMatch[1]}`
        : data.seller.storeUrl;
    } else {
      storeBtn.style.display = "none";
    }

    qs("zg-copyPromptBtn").addEventListener("click", () => {
      const promptText = qs("zg-aiPromptText").innerText;
      try {
        GM_setClipboard(promptText);
      } catch (e) {
        navigator.clipboard?.writeText(promptText);
      }
      const btn = qs("zg-copyPromptBtn");
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
    });

    qs("zg-applyAiDataBtn").addEventListener("click", () => {
      const rawJson = qs("zg-aiJsonInput").value.trim();
      if (!rawJson) return;

      try {
        const cleanJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanJson);

        if (parsed.name) data.seller.name = parsed.name;
        if (parsed.taxId) data.seller.taxId = parsed.taxId;
        if (parsed.address) data.seller.addressFull = parsed.address;

        const gRoot = generatorRoot;
        gRoot.querySelector("#zg-sellerName").value = data.seller.name;
        gRoot.querySelector("#zg-sellerTaxId").value = data.seller.taxId;
        gRoot.querySelector("#zg-sellerAddress").value = data.seller.addressFull;

        updateSellerRawText();
        closeModal("zg-ai-backdrop");
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
        { text: "ZESTAWIENIE WŁASNE", style: "header" },
        {
          text: "Dokument sporządzony samodzielnie na podstawie danych zamówienia AliExpress — nie jest fakturą wystawioną przez sprzedawcę.",
          style: "disclaimer",
          margin: [0, 2, 0, 15],
        },
        {
          columns: [
            { text: `Nr zamówienia: ${data.header.orderId}`, fontSize: 10 },
            { text: `Data zamówienia: ${data.header.date}`, fontSize: 10, alignment: "right" },
          ],
          margin: [0, 0, 0, 15],
        },
        { text: "Sprzedawca (dane orientacyjne z profilu sklepu):", style: "label" },
        { text: sellerInfo.name, bold: true },
        { text: sellerInfo.rest, margin: [0, 0, 0, 12] },
        { text: "Nabywca:", style: "label" },
        { text: buyerInfo.name, bold: true },
        { text: buyerInfo.rest, margin: [0, 0, 0, 15] },
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
                  [
                    { text: "RAZEM (zapłacono):", bold: true, alignment: "right", fillColor: "#f0f0f0" },
                    { text: `${data.totals.totalGross.toFixed(2)} PLN`, bold: true, fontSize: 12, alignment: "right", fillColor: "#f0f0f0" },
                  ],
                ],
              },
              layout: "noBorders",
            },
          ],
        },
        { text: `\nŹródło: ${data.sourceUrl}`, fontSize: 8, color: "gray", link: data.sourceUrl },
      ],
      styles: {
        header: { fontSize: 20, bold: true },
        disclaimer: { fontSize: 9, italics: true, color: "gray" },
        label: { fontSize: 10, color: "gray", italics: true },
        tableHeader: { bold: true, fontSize: 11, fillColor: "#f0f0f0" },
      },
      defaultStyle: { fontSize: 10 },
    };

    try {
      pdfMake.createPdf(docDefinition).download(`Zestawienie_${data.header.orderId}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Błąd generowania PDF!");
    }
  }

  // ---------------------------------------------------------------------
  // 7. НАСТРОЙКИ ПОКУПАТЕЛЯ
  // ---------------------------------------------------------------------
  function openSettings() {
    const cfg = GM_getValue(BUYER_CONFIG_KEY, { name: "", taxId: "", addressFull: "" });

    const html = `
      <span class="zg-close">&times;</span>
      <h2>Dane Nabywcy (Buyer / Twoja Firma)</h2>
      <p>Wprowadź dane swojej firmy. Zostaną one automatycznie wstawione do sekcji "Nabywca".</p>

      <div class="zg-form-group">
        <label for="zg-set-buyerName">Nazwa firmy (Buyer Name):</label>
        <input type="text" id="zg-set-buyerName" placeholder="np. Moja Firma">
      </div>
      <div class="zg-form-group">
        <label for="zg-set-buyerTaxId">NIP / VAT ID (Buyer Tax ID):</label>
        <input type="text" id="zg-set-buyerTaxId" placeholder="np. PL5250001234">
      </div>
      <div class="zg-form-group">
        <label for="zg-set-buyerAddress">Pełny adres (Buyer Address Full):</label>
        <textarea id="zg-set-buyerAddress" rows="4" placeholder="np. ul. Prosta 10&#10;00-001 Warszawa&#10;Polska"></textarea>
      </div>

      <hr>
      <button id="zg-set-saveBtn" class="zg-btn-save" type="button">Zapisz ustawienia</button>
      <p id="zg-set-status" style="color: green; margin-top: 10px; font-weight: bold;"></p>
    `;

    const backdrop = openModal("zg-settings-backdrop", html);
    const qs = (id) => backdrop.querySelector("#" + id);

    qs("zg-set-buyerName").value = cfg.name || "";
    qs("zg-set-buyerTaxId").value = cfg.taxId || "";
    qs("zg-set-buyerAddress").value = cfg.addressFull || "";

    qs("zg-set-saveBtn").addEventListener("click", () => {
      const buyerData = {
        name: qs("zg-set-buyerName").value,
        taxId: qs("zg-set-buyerTaxId").value,
        addressFull: qs("zg-set-buyerAddress").value,
      };
      GM_setValue(BUYER_CONFIG_KEY, buyerData);
      const status = qs("zg-set-status");
      status.innerText = "Zapisano pomyślnie!";
      setTimeout(() => { status.innerText = ""; }, 2000);
    });
  }

  GM_registerMenuCommand("⚙️ Ustawienia nabywcy (Zestawienie)", openSettings);
})();
