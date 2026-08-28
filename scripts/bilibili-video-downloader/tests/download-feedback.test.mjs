import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(TEST_DIRECTORY, '..', 'bilibili-video-downloader.user.js');

class FakeStyle {
  setProperty() {}
  removeProperty() {}
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.parentElement = null;
    this.style = new FakeStyle();
    this.value = '';
    this._textContent = '';
    this.listeners = new Map();
  }

  get textContent() {
    return this._textContent || this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  get nextElementSibling() {
    if (!this.parentElement) return null;
    const index = this.parentElement.children.indexOf(this);
    return this.parentElement.children[index + 1] || null;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  attachShadow() {
    this.shadowRoot = new FakeShadowRoot();
    return this.shadowRoot;
  }

  closest() {
    return null;
  }

  focus() {}

  getBoundingClientRect() {
    return { width: 0, height: 0 };
  }

  insertAdjacentElement(_position, element) {
    return this.parentElement?.appendChild(element) || null;
  }

  removeAttribute(name) {
    if (name === 'value') this.value = '';
  }

  replaceChildren(...children) {
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }

  setAttribute(name, value) {
    this[name] = String(value);
  }
}

class FakeShadowRoot extends FakeElement {
  constructor() {
    super('shadow-root');
    this.elementsById = new Map();
  }

  set innerHTML(value) {
    this._innerHTML = value;
    for (const match of value.matchAll(/id="([^"]+)"/g)) {
      this.elementsById.set(match[1], new FakeElement());
    }
    const overlay = this.elementsById.get('overlay');
    if (overlay) overlay.hidden = true;
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }
}

function loadUserscriptHarness() {
  const downloads = [];
  const lifecycle = [];
  const documentElement = new FakeElement('html');
  const document = {
    createElement: (tagName) => new FakeElement(tagName),
    documentElement,
    querySelector: () => null,
  };
  const window = {
    addEventListener() {},
    requestAnimationFrame(callback) {
      lifecycle.push('paint');
      queueMicrotask(() => callback(0));
      return 1;
    },
    setInterval() {
      return 1;
    },
  };

  const context = vm.createContext({
    URL,
    console,
    document,
    fetch: async () => {
      throw new Error('Unexpected fetch in download feedback test');
    },
    getComputedStyle: () => ({ marginRight: '8px' }),
    location: { href: 'https://www.bilibili.com/video/BV1TEST/' },
    navigator: { clipboard: { writeText: async () => {} } },
    queueMicrotask,
    setTimeout,
    clearTimeout,
    window,
    GM_download(details) {
      lifecycle.push('gm-download');
      downloads.push(details);
      return { abort() {} };
    },
    GM_setClipboard() {},
    GM_xmlhttpRequest() {},
  });

  let source = fs.readFileSync(SCRIPT_PATH, 'utf8');
  source = source.replace(
    /\}\)\(\);\s*$/,
    `globalThis.__downloadFeedbackTestApi = { runDownloads, ui };\n})();`,
  );
  vm.runInContext(source, context, { filename: SCRIPT_PATH });

  return {
    api: context.__downloadFeedbackTestApi,
    downloads,
    lifecycle,
  };
}

test('shows a painted file-level task before GM_download settles', async () => {
  const { api, downloads, lifecycle } = loadUserscriptHarness();
  const task = {
    media: { url: 'https://media.example.test/video.mp4' },
    name: 'example.video.mp4',
    label: '视频轨',
  };

  const completion = api.runDownloads([task], '下载完成');
  await new Promise((resolve) => setImmediate(resolve));

  const taskSection = api.ui['download-tasks'];
  const taskList = api.ui['download-task-list'];
  assert.ok(taskSection, '下载面板缺少文件级任务区域');
  assert.ok(taskList, '下载面板缺少文件级任务列表');
  assert.equal(taskSection.hidden, false, '点击下载后任务区域仍然隐藏');
  assert.match(taskList.textContent, /视频轨/, '任务区域没有显示正在下载的文件');
  assert.deepEqual(
    lifecycle.slice(0, 2),
    ['paint', 'gm-download'],
    '应该先绘制下载状态，再调用 GM_download',
  );
  assert.equal(downloads.length, 1);

  downloads[0].onprogress({ lengthComputable: false, loaded: 1024, total: 0 });
  assert.match(taskList.textContent, /1(?:\.00)? KB/, '总大小未知时没有显示已下载字节');

  downloads[0].onprogress({ lengthComputable: true, loaded: 512, total: 1024 });
  assert.match(taskList.textContent, /50%/, '总大小已知时没有显示百分比');

  downloads[0].onload();
  await completion;
  assert.match(taskList.textContent, /完成/, '下载完成后没有更新任务结果');
});

test('shows a clear task error when GM_download fails', async () => {
  const { api, downloads } = loadUserscriptHarness();
  const completion = api.runDownloads(
    [
      {
        media: { url: 'https://media.example.test/audio.m4a' },
        name: 'example.audio.m4a',
        label: '音频轨',
      },
    ],
    '下载完成',
  );
  await new Promise((resolve) => setImmediate(resolve));

  downloads[0].onerror({ error: 'not_permitted' });
  await completion;

  assert.match(api.ui['download-task-list'].textContent, /失败/, '任务没有显示失败状态');
  assert.match(api.ui.status.textContent, /下载权限/, '没有解释 Tampermonkey 下载权限错误');
});
