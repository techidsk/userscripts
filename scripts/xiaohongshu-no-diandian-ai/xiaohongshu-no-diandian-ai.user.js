// ==UserScript==
// @name         小红书：屏蔽点点 AI
// @namespace    https://github.com/techidsk/userscripts
// @version      1.0.2
// @description  隐藏点点 AI 入口，阻止 AI 搜索/对话请求，并将 AI 页面跳回普通搜索。
// @author       techidsk
// @license      MIT
// @homepageURL  https://github.com/techidsk/userscripts/tree/main/scripts/xiaohongshu-no-diandian-ai
// @supportURL   https://github.com/techidsk/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/xiaohongshu-no-diandian-ai/xiaohongshu-no-diandian-ai.user.js
// @updateURL    https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/xiaohongshu-no-diandian-ai/xiaohongshu-no-diandian-ai.user.js
// @match        https://xiaohongshu.com/*
// @match        https://www.xiaohongshu.com/*
// @match        https://diandian.xiaohongshu.com/*
// @run-at       document-start
// @sandbox      raw
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /**
   * 需要排查新接口时，把 debug 改成 true，然后查看开发者工具 Console。
   * blockAiNotesV2 默认关闭：这个接口也承载普通笔记结果，强行拦截会触发搜索报错。
   */
  const CONFIG = Object.freeze({
    debug: false,
    blockRequests: true,
    blockAiNotesV2: false,
    hideUi: true,
    redirectAiPages: true,
  });

  const LOG_PREFIX = '[XHS No Diandian AI]';
  const pageWindow =
    typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const AI_ROUTE_PREFIXES = [
    '/search_result_ai',
    '/ai_chat',
    '/ai_chat_tab',
  ];

  // 这些接口名取自小红书网页端 2026-08-08 的公开前端代码。
  // 普通搜索接口 /v1/search/notes 永不拦截；/v2/search/notes 也只有在
  // 请求体带有 messageId、multiParamQuery 等 AI 专用字段时才会拦截。
  const AI_PATH_PATTERNS = [
    /^\/api\/sns\/web\/search\/(?:send\/ai|signal)(?:\/|$)/i,
    /^\/api\/sns\/web\/v1\/search\/dqa(?:\/|$)/i,
    /^\/api\/sns\/web\/v1\/search\/ask\/guide\/words(?:\/|$)/i,
    /^\/api\/sns\/web\/v1\/search\/trending\/query(?:\/|$)/i,
    /^\/api\/sns\/web\/v1\/search\/pc\/websearch(?:\/|$)/i,
    /^\/api\/sns\/web\/v1\/dqa(?:\/|$)/i,
  ];

  const SHARED_AI_NOTES_PATH =
    /^\/api\/sns\/web\/v2\/search\/notes(?:\/|$)/i;

  const AI_BODY_VALUE_SIGNAL =
    /(?:dqa_chatsearch|web_ask|web_ai_search|ai_search|davinci)/i;
  const AI_BODY_KEY_SIGNAL =
    /(?:^|[{"&?])(?:message_?id|multi_?param_?query|skip_planning)(?:"?\s*:|=)/i;

  const log = (...args) => {
    if (CONFIG.debug) {
      pageWindow.console.debug(LOG_PREFIX, ...args);
    }
  };

  const warn = (...args) => {
    if (CONFIG.debug) {
      pageWindow.console.warn(LOG_PREFIX, ...args);
    }
  };

  function parseUrl(input) {
    try {
      const raw =
        typeof input === 'string' || input instanceof String
          ? String(input)
          : input && typeof input.url === 'string'
            ? input.url
            : String(input);

      return new pageWindow.URL(raw, pageWindow.location.href);
    } catch (error) {
      warn('无法解析请求地址：', input, error);
      return null;
    }
  }

  function bodyToText(body) {
    if (body == null) return '';
    if (typeof body === 'string') return body;

    try {
      if (pageWindow.URLSearchParams && body instanceof pageWindow.URLSearchParams) {
        return body.toString();
      }

      if (pageWindow.FormData && body instanceof pageWindow.FormData) {
        return Array.from(body.entries())
          .map(([key, value]) => `${key}=${typeof value === 'string' ? value : '[file]'}`)
          .join('&');
      }

      if (typeof body === 'object' && !(body instanceof pageWindow.Blob)) {
        return JSON.stringify(body);
      }
    } catch (error) {
      warn('无法读取请求体：', error);
    }

    return '';
  }

  function hasAiBodySignal(body) {
    const text = bodyToText(body);
    return AI_BODY_VALUE_SIGNAL.test(text) || AI_BODY_KEY_SIGNAL.test(text);
  }

  function classifyAiRequest(input, body) {
    const url = parseUrl(input);
    if (!url) return null;

    if (/(^|\.)diandian\.xiaohongshu\.com$/i.test(url.hostname)) {
      return { url, reason: '点点 AI 域名' };
    }

    if (AI_PATH_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
      return { url, reason: '点点 AI 专用接口' };
    }

    if (
      CONFIG.blockAiNotesV2 &&
      SHARED_AI_NOTES_PATH.test(url.pathname) &&
      hasAiBodySignal(body)
    ) {
      return { url, reason: '普通搜索页触发的 AI 笔记请求' };
    }

    return null;
  }

  function createEmptyAiPayload() {
    const data = {
      items: [],
      queries: [],
      tokenList: [],
      token_list: [],
      hasMore: false,
      has_more: false,
      requestDqaInstant: false,
      request_dqa_instant: false,
      simpleData: null,
      simple_data: null,
    };

    // 同时放在 data 与顶层，兼容小红书不同接口的解包方式。
    return {
      code: 0,
      success: true,
      msg: 'success',
      message: 'success',
      data,
      ...data,
    };
  }

  function createEmptyFetchResponse() {
    const payload = createEmptyAiPayload();
    const responseText = JSON.stringify(payload);

    if (typeof pageWindow.Response === 'function') {
      return new pageWindow.Response(responseText, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // 极旧浏览器的保底实现。
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new pageWindow.Headers({
        'Content-Type': 'application/json; charset=utf-8',
      }),
      json: () => pageWindow.Promise.resolve(payload),
      text: () => pageWindow.Promise.resolve(responseText),
    };
  }

  function patchFetch() {
    const nativeFetch = pageWindow.fetch;
    if (typeof nativeFetch !== 'function' || nativeFetch.__xhsNoDiandianAi) {
      return;
    }

    function patchedFetch(input, init) {
      const matched = classifyAiRequest(input, init && init.body);
      if (!matched) {
        return nativeFetch.apply(this, arguments);
      }

      log('已阻止 fetch：', matched.reason, matched.url.href);
      return pageWindow.Promise.resolve(createEmptyFetchResponse());
    }

    Object.defineProperty(patchedFetch, '__xhsNoDiandianAi', {
      value: true,
    });

    try {
      patchedFetch.toString = nativeFetch.toString.bind(nativeFetch);
    } catch {
      // 某些浏览器不允许改写函数的 toString；不影响拦截。
    }

    try {
      pageWindow.fetch = patchedFetch;
    } catch (error) {
      warn('无法改写 fetch：', error);
    }
  }

  function patchXmlHttpRequest() {
    const Xhr = pageWindow.XMLHttpRequest;
    if (!Xhr || !Xhr.prototype) return;

    const proto = Xhr.prototype;
    if (proto.open.__xhsNoDiandianAi) return;

    const nativeOpen = proto.open;
    const nativeSend = proto.send;
    const requestMeta = new pageWindow.WeakMap();

    function setSyntheticValue(xhr, key, value) {
      try {
        Object.defineProperty(xhr, key, {
          configurable: true,
          get: () => value,
        });
        return true;
      } catch (error) {
        warn(`无法模拟 XHR.${key}：`, error);
        return false;
      }
    }

    function completeWithEmptySuccess(xhr, matched) {
      const payload = createEmptyAiPayload();
      const responseText = JSON.stringify(payload);
      const responseValue =
        xhr.responseType === 'json' ? payload : responseText;

      setSyntheticValue(xhr, 'readyState', 4);
      setSyntheticValue(xhr, 'status', 200);
      setSyntheticValue(xhr, 'statusText', 'OK');
      setSyntheticValue(xhr, 'responseURL', matched.url.href);
      setSyntheticValue(xhr, 'responseText', responseText);
      setSyntheticValue(xhr, 'response', responseValue);
      setSyntheticValue(xhr, 'responseXML', null);

      try {
        Object.defineProperty(xhr, 'getAllResponseHeaders', {
          configurable: true,
          value: () => 'content-type: application/json; charset=utf-8\r\n',
        });
        Object.defineProperty(xhr, 'getResponseHeader', {
          configurable: true,
          value: (name) =>
            String(name).toLowerCase() === 'content-type'
              ? 'application/json; charset=utf-8'
              : null,
        });
      } catch (error) {
        warn('无法模拟 XHR 响应头：', error);
      }

      pageWindow.queueMicrotask(() => {
        try {
          const EventCtor = pageWindow.Event || pageWindow.ProgressEvent;
          xhr.dispatchEvent(new EventCtor('readystatechange'));
          xhr.dispatchEvent(new pageWindow.ProgressEvent('load'));
          xhr.dispatchEvent(new pageWindow.ProgressEvent('loadend'));
        } catch (error) {
          warn('模拟 XHR 成功事件失败：', error);
        }
      });
    }

    function patchedOpen(method, url) {
      requestMeta.set(this, { method: String(method || 'GET'), url });
      return nativeOpen.apply(this, arguments);
    }

    function patchedSend(body) {
      const meta = requestMeta.get(this);
      const matched = meta && classifyAiRequest(meta.url, body);

      if (!matched) {
        return nativeSend.apply(this, arguments);
      }

      log(
        '已阻止 XHR：',
        matched.reason,
        meta.method,
        matched.url.href,
      );

      // 不调用原生 send，请求不会离开浏览器；返回本地空成功结果，
      // 避免小红书把拦截识别成网络错误并弹出提示。
      completeWithEmptySuccess(this, matched);

      return undefined;
    }

    Object.defineProperty(patchedOpen, '__xhsNoDiandianAi', {
      value: true,
    });

    try {
      proto.open = patchedOpen;
      proto.send = patchedSend;
    } catch (error) {
      proto.open = nativeOpen;
      warn('无法改写 XMLHttpRequest：', error);
    }
  }

  function patchSendBeacon() {
    const navigatorObject = pageWindow.navigator;
    const nativeSendBeacon = navigatorObject && navigatorObject.sendBeacon;
    if (
      typeof nativeSendBeacon !== 'function' ||
      nativeSendBeacon.__xhsNoDiandianAi
    ) {
      return;
    }

    function patchedSendBeacon(url, data) {
      const matched = classifyAiRequest(url, data);
      if (!matched) {
        return nativeSendBeacon.apply(this, arguments);
      }

      log('已阻止 sendBeacon：', matched.reason, matched.url.href);
      return true;
    }

    Object.defineProperty(patchedSendBeacon, '__xhsNoDiandianAi', {
      value: true,
    });

    try {
      navigatorObject.sendBeacon = patchedSendBeacon;
    } catch (error) {
      warn('无法改写 sendBeacon：', error);
    }
  }

  function installRequestBlockers() {
    if (!CONFIG.blockRequests) return;
    patchFetch();
    patchXmlHttpRequest();
    patchSendBeacon();
  }

  function isAiRoute(pathname = pageWindow.location.pathname) {
    return AI_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }

  function buildNormalSearchUrl(currentUrl) {
    const keyword =
      currentUrl.searchParams.get('keyword') ||
      currentUrl.searchParams.get('searchKeyWord') ||
      currentUrl.searchParams.get('search_keyword');

    if (!keyword) {
      return new pageWindow.URL('/explore', 'https://www.xiaohongshu.com');
    }

    const target = new pageWindow.URL(
      '/search_result/',
      'https://www.xiaohongshu.com',
    );
    target.searchParams.set('keyword', keyword);
    target.searchParams.set('source', 'web_search_result_notes');
    return target;
  }

  function escapeAiPage() {
    if (!CONFIG.redirectAiPages) return false;

    const currentUrl = new pageWindow.URL(pageWindow.location.href);
    const isDiandianHost = /(^|\.)diandian\.xiaohongshu\.com$/i.test(
      currentUrl.hostname,
    );

    if (!isDiandianHost && !isAiRoute(currentUrl.pathname)) {
      return false;
    }

    const target = buildNormalSearchUrl(currentUrl);
    if (target.href === currentUrl.href) return false;

    log('离开点点 AI 页面：', currentUrl.href, '→', target.href);
    pageWindow.location.replace(target.href);
    return true;
  }

  function watchSpaNavigation() {
    const historyObject = pageWindow.history;

    for (const methodName of ['pushState', 'replaceState']) {
      const nativeMethod = historyObject[methodName];
      if (
        typeof nativeMethod !== 'function' ||
        nativeMethod.__xhsNoDiandianAi
      ) {
        continue;
      }

      function patchedHistoryMethod() {
        const result = nativeMethod.apply(this, arguments);
        pageWindow.queueMicrotask(escapeAiPage);
        return result;
      }

      Object.defineProperty(patchedHistoryMethod, '__xhsNoDiandianAi', {
        value: true,
      });
      try {
        historyObject[methodName] = patchedHistoryMethod;
      } catch (error) {
        warn(`无法监听 history.${methodName}：`, error);
      }
    }

    pageWindow.addEventListener('popstate', escapeAiPage, true);
  }

  const HIDE_CSS = `
    .channel-list li:has(a[href^="/ai_chat"]),
    .channel-list li:has(a[href*="xiaohongshu.com/ai_chat"]),
    .channel-list li:has(a[href^="/search_result_ai"]),
    .channel-list li:has(a[href*="xiaohongshu.com/search_result_ai"]),
    .channel-list li:has(.xhs-channel-AiChat),
    .side-bar li:has(a[href^="/ai_chat"]),
    .side-bar li:has(a[href^="/search_result_ai"]),
    .side-bar li:has(.xhs-channel-AiChat),
    a[href^="/ai_chat"],
    a[href*="xiaohongshu.com/ai_chat"],
    a[href^="/search_result_ai"],
    a[href*="xiaohongshu.com/search_result_ai"],
    .wendian-btn,
    .ai-sug-container.wendian-active,
    .wendian-wrapper--active .ai-dropdown-panel,
    .ai-might-ask,
    .ai-might-ask-container,
    .ai-message-recommend-box,
    .xhs-ai-chat-recommend,
    .ai-chat-renderer,
    .ai-note-feeds-wrapper,
    [data-xhs-no-diandian-ai="hidden"] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      min-height: 0 !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  `;

  const AI_NAV_CONTROL_SELECTOR = [
    'a[href^="/ai_chat"]',
    'a[href*="xiaohongshu.com/ai_chat"]',
    'a[href^="/search_result_ai"]',
    'a[href*="xiaohongshu.com/search_result_ai"]',
    '.xhs-channel-AiChat',
  ].join(', ');

  const AI_NAV_ROW_SELECTOR = [
    '.channel-list li',
    '.side-bar li',
    '.bottom-menu .bottom-channel',
    '.bottom-menu-component .bottom-channel',
  ].join(', ');

  function isElement(value) {
    return Boolean(
      pageWindow.Element && value instanceof pageWindow.Element,
    );
  }

  function queryIncludingRoot(root, selector) {
    const results = [];
    if (isElement(root) && root.matches(selector)) {
      results.push(root);
    }
    if (root && typeof root.querySelectorAll === 'function') {
      results.push(...root.querySelectorAll(selector));
    }
    return results;
  }

  function markHidden(element) {
    if (!isElement(element)) return;
    element.setAttribute('data-xhs-no-diandian-ai', 'hidden');
  }

  function hideAiNavigation(root) {
    for (const control of queryIncludingRoot(root, AI_NAV_CONTROL_SELECTOR)) {
      const row = control.closest(AI_NAV_ROW_SELECTOR);
      markHidden(row || control);
    }

    // 页面改版、链接结构变化时的保底：只检查侧栏菜单行，避免误伤笔记正文。
    for (const row of queryIncludingRoot(
      root,
      '.channel-list li, .side-bar li',
    )) {
      const text = (row.textContent || '').replace(/\s+/g, '').trim();
      if (/^点点(?:AI)?$/i.test(text)) {
        markHidden(row);
      }
    }
  }

  function deactivateWendianButton(root) {
    const activeButtons = queryIncludingRoot(
      root,
      '.wendian-btn.wendian-btn--active',
    );

    for (const button of activeButtons) {
      if (button.dataset.xhsNoDiandianDeactivated === 'true') continue;
      button.dataset.xhsNoDiandianDeactivated = 'true';

      try {
        button.click();
        log('已关闭搜索框中的点点 AI 模式');
      } catch (error) {
        warn('无法自动关闭点点 AI 模式：', error);
      }
    }
  }

  function hideTextOnlyControls(root) {
    const controls = queryIncludingRoot(
      root,
      'header button, nav button, aside button',
    );

    for (const control of controls) {
      const text = (control.textContent || '').replace(/\s+/g, '').trim();
      if (/^(?:点点(?:AI)?|问点点|AI搜索)$/i.test(text)) {
        markHidden(control);
      }
    }
  }

  function scrubAiUi(root = document) {
    if (!CONFIG.hideUi) return;

    deactivateWendianButton(root);
    hideTextOnlyControls(root);
    hideAiNavigation(root);
  }

  function installUiBlocker() {
    if (!CONFIG.hideUi) return;

    const attach = () => {
      if (!document.documentElement) return false;

      if (!document.getElementById('xhs-no-diandian-ai-style')) {
        const style = document.createElement('style');
        style.id = 'xhs-no-diandian-ai-style';
        style.textContent = HIDE_CSS;
        document.documentElement.appendChild(style);
      }

      scrubAiUi(document);

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              scrubAiUi(node);
            }
          }
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      return true;
    };

    if (attach()) return;

    const bootstrapObserver = new MutationObserver(() => {
      if (attach()) bootstrapObserver.disconnect();
    });
    bootstrapObserver.observe(document, { childList: true, subtree: true });
  }

  installRequestBlockers();
  watchSpaNavigation();
  if (!escapeAiPage()) {
    installUiBlocker();
  }
})();
