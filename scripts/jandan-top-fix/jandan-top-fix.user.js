// ==UserScript==
// @name         煎蛋热榜：主题防闪与图片优化
// @namespace    local.jandan.fixes
// @version      1.4.0
// @description  提前恢复主题；已加载媒体的非侵入式显示修复
// @author       techidsk
// @license      MIT
// @homepageURL  https://github.com/techidsk/userscripts/tree/main/scripts/jandan-top-fix
// @supportURL   https://github.com/techidsk/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/jandan-top-fix/jandan-top-fix.user.js
// @updateURL    https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/jandan-top-fix/jandan-top-fix.user.js
// @match        https://jandan.net/*
// @match        https://www.jandan.net/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  // 覆盖全站以兼容从首页进入热榜的单页导航。
  let dark = true;
  try {
    const saved = localStorage.getItem('darkMode');
    dark = saved === null || saved === 'true';
    if (saved === null) localStorage.setItem('darkMode', 'true');
  } catch (error) {
    console.warn('[煎蛋优化] 无法读取本地设置', error);
  }

  function initTheme() {
    if (!document.documentElement) return false;
    document.documentElement.classList.toggle('dark-model', dark);
    const style = document.createElement('style');
    style.textContent = 'html.dark-model{color-scheme:dark;background:#181818}html.dark-model body{background:var(--bg-body,var(--bg-base,#181818))}';
    document.documentElement.append(style);
    return true;
  }
  if (!initTheme()) {
    const boot = new MutationObserver(() => {
      if (initTheme()) boot.disconnect();
    });
    boot.observe(document, { childList: true });
  }

  // 仅用脚本自己的属性和 CSS 兜底；不触碰 Vue 的节点、类和事件。
  const css = `
    .img-frame [data-jd-media-ready="1"].img-hidden {
      opacity:1!important; position:static!important;
      width:auto!important; height:auto!important;
      overflow:visible!important; pointer-events:auto!important;
      max-width:100%;
    }
    .img-frame:has(> [data-jd-media-ready="1"]) > .img-placeholder {
      display:none!important;
    }
  `;
  function start() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    function update() {
      if (document.hidden) return;
      document.querySelectorAll('.img-frame img:not(.img-placeholder), .img-frame video').forEach(media => {
        const video = media.tagName === 'VIDEO';
        if (!video) {
          // 网站用 img-hidden 隐藏未完成的图片，不适合额外加懒加载门槛。
          media.loading = 'eager';
          media.fetchPriority = 'auto';
        }
        const ready = video ? media.readyState >= 2 : media.complete && media.naturalWidth > 0;
        if (ready) media.setAttribute('data-jd-media-ready', '1');
        else media.removeAttribute('data-jd-media-ready');
      });
    }
    update();
    setInterval(update, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
