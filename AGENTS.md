# AGENTS.md

本文件约束在本仓库中工作的 Coding Agent，适用于仓库根目录及全部子目录。

## 基本原则

- 默认使用中文编写说明文档和面向用户的文字。
- 先阅读根目录 `README.md`、`CONTRIBUTING.md` 和 `docs/script-conventions.md`，再新增或修改脚本。
- 保持脚本可直接审阅、可直接安装；简单脚本不引入构建工具或运行时依赖。
- 只修改当前任务涉及的脚本和文档，不顺手重构其他脚本。
- 不提交 Cookie、Token、账号信息、抓包数据或其他敏感内容。

## 脚本目录

所有正式脚本必须放在：

```text
scripts/<script-slug>/
```

`<script-slug>` 使用小写英文、数字和短横线，并与脚本文件名前缀保持一致。每个正式脚本目录必须包含：

```text
scripts/<script-slug>/
├─ <script-slug>.user.js
├─ README.md
└─ CHANGELOG.md
```

如有需要，可以增加 `src/`、`tests/` 和 `assets/`。无论是否使用源码目录或构建流程，都必须提交能够直接安装的 `<script-slug>.user.js`。

完整要求见 `docs/script-conventions.md`。

## 修改规则

- 新增脚本时，同时更新根目录 `README.md` 的脚本列表。
- 修改脚本运行逻辑时，更新 `@version` 和同目录 `CHANGELOG.md`。
- 只修改说明文档时，不需要提升脚本版本。
- 保持 `@match` 范围尽量小；没有特权 API 时使用 `@grant none`。
- `@downloadURL` 和 `@updateURL` 必须指向 `main` 分支下对应的 `.user.js` 文件。
- 需要访问页面主世界、提前拦截请求或使用特殊权限时，必须在脚本 README 中说明原因和兼容性边界。

## 代码与性能

- 可直接发布的用户脚本优先使用原生 JavaScript；只有确有必要时才在 `src/` 中使用 TypeScript，并提交构建后的 `.user.js`。
- 使用 IIFE 或其他方式避免污染页面全局变量。
- DOM 监听应限制作用范围并进行合并或节流，避免全页高频扫描。
- 网络拦截使用明确的域名或路径规则，默认保留页面核心功能，并对被拦截 SDK 提供必要的兼容兜底。
- 不加入本仓库自己的统计、遥测、广告或隐蔽联网行为。

## 验证

提交前至少执行：

```powershell
node --check scripts/<script-slug>/<script-slug>.user.js
git diff --check
```

还需人工确认元数据、安装链接、目标网站匹配范围和核心功能。未经用户明确要求，不启动长期运行服务，不创建 Tag 或 Release。

## Git

- Commit Message 使用英文并遵循 Conventional Commits。
- 一个提交聚焦一个主题，不混入无关文件。
- 未经用户明确要求，不推送、发布或修改仓库可见性。
