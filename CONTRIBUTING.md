# Contributing

欢迎提交新脚本或改进现有脚本。

开始前请先阅读[用户脚本目录与发布规范](docs/script-conventions.md)。该文档是目录、元数据、版本和验证要求的正式来源。

## 新增脚本

1. 在 `scripts/` 下创建独立的短横线命名目录。
2. 将可直接安装的脚本命名为 `<script-slug>.user.js`。
3. 添加同目录 `README.md`，说明功能、适用网站、安装方式和已知限制。
4. 添加同目录 `CHANGELOG.md`，初始版本应与脚本元数据一致。
5. 在根目录 `README.md` 的脚本列表中添加入口。

## 元数据要求

- 使用明确、尽量收敛的 `@match`。
- 使用递增的 `@version`。
- 填写 `@homepageURL`、`@supportURL`、`@downloadURL` 和 `@updateURL`。
- 默认添加 `@noframes`；确需在 iframe 中运行时说明原因。
- 不提交 Token、Cookie、密码或其他敏感信息。
- 涉及请求拦截时，需要说明保留和屏蔽的功能边界。

## 提交前检查

- 使用 `node --check path/to/script.user.js` 检查 JavaScript 语法。
- 使用 `git diff --check` 检查空白和补丁格式。
- 确认安装链接指向 `main` 分支中的 `.user.js` 文件。
- 确认 `@version` 与 `CHANGELOG.md` 最新版本一致。
- 验证脚本只在预期网站运行，并且不会破坏页面核心功能。
