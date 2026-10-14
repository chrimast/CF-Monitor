# CF-Monitor

基于 [huilang-me/CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 的自用分支。

新增：**管理员反向终端**（方案 B）。探针主动连上 Worker，浏览器通过 xterm 使用本机 PTY。不依赖公网 22。

- 面板：https://github.com/chrimast/CF-Monitor
- Agent：https://github.com/chrimast/cfm-agent
- Worker 名：`cf-monitor`
- D1 名：`cf-monitor-db`

## 安全

终端默认关闭。后台按服务器点 **TERM** 才会启用，探针收到 `terminal_enabled=1` 后才会连 `/agent/term`。启用后，拿到 `API_SECRET` 的人可以打开该机当前 Agent 用户的壳。这与原版「单向探针、无主控通道」不同，只适合自用。

Windows 终端本 MVP 未实现。

## 后台视觉

管理后台参考 [EdgeSSH](https://github.com/aozorae/EdgeSSH) 的工作台：近黑背景 `#080b10`、橙色强调 `#f4511e`、系统字体 + Cascadia/Consolas 等宽。Apache-2.0 布局灵感见 `NOTICE`。

## 部署

1. 在 Cloudflare 创建 D1 数据库 `cf-monitor-db`。
2. 仓库 GitHub Secrets 填入 `CF_ACCOUNT_ID`、`CF_API_TOKEN`、`D1_DATABASE_ID`、`API_SECRET`。
3. 推送 `main` 会走 `.github/workflows/deploy.yml`，Worker 名为 `cf-monitor`。

不要复用现有 CF-Server-Monitor 的 Worker / D1 名称，避免撞库。
