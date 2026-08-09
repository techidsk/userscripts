# Contributing

欢迎提交新脚本或改进现有脚本。

## 新增脚本

1. 在 `scripts/` 下创建独立的短横线命名目录。
2. 将可直接安装的脚本命名为 `<script-name>.user.js`。
3. 添加同目录 `README.md`，说明功能、适用网站、安装方式和已知限制。
4. 在根目录 `README.md` 的脚本列表中添加入口。

## 元数据要求

- 使用明确、尽量收敛的 `@match`。
- 使用递增的 `@version`。
- 填写 `@homepageURL`、`@supportURL`、`@downloadURL` 和 `@updateURL`。
- 不提交 Token、Cookie、密码或其他敏感信息。
- 涉及请求拦截时，需要说明保留和屏蔽的功能边界。

## 提交前检查

- 使用 `node --check path/to/script.user.js` 检查 JavaScript 语法。
- 确认安装链接指向 `main` 分支中的 `.user.js` 文件。
- 验证脚本只在预期网站运行，并且不会破坏页面核心功能。
