# CF-Monitor

基于 [huilang-me/CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 的自用分支。

新增：**管理员反向终端**（方案 B）。探针主动连上 Worker，浏览器通过 xterm 使用本机 PTY。不依赖公网 22。

- 面板：https://github.com/chrimast/CF-Monitor
- Agent：https://github.com/chrimast/cfm-agent
- Worker 名：`cf-monitor`
- D1 名：`cf-monitor-db`
- 绑定名：`DB`（代码读取这个名字，不要改成 `db`）

不要复用现有 CF-Server-Monitor 的 Worker / D1 名称，避免撞库。

## 安全

终端默认关闭。后台点 **TERM** 会临时打开该机终端并进入工作台；关掉终端窗口后自动关闭。探针只有收到 `terminal_enabled=1` 才会连 `/agent/term`。拿到 `API_SECRET` 的人可以打开该机当前 Agent 用户的壳。这与原版「单向探针、无主控通道」不同，只适合自用。

Windows 终端本 MVP 未实现。

## 后台视觉

管理后台参考 [EdgeSSH](https://github.com/aozorae/EdgeSSH) 的工作台：近黑背景 `#080b10`、橙色强调 `#f4511e`、系统字体 + Cascadia/Consolas 等宽。Apache-2.0 布局灵感见 `NOTICE`。

## 部署前准备

需要：Cloudflare 账号、GitHub 账号、一条强随机 `API_SECRET`（探针上报密钥，也是后台初始密码）。

Cloudflare API Token 建议权限：

- Account Settings：Read
- Workers Scripts：Edit
- D1：Edit

Token 只放在 GitHub Secrets 或本机环境变量，不要提交进仓库，也不要发到聊天。

## 方式一：GitHub Actions（推荐）

仓库已有 `.github/workflows/deploy.yml`。推送 `main` 或在 Actions 里手动跑 `Deploy to Cloudflare Workers`。

1. 打开 [Cloudflare Dashboard → D1](https://dash.cloudflare.com/?to=/:account/workers/d1)，新建数据库，名称必须是 `cf-monitor-db`。记下 UUID（`database_id`）。
2. 复制 Cloudflare Account ID（Workers 概览页右侧）。
3. 按上面权限创建 API Token。
4. 打开 https://github.com/chrimast/CF-Monitor/settings/secrets/actions ，添加：

| Secret | 必填 | 说明 |
| --- | --- | --- |
| `CF_API_TOKEN` | 是 | Cloudflare API Token |
| `CF_ACCOUNT_ID` | 是 | Cloudflare Account ID |
| `D1_DATABASE_ID` | 是 | `cf-monitor-db` 的 UUID |
| `API_SECRET` | 是 | 探针密钥 + 后台初始密码 |

5. 推送 `main`，或 Actions → `Deploy to Cloudflare Workers` → Run workflow。
6. 当前线上地址：

```text
https://cf-monitor.chrimast.workers.dev
后台：https://cf-monitor.chrimast.workers.dev/admin#/admin
```

工作流会在 CI 里生成带真实 `database_id` 的 `wrangler.toml` 再 `wrangler deploy`，并写入 Worker Secret `API_SECRET`。仓库里的 `wrangler.toml` 没有真实 D1 UUID，只给本地测试用。

Workers 免费套餐全账号最多 5 条 Cron。本账号已满，所以当前部署**不挂定时任务**；离线检测、资源告警、到期提醒不会自动跑，面板和反向终端仍可用。腾出 Cron 额度或升级 Paid 后，再把 `wrangler.toml` / `deploy.yml` 里的 `[triggers]` 打开。

未配置 `CF_ACCOUNT_ID` 时，push 不会部署（工作流 `check` 会跳过），避免空跑失败。

## 方式二：Cloudflare Dashboard 连接 GitHub

1. Cloudflare Dashboard → Workers & Pages → Create → 导入本仓库。
2. 构建命令：`npm run build:frontend`
3. 部署命令：`npx wrangler deploy`
4. 先创建 D1 `cf-monitor-db`，绑定名必须是 `DB`。
5. 在 Worker 的 Variables and Secrets 里添加 `API_SECRET`。
6. 确认 `wrangler.toml` 的 `name = "cf-monitor"`，不要和已有 `cf-server-monitor` 撞名。

## 方式三：一键 Deploy 按钮

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chrimast/CF-Monitor)

向导里如果提示名称冲突，把 Worker / D1 改成 `cf-monitor` / `cf-monitor-db`。部署后立刻把默认 `API_SECRET` 换成强随机值，并登录后台改管理员密码。

长期使用仍建议方式一或方式二。

## 首次使用

1. 打开 `/admin#/admin`
2. 用户名 `admin`，密码等于刚设置的 `API_SECRET`
3. 登录后立刻改后台用户名和密码。改密码不会改探针用的 `API_SECRET`
4. 添加服务器 → 复制安装命令 → 在目标机器执行（脚本仓库是 `chrimast/cfm-agent`）
5. Linux (systemd) 复制的是一行 `curl | sh`，脚本会建专用 `cfm` 用户并装到 `/opt/cfm/.cf-probe/`。反向终端是 cfm 的壳，不是 root。需要 sudo。OpenWrt/Alpine/群晖/FreeBSD/macOS/Windows 仍按所选系统安装。
6. 需要终端时：对该机点 **TERM** 进入工作台；关掉窗口后自动关闭

探针上报地址是 Worker 的 `/update`，例如 `https://cf-monitor.<子域>.workers.dev/update`。

## 本机用 Wrangler 部署（有 Token 时）

```bash
export CLOUDFLARE_API_TOKEN='...'
export CLOUDFLARE_ACCOUNT_ID='...'
cd CF-Monitor
npm install
npx wrangler d1 list --json
# 没有 cf-monitor-db 再创建：
npx wrangler d1 create cf-monitor-db
npm run build:frontend
# 把返回的 UUID 写进临时 wrangler.toml 的 database_id，不要提交
npx wrangler deploy
printf '%s' "$API_SECRET" | npx wrangler secret put API_SECRET
```

手机操作不要跑 `wrangler login`：OAuth 回调是本机 `localhost`，用 API Token。

## 部署后核对

- Worker 名称是 `cf-monitor`，不是 `cf-server-monitor`
- D1 绑定名是 `DB`，库名是 `cf-monitor-db`
- `API_SECRET` 已出现在 Worker Secrets
- `/admin#/admin` 能打开登录页
- 未登录不能连终端 WebSocket

## Agent

安装、日志、升级见 https://github.com/chrimast/cfm-agent 。服务名仍是 `cf-probe`。
