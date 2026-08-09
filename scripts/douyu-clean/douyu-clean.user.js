// ==UserScript==
// @name         斗鱼极简直播间
// @namespace    https://www.douyu.com/
// @version      1.2.0
// @description  清理斗鱼直播间的活动与特效，屏蔽统计追踪，默认网页全屏并自动选择最高可用画质。
// @author       techidsk
// @license      MIT
// @homepageURL  https://github.com/techidsk/userscripts/tree/main/scripts/douyu-clean
// @supportURL   https://github.com/techidsk/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/douyu-clean/douyu-clean.user.js
// @updateURL    https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/douyu-clean/douyu-clean.user.js
// @match        https://www.douyu.com/*
// @match        http://www.douyu.com/*
// @match        https://douyu.com/*
// @match        http://douyu.com/*
// @run-at       document-start
// @noframes
// @sandbox      raw
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const ROOT_CLASS = 'dy-clean-room';
  const QUALITY_LABEL_PATTERN =
    /(?:原画|蓝光|超清|高清|流畅|标清|极速|省流|(?:8|4|2)K|(?:2160|1440|1080|720|540|480|360)P)/i;
  const QUALITY_BLOCKED_PATTERN =
    /(?:不可用|暂不可用|需登录|登录后|开通|会员专享|贵族专享|付费|未解锁|disabled?|locked?|unavailable|vip|member|login-required)/i;
  const OBSERVED_WIDGET_SELECTOR = [
    '#js-player-main',
    '#js-player-video-case',
    '#__video_container',
    '#room-html5-player',
    '#douyu_room_normal_player_proxy_box',
    '[class*="Effect" i] video',
    '[class*="Svga" i] video',
    '[class*="VapPlayer" i] video',
    '[class*="mp4Eff" i] video',
    '[class*="Gift" i] video',
    '#js-player-effect video',
    '#js-player-video-above video',
  ].join(',');
  let cleanModeEnabled = true;
  let syncScheduled = false;
  let qualityTimerId = null;
  const qualitySelectionState = {
    route: '',
    control: null,
    configured: false,
    retryDeadline: 0,
  };

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const TRACKING_HOSTS = new Set([
    'apm.douyucdn.cn',
    'uact.douyucdn.cn',
    'dotcounter.douyucdn.cn',
    'dotserver.douyucdn.cn',
    'dotab.douyucdn.cn',
    'dotexperiment.douyucdn.cn',
    'dotbeats.douyucdn.cn',
    'p2perrorlog.douyucdn.cn',
    'abvolcapi.douyucdn.cn',
    'rtbapi.douyucdn.cn',
    'beacon.cdn.qq.com',
    'hm.baidu.com',
    'hmcdn.baidu.com',
    'www.googletagmanager.com',
    'googletagmanager.com',
    'www.google-analytics.com',
    'google-analytics.com',
  ]);
  const TRACKING_HOST_SUFFIXES = [
    '.google-analytics.com',
    '.googletagmanager.com',
    '.doubleclick.net',
    '.beacon.qq.com',
    '.cnzz.com',
  ];
  const TRACKING_PATH_PATTERN =
    /\/(?:deliver\/(?:perform|fish2)|fish3\/1\.gif|errorlogreport|beats|lapi\/sign\/web\/(?:rtpv|click)|fedbasic\/ad-report\/|log-sdk\/collect\/|beacon_web(?:\.min)?\.js|hm\.(?:js|gif)|gtag\/js)/i;
  const TRACKING_RESPONSE_BODY = JSON.stringify({
    error: 0,
    code: 0,
    status: 0,
    data: { interval: 60_000 },
  });
  const TRANSPARENT_PIXEL =
    'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const privacyStats = {
    total: 0,
    byKind: Object.create(null),
    byHost: Object.create(null),
  };

  function toRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;

    try {
      return String(input || '');
    } catch {
      return '';
    }
  }

  function parseRequestUrl(input) {
    const rawUrl = toRequestUrl(input);
    if (!rawUrl) return null;

    try {
      return new pageWindow.URL(rawUrl, pageWindow.location.href);
    } catch {
      return null;
    }
  }

  function isTrackingUrl(input) {
    const url = parseRequestUrl(input);
    if (!url || !/^https?:$/.test(url.protocol)) return false;

    const host = url.hostname.toLowerCase();
    if (TRACKING_HOSTS.has(host)) return true;
    if (TRACKING_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;

    return TRACKING_PATH_PATTERN.test(`${url.pathname}${url.search}`);
  }

  function recordBlockedRequest(input, kind) {
    const url = parseRequestUrl(input);
    const host = url?.hostname || 'unknown';

    privacyStats.total += 1;
    privacyStats.byKind[kind] = (privacyStats.byKind[kind] || 0) + 1;
    privacyStats.byHost[host] = (privacyStats.byHost[host] || 0) + 1;
  }

  function createTrackingResponse() {
    return new pageWindow.Response(TRACKING_RESPONSE_BODY, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function createBlockedScriptUrl(input) {
    const url = parseRequestUrl(input);
    const callback = url?.searchParams.get('callback') || url?.searchParams.get('cb');
    const validCallback =
      callback && /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(callback);
    const source = validCallback
      ? `try{${callback}({error:0,code:0,data:[]})}catch(e){}`
      : 'void 0;';

    return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
  }

  function replacementUrlForElement(element, input) {
    const tagName = element?.tagName?.toLowerCase();

    if (tagName === 'script') return createBlockedScriptUrl(input);
    if (tagName === 'img' || tagName === 'source') return TRANSPARENT_PIXEL;
    if (tagName === 'iframe') return 'about:blank';
    if (tagName === 'link') return 'data:text/plain,';

    return 'about:blank';
  }

  function replacePageFunction(target, property, replacement) {
    try {
      Object.defineProperty(target, property, {
        configurable: true,
        writable: true,
        value: replacement,
      });
      return true;
    } catch {
      try {
        target[property] = replacement;
        return true;
      } catch {
        return false;
      }
    }
  }

  function patchFetch() {
    const nativeFetch = pageWindow.fetch;
    if (typeof nativeFetch !== 'function') return;

    replacePageFunction(pageWindow, 'fetch', function privacyFetch(input, init) {
      if (isTrackingUrl(input)) {
        recordBlockedRequest(input, 'fetch');
        return pageWindow.Promise.resolve(createTrackingResponse());
      }

      return pageWindow.Reflect.apply(nativeFetch, this, [input, init]);
    });
  }

  function patchSendBeacon() {
    const navigatorObject = pageWindow.navigator;
    const nativeSendBeacon = navigatorObject?.sendBeacon;
    if (typeof nativeSendBeacon !== 'function') return;

    replacePageFunction(navigatorObject, 'sendBeacon', function privacySendBeacon(url, data) {
      if (isTrackingUrl(url)) {
        recordBlockedRequest(url, 'beacon');
        return true;
      }

      return nativeSendBeacon.call(this, url, data);
    });
  }

  function patchXmlHttpRequest() {
    const Xhr = pageWindow.XMLHttpRequest;
    if (!Xhr?.prototype) return;

    const nativeOpen = Xhr.prototype.open;
    const nativeSend = Xhr.prototype.send;
    const blockedFlag = Symbol('dyCleanBlockedXhr');
    let localResponseUrl = '';

    try {
      localResponseUrl = pageWindow.URL.createObjectURL(
        new pageWindow.Blob([TRACKING_RESPONSE_BODY], { type: 'application/json' }),
      );
    } catch {
      localResponseUrl = `data:application/json,${encodeURIComponent(TRACKING_RESPONSE_BODY)}`;
    }

    replacePageFunction(Xhr.prototype, 'open', function privacyXhrOpen(method, url, ...rest) {
      this[blockedFlag] = isTrackingUrl(url);

      if (this[blockedFlag]) {
        recordBlockedRequest(url, 'xhr');
        const async = rest.length === 0 || rest[0] !== false;
        return nativeOpen.call(this, 'GET', localResponseUrl, async);
      }

      return nativeOpen.call(this, method, url, ...rest);
    });

    replacePageFunction(Xhr.prototype, 'send', function privacyXhrSend(body) {
      return nativeSend.call(this, this[blockedFlag] ? null : body);
    });
  }

  function patchUrlProperty(Constructor, property, kind) {
    const prototype = Constructor?.prototype;
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, property);
    if (!descriptor?.get || !descriptor?.set) return;

    try {
      Object.defineProperty(prototype, property, {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) {
          if (isTrackingUrl(value)) {
            recordBlockedRequest(value, kind);
            return descriptor.set.call(this, replacementUrlForElement(this, value));
          }

          return descriptor.set.call(this, value);
        },
      });
    } catch {
      // 某些浏览器不允许重定义原生 DOM setter，其他拦截层仍会继续工作。
    }
  }

  function patchElementAttributes() {
    const ElementConstructor = pageWindow.Element;
    const nativeSetAttribute = ElementConstructor?.prototype?.setAttribute;
    if (typeof nativeSetAttribute !== 'function') return;

    replacePageFunction(
      ElementConstructor.prototype,
      'setAttribute',
      function privacySetAttribute(name, value) {
        const attributeName = String(name).toLowerCase();
        const isUrlAttribute = attributeName === 'src' || attributeName === 'href';

        if (isUrlAttribute && isTrackingUrl(value)) {
          recordBlockedRequest(value, 'element');
          return nativeSetAttribute.call(
            this,
            name,
            replacementUrlForElement(this, value),
          );
        }

        return nativeSetAttribute.call(this, name, value);
      },
    );
  }

  function createNoopProxy() {
    const noop = () => undefined;
    let proxy = noop;

    if (typeof pageWindow.Proxy === 'function') {
      proxy = new pageWindow.Proxy(noop, {
        apply: () => undefined,
        construct: () => proxy,
        get: (_target, property) => (property === 'then' ? undefined : proxy),
      });
    }

    return proxy;
  }

  function installGlobalTrackingNoops() {
    const defineSink = (name, value) => {
      try {
        Object.defineProperty(pageWindow, name, {
          configurable: true,
          get: () => value,
          set: () => undefined,
        });
      } catch {
        // URL/API 层仍会拦截实际请求。
      }
    };

    const collectEvent = (command, ...args) => {
      const callback = [...args].reverse().find((item) => typeof item === 'function');
      if (!callback) return undefined;

      pageWindow.queueMicrotask(() => {
        if (command === 'getToken') {
          callback({ ssid: '', web_id: '' });
        } else if (command === 'getAllVars') {
          callback({});
        } else if (command === 'getVar') {
          callback(args[1]);
        }
      });

      return undefined;
    };

    const silentArray = [];
    silentArray.push = () => 0;
    const silentDataLayer = [];
    silentDataLayer.push = () => 0;

    defineSink('collectEvent', collectEvent);
    defineSink('DYAPM', createNoopProxy());
    defineSink('BeaconAction', createNoopProxy());
    defineSink('adReport', createNoopProxy());
    defineSink('_hmt', silentArray);
    defineSink('dataLayer', silentDataLayer);
    defineSink('gtag', () => undefined);
  }

  function installPrivacyProtection() {
    patchFetch();
    patchSendBeacon();
    patchXmlHttpRequest();
    patchElementAttributes();

    patchUrlProperty(pageWindow.HTMLScriptElement, 'src', 'script');
    patchUrlProperty(pageWindow.HTMLImageElement, 'src', 'image');
    patchUrlProperty(pageWindow.HTMLIFrameElement, 'src', 'iframe');
    patchUrlProperty(pageWindow.HTMLLinkElement, 'href', 'link');
    patchUrlProperty(pageWindow.HTMLSourceElement, 'src', 'source');

    installGlobalTrackingNoops();
  }

  function getPrivacyStatsMessage() {
    const kinds = Object.entries(privacyStats.byKind)
      .sort((left, right) => right[1] - left[1])
      .map(([kind, count]) => `${kind}: ${count}`)
      .join('，');
    const hosts = Object.entries(privacyStats.byHost)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .map(([host, count]) => `${host}: ${count}`)
      .join('\n');

    return [
      `本页已拦截 ${privacyStats.total} 次追踪请求。`,
      kinds ? `类型：${kinds}` : '',
      hosts ? `\n主要来源：\n${hosts}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  installPrivacyProtection();

  const css = String.raw`
    /* 只在检测到直播播放器后生效，避免影响斗鱼首页和分类页。 */
    html.${ROOT_CLASS},
    html.${ROOT_CLASS} body {
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      overscroll-behavior: none !important;
      background: #000 !important;
      background-image: none !important;
    }

    html.${ROOT_CLASS} body::before,
    html.${ROOT_CLASS} body::after {
      display: none !important;
      content: none !important;
      background: none !important;
    }

    /* 顶栏、活动入口、主播信息、右侧聊天/榜单、礼物栏和底部长内容。 */
    html.${ROOT_CLASS} #js-header,
    html.${ROOT_CLASS} body > header,
    html.${ROOT_CLASS} body > aside,
    html.${ROOT_CLASS} #js-super-menu,
    html.${ROOT_CLASS} #js-room-top-banner,
    html.${ROOT_CLASS} #js-player-main > [class*="player__"] > [class*="title__"],
    html.${ROOT_CLASS} #js-player-main > [class*="player__"] > [class*="interactive__"],
    html.${ROOT_CLASS} #js-player-main ~ [class*="sidebar__"],
    html.${ROOT_CLASS} #js-player-asideTopSuspension,
    html.${ROOT_CLASS} #js-player-asideMain,
    html.${ROOT_CLASS} #js-player-interactive-panel,
    html.${ROOT_CLASS} #js-player-toolbar,
    html.${ROOT_CLASS} #js-player-above-controller,
    html.${ROOT_CLASS} #js-room-activity,
    html.${ROOT_CLASS} #js-room-snapbar,
    html.${ROOT_CLASS} #js-bottom-left,
    html.${ROOT_CLASS} #webm-site-room-player-bottom,
    html.${ROOT_CLASS} #yuba-bottom-region,
    html.${ROOT_CLASS} #yuba-hot-topic-portal,
    html.${ROOT_CLASS} #new-kill-ie,
    html.${ROOT_CLASS} .CustomGroup,
    html.${ROOT_CLASS} #AnchorInteractiveTool {
      display: none !important;
    }

    /* 贵族、VIP、喇叭、超级弹幕、礼物广播和活动组件。 */
    html.${ROOT_CLASS} [class*="Noble" i],
    html.${ROOT_CLASS} [class*="VIP" i],
    html.${ROOT_CLASS} [class*="Horn" i],
    html.${ROOT_CLASS} [class*="SuperBarrage" i],
    html.${ROOT_CLASS} [class*="SuperDanmu" i],
    html.${ROOT_CLASS} [class*="HigherBarrage" i],
    html.${ROOT_CLASS} [class*="higherDiv" i],
    html.${ROOT_CLASS} [class*="retentionDanmu" i],
    html.${ROOT_CLASS} [class*="BarrageBanner" i],
    html.${ROOT_CLASS} [class*="topFloater" i],
    html.${ROOT_CLASS} [class*="Broadcast" i],
    html.${ROOT_CLASS} [class*="Recharge" i],
    html.${ROOT_CLASS} [class*="Gift" i],
    html.${ROOT_CLASS} [class*="Activity" i],
    html.${ROOT_CLASS} [id*="activity" i],
    html.${ROOT_CLASS} #comment-higher-container,
    html.${ROOT_CLASS} #douyu_room_normal_player_danmuDom,
    html.${ROOT_CLASS} #douyu_room_normal_player_danmuDom_barrage,
    html.${ROOT_CLASS} #actRandomEffectGiftBanner,
    html.${ROOT_CLASS} #liveActivityGiftHallEnter202308,
    html.${ROOT_CLASS} #giftNamingEnter,
    html.${ROOT_CLASS} #TestGetAnchorEnter {
      display: none !important;
    }

    /* SVGA/VAP/MP4、入场动画、礼物动画、烟花和播放器挂件。 */
    html.${ROOT_CLASS} [class*="Effect" i],
    html.${ROOT_CLASS} [class*="Svga" i],
    html.${ROOT_CLASS} [class*="VapPlayer" i],
    html.${ROOT_CLASS} [class*="spinePlayer" i],
    html.${ROOT_CLASS} [class*="mp4Eff" i],
    html.${ROOT_CLASS} [class*="Fireworks" i],
    html.${ROOT_CLASS} [class*="DiamondsFans" i],
    html.${ROOT_CLASS} [class*="Pendant" i],
    html.${ROOT_CLASS} .DrawContainer,
    html.${ROOT_CLASS} .XinghaiAd,
    html.${ROOT_CLASS} #js-player-effect,
    html.${ROOT_CLASS} #js-spine-player,
    html.${ROOT_CLASS} #js-svgaV1-player,
    html.${ROOT_CLASS} #js-player-pendant,
    html.${ROOT_CLASS} #js-player-guessgame,
    html.${ROOT_CLASS} #js-player-video-above,
    html.${ROOT_CLASS} #__hyad {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    /* 页面皮肤和装饰背景；播放器按钮图标不受影响。 */
    html.${ROOT_CLASS} body,
    html.${ROOT_CLASS} body > main,
    html.${ROOT_CLASS} [class*="stage__"],
    html.${ROOT_CLASS} #js-player-main,
    html.${ROOT_CLASS} #js-player-main > [class*="player__"],
    html.${ROOT_CLASS} #js-player-main [class*="stream__"],
    html.${ROOT_CLASS} #js-player-main [class*="video__"] {
      background-color: #000 !important;
      background-image: none !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    html.${ROOT_CLASS} [class*="stage__"] {
      --stage-gap: 0px !important;
      --stage-info-height: 0px !important;
      --stage-interactive-height: 0px !important;
      --stage-player-gap-top: 0px !important;
      --stage-player-gap-bottom: 0px !important;
      --stage-border-radius: 0px !important;
    }

    html.${ROOT_CLASS} [data-role*="background" i],
    html.${ROOT_CLASS} [class*="roomBackground" i],
    html.${ROOT_CLASS} [class*="room-background" i],
    html.${ROOT_CLASS} [class*="pageBackground" i],
    html.${ROOT_CLASS} [class*="page-background" i],
    html.${ROOT_CLASS} [class*="roomSkin" i],
    html.${ROOT_CLASS} [class*="room-skin" i],
    html.${ROOT_CLASS} [id*="roomBackground" i],
    html.${ROOT_CLASS} [id*="roomSkin" i],
    html.${ROOT_CLASS} [class*="RecommendBgimg" i],
    html.${ROOT_CLASS} [class*="RecommendBgmask" i],
    html.${ROOT_CLASS} [class*="customBc-" i] {
      display: none !important;
      background: none !important;
      background-image: none !important;
    }

    /* 默认网页全屏：播放器铺满当前标签页，保留普通弹幕和播放器控制条。 */
    html.${ROOT_CLASS} #js-player-main {
      position: fixed !important;
      inset: 0 !important;
      z-index: 999999 !important;
      display: block !important;
      width: 100vw !important;
      height: 100vh !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    html.${ROOT_CLASS} #js-player-main > [class*="player__"],
    html.${ROOT_CLASS} #js-player-main [class*="stream__"],
    html.${ROOT_CLASS} #js-player-main [class*="video__"],
    html.${ROOT_CLASS} #js-web-stream,
    html.${ROOT_CLASS} #js-player-dialog,
    html.${ROOT_CLASS} #js-player-video-case,
    html.${ROOT_CLASS} #js-player-video,
    html.${ROOT_CLASS} #js-player-video > div,
    html.${ROOT_CLASS} #js-player-multiContainer,
    html.${ROOT_CLASS} #js-player-video-first,
    html.${ROOT_CLASS} #__video_container,
    html.${ROOT_CLASS} #js-player-video-widgets,
    html.${ROOT_CLASS} .room-Player-Box,
    html.${ROOT_CLASS} #douyu_room_normal_player_proxy_box,
    html.${ROOT_CLASS} #room-html5-player,
    html.${ROOT_CLASS} #__h5player,
    html.${ROOT_CLASS} #player-control-video {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      transform: none !important;
      border: 0 !important;
      border-radius: 0 !important;
    }

    html.${ROOT_CLASS} #js-player-main video {
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      max-height: none !important;
      object-fit: contain !important;
      background: #000 !important;
    }

    html.${ROOT_CLASS} #js-player-main [class*="case__"] {
      right: 0 !important;
      bottom: 0 !important;
      left: 0 !important;
      width: 100% !important;
      padding: 0 !important;
      transform: none !important;
    }

    html.${ROOT_CLASS} #js-player-controlbar {
      position: relative !important;
      z-index: 1000001 !important;
      width: 100% !important;
      margin: 0 !important;
    }

    html.${ROOT_CLASS} :fullscreen,
    html.${ROOT_CLASS} :fullscreen #js-player-main {
      background: #000 !important;
    }
  `;

  if (typeof GM_addStyle === 'function') {
    GM_addStyle(css);
  } else {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function hasLivePlayer() {
    return Boolean(
      document.getElementById('js-player-main') &&
      document.querySelector(
        '#js-player-video-case, #__video_container, #room-html5-player, #douyu_room_normal_player_proxy_box',
      )
    );
  }

  function pauseEffectVideos() {
    const selector = [
      '[class*="Effect" i] video',
      '[class*="Svga" i] video',
      '[class*="VapPlayer" i] video',
      '[class*="mp4Eff" i] video',
      '[class*="Gift" i] video',
      '#js-player-effect video',
      '#js-player-video-above video',
    ].join(',');

    for (const media of document.querySelectorAll(selector)) {
      if (media.closest('#js-player-video-first, #room-html5-player, #player-control-video')) {
        continue;
      }

      media.muted = true;
      media.pause?.();
    }
  }

  function normalizeQualityText(element) {
    return (element.textContent || '').replace(/\s+/g, '').trim();
  }

  function findQualityOptions(control) {
    const groups = new Map();

    for (const item of control.querySelectorAll('li')) {
      const text = normalizeQualityText(item);
      if (!QUALITY_LABEL_PATTERN.test(text)) continue;

      const list = item.parentElement;
      if (!list) continue;

      if (!groups.has(list)) groups.set(list, []);
      groups.get(list).push(item);
    }

    return [...groups.values()].sort((left, right) => right.length - left.length)[0] || [];
  }

  function isSelectableQuality(item) {
    if (
      item.matches(
        ':disabled, [disabled], [aria-disabled="true"], [data-disabled="true"], [data-locked="true"]',
      )
    ) {
      return false;
    }

    const attributes = [...item.attributes].map(({ name, value }) => `${name}=${value}`).join(' ');
    const hint = `${normalizeQualityText(item)} ${item.className || ''} ${attributes}`;
    if (QUALITY_BLOCKED_PATTERN.test(hint)) return false;

    if (
      item.querySelector(
        '[class*="disabled" i], [class*="locked" i], [class*="lock-" i], [class*="vip" i], [class*="member" i], [class*="login" i]',
      )
    ) {
      return false;
    }

    // 当前已选项有时会被设为 pointer-events:none，它仍然是有效画质。
    return isSelectedQuality(item) || getComputedStyle(item).pointerEvents !== 'none';
  }

  function isSelectedQuality(item) {
    return (
      item.getAttribute('aria-selected') === 'true' ||
      /(?:selected|active|current|checked)/i.test(String(item.className || ''))
    );
  }

  function refreshQualitySelectionState(control) {
    const route = `${location.pathname}${location.search}`;
    if (qualitySelectionState.route === route && qualitySelectionState.control === control) return;

    qualitySelectionState.route = route;
    qualitySelectionState.control = control;
    qualitySelectionState.configured = false;
    qualitySelectionState.retryDeadline = Date.now() + 60_000;
  }

  function selectHighestAvailableQuality() {
    const control = document.getElementById('js-player-controlbar');
    if (!control) return false;

    refreshQualitySelectionState(control);
    if (qualitySelectionState.configured) return true;

    const options = findQualityOptions(control);
    if (options.length === 0) return false;

    // 斗鱼当前菜单按画质从高到低排列，跳过登录、会员或其他锁定项。
    const highest = options.find(isSelectableQuality);
    if (!highest) return false;

    const selected = options.find(isSelectedQuality);
    const qualityName = normalizeQualityText(highest);

    if (selected !== highest) {
      highest.click();
      console.info(`[斗鱼极简直播间] 已自动选择最高可用画质：${qualityName}`);
    }

    // 同一个播放器只自动设置一次，之后尊重用户手动切换的选择。
    qualitySelectionState.configured = true;
    return true;
  }

  function scheduleHighestQualitySelection(delay = 1_200) {
    const control = document.getElementById('js-player-controlbar');
    if (!control) return;

    refreshQualitySelectionState(control);
    if (qualitySelectionState.configured || qualityTimerId !== null) return;
    if (Date.now() > qualitySelectionState.retryDeadline) return;

    qualityTimerId = window.setTimeout(() => {
      qualityTimerId = null;

      if (!selectHighestAvailableQuality()) {
        scheduleHighestQualitySelection(1_000);
      }
    }, delay);
  }

  function retryHighestQualitySelection() {
    qualitySelectionState.configured = false;
    qualitySelectionState.retryDeadline = Date.now() + 60_000;
    scheduleHighestQualitySelection(0);
  }

  function syncCleanMode() {
    syncScheduled = false;
    const livePlayerAvailable = hasLivePlayer();
    const shouldEnable = cleanModeEnabled && livePlayerAvailable;
    document.documentElement.classList.toggle(ROOT_CLASS, shouldEnable);

    if (shouldEnable) {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      pauseEffectVideos();
    }

    if (livePlayerAvailable) {
      scheduleHighestQualitySelection();
    }
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    window.setTimeout(syncCleanMode, 80);
  }

  function mutationsNeedSync(records) {
    for (const record of records) {
      if (
        !qualitySelectionState.configured &&
        record.target?.nodeType === Node.ELEMENT_NODE &&
        record.target.closest?.('#js-player-controlbar')
      ) {
        return true;
      }

      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.(OBSERVED_WIDGET_SELECTOR)) return true;
        if (node.querySelector?.(OBSERVED_WIDGET_SELECTOR)) return true;
      }
    }

    return false;
  }

  function toggleCleanMode() {
    cleanModeEnabled = !cleanModeEnabled;
    syncCleanMode();
  }

  async function toggleNativeFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      const target = document.getElementById('js-player-main') || document.documentElement;
      await target.requestFullscreen();
    } catch (error) {
      console.info('[斗鱼极简直播间] 浏览器拒绝进入原生全屏，请再按一次 Shift+F。', error);
    }
  }

  function onKeydown(event) {
    if (event.repeat) return;

    if (event.altKey && event.shiftKey && event.code === 'KeyD') {
      event.preventDefault();
      toggleCleanMode();
      return;
    }

    if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyF') {
      event.preventDefault();
      void toggleNativeFullscreen();
    }
  }

  document.addEventListener('keydown', onKeydown, true);

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('切换极简模式（Alt+Shift+D）', toggleCleanMode);
    GM_registerMenuCommand('重新选择最高可用画质', retryHighestQualitySelection);
    GM_registerMenuCommand('查看本页追踪拦截统计', () => {
      pageWindow.alert(getPrivacyStatsMessage());
    });
    GM_registerMenuCommand('进入/退出原生全屏（Shift+F）', () => void toggleNativeFullscreen());
  }

  const startObserver = () => {
    const observer = new MutationObserver((records) => {
      if (mutationsNeedSync(records)) scheduleSync();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleSync();
  };

  if (document.documentElement) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  }

  window.addEventListener('popstate', scheduleSync);
  window.addEventListener('hashchange', scheduleSync);
})();
