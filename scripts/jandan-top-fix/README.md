# 煎蛋热榜：主题防闪与图片优化

[安装脚本](https://raw.githubusercontent.com/techidsk/userscripts/main/scripts/jandan-top-fix/jandan-top-fix.user.js)

适用于 `https://jandan.net/*` 和 `https://www.jandan.net/*`，包括热榜。匹配全站以兼容从首页进入热榜的单页导航。

## 功能

- 在 `document-start` 提前恢复网站的 `darkMode` 设置，减少主题闪烁；首次无设置时默认暗色。
- 恢复 `.img-frame` 中图片的正常加载，避免额外懒加载与隐藏占位机制冲突。
- 每秒检查媒体状态，后台标签页跳过检查。只对确实已完成加载的图片或视频添加自有属性，通过 CSS 解除隐藏。
- 不删除 Vue 节点、不修改组件状态类、不模拟加载事件、不修改图片 URL。

## 使用

安装后刷新页面。没有快捷键或菜单命令；主题仍使用网站开关。

从聊天中的旧版本升级时，请替换原脚本，避免同时启用多个副本。为保持替换识别，保留原来的 `local.jandan.fixes` namespace。

## 权限与隐私

使用 `@grant none`、`@noframes`。提前运行仅用于恢复主题，不拦截网络，不收集或上传数据。不修改图片通道和 GIF 设置；旧版本已经保存到网站的设置不会自动还原，可在网站界面调整。

## 兼容性与限制

- 需要支持 CSS `:has()` 的现代浏览器；主题防闪效果受用户脚本注入时机影响。
- 已下载成功但被隐藏的资源可进行显示兜底；图床不可达、403、过期签名或站点 JavaScript 异常无法保证修复。
- 不提供额外图片缓存或严格的请求并发控制。
- 已通过 JavaScript 语法和模拟媒体状态检查，尚未完成真实浏览器验收。
- 禁用并刷新可撤销显示修改；已经保存的主题偏好保留。

[反馈问题](https://github.com/techidsk/userscripts/issues)
