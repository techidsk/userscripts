# Userscripts

个人维护的油猴脚本合集。这里的脚本以减少网页干扰、改善使用体验和保护隐私为主要目标。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 等用户脚本管理器。
2. 点击下表中的“安装脚本”。
3. 在用户脚本管理器打开的安装页面中确认安装。

## 脚本列表

| 脚本 | 功能 | 安装 |
| --- | --- | --- |
| [斗鱼极简直播间](scripts/douyu-clean/) | 清理活动、贵族/VIP、超级弹幕和特效；默认网页全屏；自动选择最高可用画质；拦截常见统计追踪 | [安装脚本](https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/douyu-clean/douyu-clean.user.js) |

## 自动更新

脚本通过元数据中的 `@updateURL` 和 `@downloadURL` 获取更新。用户脚本管理器会按照自身的检查周期发现新版本，也可以在管理面板中手动检查更新。

## 目录约定

每个脚本放在 `scripts/<script-name>/` 下，并至少包含：

- `<script-name>.user.js`：可直接安装的用户脚本。
- `README.md`：功能、安装方式和使用说明。

## 隐私与安全

- 仓库中的脚本均可直接审阅，不上传本仓库自行收集的用户数据。
- 每个脚本应将 `@match` 限制在实际需要的网站范围内。
- 用户脚本可能会随目标网站改版而失效；发现问题请提交 [Issue](https://github.com/techidsk/userscripts/issues)。

## License

[MIT](LICENSE)
