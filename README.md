# Userscripts

个人维护的油猴脚本合集。这里的脚本以减少网页干扰、改善使用体验和保护隐私为主要目标。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 等用户脚本管理器。
2. 点击下表中的“安装脚本”。
3. 在用户脚本管理器打开的安装页面中确认安装。

## 脚本列表

| 脚本 | 功能 | 安装 |
| --- | --- | --- |
| [Bilibili 视频下载助手](scripts/bilibili-video-downloader/) | 下载普通视频页的兼容版，或分别保存高清 DASH 视频与音频轨；支持分 P、FFmpeg 合并命令和备用 CDN | [安装脚本](https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/bilibili-video-downloader/bilibili-video-downloader.user.js) |
| [斗鱼极简直播间](scripts/douyu-clean/) | 清理活动、贵族/VIP、超级弹幕和特效；默认网页全屏；自动选择最高可用画质；拦截常见统计追踪 | [安装脚本](https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/douyu-clean/douyu-clean.user.js) |
| [小红书：屏蔽点点 AI](scripts/xiaohongshu-no-diandian-ai/) | 隐藏点点 AI 入口和占位；阻止 AI 对话与搜索增强请求；保留普通笔记搜索 | [安装脚本](https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/xiaohongshu-no-diandian-ai/xiaohongshu-no-diandian-ai.user.js) |
| [雪球公开页面净化](scripts/xueqiu-public-clean/) | 抑制公开页面自动登录弹窗；匿名打开帖子讨论；移除下载推广并减少非必要追踪 | [安装脚本](https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/xueqiu-public-clean/xueqiu-public-clean.user.js) |

## 自动更新

脚本通过元数据中的 `@updateURL` 和 `@downloadURL` 获取更新。用户脚本管理器会按照自身的检查周期发现新版本，也可以在管理面板中手动检查更新。

## 目录约定

每个正式脚本放在 `scripts/<script-slug>/` 下：

```text
scripts/<script-slug>/
├─ <script-slug>.user.js
├─ README.md
└─ CHANGELOG.md
```

可按需增加 `src/`、`tests/` 和 `assets/`。完整的命名、元数据、版本、隐私和验证要求见[用户脚本目录与发布规范](docs/script-conventions.md)。

## 隐私与安全

- 仓库中的脚本均可直接审阅，不收集或上传用户数据。
- 每个脚本应将 `@match` 限制在实际需要的网站范围内。
- 用户脚本可能会随目标网站改版而失效；发现问题请提交 [Issue](https://github.com/techidsk/userscripts/issues)。

## License

[MIT](LICENSE)
