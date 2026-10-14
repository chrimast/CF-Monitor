# CF-Monitor

基于 [huilang-me/CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 的自用分支。

新增：**管理员反向终端**（方案 B）。探针主动连上 Worker，浏览器通过 xterm 使用本机 PTY。不依赖公网 22。

- 面板：https://github.com/chrimast/CF-Monitor
- Agent：https://github.com/chrimast/cfm-agent
- Worker 名：`cf-monitor`
- D1 名：`cf-monitor-db`

## 安全

终端默认关闭。后台按服务器点 **TERM** 才会启用。启用后，拿到 `API_SECRET` 的人可以打开该机当前 Agent 用户的壳。这与原版「单向探针、无主控通道」不同，只适合自用。

Windows 终端本 MVP 未实现。

## 后台视觉

管理后台参考 [EdgeSSH](https://github.com/aozorae/EdgeSSH) 的工作台：近黑背景 `#080b10`、橙色强调 `#f4511e`、系统字体 + Cascadia/Consolas 等宽。Apache-2.0 布局灵感已在此注明。

## 部署

Fork 后按原 CF-Server-Monitor 流程部署，但 Worker / D1 名称换成上面两个，避免和现有 CFSM 实例撞库。
