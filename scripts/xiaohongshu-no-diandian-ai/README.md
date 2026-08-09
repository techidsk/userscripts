# 小红书：屏蔽点点 AI

面向小红书网页端的精简油猴脚本，隐藏“点点 AI”入口，阻止已识别的 AI 对话与搜索增强请求，同时保留普通笔记搜索。

## 安装

[点击安装小红书：屏蔽点点 AI](https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/xiaohongshu-no-diandian-ai/xiaohongshu-no-diandian-ai.user.js)

需要先安装 Tampermonkey 或兼容的用户脚本管理器。

## 功能

- 隐藏左侧“点点”菜单的完整菜单行，不保留空白占位。
- 隐藏搜索框中的点点按钮、AI 推荐内容和相关入口。
- 检测到点点模式处于启用状态时，自动切回普通搜索模式。
- 访问 `/search_result_ai`、`/ai_chat` 或 `/ai_chat_tab` 时，跳回普通搜索或发现页。
- 拦截已识别的点点 AI 对话、DQA、AI 推荐词和联网搜索接口。
- 为被拦截的请求返回本地空成功结果，避免页面弹出网络错误或反复重试。

## 请求拦截边界

脚本会拦截点点 AI 专用的 `send/ai`、`search/dqa`、`search/ask/guide/words`、`search/trending/query`、`search/pc/websearch` 和 `v1/dqa` 请求。

普通笔记搜索请求会被保留。`/api/sns/web/v2/search/notes` 同时承载普通搜索结果，因此默认不拦截；脚本配置中的 `blockAiNotesV2` 仅用于手动排查，不建议日常开启。

脚本不是浏览器网络层防火墙，无法保证拦截扩展注入前已经发出的极早请求，也不会修改小红书客户端或服务端数据。

## 调试

如需确认拦截情况，可将脚本顶部 `CONFIG` 中的 `debug` 改为 `true`，然后在浏览器开发者工具 Console 中查看记录。

## 运行方式与权限

脚本使用 `document-start`，并声明 `@sandbox raw` 与 `unsafeWindow`，因为必须在小红书页面脚本初始化前改写页面主世界的 `fetch`、XHR 和 `sendBeacon`。权限仅用于当前小红书标签页中的界面清理与请求拦截，不读取或上传 Cookie、Token、账号信息和浏览历史。

## 兼容性

主要面向桌面版 Chromium 浏览器和 Tampermonkey。小红书更新页面结构或接口后，个别选择器和请求规则可能需要同步调整。

遇到搜索、布局或请求拦截问题时，请提交 [Issue](https://github.com/techidsk/userscripts/issues)，并附上页面地址、浏览器版本、问题截图以及 Console 中的相关记录。

版本变化见 [CHANGELOG.md](CHANGELOG.md)。
