// ==UserScript==
// @name         IT之家移动端 · 阅读增强
// @namespace    https://github.com/techidsk/userscripts
// @version      1.1.0
// @description  为 IT之家移动端新闻流与热榜补充导语，重排卡片，并提供图片、紧凑与净化开关。
// @author       techidsk
// @license      MIT
// @homepageURL  https://github.com/techidsk/userscripts/tree/main/scripts/ithome-reader
// @supportURL   https://github.com/techidsk/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/ithome-reader/ithome-reader.user.js
// @updateURL    https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/ithome-reader/ithome-reader.user.js
// @match        https://m.ithome.com/*
// @icon         https://www.ithome.com/favicon.ico
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const PREFIX = "ith-reader";
  const SETTINGS_KEY = `${PREFIX}:settings:v1`;
  const CACHE_KEY = `${PREFIX}:summary-cache:v1`;
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  const CACHE_LIMIT = 250;
  const ARTICLE_TIMEOUT = 9000;
  const MAX_CONCURRENT_REQUESTS = 3;
  const LIST_API_RE = /\/api\/news\/(?:newslistpageget|newstaglistpageget)/i;

  const defaults = {
    summaries: true,
    images: true,
    compact: false,
    clean: true,
  };

  const state = {
    settings: loadJson(SETTINGS_KEY, defaults),
    cache: loadJson(CACHE_KEY, {}),
    summaries: new Map(),
    queue: [],
    queuedIds: new Set(),
    pendingIds: new Map(),
    activeRequests: 0,
    observer: null,
    cacheTimer: 0,
    initialBatch: Promise.resolve(),
    ready: false,
  };

  pruneCache();
  captureListResponses();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  function init() {
    const feed = document.querySelector(
      ".index-box > .content, .index-box > .rank",
    );
    if (!feed || !feed.querySelector(".placeholder[data-news-id]")) return;

    state.ready = true;
    injectStyles();
    document.documentElement.classList.add(`${PREFIX}-ready`);
    applySettings();
    installToolbar(feed);
    installCardObserver(feed);
    enhanceCards(feed);
    if (!feed.classList.contains("rank")) {
      state.initialBatch = fetchInitialDescriptions();
    }
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.id = `${PREFIX}-styles`;
    style.textContent = `
      html.${PREFIX}-ready {
        --ir-accent: #e5484d;
        --ir-accent-soft: #fff0f0;
        --ir-page: #f5f6f8;
        --ir-card: #ffffff;
        --ir-text: #202124;
        --ir-muted: #71757d;
        --ir-line: #e9eaed;
        --ir-shadow: 0 2px 10px rgba(20, 24, 31, .055);
      }

      @media (prefers-color-scheme: dark) {
        html.${PREFIX}-ready:not(.light) {
          --ir-accent: #ff686d;
          --ir-accent-soft: #361d20;
          --ir-page: #090a0b;
          --ir-card: #17181a;
          --ir-text: #f3f4f6;
          --ir-muted: #a2a6ad;
          --ir-line: #292b2f;
          --ir-shadow: none;
        }
      }

      html.${PREFIX}-ready.dark:not(.light) {
        --ir-accent: #ff686d;
        --ir-accent-soft: #361d20;
        --ir-page: #090a0b;
        --ir-card: #17181a;
        --ir-text: #f3f4f6;
        --ir-muted: #a2a6ad;
        --ir-line: #292b2f;
        --ir-shadow: none;
      }

      html.${PREFIX}-ready body,
      html.${PREFIX}-ready .index-box,
      html.${PREFIX}-ready .content,
      html.${PREFIX}-ready .rank {
        background: var(--ir-page) !important;
      }

      html.${PREFIX}-ready .index-box > :is(.content, .rank) {
        box-sizing: border-box;
        padding: 2px 12px 86px !important;
      }

      html.${PREFIX}-ready .rank-name {
        box-sizing: border-box;
        margin: 18px 0 6px !important;
        color: var(--ir-text) !important;
      }

      .${PREFIX}-toolbar {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 9px 12px;
        overflow-x: auto;
        color: var(--ir-text);
        background: var(--ir-card);
        border-top: 1px solid var(--ir-line);
        border-bottom: 1px solid var(--ir-line);
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .${PREFIX}-toolbar::-webkit-scrollbar { display: none; }

      .${PREFIX}-brand {
        flex: 0 0 auto;
        margin-right: auto;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .04em;
        color: var(--ir-muted);
        white-space: nowrap;
      }

      .${PREFIX}-toggle {
        appearance: none;
        flex: 0 0 auto;
        min-width: 48px;
        height: 32px;
        padding: 0 10px;
        border: 1px solid var(--ir-line);
        border-radius: 999px;
        color: var(--ir-muted);
        background: transparent;
        font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .${PREFIX}-toggle[aria-pressed="true"] {
        color: var(--ir-accent);
        border-color: color-mix(in srgb, var(--ir-accent) 42%, transparent);
        background: var(--ir-accent-soft);
      }

      .${PREFIX}-toggle:focus-visible {
        outline: 2px solid var(--ir-accent);
        outline-offset: 2px;
      }

      html.${PREFIX}-ready :is(.content, .rank-box) > .placeholder {
        box-sizing: border-box !important;
        position: relative;
        height: auto !important;
        min-height: 0 !important;
        margin: 10px 0 !important;
        padding: 0 !important;
        overflow: hidden;
        background: var(--ir-card) !important;
        border: 1px solid var(--ir-line) !important;
        border-radius: 13px !important;
        box-shadow: var(--ir-shadow);
      }

      html.${PREFIX}-ready :is(.content, .rank-box) > .placeholder > a {
        box-sizing: border-box;
        height: auto !important;
        color: var(--ir-text) !important;
        text-decoration: none !important;
        -webkit-tap-highlight-color: transparent;
      }

      html.${PREFIX}-ready :is(.content, .rank-box) > .one-img-plc > a {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) 104px;
        gap: 11px;
        align-items: start;
        padding: 13px !important;
      }

      html.${PREFIX}-ready :is(.content, .rank-box) > .one-img-plc .plc-con {
        box-sizing: border-box;
        display: flex !important;
        flex-direction: column;
        grid-column: 1;
        grid-row: 1;
        width: auto !important;
        min-width: 0;
        height: auto !important;
        min-height: 78px;
        padding: 0 !important;
        position: static !important;
        float: none !important;
      }

      html.${PREFIX}-ready :is(.content, .rank-box) > .one-img-plc .plc-image {
        box-sizing: border-box;
        grid-column: 2;
        grid-row: 1;
        width: 104px !important;
        height: 78px !important;
        margin: 0 !important;
        overflow: hidden;
        float: none !important;
        border-radius: 9px;
        background: var(--ir-line);
      }

      html.${PREFIX}-ready :is(.content, .rank-box) > .one-img-plc .plc-image img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
      }

      html.${PREFIX}-ready .rank-box > .one-img-plc .plc-image {
        position: static !important;
        overflow: visible;
        padding: 0 !important;
        background: transparent;
      }

      html.${PREFIX}-ready .rank-box > .one-img-plc .plc-image img {
        position: static !important;
        overflow: hidden;
        border-radius: 9px;
        background: var(--ir-line);
      }

      html.${PREFIX}-ready .rank-box .rank-num {
        z-index: 2;
        top: 13px !important;
        left: 13px !important;
      }

      html.${PREFIX}-ready :is(.content, .rank-box) > .no-img-plc > a,
      html.${PREFIX}-ready :is(.content, .rank-box) > .three-img-plc > a {
        display: block !important;
        padding: 13px !important;
      }

      html.${PREFIX}-ready :is(.content, .rank-box) > .no-img-plc .plc-con {
        width: auto !important;
        height: auto !important;
        padding: 0 !important;
        position: static !important;
        float: none !important;
      }

      html.${PREFIX}-ready :is(.content, .rank-box) .plc-title,
      html.${PREFIX}-ready :is(.content, .rank-box) .three-img-plc .title {
        display: -webkit-box !important;
        margin: 0 !important;
        overflow: hidden;
        color: var(--ir-text) !important;
        font-size: 16px !important;
        font-weight: 650 !important;
        line-height: 1.42 !important;
        letter-spacing: -.01em;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .${PREFIX}-summary {
        display: -webkit-box;
        min-height: 39px;
        margin: 6px 0 7px !important;
        overflow: hidden;
        color: var(--ir-muted);
        font-size: 13.5px;
        font-weight: 400;
        line-height: 1.48;
        letter-spacing: .005em;
        text-wrap: pretty;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .${PREFIX}-summary[data-state="loading"] {
        color: transparent;
        border-radius: 4px;
        background:
          linear-gradient(90deg, transparent, rgba(128, 128, 128, .13), transparent) -180px 0 / 180px 100% no-repeat,
          linear-gradient(var(--ir-line), var(--ir-line)) 0 4px / 94% 8px no-repeat,
          linear-gradient(var(--ir-line), var(--ir-line)) 0 25px / 72% 8px no-repeat;
        animation: ${PREFIX}-shimmer 1.25s ease-in-out infinite;
      }

      .${PREFIX}-summary[data-state="empty"] { display: none; }

      @keyframes ${PREFIX}-shimmer {
        to { background-position: calc(100% + 180px) 0, 0 4px, 0 25px; }
      }

      html.${PREFIX}-ready :is(.content, .rank-box) .plc-footer {
        box-sizing: border-box;
        height: auto !important;
        min-height: 18px;
        margin: auto 0 0 !important;
        color: var(--ir-muted) !important;
        font-size: 12px !important;
        line-height: 18px !important;
      }

      html.${PREFIX}-ready :is(.content, .rank-box) .plc-footer-fr {
        color: var(--ir-muted) !important;
      }

      html.${PREFIX}-ready :is(.content, .rank-box) .pic-space {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        height: 88px !important;
        margin-top: 9px;
      }

      html.${PREFIX}-ready :is(.content, .rank-box) .pic-space .plc-image {
        width: auto !important;
        height: 88px !important;
        overflow: hidden;
        border-radius: 8px;
        background: var(--ir-line);
      }

      html.${PREFIX}-ready :is(.content, .rank-box) .pic-space img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
      }

      html.${PREFIX}-no-summaries .${PREFIX}-summary { display: none !important; }

      html.${PREFIX}-no-images :is(.content, .rank-box) > .one-img-plc > a {
        display: block !important;
      }

      html.${PREFIX}-no-images :is(.content, .rank-box) .plc-image,
      html.${PREFIX}-no-images :is(.content, .rank-box) .pic-space {
        display: none !important;
      }

      html.${PREFIX}-ready.${PREFIX}-no-images .rank-box > .one-img-plc .plc-image {
        display: block !important;
        width: 0 !important;
        height: 0 !important;
        overflow: visible;
      }

      html.${PREFIX}-no-images .rank-box .plc-image img {
        display: none !important;
      }

      html.${PREFIX}-compact :is(.content, .rank-box) > .placeholder { margin: 7px 0 !important; }

      html.${PREFIX}-compact :is(.content, .rank-box) > .placeholder > a { padding: 10px 11px !important; }

      html.${PREFIX}-compact :is(.content, .rank-box) .plc-title,
      html.${PREFIX}-compact :is(.content, .rank-box) .three-img-plc .title {
        font-size: 15px !important;
        -webkit-line-clamp: 2;
      }

      html.${PREFIX}-compact .${PREFIX}-summary {
        min-height: 20px;
        margin: 4px 0 5px !important;
        font-size: 12.5px;
        -webkit-line-clamp: 1;
      }

      html.${PREFIX}-compact .${PREFIX}-summary[data-state="loading"] {
        background:
          linear-gradient(90deg, transparent, rgba(128, 128, 128, .13), transparent) -180px 0 / 180px 100% no-repeat,
          linear-gradient(var(--ir-line), var(--ir-line)) 0 5px / 78% 8px no-repeat;
      }

      html.${PREFIX}-compact :is(.content, .rank-box) > .one-img-plc > a {
        grid-template-columns: minmax(0, 1fr) 92px;
      }

      html.${PREFIX}-compact :is(.content, .rank-box) > .one-img-plc .plc-image {
        width: 92px !important;
        height: 69px !important;
      }

      html.${PREFIX}-compact .rank-box .rank-num {
        top: 10px !important;
        left: 11px !important;
      }

      html.${PREFIX}-clean :is(.content, .rank-box) > .placeholder[data-${PREFIX}-ad="true"],
      html.${PREFIX}-clean .open-app-banner {
        display: none !important;
      }

      @media (min-width: 720px) {
        html.${PREFIX}-ready .index-box { max-width: 720px; margin: 0 auto; }
        html.${PREFIX}-ready :is(.content, .rank-box) > .one-img-plc > a {
          grid-template-columns: minmax(0, 1fr) 132px;
        }
        html.${PREFIX}-ready :is(.content, .rank-box) > .one-img-plc .plc-image {
          width: 132px !important;
          height: 92px !important;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .${PREFIX}-summary[data-state="loading"] { animation: none; }
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  function installToolbar(feed) {
    if (document.getElementById(`${PREFIX}-toolbar`)) return;

    const toolbar = document.createElement("section");
    toolbar.id = `${PREFIX}-toolbar`;
    toolbar.className = `${PREFIX}-toolbar`;
    toolbar.setAttribute("aria-label", "阅读增强设置");

    const brand = document.createElement("span");
    brand.className = `${PREFIX}-brand`;
    brand.textContent = "阅读增强";
    toolbar.append(brand);

    const buttons = [
      ["summaries", "导语", "为新闻卡片补充两行摘要"],
      ["images", "图片", "显示或隐藏缩略图"],
      ["compact", "紧凑", "压缩卡片的垂直空间"],
      ["clean", "净化", "隐藏广告条目和打开 App 横幅"],
    ];

    for (const [key, label, title] of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${PREFIX}-toggle`;
      button.dataset.setting = key;
      button.textContent = label;
      button.title = title;
      button.addEventListener("click", () => {
        state.settings[key] = !state.settings[key];
        saveJson(SETTINGS_KEY, state.settings);
        applySettings();
        updateToolbar();
        if (key === "summaries" && state.settings.summaries) observeAllCards();
      });
      toolbar.append(button);
    }

    feed.before(toolbar);
    updateToolbar();
  }

  function updateToolbar() {
    document.querySelectorAll(`.${PREFIX}-toggle[data-setting]`).forEach((button) => {
      const key = button.dataset.setting;
      button.setAttribute("aria-pressed", String(Boolean(state.settings[key])));
    });
  }

  function applySettings() {
    const root = document.documentElement;
    root.classList.toggle(`${PREFIX}-no-summaries`, !state.settings.summaries);
    root.classList.toggle(`${PREFIX}-no-images`, !state.settings.images);
    root.classList.toggle(`${PREFIX}-compact`, state.settings.compact);
    root.classList.toggle(`${PREFIX}-clean`, state.settings.clean);
  }

  function installCardObserver(feed) {
    state.observer = new IntersectionObserver(
      (entries) => {
        if (!state.settings.summaries) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          state.observer.unobserve(entry.target);
          queueSummary(entry.target);
        }
      },
      { rootMargin: "900px 0px", threshold: 0.01 },
    );

    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(".placeholder[data-news-id]")) enhanceCard(node);
          node.querySelectorAll?.(".placeholder[data-news-id]").forEach(enhanceCard);
        }
      }
    });
    mutationObserver.observe(feed, { childList: true, subtree: true });
  }

  function enhanceCards(root = document) {
    root.querySelectorAll(".placeholder[data-news-id]").forEach(enhanceCard);
  }

  function enhanceCard(card) {
    if (card.dataset[`${camelPrefix()}Ready`] === "true") return;
    card.dataset[`${camelPrefix()}Ready`] = "true";

    const isAd = [...card.querySelectorAll(".tip")].some(
      (tip) => tip.textContent.trim() === "广告",
    );
    card.dataset[`${camelPrefix()}Ad`] = String(isAd);

    const link = card.querySelector(":scope > a");
    if (!link) return;

    const summary = document.createElement("p");
    summary.className = `${PREFIX}-summary`;
    summary.dataset.state = isAd ? "empty" : "loading";

    const textColumn = card.classList.contains("three-img-plc")
      ? link
      : link.querySelector(":scope > .plc-con") || link;
    const footer = textColumn.querySelector(":scope > .plc-footer");
    const imageStrip = textColumn.querySelector(":scope > .pic-space");
    textColumn.insertBefore(summary, footer || imageStrip || null);

    if (isAd) return;

    const cached = getKnownSummary(card.dataset.newsId);
    if (cached) renderSummary(card, cached);
    else state.observer?.observe(card);
  }

  function observeAllCards() {
    document.querySelectorAll(".placeholder[data-news-id]").forEach((card) => {
      const summary = card.querySelector(`.${PREFIX}-summary`);
      if (summary?.dataset.state !== "loading") return;
      const rect = card.getBoundingClientRect();
      if (rect.bottom >= -900 && rect.top <= window.innerHeight + 900) {
        state.observer?.unobserve(card);
        queueSummary(card);
      } else {
        state.observer?.observe(card);
      }
    });
  }

  function queueSummary(card) {
    const id = card.dataset.newsId;
    if (!id || card.dataset[`${camelPrefix()}Ad`] === "true") return;

    const known = getKnownSummary(id);
    if (known) {
      renderSummary(card, known);
      return;
    }

    if (state.queuedIds.has(id) || state.pendingIds.has(id)) return;
    state.queuedIds.add(id);
    state.queue.push(card);
    pumpQueue();
  }

  function pumpQueue() {
    while (
      state.activeRequests < MAX_CONCURRENT_REQUESTS &&
      state.queue.length > 0
    ) {
      const card = state.queue.shift();
      const id = card?.dataset.newsId;
      if (!id) continue;
      state.queuedIds.delete(id);
      state.activeRequests += 1;

      loadSummary(card)
        .catch(() => renderSummary(card, ""))
        .finally(() => {
          state.activeRequests -= 1;
          pumpQueue();
        });
    }
  }

  async function loadSummary(card) {
    const id = card.dataset.newsId;
    await Promise.race([state.initialBatch, delay(1100)]).catch(() => {});

    const known = getKnownSummary(id);
    if (known) {
      renderSummary(card, known);
      return;
    }

    if (!state.pendingIds.has(id)) {
      state.pendingIds.set(id, fetchArticleDescription(card));
    }

    const text = await state.pendingIds.get(id).finally(() => {
      state.pendingIds.delete(id);
    });

    if (text) rememberSummary(id, text);
    renderAllCardsWithId(id, text);
  }

  async function fetchInitialDescriptions() {
    const pageData = document.querySelector("#page-data");
    const tag = (pageData?.dataset.tag || "").replaceAll("/", "");
    const newsTag = pageData?.dataset.newsTag || "";
    let endpoint;

    if (newsTag) {
      endpoint = `/api/news/newstaglistpageget?NewsTag=${encodeURIComponent(newsTag)}&PageNo=0`;
    } else {
      const afterNow = Date.now() + 5 * 60 * 1000;
      endpoint = `/api/news/newslistpageget?Tag=${encodeURIComponent(tag)}&ot=${afterNow}&page=0&hitCountAuthority=false`;
    }

    try {
      const response = await fetch(endpoint, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      ingestPayload(await response.json());
    } catch {
      // The visible-card fallback below still works if the list API is unavailable.
    }
  }

  async function fetchArticleDescription(card) {
    const id = card.dataset.newsId;
    const href = card.querySelector(":scope > a")?.href;
    const articleUrl = /^\d+$/.test(id)
      ? new URL(`/html/${id}.htm`, location.origin).href
      : href;
    if (!articleUrl) return "";

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), ARTICLE_TIMEOUT);
    try {
      const response = await fetch(articleUrl, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) return "";
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const meta = doc.querySelector('meta[name="description"]')?.content;
      const firstParagraph = doc.querySelector(".news-content > p")?.textContent;
      return cleanSummary(meta || firstParagraph || "");
    } catch {
      return "";
    } finally {
      window.clearTimeout(timer);
    }
  }

  function captureListResponses() {
    if (window.__ITHOME_READER_XHR_PATCHED__) return;
    window.__ITHOME_READER_XHR_PATCHED__ = true;

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__ithReaderUrl = String(url || "");
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      if (LIST_API_RE.test(this.__ithReaderUrl || "")) {
        this.addEventListener(
          "load",
          () => {
            try {
              const payload = this.responseType === "json"
                ? this.response
                : JSON.parse(this.responseText);
              ingestPayload(payload);
            } catch {
              // Ignore unrelated or malformed responses without affecting the site.
            }
          },
          { once: true },
        );
      }
      return originalSend.apply(this, args);
    };
  }

  function ingestPayload(payload) {
    const items = Array.isArray(payload) ? payload : payload?.Result;
    if (!Array.isArray(items)) return;

    for (const item of items) {
      const id = String(item?.newsid ?? item?.NewsId ?? item?.NewsID ?? "");
      const text = cleanSummary(item?.description ?? item?.Description ?? "");
      if (!id || !text) continue;
      rememberSummary(id, text);
      if (state.ready) renderAllCardsWithId(id, text);
    }
  }

  function cleanSummary(value) {
    const text = String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/#[^#\n]{1,48}#/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    if (text.length <= 118) return text;
    return `${text.slice(0, 117).replace(/[，。；、,:：\s]+$/u, "")}…`;
  }

  function renderAllCardsWithId(id, text) {
    document.querySelectorAll(".placeholder[data-news-id]").forEach((card) => {
      if (card.dataset.newsId === id) renderSummary(card, text);
    });
  }

  function renderSummary(card, text) {
    const summary = card.querySelector(`.${PREFIX}-summary`);
    if (!summary) return;
    const cleaned = cleanSummary(text);
    summary.textContent = cleaned;
    summary.dataset.state = cleaned ? "ready" : "empty";
    if (cleaned) summary.title = cleaned;
  }

  function getKnownSummary(id) {
    if (!id) return "";
    if (state.summaries.has(id)) return state.summaries.get(id);
    const entry = state.cache[id];
    if (!entry || Date.now() - entry.time > CACHE_TTL) return "";
    state.summaries.set(id, entry.text);
    return entry.text;
  }

  function rememberSummary(id, text) {
    const cleaned = cleanSummary(text);
    if (!id || !cleaned) return;
    state.summaries.set(id, cleaned);
    state.cache[id] = { text: cleaned, time: Date.now() };
    scheduleCacheWrite();
  }

  function pruneCache() {
    const now = Date.now();
    state.cache = Object.fromEntries(
      Object.entries(state.cache)
        .filter(([, entry]) => entry?.text && now - entry.time <= CACHE_TTL)
        .sort((a, b) => b[1].time - a[1].time)
        .slice(0, CACHE_LIMIT),
    );
  }

  function scheduleCacheWrite() {
    window.clearTimeout(state.cacheTimer);
    state.cacheTimer = window.setTimeout(() => {
      pruneCache();
      saveJson(CACHE_KEY, state.cache);
    }, 350);
  }

  function camelPrefix() {
    return PREFIX.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function loadJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed && typeof parsed === "object"
        ? { ...fallback, ...parsed }
        : structuredClone(fallback);
    } catch {
      return { ...fallback };
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The script remains usable when storage is disabled.
    }
  }
})();
