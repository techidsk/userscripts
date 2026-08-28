// ==UserScript==
// @name         Bilibili 视频下载助手
// @namespace    https://github.com/techidsk/userscripts
// @version      1.0.2
// @description  在 Bilibili 普通视频页下载当前分 P 的兼容版，或分别下载高清 DASH 视频与音频轨道。
// @author       techidsk
// @license      MIT
// @homepageURL  https://github.com/techidsk/userscripts/tree/main/scripts/bilibili-video-downloader
// @supportURL   https://github.com/techidsk/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/bilibili-video-downloader/bilibili-video-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/bilibili-video-downloader/bilibili-video-downloader.user.js
// @match        https://www.bilibili.com/video/*
// @match        https://m.bilibili.com/video/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_download
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @connect      bilivideo.com
// @connect      bilivideo.cn
// @connect      akamaized.net
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const API_ORIGIN = 'https://api.bilibili.com';
  const QUALITY_NAMES = new Map([
    [127, '8K 超高清'],
    [126, '杜比视界'],
    [125, 'HDR 真彩'],
    [120, '4K 超清'],
    [116, '1080P 60帧'],
    [112, '1080P 高码率'],
    [100, '智能修复'],
    [80, '1080P'],
    [74, '720P 60帧'],
    [64, '720P'],
    [32, '480P'],
    [16, '360P'],
    [6, '240P'],
  ]);

  const state = {
    videoInfo: null,
    pageIndex: 0,
    dashData: null,
    progressiveData: null,
    videoTracks: [],
    audioTracks: [],
    downloadTasks: [],
    loadToken: 0,
    actionBusy: false,
  };

  const host = document.createElement('div');
  host.id = 'bilibili-video-downloader-host';
  host.dataset.placement = 'floating';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        display: block;
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
          "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      }

      *, *::before, *::after { box-sizing: border-box; }
      [hidden] { display: none !important; }
      button, select, textarea { font: inherit; }

      .launcher {
        position: fixed;
        right: 18px;
        top: 52%;
        z-index: 2147483645;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 42px;
        padding: 0 15px;
        border: 0;
        border-radius: 999px;
        color: #fff;
        background: linear-gradient(135deg, #fb7299, #f24b7c);
        box-shadow: 0 8px 24px rgb(251 114 153 / 35%);
        cursor: pointer;
        font-size: 14px;
        font-weight: 650;
        transition: transform 140ms ease, box-shadow 140ms ease;
      }

      .launcher:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 28px rgb(251 114 153 / 45%);
      }

      .launcher-icon {
        flex: 0 0 auto;
        width: 18px;
        height: 18px;
      }

      :host([data-placement="toolbar"]) {
        display: block;
        flex: 0 0 var(--bili-toolbar-item-width, 92px);
        width: var(--bili-toolbar-item-width, 92px);
        height: 28px;
        margin-right: var(--bili-toolbar-item-margin, 8px);
      }

      :host([data-placement="toolbar"]) .launcher {
        position: static;
        justify-content: flex-start;
        width: 100%;
        min-height: 28px;
        height: 28px;
        padding: 0;
        border-radius: 0;
        color: #61666d;
        background: transparent;
        box-shadow: none;
        font-size: 14px;
        font-weight: 400;
        gap: 8px;
        transform: none;
      }

      :host([data-placement="toolbar"]) .launcher:hover {
        color: #00aeec;
        background: transparent;
        box-shadow: none;
        transform: none;
      }

      :host([data-placement="toolbar"]) .launcher-icon {
        width: 28px;
        height: 28px;
      }

      :host([data-placement="dialog"]) .launcher { display: none; }

      .launcher:focus-visible,
      button:focus-visible,
      select:focus-visible,
      textarea:focus-visible {
        outline: 3px solid rgb(0 174 236 / 28%);
        outline-offset: 2px;
      }

      .overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgb(15 23 42 / 54%);
        backdrop-filter: blur(4px);
      }

      .dialog {
        width: min(680px, calc(100vw - 24px));
        max-height: min(820px, calc(100vh - 30px));
        overflow: auto;
        color: #18191c;
        background: #fff;
        border: 1px solid #e3e5e7;
        border-radius: 18px;
        box-shadow: 0 24px 70px rgb(0 0 0 / 24%);
      }

      .header {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 20px;
        background: rgb(255 255 255 / 94%);
        border-bottom: 1px solid #e3e5e7;
        backdrop-filter: blur(10px);
      }

      .header h2 {
        margin: 0;
        font-size: 18px;
        line-height: 1.35;
      }

      .close {
        flex: 0 0 auto;
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 50%;
        color: #61666d;
        background: #f1f2f3;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
      }

      .body { padding: 20px; }

      .video-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        line-height: 1.55;
        overflow-wrap: anywhere;
      }

      .video-meta {
        margin: 6px 0 0;
        color: #9499a0;
        font-size: 13px;
        line-height: 1.5;
      }

      .status {
        margin: 16px 0;
        padding: 11px 13px;
        border-radius: 10px;
        color: #24516c;
        background: #edf8fc;
        border: 1px solid #ccecf7;
        font-size: 13px;
        line-height: 1.55;
      }

      .status[data-tone="success"] {
        color: #28623c;
        background: #effaf2;
        border-color: #ccebd4;
      }

      .status[data-tone="error"] {
        color: #8f2c36;
        background: #fff1f2;
        border-color: #fecdd3;
      }

      .status[data-tone="warning"] {
        color: #7a4a13;
        background: #fff8e8;
        border-color: #f7dfaa;
      }

      .section {
        margin-top: 16px;
        padding: 16px;
        border: 1px solid #e3e5e7;
        border-radius: 14px;
        background: #fff;
      }

      .download-tasks {
        scroll-margin: 12px;
        border-color: #b8e7f8;
        background: #f8fdff;
      }

      .download-summary {
        flex: 0 0 auto;
        color: #00a1d6;
        font-size: 12px;
        font-weight: 700;
      }

      .download-task-list {
        display: grid;
        gap: 10px;
      }

      .download-task {
        padding: 11px 12px;
        border: 1px solid #e3e5e7;
        border-radius: 10px;
        background: #fff;
      }

      .download-task-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .download-task-label {
        min-width: 0;
        color: #18191c;
        font-size: 13px;
        font-weight: 700;
      }

      .download-task-state {
        flex: 0 0 auto;
        color: #00a1d6;
        font-size: 12px;
        font-weight: 700;
      }

      .download-task-name {
        margin-top: 4px;
        overflow: hidden;
        color: #9499a0;
        font-size: 11px;
        line-height: 1.4;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .download-task-progress {
        height: 6px;
        margin-top: 9px;
        overflow: hidden;
        border-radius: 999px;
        background: #e8f3f8;
      }

      .download-task-progress-bar {
        width: 0;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #00aeec, #48c8f3);
        transition: width 180ms ease;
      }

      .download-task-progress-bar[data-indeterminate="true"] {
        width: 38%;
        animation: download-progress-indeterminate 1.1s ease-in-out infinite;
      }

      .download-task-detail {
        margin-top: 6px;
        color: #61666d;
        font-size: 11px;
        line-height: 1.4;
      }

      .download-task[data-state="complete"] .download-task-state { color: #2f8f4e; }
      .download-task[data-state="complete"] .download-task-progress-bar { background: #4fbd75; }
      .download-task[data-state="error"] .download-task-state { color: #d64252; }
      .download-task[data-state="error"] .download-task-progress-bar { background: #f06a77; }
      .download-task[data-state="retrying"] .download-task-state { color: #c97919; }

      @keyframes download-progress-indeterminate {
        from { transform: translateX(-115%); }
        to { transform: translateX(305%); }
      }

      @media (prefers-reduced-motion: reduce) {
        .download-task-progress-bar[data-indeterminate="true"] {
          animation: none;
          transform: translateX(80%);
        }
      }

      .section-title-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .section h3 {
        margin: 0;
        font-size: 15px;
        line-height: 1.45;
      }

      .hint {
        margin: 4px 0 0;
        color: #9499a0;
        font-size: 12px;
        line-height: 1.5;
      }

      .field { margin-top: 12px; }
      .field:first-child { margin-top: 0; }

      .field label {
        display: block;
        margin-bottom: 6px;
        color: #61666d;
        font-size: 13px;
        font-weight: 650;
      }

      select, textarea {
        width: 100%;
        color: #18191c;
        background: #f6f7f8;
        border: 1px solid #d9dde1;
        border-radius: 9px;
      }

      select {
        min-height: 40px;
        padding: 7px 36px 7px 10px;
      }

      textarea {
        min-height: 74px;
        padding: 10px;
        resize: vertical;
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        line-height: 1.5;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        margin-top: 14px;
      }

      .button {
        min-height: 38px;
        padding: 0 14px;
        border: 1px solid #d9dde1;
        border-radius: 9px;
        color: #18191c;
        background: #fff;
        cursor: pointer;
        font-size: 13px;
        font-weight: 650;
      }

      .button:hover:not(:disabled) { background: #f6f7f8; }

      .button.primary {
        color: #fff;
        background: #00aeec;
        border-color: #00aeec;
      }

      .button.primary:hover:not(:disabled) { background: #00a1d6; }

      .button.pink {
        color: #fff;
        background: #fb7299;
        border-color: #fb7299;
      }

      .button.pink:hover:not(:disabled) { background: #f15f8a; }

      .button:disabled, select:disabled {
        opacity: 0.52;
        cursor: not-allowed;
      }

      .footer-note {
        margin: 16px 2px 2px;
        color: #9499a0;
        font-size: 12px;
        line-height: 1.6;
      }

      .footer-note strong { color: #61666d; }

      @media (max-width: 640px) {
        :host(:not([data-placement="toolbar"])) .launcher {
          right: 12px;
          top: auto;
          bottom: 22px;
        }

        .overlay { padding: 8px; align-items: flex-end; }
        .dialog {
          width: 100%;
          max-height: calc(100vh - 16px);
          border-radius: 18px 18px 10px 10px;
        }
        .header, .body { padding-left: 15px; padding-right: 15px; }
        .actions { display: grid; grid-template-columns: 1fr; }
        .button { width: 100%; }
      }
    </style>

    <button id="launcher" class="launcher" type="button" title="下载当前视频" aria-label="打开 Bilibili 视频下载助手">
      <svg class="launcher-icon" viewBox="0 0 28 28" aria-hidden="true">
        <path fill="currentColor" d="M12.75 3.5a1.25 1.25 0 0 1 2.5 0v11.98l3.62-3.62a1.25 1.25 0 1 1 1.76 1.77l-5.75 5.75a1.25 1.25 0 0 1-1.76 0l-5.75-5.75a1.25 1.25 0 0 1 1.76-1.77l3.62 3.62V3.5Z"/>
        <path fill="currentColor" d="M5.25 20a1.25 1.25 0 0 1 1.25 1.25v1h15v-1a1.25 1.25 0 1 1 2.5 0v2.25a1.25 1.25 0 0 1-1.25 1.25H5.25A1.25 1.25 0 0 1 4 23.5v-2.25A1.25 1.25 0 0 1 5.25 20Z"/>
      </svg>
      <span class="launcher-label">下载</span>
    </button>

    <div id="overlay" class="overlay" hidden>
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header class="header">
          <h2 id="dialog-title">Bilibili 视频下载助手</h2>
          <button id="close" class="close" type="button" aria-label="关闭">×</button>
        </header>

        <main class="body">
          <p id="video-title" class="video-title">正在读取视频信息…</p>
          <p id="video-meta" class="video-meta"></p>

          <div id="status" class="status" role="status" aria-live="polite">正在加载…</div>

          <section id="download-tasks" class="section download-tasks" aria-labelledby="download-tasks-title" hidden>
            <div class="section-title-row">
              <div>
                <h3 id="download-tasks-title">下载任务</h3>
                <p class="hint">浏览器下载栏可能在 Tampermonkey 完成接收后才出现，请以这里的状态为准。</p>
              </div>
              <span id="download-summary" class="download-summary"></span>
            </div>
            <div id="download-task-list" class="download-task-list" role="status" aria-live="polite"></div>
          </section>

          <section id="page-section" class="section" hidden>
            <div class="field">
              <label for="page-select">分 P</label>
              <select id="page-select"></select>
            </div>
          </section>

          <section id="dash-section" class="section" hidden>
            <div class="section-title-row">
              <div>
                <h3>高清下载（DASH）</h3>
                <p class="hint">画质更高；B 站会将视频与音频分开提供。</p>
              </div>
            </div>

            <div class="field">
              <label for="video-select">视频轨（下载后没有声音）</label>
              <select id="video-select"></select>
            </div>

            <div class="field">
              <label for="audio-select">音频轨</label>
              <select id="audio-select"></select>
            </div>

            <div class="actions">
              <button id="download-pair" class="button primary" type="button">下载视频 + 音频</button>
              <button id="download-video" class="button" type="button">仅下载视频</button>
              <button id="download-audio" class="button" type="button">仅下载音频</button>
            </div>

            <div class="field">
              <label for="ffmpeg-command">无损合并命令（需已安装 FFmpeg）</label>
              <textarea id="ffmpeg-command" readonly spellcheck="false"></textarea>
            </div>

            <div class="actions">
              <button id="copy-command" class="button" type="button">复制 FFmpeg 命令</button>
            </div>
          </section>

          <section id="progressive-section" class="section" hidden>
            <div class="section-title-row">
              <div>
                <h3>兼容版下载</h3>
                <p id="progressive-summary" class="hint">包含画面和声音，通常画质较低。</p>
              </div>
            </div>
            <div class="actions">
              <button id="download-progressive" class="button pink" type="button">下载兼容版</button>
            </div>
          </section>

          <div class="actions">
            <button id="refresh" class="button" type="button">刷新资源</button>
          </div>

          <p class="footer-note">
            <strong>使用说明：</strong>清晰度由当前 Bilibili 登录状态与账号权限决定；临时下载地址会过期。
            请仅下载你拥有版权、已获授权或平台允许离线保存的内容。本脚本不绕过登录、会员、付费或 DRM 限制。
          </p>
        </main>
      </section>
    </div>
  `;

  const ui = Object.fromEntries(
    [
      'launcher',
      'overlay',
      'close',
      'video-title',
      'video-meta',
      'status',
      'download-tasks',
      'download-summary',
      'download-task-list',
      'page-section',
      'page-select',
      'dash-section',
      'video-select',
      'audio-select',
      'download-pair',
      'download-video',
      'download-audio',
      'ffmpeg-command',
      'copy-command',
      'progressive-section',
      'progressive-summary',
      'download-progressive',
      'refresh',
    ].map((id) => [id, shadow.getElementById(id)]),
  );

  function setStatus(message, tone = 'info') {
    ui.status.textContent = message;
    ui.status.dataset.tone = tone;
  }

  function parseCurrentVideoId() {
    const path = new URL(location.href).pathname;
    const bvidMatch = path.match(/\/video\/(BV[0-9A-Za-z]+)/i);
    if (bvidMatch) {
      return { bvid: bvidMatch[1] };
    }

    const aidMatch = path.match(/\/video\/av(\d+)/i);
    if (aidMatch) {
      return { aid: Number(aidMatch[1]) };
    }

    return null;
  }

  function currentPageIndex(pageCount) {
    const page = Number(new URL(location.href).searchParams.get('p') || '1');
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      return 0;
    }
    return page - 1;
  }

  function createApiUrl(path, params) {
    const url = new URL(path, API_ORIGIN);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.href;
  }

  function gmRequestJson(url, previousError) {
    if (typeof GM_xmlhttpRequest !== 'function') {
      return Promise.reject(previousError || new Error('当前油猴环境不支持跨域请求。'));
    }

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: {
          Accept: 'application/json, text/plain, */*',
          Referer: location.href,
        },
        responseType: 'json',
        timeout: 15_000,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`接口请求失败：HTTP ${response.status}`));
            return;
          }

          try {
            const payload =
              typeof response.response === 'object' && response.response !== null
                ? response.response
                : JSON.parse(response.responseText);
            resolve(payload);
          } catch (error) {
            reject(new Error(`接口返回内容无法解析：${error.message}`));
          }
        },
        ontimeout() {
          reject(new Error('接口请求超时，请稍后重试。'));
        },
        onerror(error) {
          reject(new Error(error?.error || previousError?.message || '接口请求失败。'));
        },
      });
    });
  }

  async function requestJson(url) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json, text/plain, */*' },
      });

      if (!response.ok) {
        throw new Error(`接口请求失败：HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      return gmRequestJson(url, error);
    }
  }

  async function apiGet(path, params) {
    const payload = await requestJson(createApiUrl(path, params));
    if (!payload || payload.code !== 0 || !payload.data) {
      const code = payload?.code ?? '未知';
      const message = payload?.message || payload?.msg || '接口未返回数据';
      throw new Error(`${message}（错误码 ${code}）`);
    }
    return payload.data;
  }

  function getMainUrl(item) {
    return item?.baseUrl || item?.base_url || item?.url || '';
  }

  function getBackupUrls(item) {
    const backups = item?.backupUrl || item?.backup_url || [];
    return Array.isArray(backups) ? backups : [];
  }

  function getCandidateUrls(item) {
    return [...new Set([getMainUrl(item), ...getBackupUrls(item)].filter(Boolean))];
  }

  function codecName(track) {
    const codec = String(track?.codecs || '').toLowerCase();
    if (codec.startsWith('avc') || codec.includes('h264')) return 'AVC/H.264';
    if (codec.startsWith('hev') || codec.startsWith('hvc') || codec.includes('h265')) {
      return 'HEVC/H.265';
    }
    if (codec.startsWith('av01') || codec.includes('av1')) return 'AV1';
    if (codec.includes('mp4a')) return 'AAC';
    if (codec.includes('ec-3') || codec.includes('eac3')) return 'Dolby E-AC-3';
    if (codec.includes('flac')) return 'FLAC';
    if (codec.includes('opus')) return 'Opus';
    return track?.codecs || `编码 ${track?.codecid ?? '未知'}`;
  }

  function codecPreference(track) {
    const name = codecName(track);
    if (name.startsWith('AVC')) return 0;
    if (name.startsWith('HEVC')) return 1;
    if (name === 'AV1') return 2;
    return 3;
  }

  function qualityName(id) {
    return QUALITY_NAMES.get(Number(id)) || `清晰度 ${id}`;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
  }

  function formatBitrate(bitsPerSecond) {
    if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return '码率未知';
    if (bitsPerSecond >= 1_000_000) {
      return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
    }
    return `${Math.round(bitsPerSecond / 1000)} kbps`;
  }

  function estimatedSize(track) {
    const duration = Number(state.videoInfo?.pages?.[state.pageIndex]?.duration || 0);
    const bandwidth = Number(track?.bandwidth || 0);
    return duration > 0 && bandwidth > 0 ? (duration * bandwidth) / 8 : 0;
  }

  function collectVideoTracks(dash) {
    const seen = new Set();
    return (Array.isArray(dash?.video) ? dash.video : [])
      .filter((track) => {
        const url = getMainUrl(track);
        if (!url || seen.has(url)) return false;
        seen.add(url);
        return true;
      })
      .sort((left, right) => {
        return Number(right.id) - Number(left.id) || codecPreference(left) - codecPreference(right);
      });
  }

  function collectAudioTracks(dash) {
    const candidates = [];
    for (const track of Array.isArray(dash?.audio) ? dash.audio : []) {
      candidates.push({ ...track, sourceLabel: '普通音频' });
    }
    for (const track of Array.isArray(dash?.dolby?.audio) ? dash.dolby.audio : []) {
      candidates.push({ ...track, sourceLabel: '杜比音频' });
    }
    if (dash?.flac?.audio) {
      candidates.push({ ...dash.flac.audio, sourceLabel: 'Hi-Res/FLAC' });
    }

    const seen = new Set();
    return candidates
      .filter((track) => {
        const url = getMainUrl(track);
        if (!url || seen.has(url)) return false;
        seen.add(url);
        return true;
      })
      .sort((left, right) => Number(right.bandwidth || 0) - Number(left.bandwidth || 0));
  }

  function videoTrackLabel(track) {
    const resolution = track.width && track.height ? `${track.width}×${track.height}` : '分辨率未知';
    const frameRate = track.frameRate || track.frame_rate;
    const parts = [qualityName(track.id), resolution, codecName(track)];
    if (frameRate) parts.push(`${frameRate} fps`);
    parts.push(formatBitrate(Number(track.bandwidth || 0)));
    const size = estimatedSize(track);
    if (size) parts.push(`约 ${formatBytes(size)}`);
    return parts.join(' · ');
  }

  function audioTrackLabel(track) {
    const parts = [track.sourceLabel || '音频', codecName(track), formatBitrate(Number(track.bandwidth || 0))];
    const size = estimatedSize(track);
    if (size) parts.push(`约 ${formatBytes(size)}`);
    return parts.join(' · ');
  }

  function replaceOptions(select, tracks, labelFactory) {
    select.replaceChildren();
    tracks.forEach((track, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = labelFactory(track);
      select.appendChild(option);
    });
    select.disabled = tracks.length === 0;
  }

  function selectedVideoTrack() {
    return state.videoTracks[Number(ui['video-select'].value || 0)] || null;
  }

  function selectedAudioTrack() {
    return state.audioTracks[Number(ui['audio-select'].value || 0)] || null;
  }

  function sanitizeFilename(value, maxLength = 135) {
    const sanitized = String(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim();
    return (sanitized || 'bilibili-video').slice(0, maxLength).replace(/[. ]+$/g, '');
  }

  function baseFilename() {
    const info = state.videoInfo;
    const page = info?.pages?.[state.pageIndex];
    const pageSuffix = info?.pages?.length > 1 ? ` - P${page.page} ${page.part}` : '';
    return sanitizeFilename(`${info?.title || 'Bilibili 视频'}${pageSuffix} [${info?.bvid || info?.aid || ''}]`);
  }

  function videoExtension(track) {
    return String(track?.mimeType || track?.mime_type || '').includes('webm') ? 'webm' : 'mp4';
  }

  function audioExtension(track) {
    const mime = String(track?.mimeType || track?.mime_type || '').toLowerCase();
    const codec = codecName(track);
    if (mime.includes('webm') || codec === 'Opus') return 'webm';
    if (mime.includes('flac') || codec === 'FLAC') return 'flac';
    return 'm4a';
  }

  function videoFilename(track) {
    const quality = sanitizeFilename(qualityName(track.id), 30);
    const codec = sanitizeFilename(codecName(track).replace('/', '-'), 30);
    return `${baseFilename()}.${quality}.${codec}.video.${videoExtension(track)}`;
  }

  function audioFilename(track) {
    const source = sanitizeFilename(track.sourceLabel || '音频', 24);
    const bitrate = Math.round(Number(track.bandwidth || 0) / 1000) || 'unknown';
    return `${baseFilename()}.${source}.${bitrate}k.audio.${audioExtension(track)}`;
  }

  function mergeExtension(videoTrack, audioTrack) {
    const videoExt = videoExtension(videoTrack);
    const audioExt = audioExtension(audioTrack);
    return videoExt === 'webm' || audioExt === 'webm' || audioExt === 'flac' ? 'mkv' : 'mp4';
  }

  function shellQuoteFilename(filename) {
    return `"${String(filename).replace(/"/g, '_')}"`;
  }

  function buildFfmpegCommand() {
    const video = selectedVideoTrack();
    const audio = selectedAudioTrack();
    if (!video || !audio) return '';

    const outputExtension = mergeExtension(video, audio);
    const outputName = `${baseFilename()}.${sanitizeFilename(qualityName(video.id), 30)}.${outputExtension}`;
    const fastStart = outputExtension === 'mp4' ? ' -movflags +faststart' : '';
    return `ffmpeg -i ${shellQuoteFilename(videoFilename(video))} -i ${shellQuoteFilename(audioFilename(audio))} -map 0:v:0 -map 1:a:0 -c copy${fastStart} ${shellQuoteFilename(outputName)}`;
  }

  function updateFfmpegCommand() {
    const command = buildFfmpegCommand();
    ui['ffmpeg-command'].value = command;
    ui['copy-command'].disabled = !command || state.actionBusy;
  }

  function updateActionAvailability() {
    const hasVideo = Boolean(selectedVideoTrack());
    const hasAudio = Boolean(selectedAudioTrack());
    const hasProgressive = Boolean(state.progressiveData?.durl?.length);
    ui['download-pair'].disabled = state.actionBusy || !hasVideo || !hasAudio;
    ui['download-video'].disabled = state.actionBusy || !hasVideo;
    ui['download-audio'].disabled = state.actionBusy || !hasAudio;
    ui['download-progressive'].disabled = state.actionBusy || !hasProgressive;
    ui.refresh.disabled = state.actionBusy;
    ui['page-select'].disabled = state.actionBusy;
    ui['video-select'].disabled = state.actionBusy || state.videoTracks.length === 0;
    ui['audio-select'].disabled = state.actionBusy || state.audioTracks.length === 0;
    updateFfmpegCommand();
  }

  function setActionBusy(busy) {
    state.actionBusy = busy;
    updateActionAvailability();
  }

  function renderVideoInfo() {
    const info = state.videoInfo;
    ui['video-title'].textContent = info.title;
    const owner = info.owner?.name ? ` · UP：${info.owner.name}` : '';
    ui['video-meta'].textContent = `${info.bvid || `av${info.aid}`}${owner}`;

    const pages = Array.isArray(info.pages) ? info.pages : [];
    ui['page-select'].replaceChildren();
    pages.forEach((page, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `P${page.page} · ${page.part || `分 P ${page.page}`}`;
      ui['page-select'].appendChild(option);
    });
    ui['page-select'].value = String(state.pageIndex);
    ui['page-section'].hidden = pages.length <= 1;
  }

  function progressiveExtension(data) {
    const format = String(data?.format || '').toLowerCase();
    const firstUrl = String(data?.durl?.[0]?.url || '').toLowerCase();
    if (format.includes('flv') || firstUrl.includes('.flv')) return 'flv';
    if (format.includes('mp4') || firstUrl.includes('.mp4')) return 'mp4';
    return 'mp4';
  }

  function renderMediaOptions() {
    const dash = state.dashData?.dash;
    state.videoTracks = collectVideoTracks(dash);
    state.audioTracks = collectAudioTracks(dash);

    replaceOptions(ui['video-select'], state.videoTracks, videoTrackLabel);
    replaceOptions(ui['audio-select'], state.audioTracks, audioTrackLabel);
    ui['dash-section'].hidden = state.videoTracks.length === 0;

    const progressiveUrls = state.progressiveData?.durl || [];
    ui['progressive-section'].hidden = progressiveUrls.length === 0;
    if (progressiveUrls.length > 0) {
      const totalSize = progressiveUrls.reduce((sum, item) => sum + Number(item.size || 0), 0);
      const segments = progressiveUrls.length > 1 ? ` · ${progressiveUrls.length} 个分段` : '';
      const size = totalSize ? ` · ${formatBytes(totalSize)}` : '';
      ui['progressive-summary'].textContent = `${qualityName(state.progressiveData.quality)} · ${progressiveExtension(state.progressiveData).toUpperCase()}${segments}${size}；包含画面和声音。`;
    }

    updateActionAvailability();
  }

  function mediaParams(page, fnval) {
    return {
      avid: state.videoInfo.aid,
      bvid: state.videoInfo.bvid,
      cid: page.cid,
      qn: 127,
      fnver: 0,
      fnval,
      fourk: 1,
      high_quality: 1,
      platform: 'pc',
    };
  }

  async function loadMediaForPage(pageIndex) {
    if (!state.videoInfo?.pages?.[pageIndex]) return;
    const token = ++state.loadToken;
    state.pageIndex = pageIndex;
    state.dashData = null;
    state.progressiveData = null;
    state.videoTracks = [];
    state.audioTracks = [];
    renderVideoInfo();
    ui['dash-section'].hidden = true;
    ui['progressive-section'].hidden = true;
    setStatus(`正在读取 P${pageIndex + 1} 的可下载资源…`);

    const page = state.videoInfo.pages[pageIndex];
    try {
      const [dashResult, progressiveResult] = await Promise.allSettled([
        apiGet('/x/player/playurl', mediaParams(page, 4048)),
        apiGet('/x/player/playurl', mediaParams(page, 0)),
      ]);

      if (token !== state.loadToken) return;

      if (dashResult.status === 'fulfilled') state.dashData = dashResult.value;
      if (progressiveResult.status === 'fulfilled') state.progressiveData = progressiveResult.value;

      if (!state.dashData && !state.progressiveData) {
        const dashError = dashResult.status === 'rejected' ? dashResult.reason.message : '';
        const progressiveError =
          progressiveResult.status === 'rejected' ? progressiveResult.reason.message : '';
        throw new Error(dashError || progressiveError || '没有取得可下载资源。');
      }

      renderMediaOptions();
      const trackSummary = [];
      if (state.videoTracks.length) trackSummary.push(`${state.videoTracks.length} 个视频轨`);
      if (state.audioTracks.length) trackSummary.push(`${state.audioTracks.length} 个音频轨`);
      if (state.progressiveData?.durl?.length) trackSummary.push('兼容版');
      setStatus(`P${page.page} 资源已就绪：${trackSummary.join('、')}。`, 'success');
    } catch (error) {
      if (token !== state.loadToken) return;
      setStatus(`资源读取失败：${error.message}`, 'error');
    }
  }

  async function loadCurrentVideo() {
    const videoId = parseCurrentVideoId();
    if (!videoId) {
      setStatus('当前地址不是受支持的 Bilibili 普通视频页。', 'error');
      return;
    }

    const token = ++state.loadToken;
    state.videoInfo = null;
    ui['video-title'].textContent = '正在读取视频信息…';
    ui['video-meta'].textContent = '';
    ui['page-section'].hidden = true;
    ui['dash-section'].hidden = true;
    ui['progressive-section'].hidden = true;
    setStatus('正在读取视频与分 P 信息…');

    try {
      const info = await apiGet('/x/web-interface/view', videoId);
      if (token !== state.loadToken) return;
      if (!Array.isArray(info.pages) || info.pages.length === 0) {
        throw new Error('该视频没有可读取的分 P 信息。');
      }
      state.videoInfo = info;
      state.pageIndex = currentPageIndex(info.pages.length);
      renderVideoInfo();
      await loadMediaForPage(state.pageIndex);
    } catch (error) {
      if (token !== state.loadToken) return;
      setStatus(`读取失败：${error.message}`, 'error');
    }
  }

  function normalizeDownloadError(error) {
    const code = error?.error || error?.message || String(error || '未知错误');
    const details = error?.details ? `：${error.details}` : '';
    if (code === 'not_enabled') return 'Tampermonkey 的下载功能尚未启用';
    if (code === 'not_whitelisted') return '该文件扩展名未被 Tampermonkey 允许';
    if (code === 'not_permitted') return '浏览器尚未授予 Tampermonkey 下载权限';
    if (code === 'not_supported') return '当前浏览器或油猴版本不支持 GM_download';
    return `${code}${details}`;
  }

  function waitForVisiblePaint() {
    return new Promise((resolve) => {
      const finishAfterPaint = () => setTimeout(resolve, 0);
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(finishAfterPaint);
      } else {
        finishAfterPaint();
      }
    });
  }

  function updateDownloadSummary() {
    const total = state.downloadTasks.length;
    const completed = state.downloadTasks.filter((task) => task.status === 'complete').length;
    const failed = state.downloadTasks.filter((task) => task.status === 'error').length;
    const finished = completed + failed;

    if (total === 0) {
      ui['download-summary'].textContent = '';
      return;
    }

    if (finished === total) {
      ui['download-summary'].textContent =
        failed > 0 ? `${completed} 成功 · ${failed} 失败` : '全部完成';
      ui['download-tasks'].setAttribute('aria-busy', 'false');
      return;
    }

    ui['download-summary'].textContent = `${finished}/${total} 已结束`;
  }

  function renderDownloadTasks(items) {
    ui['download-task-list'].replaceChildren();
    ui['download-tasks'].hidden = false;
    ui['download-tasks'].setAttribute('aria-busy', 'true');

    state.downloadTasks = items.map((item) => {
      const row = document.createElement('div');
      row.className = 'download-task';
      row.dataset.state = 'queued';

      const heading = document.createElement('div');
      heading.className = 'download-task-heading';

      const label = document.createElement('span');
      label.className = 'download-task-label';
      label.textContent = item.label;

      const status = document.createElement('span');
      status.className = 'download-task-state';
      status.textContent = '准备中';
      heading.append(label, status);

      const filename = document.createElement('div');
      filename.className = 'download-task-name';
      filename.textContent = item.name;
      filename.title = item.name;

      const progress = document.createElement('div');
      progress.className = 'download-task-progress';
      const progressBar = document.createElement('div');
      progressBar.className = 'download-task-progress-bar';
      progressBar.dataset.indeterminate = 'true';
      progress.appendChild(progressBar);

      const detail = document.createElement('div');
      detail.className = 'download-task-detail';
      detail.textContent = '等待启动下载…';

      row.append(heading, filename, progress, detail);
      ui['download-task-list'].appendChild(row);

      return {
        row,
        statusElement: status,
        detailElement: detail,
        progressBar,
        status: 'queued',
        loaded: 0,
        total: 0,
      };
    });

    updateDownloadSummary();
    return state.downloadTasks;
  }

  function updateDownloadTask(task, update) {
    Object.assign(task, update);
    task.row.dataset.state = task.status;

    const statusLabels = {
      queued: '准备中',
      downloading: '正在下载',
      retrying: '切换线路',
      complete: '已完成',
      error: '失败',
    };
    task.statusElement.textContent = statusLabels[task.status] || task.status;

    const loaded = Number(task.loaded || 0);
    const total = Number(task.total || 0);
    const hasKnownTotal = total > 0;
    const percent = hasKnownTotal ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

    if (task.status === 'complete') {
      task.detailElement.textContent =
        loaded > 0 ? `${formatBytes(loaded)} · 下载完成` : '下载完成';
      task.progressBar.dataset.indeterminate = 'false';
      task.progressBar.style.width = '100%';
    } else if (task.status === 'error') {
      task.detailElement.textContent = task.message || '下载失败';
      task.progressBar.dataset.indeterminate = 'false';
      task.progressBar.style.width = '100%';
    } else if (hasKnownTotal) {
      task.detailElement.textContent = `${formatBytes(loaded)} / ${formatBytes(total)} · ${percent}%`;
      task.progressBar.dataset.indeterminate = 'false';
      task.progressBar.style.width = `${percent}%`;
    } else {
      task.detailElement.textContent =
        loaded > 0
          ? `${formatBytes(loaded)} · 总大小未知`
          : task.message || '已交给 Tampermonkey，等待下载进度…';
      task.progressBar.dataset.indeterminate = 'true';
      task.progressBar.style.width = '';
    }

    updateDownloadSummary();
  }

  function downloadOnce(url, name, onProgress) {
    if (typeof GM_download !== 'function') {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.click();
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        GM_download({
          url,
          name,
          saveAs: false,
          conflictAction: 'uniquify',
          headers: { Referer: location.href },
          onprogress(event) {
            if (typeof onProgress === 'function') {
              const loaded = Number(event.loaded || 0);
              const total =
                event.lengthComputable && Number(event.total) > 0 ? Number(event.total) : 0;
              onProgress({ loaded, total });
            }
          },
          onload() {
            resolve();
          },
          onerror(error) {
            reject(error);
          },
          ontimeout() {
            reject(new Error('下载超时'));
          },
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function downloadWithFallback(item, name, label, task) {
    const urls = getCandidateUrls(item);
    if (urls.length === 0) throw new Error(`${label}没有可用下载地址`);

    let lastError = null;
    for (let index = 0; index < urls.length; index += 1) {
      updateDownloadTask(task, {
        status: index === 0 ? 'downloading' : 'retrying',
        loaded: 0,
        total: 0,
        message:
          index === 0
            ? '已交给 Tampermonkey，等待下载进度…'
            : `正在尝试备用线路 ${index + 1}/${urls.length}…`,
      });
      try {
        await downloadOnce(urls[index], name, ({ loaded, total }) => {
          updateDownloadTask(task, { status: 'downloading', loaded, total, message: '' });
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`${label}下载失败：${normalizeDownloadError(lastError)}`);
  }

  async function runDownloads(items, successMessage) {
    if (state.actionBusy) return;
    const tasks = renderDownloadTasks(items);
    setActionBusy(true);
    setStatus(`已创建 ${items.length} 个下载任务，正在交给 Tampermonkey…`);
    if (typeof ui['download-tasks'].scrollIntoView === 'function') {
      ui['download-tasks'].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    await waitForVisiblePaint();

    try {
      const results = await Promise.allSettled(
        items.map(async (item, index) => {
          try {
            await downloadWithFallback(item.media, item.name, item.label, tasks[index]);
            updateDownloadTask(tasks[index], {
              status: 'complete',
              loaded: tasks[index].total > 0 ? tasks[index].total : tasks[index].loaded,
              message: '',
            });
          } catch (error) {
            updateDownloadTask(tasks[index], { status: 'error', message: error.message });
            throw error;
          }
        }),
      );
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length > 0) {
        const messages = failures.map((result) => result.reason.message).join('；');
        setStatus(messages, 'error');
      } else {
        setStatus(successMessage, 'success');
      }
    } finally {
      setActionBusy(false);
    }
  }

  function handleDownloadPair() {
    const video = selectedVideoTrack();
    const audio = selectedAudioTrack();
    if (!video || !audio) return;
    void runDownloads(
      [
        { media: video, name: videoFilename(video), label: '视频轨' },
        { media: audio, name: audioFilename(audio), label: '音频轨' },
      ],
      '视频轨和音频轨已下载。可在下载目录运行面板中的 FFmpeg 命令进行无损合并。',
    );
  }

  function handleDownloadVideo() {
    const video = selectedVideoTrack();
    if (!video) return;
    void runDownloads(
      [{ media: video, name: videoFilename(video), label: '视频轨' }],
      '视频轨已下载（该文件不含声音）。',
    );
  }

  function handleDownloadAudio() {
    const audio = selectedAudioTrack();
    if (!audio) return;
    void runDownloads(
      [{ media: audio, name: audioFilename(audio), label: '音频轨' }],
      '音频轨已下载。',
    );
  }

  function handleDownloadProgressive() {
    const data = state.progressiveData;
    const segments = Array.isArray(data?.durl) ? data.durl : [];
    if (segments.length === 0) return;

    const extension = progressiveExtension(data);
    const quality = sanitizeFilename(qualityName(data.quality), 30);
    const items = segments.map((segment, index) => {
      const part = segments.length > 1 ? `.part${String(index + 1).padStart(2, '0')}` : '';
      return {
        media: segment,
        name: `${baseFilename()}.${quality}${part}.${extension}`,
        label: segments.length > 1 ? `兼容版分段 ${index + 1}` : '兼容版',
      };
    });

    void runDownloads(
      items,
      segments.length > 1
        ? `兼容版的 ${segments.length} 个分段已下载。`
        : '包含画面和声音的兼容版已下载。',
    );
  }

  async function copyFfmpegCommand() {
    const command = buildFfmpegCommand();
    if (!command) return;

    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(command, 'text');
      } else {
        await navigator.clipboard.writeText(command);
      }
      setStatus('FFmpeg 合并命令已复制到剪贴板。', 'success');
    } catch (error) {
      setStatus(`复制失败：${error.message}`, 'error');
    }
  }

  function placeLauncher() {
    if (!ui.overlay.hidden) {
      host.dataset.placement = 'dialog';
      if (host.parentElement !== document.documentElement) {
        document.documentElement.appendChild(host);
      }
      return;
    }

    const shareItem = document.querySelector(
      '#arc_toolbar_report .video-share-wrap, .video-toolbar-container .video-share-wrap',
    );
    const shareWrapper = shareItem?.closest('.toolbar-left-item-wrap') || shareItem;
    const toolbar = shareWrapper?.parentElement;

    if (shareWrapper && toolbar) {
      if (shareWrapper.nextElementSibling !== host) {
        shareWrapper.insertAdjacentElement('afterend', host);
      }

      const rectangle = shareWrapper.getBoundingClientRect();
      const computedStyle = getComputedStyle(shareWrapper);
      if (rectangle.width > 0) {
        host.style.setProperty('--bili-toolbar-item-width', `${Math.round(rectangle.width)}px`);
      }
      host.style.setProperty('--bili-toolbar-item-margin', computedStyle.marginRight || '8px');
      host.dataset.placement = 'toolbar';
      return;
    }

    host.dataset.placement = 'floating';
    host.style.removeProperty('--bili-toolbar-item-width');
    host.style.removeProperty('--bili-toolbar-item-margin');
    if (host.parentElement !== document.documentElement) {
      document.documentElement.appendChild(host);
    }
  }

  function openDialog() {
    ui.overlay.hidden = false;
    placeLauncher();
    ui.close.focus();
    void loadCurrentVideo();
  }

  function closeDialog() {
    ui.overlay.hidden = true;
    state.loadToken += 1;
    placeLauncher();
    ui.launcher.focus();
  }

  ui.launcher.addEventListener('click', openDialog);
  ui.close.addEventListener('click', closeDialog);
  ui.overlay.addEventListener('click', (event) => {
    if (event.target === ui.overlay) closeDialog();
  });
  shadow.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !ui.overlay.hidden) closeDialog();
  });
  ui.refresh.addEventListener('click', () => void loadCurrentVideo());
  ui['page-select'].addEventListener('change', () => {
    void loadMediaForPage(Number(ui['page-select'].value));
  });
  ui['video-select'].addEventListener('change', updateFfmpegCommand);
  ui['audio-select'].addEventListener('change', updateFfmpegCommand);
  ui['download-pair'].addEventListener('click', handleDownloadPair);
  ui['download-video'].addEventListener('click', handleDownloadVideo);
  ui['download-audio'].addEventListener('click', handleDownloadAudio);
  ui['download-progressive'].addEventListener('click', handleDownloadProgressive);
  ui['copy-command'].addEventListener('click', () => void copyFfmpegCommand());

  placeLauncher();
  window.setInterval(placeLauncher, 1_200);
  window.addEventListener('resize', placeLauncher, { passive: true });
})();
