// ==UserScript==
// @name         雪球公开页面净化
// @namespace    https://github.com/techidsk/userscripts
// @version      1.2.0
// @description  抑制公开页面的自动登录弹窗，匿名打开公开评论，并做低风险的加载与隐私优化
// @author       techidsk
// @license      MIT
// @homepageURL  https://github.com/techidsk/userscripts/tree/main/scripts/xueqiu-public-clean
// @supportURL   https://github.com/techidsk/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/xueqiu-public-clean/xueqiu-public-clean.user.js
// @updateURL    https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/xueqiu-public-clean/xueqiu-public-clean.user.js
// @match        https://xueqiu.com/k*
// @match        https://www.xueqiu.com/k*
// @match        https://xueqiu.com/S/*
// @match        https://www.xueqiu.com/S/*
// @include      /^https:\/\/(?:www\.)?xueqiu\.com\/\d+\/\d+(?:[/?#].*)?$/
// @run-at       document-start
// @sandbox      raw
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  /*
   * 可以按需把某一项改成 false。
   * 这里不拦截数美/阿里等风控脚本，也不处理登录二维码资源，避免影响正常登录。
   */
  const OPTIONS = Object.freeze({
    redirectAnonymousTimelineComments: true,
    removeDownloadPromos: true,
    lazyLoadImages: true,
    deferTimelineRendering: true,
    disableInternalBehaviorTracking: true,
    blockBaiduAnalytics: true,
  });

  const STYLE_ID = 'xueqiu-search-clean-style';
  const TOAST_ID = 'xueqiu-search-clean-toast';
  const AUTO_HIDDEN_CLASS = 'xq-auto-login-hidden';
  const PROMO_SELECTOR = '.widget__download-app--side, .setting.download';

  const isSearchPage = /^\/k(?:\/|$)/i.test(location.pathname);
  const isStockPage = /^\/S\/[^/]+\/?$/i.test(location.pathname);
  const isStatusPage = /^\/\d+\/\d+\/?$/.test(location.pathname);
  const shouldSuppressAutomaticLogin = isSearchPage || isStockPage;

  if (!isSearchPage && !isStockPage && !isStatusPage) return;

  let scheduled = false;
  let manualLoginOpen = false;
  let manualLoginRequestedUntil = 0;
  let didScrollToComments = false;
  let toastTimer = 0;

  const closingModals = new WeakSet();
  const watchedDimmers = new WeakSet();

  function isBaiduAnalyticsScript(node) {
    if (!(node instanceof HTMLScriptElement)) return false;

    const src = node.src || node.getAttribute('src') || '';
    return /^https?:\/\/hm\.baidu\.com\/hm\.js(?:\?|$)/i.test(src);
  }

  function installEarlyPrivacyGuards() {
    if (OPTIONS.disableInternalBehaviorTracking) {
      // 雪球前端会先检查这个标记，再绑定 /upload/web 行为上报事件。
      try {
        window.__analyticsHandlersBound = true;
      } catch {
        // 页面若将该属性设为只读，保持网站原行为。
      }
    }

    if (!OPTIONS.blockBaiduAnalytics) return;

    const nodePrototype = Node.prototype;
    const originalAppendChild = nodePrototype.appendChild;
    const originalInsertBefore = nodePrototype.insertBefore;

    function blockOrAppend(newNode) {
      if (!isBaiduAnalyticsScript(newNode)) return false;
      newNode.dataset.xqPrivacyBlocked = 'baidu-hm';
      return true;
    }

    function guardedAppendChild(newNode) {
      if (blockOrAppend(newNode)) return newNode;
      return originalAppendChild.call(this, newNode);
    }

    function guardedInsertBefore(newNode, referenceNode) {
      if (blockOrAppend(newNode)) return newNode;
      return originalInsertBefore.call(this, newNode, referenceNode);
    }

    let appendGuardInstalled = false;
    let insertGuardInstalled = false;

    try {
      nodePrototype.appendChild = guardedAppendChild;
      appendGuardInstalled = nodePrototype.appendChild === guardedAppendChild;
      nodePrototype.insertBefore = guardedInsertBefore;
      insertGuardInstalled = nodePrototype.insertBefore === guardedInsertBefore;
    } catch {
      // 原型不可写时，仅使用后续的 DOM 清理，不中断页面。
    }

    function restoreNativeDomMethods() {
      if (appendGuardInstalled && nodePrototype.appendChild === guardedAppendChild) {
        nodePrototype.appendChild = originalAppendChild;
      }
      if (insertGuardInstalled && nodePrototype.insertBefore === guardedInsertBefore) {
        nodePrototype.insertBefore = originalInsertBefore;
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', restoreNativeDomMethods, {
        once: true,
      });
    } else {
      queueMicrotask(restoreNativeDomMethods);
    }
  }

  installEarlyPrivacyGuards();

  function queryIncludingRoot(root, selector) {
    const matches = [];

    if (root instanceof Element && root.matches(selector)) matches.push(root);
    if (typeof root.querySelectorAll === 'function') {
      matches.push(...root.querySelectorAll(selector));
    }

    return matches;
  }

  function installStyle() {
    if (!document.documentElement || document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${OPTIONS.removeDownloadPromos ? `${PROMO_SELECTOR} { display: none !important; }` : ''}

      .modal__login.${AUTO_HIDDEN_CLASS} {
        display: none !important;
      }

      ${OPTIONS.deferTimelineRendering ? `
        .timeline__item {
          content-visibility: auto;
          contain-intrinsic-size: auto 220px;
        }
      ` : ''}

      .article__comment,
      .comment__wrap {
        scroll-margin-top: 72px;
      }

      #${TOAST_ID} {
        position: fixed;
        left: 50%;
        bottom: 36px;
        z-index: 2147483647;
        transform: translateX(-50%);
        max-width: min(420px, calc(100vw - 32px));
        padding: 9px 14px;
        border-radius: 7px;
        color: #fff;
        background: rgba(32, 35, 42, 0.92);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
        font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;

    const style = getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.getClientRects().length > 0
    );
  }

  function showNotice(message) {
    if (!document.body) return;

    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast?.remove(), 2200);
  }

  function removePromotions(root) {
    if (!OPTIONS.removeDownloadPromos) return;
    queryIncludingRoot(root, PROMO_SELECTOR).forEach((element) => element.remove());
  }

  function removeKnownTrackingScripts(root) {
    if (!OPTIONS.blockBaiduAnalytics) return;
    queryIncludingRoot(root, 'script[src]')
      .filter(isBaiduAnalyticsScript)
      .forEach((script) => script.remove());
  }

  function optimizeImages(root) {
    if (!OPTIONS.lazyLoadImages) return;

    for (const image of queryIncludingRoot(root, 'img')) {
      // 登录框二维码应在用户主动登录时立即可用。
      if (image.closest('.modal__login')) continue;
      if (!image.hasAttribute('loading')) image.loading = 'lazy';
      if (!image.hasAttribute('decoding')) image.decoding = 'async';
    }
  }

  function restoreScrolling(dimmer) {
    const otherModalIsVisible = dimmer
      ? [...dimmer.querySelectorAll('.modal:not(.modal__login)')].some(isVisible)
      : false;

    if (otherModalIsVisible) return;

    dimmer?.classList.remove('js-shown');
    document.body?.classList.remove('scroll-no');
    document.body?.style.removeProperty('margin-right');
    document.body?.style.removeProperty('overflow');
  }

  function getVisibleLoginModals() {
    return [...document.querySelectorAll('.modal__login')].filter(isVisible);
  }

  function closeAutomaticLoginModal() {
    if (!shouldSuppressAutomaticLogin) return;

    const modals = getVisibleLoginModals();

    // 用户关闭手动打开的登录框后，恢复自动拦截状态。
    if (modals.length === 0) {
      if (manualLoginRequestedUntil > Date.now()) return;
      manualLoginOpen = false;
      manualLoginRequestedUntil = 0;
      return;
    }

    // 顶部“登录”按钮由用户主动点击时，完整保留网站登录流程。
    if (manualLoginOpen) {
      manualLoginRequestedUntil = 0;
      return;
    }

    for (const modal of modals) {
      if (closingModals.has(modal)) continue;
      closingModals.add(modal);

      const dimmer = modal.closest('.modals.dimmer');
      const closeButton = modal.querySelector(
        'a.close, button.close, [aria-label="关闭"]'
      );

      // 优先调用网站自己的关闭逻辑，以便正确清理遮罩和滚动锁。
      if (closeButton instanceof HTMLElement) closeButton.click();

      // 若页面改版导致关闭按钮失效，只隐藏已确认是登录框的弹层。
      window.setTimeout(() => {
        if (isVisible(modal)) {
          modal.classList.add(AUTO_HIDDEN_CLASS);
        }

        restoreScrolling(dimmer);
        closingModals.delete(modal);
      }, 80);
    }
  }

  function getTimelineCommentControl(item) {
    const footers = [...item.querySelectorAll('.timeline__item__ft')].filter(
      (footer) => footer.closest('.timeline__item') === item
    );
    const footer = footers[0];
    if (!footer) return null;

    const directControls = [...footer.children].filter(
      (child) =>
        child instanceof HTMLAnchorElement &&
        child.classList.contains('timeline__item__control')
    );

    // 当前结构依次为：转发、评论、赞、收藏；只处理第二个直接子项。
    return directControls[1] || null;
  }

  function getPublicStatusUrl(item) {
    for (const link of item.querySelectorAll('a[href]')) {
      let url;
      try {
        url = new URL(link.getAttribute('href'), location.href);
      } catch {
        continue;
      }

      const currentSite = location.hostname.replace(/^www\./, '');
      const sameSite = url.hostname.replace(/^www\./, '') === currentSite;
      if (sameSite && /^\/\d+\/\d+\/?$/.test(url.pathname)) {
        url.hash = 'xq-comments';
        return url.href;
      }
    }

    return '';
  }

  function decorateTimelineComments(root) {
    if (!OPTIONS.redirectAnonymousTimelineComments || !isStockPage) return;

    for (const item of queryIncludingRoot(root, '.timeline__item')) {
      const control = getTimelineCommentControl(item);
      const publicUrl = getPublicStatusUrl(item);
      if (!control || !publicUrl) continue;

      control.href = publicUrl;
      control.dataset.xqPublicComments = publicUrl;
      control.title = '打开这条帖子的公开讨论';
    }
  }

  function isAnonymousView() {
    return [...document.querySelectorAll('.loginBtn')].some(
      (button) => !button.closest('.modal__login') && isVisible(button)
    );
  }

  function getCommentClickContext(target) {
    if (!(target instanceof Element)) return null;

    const control = target.closest('a.timeline__item__control');
    const item = control?.closest('.timeline__item');
    if (!control || !item || getTimelineCommentControl(item) !== control) return null;

    return {
      control,
      publicUrl: control.dataset.xqPublicComments || getPublicStatusUrl(item),
    };
  }

  function redirectAnonymousCommentClick(event) {
    if (
      !OPTIONS.redirectAnonymousTimelineComments ||
      !isStockPage ||
      !isAnonymousView()
    ) {
      return;
    }

    const context = getCommentClickContext(event.target);
    if (!context) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (!context.publicUrl) {
      showNotice('这条内容暂时没有可打开的公开讨论页');
      return;
    }

    const openInNewTab =
      event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey;
    if (openInNewTab) {
      window.open(context.publicUrl, '_blank', 'noopener');
    } else {
      location.assign(context.publicUrl);
    }
  }

  function scrollToRequestedComments() {
    if (
      didScrollToComments ||
      !isStatusPage ||
      location.hash !== '#xq-comments'
    ) {
      return;
    }

    const commentSection = document.querySelector(
      '.article__comment, .comment__wrap'
    );
    if (!commentSection) return;

    didScrollToComments = true;
    requestAnimationFrame(() => {
      commentSection.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  }

  function watchDimmers(root) {
    for (const dimmer of queryIncludingRoot(root, '.modals.dimmer')) {
      if (watchedDimmers.has(dimmer)) continue;
      watchedDimmers.add(dimmer);
      dimmerObserver.observe(dimmer, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    }
  }

  function processRoot(root) {
    removePromotions(root);
    removeKnownTrackingScripts(root);
    optimizeImages(root);
    decorateTimelineComments(root);
    watchDimmers(root);
    scrollToRequestedComments();
  }

  function sweep() {
    scheduled = false;
    installStyle();
    closeAutomaticLoginModal();
    scrollToRequestedComments();
  }

  function scheduleSweep() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sweep);
  }

  function isManualLoginControl(target) {
    if (!(target instanceof Element)) return false;

    const control = target.closest('a, button, [role="button"], .loginBtn');
    if (!control) return false;
    if (control.matches('.loginBtn') && !control.closest('.modal__login')) return true;

    const text = (control.textContent || '').replace(/\s+/g, '');
    return text === '登录' || text === '登录/注册' || text === '注册/登录';
  }

  function allowManualLogin(event) {
    if (!isManualLoginControl(event.target)) return;

    manualLoginOpen = true;
    manualLoginRequestedUntil = Date.now() + 3000;

    // 清除兜底隐藏标记，让网站自己的登录入口可以重新显示弹窗。
    document
      .querySelectorAll(`.modal__login.${AUTO_HIDDEN_CLASS}`)
      .forEach((modal) => modal.classList.remove(AUTO_HIDDEN_CLASS));

    // 若点击后没有打开登录框，避免误放行稍后出现的自动弹窗。
    window.setTimeout(() => {
      if (
        getVisibleLoginModals().length === 0 &&
        manualLoginRequestedUntil <= Date.now()
      ) {
        manualLoginOpen = false;
        manualLoginRequestedUntil = 0;
      }
    }, 3100);
  }

  const dimmerObserver = new MutationObserver(scheduleSweep);

  function start() {
    installStyle();
    processRoot(document);
    sweep();

    const rootObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) processRoot(node);
        }
      }
      scheduleSweep();
    });

    rootObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
    });

    document.addEventListener('click', redirectAnonymousCommentClick, true);
    document.addEventListener('auxclick', redirectAnonymousCommentClick, true);
    document.addEventListener('click', allowManualLogin, true);
    window.addEventListener('pageshow', () => {
      processRoot(document);
      scheduleSweep();
    });
  }

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
