# 用户脚本目录与发布规范

本文定义 `userscripts` 仓库中新增和维护油猴脚本时必须遵循的结构、元数据、版本和验证要求。

## 1. 目录位置与命名

所有正式脚本都放在 `scripts/` 下，每个脚本使用独立目录：

```text
scripts/<script-slug>/
```

`<script-slug>` 必须：

- 只包含小写英文字母、数字和短横线。
- 简短表达脚本用途，例如 `douyu-clean`。
- 与发布文件 `<script-slug>.user.js` 的名称保持一致。
- 创建后尽量保持稳定，避免破坏已有安装地址和自动更新。

## 2. 单个脚本目录内容

标准结构如下：

```text
scripts/<script-slug>/
├─ <script-slug>.user.js  # 必需：可直接安装的发布文件
├─ README.md              # 必需：安装与使用说明
├─ CHANGELOG.md           # 必需：按版本记录用户可感知变化
├─ src/                   # 可选：需要编译时的源代码
├─ tests/                 # 可选：自动化或静态测试
└─ assets/                # 可选：README 图片等静态资源
```

### `<script-slug>.user.js`

- 必须是用户脚本管理器可以直接安装的完整文件。
- 文件顶部必须包含合法的 `// ==UserScript==` 元数据块。
- 不依赖未提交的本地文件。
- 如果使用 `src/` 或构建流程，仍必须提交最新构建产物。

### `README.md`

至少包含：

- 脚本用途和适用网站。
- Raw 一键安装链接。
- 主要功能和默认行为。
- 快捷键或油猴菜单命令。
- 使用的特殊权限、请求拦截或隐私行为。
- 兼容性、已知限制和问题反馈入口。

### `CHANGELOG.md`

- 使用倒序版本记录，最新版本在最上方。
- 版本号必须与 `.user.js` 中的 `@version` 一致。
- 记录新增、变更、修复、性能或隐私相关的用户可感知变化。
- 纯仓库文档变更可以只写入 Git 历史，不必新增脚本版本。

### 可选目录

- `src/`：TypeScript、模块化源代码或生成脚本，仅在单文件难以维护时使用。
- `tests/`：DOM 固件、单元测试或 URL 匹配测试；不得包含真实 Cookie 或账号数据。
- `assets/`：只存放该脚本文档需要的图片等资源，不存放抓包文件或大体积临时产物。

## 3. 元数据规范

建议使用以下顺序：

```javascript
// ==UserScript==
// @name         脚本名称
// @namespace    https://github.com/techidsk/userscripts
// @version      1.0.0
// @description  一句话说明用途
// @author       techidsk
// @license      MIT
// @homepageURL  https://github.com/techidsk/userscripts/tree/main/scripts/<script-slug>
// @supportURL   https://github.com/techidsk/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/<script-slug>/<script-slug>.user.js
// @updateURL    https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/<script-slug>/<script-slug>.user.js
// @match        https://example.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
```

具体规则：

- `@version` 使用语义化版本 `MAJOR.MINOR.PATCH`。
- `@description` 说明用户价值，不堆砌关键词。
- `@match` 仅包含脚本真正支持的域名和协议，不使用无必要的全网匹配。
- `@grant` 只声明实际使用的能力；不需要权限时写 `none`。
- 默认使用 `document-idle`。只有必须在页面脚本前执行时才使用 `document-start`，并在 README 解释原因。
- 默认增加 `@noframes`；确实需要在 iframe 内运行时例外并说明原因。
- 只有需要页面主世界时才声明 `@sandbox raw` 或 `unsafeWindow`。

## 4. 版本与变更记录

- `PATCH`：选择器修复、小范围兼容或不改变主要行为的错误修复。
- `MINOR`：新增用户可见功能、支持新页面或增加新的可配置行为。
- `MAJOR`：不兼容的行为、配置或目录变更。
- 修改脚本代码时，必须同步更新版本号和 `CHANGELOG.md`。
- 只修改根 README、规范或贡献文档时，不提升脚本版本。

## 5. 代码、安全与隐私

- 脚本默认不收集、保存或上传用户数据。
- 禁止提交密钥、Token、Cookie、设备标识或未脱敏的网络记录。
- 网络拦截规则应尽可能精确，并明确保留登录、媒体、支付等核心接口的边界。
- 不使用远程动态代码、隐蔽 `eval` 或无法审阅的压缩代码。
- 高频事件、轮询和 `MutationObserver` 必须合并、节流或限制观察范围。
- 页面改版或接口失败时应尽量降级，不制造高频重试。

## 6. 新脚本接入步骤

1. 创建 `scripts/<script-slug>/`。
2. 添加同名 `.user.js`、`README.md` 和 `CHANGELOG.md`。
3. 补齐元数据中的仓库地址和 Raw 更新地址。
4. 在根目录 `README.md` 的脚本表格中新增一行。
5. 执行语法、格式和敏感信息检查。
6. 在目标网站手动验证安装、核心功能和禁用后的恢复行为。

## 7. 提交前检查清单

- [ ] 目录名和 `.user.js` 文件名一致。
- [ ] 元数据块完整，`@match` 与 `@grant` 最小化。
- [ ] `@version` 与 `CHANGELOG.md` 最新版本一致。
- [ ] Raw 安装、下载和更新 URL 指向正确文件。
- [ ] 根目录脚本索引已经更新。
- [ ] `node --check` 与 `git diff --check` 通过。
- [ ] 没有敏感信息、临时文件或抓包数据。
- [ ] 已确认不会破坏目标网站核心功能。
