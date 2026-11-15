# GitHub Pages deployment

Last Harbor: Departure 在本地预编译，由 GitHub Pages 托管静态文件。源码保留在 `main`，`gh-pages` 只存放发布包，并拥有独立提交历史。GitHub 无需执行 npm 安装或游戏构建。

正式地址：**https://lastharbor.zhuiguang.tech/**

源码仓库：[zhuiguang49/LastHarbor-Departure](https://github.com/zhuiguang49/LastHarbor-Departure)

## 两种构建模式

所有命令在独立的 `LastHarbor/` 仓库执行，需要 Node.js 20+、npm 和 Git。

| 用途 | 命令 | 包内 base | CNAME | 本地预览 |
| --- | --- | --- | --- | --- |
| 正式自定义域名 | `npm run build:pages` | `/` | `lastharbor.zhuiguang.tech` | `http://127.0.0.1:4181/` |
| GitHub 项目路径备用测试 | `npm run build:pages:project` | `/LastHarbor-Departure/` | 无 | `http://127.0.0.1:4181/LastHarbor-Departure/` |
| 日常本地运行 | `npm run build` | `/` | 无 | `http://127.0.0.1:4181/` |

每次构建都会重建 `dist/`。两种发布包的路径配置不能混用。正式域名包不能挂在项目子路径下，项目路径包也不能直接用于自定义域名根路径。

## 本地构建与验证

```sh
npm ci
npm run build:pages
npm test
npm start
```

访问根地址或 `/campaign/`，都应进入完整战役标题界面。点击“开始行动”检查第一章报幕。首次点击画布获取鼠标锁定；音频由用户交互初始化。

在另一个终端运行真实 Google Chrome 检查（需已安装 Chrome）：

```sh
npm run test:browser
```

该检查覆盖标题、第一章报幕、静态资源、音频初始化、鼠标锁定、暂停、刷新和返回，不执行全关卡游玩。截图与结果存入被 Git 忽略的 `artifacts/browser-smoke/`。

停止预览服务器后，可验证备用包：

```sh
npm run build:pages:project
npm run test:release
npm start
```

另一个终端：

```sh
LASTHARBOR_URL=http://127.0.0.1:4181/LastHarbor-Departure/ npm run test:browser
```

测试结束后停止服务器，并重新运行 `npm run build:pages`，让 `dist/` 恢复为正式根路径包。

`npm start` 是纯静态服务器，只读取 `dist/`；不会从源码补齐缺失资源。`release-manifest.json` 记录模式、base、域名、包内文件及构建输入的大小和 SHA-256。包中包含根目录的 `.nojekyll`、许可与第三方通知；正式包另含仅一行域名的 `CNAME`。

## 准备 gh-pages

先审查并提交需要发行的源码到本地 `main`，确保 `git status --short` 为空。不要将 `dist/`、本地测试产物或原始录屏提交到 `main`。源码提交后可重新构建，避免发布过期包。

```sh
npm run build:pages
npm run pages:dry-run
npm run pages:prepare
```

`pages:dry-run` 校验静态包并检查远端分支，输出发布计划，不创建提交或更新分支。源码尚未提交时会显示 `ready: false`。检查远端需要网络与仓库读取权限；远端分支存在时会 fetch 到本地以核对历史。

`pages:prepare` 要求干净的 `main`、正确的目标仓库和与当前源码一致的发布包。工具使用隔离的 Git index 创建本地 `gh-pages`，不会切换当前分支或更改 `main` 的工作文件和 index，也不会推送。同一包重复准备不会产生空提交。

准备之前会检查并获取远端 `gh-pages`。远端领先时保留其提交作为父提交，包括 GitHub Pages 设置页添加的 CNAME；本地领先时在本地历史上继续。如果两边分叉，工具停止并保留现有分支，需维护者检查后决定处理方式。不要使用 force push 绕过检查。

已经配置自定义域名的 `gh-pages` 不接受会移除 CNAME 的项目路径包；这个备用包仍可在本地单独测试。域名不匹配也会停止，防止无意切换站点配置。

## 发布到 GitHub

完成本地验收并准备好分支后，由维护者执行：

```sh
git push origin main
git push origin gh-pages:gh-pages
```

使用普通快进推送。若推送被拒绝，重新运行 `npm run pages:dry-run` 和 `npm run pages:prepare`，检查远端新提交后再推送；历史分叉时先停下处理。不要重建一个孤立分支来覆盖远端历史。

首次发布后，在仓库 **Settings → Pages** 中设置：

| 设置项 | 值 |
| --- | --- |
| Source | Deploy from a branch |
| Branch | gh-pages |
| Folder | /(root) |
| Custom domain | lastharbor.zhuiguang.tech |

`.nojekyll` 让 Pages 跳过 Jekyll 处理。GitHub 仍可能使用其管理的 Actions 流程完成静态部署。详见 [GitHub 发布来源说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。私有仓库的 Pages 可用性取决于账户方案与仓库设置。

## 域名与 HTTPS

先在 GitHub Pages 中绑定上述 Custom domain，再到 `zhuiguang.tech` 的 DNS 服务商添加记录：

| 类型 | 主机记录 | 目标 |
| --- | --- | --- |
| CNAME | lastharbor | zhuiguang49.github.io |

目标不带 `https://`，也不带 `/LastHarbor-Departure/`。`dist/CNAME` 是站点域名配置文件，不能代替 DNS 记录。`gh-pages` 根目录必须保留这个文件。

GitHub 建议先绑定域名再修改 DNS；通过设置页保存域名时，GitHub 可能向发布分支添加 CNAME 提交。后续发布须先同步检查该提交，准备工具已包含此步骤。参见 [GitHub 自定义域名配置](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)。

检查解析与站点响应：

```sh
dig +short CNAME lastharbor.zhuiguang.tech
curl -I https://lastharbor.zhuiguang.tech/
curl -I https://lastharbor.zhuiguang.tech/local/night.mjs
```

DNS 应指向 `zhuiguang49.github.io.`。在 Settings → Pages 查看域名检查和部署状态；证书就绪后启用 **Enforce HTTPS**。DNS 传播和 HTTPS 选项出现可能需要约 24 小时，期间不要反复切换域名。参见 [GitHub HTTPS 说明](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)。

上线后用浏览器访问根地址与 `/campaign/`，检查第一章开场、刷新、鼠标锁定和音频，并检查 Network/Console 无资源、MIME 或跨域错误。自定义域名绑定后，GitHub 默认网址可能重定向到该域名；项目路径兼容性仍可用本地备用包验证。

## 后续更新

在开发主仓库完成开发后，将审核过的变化同步到独立发行工程。在 `LastHarbor/` 的 `main` 审查并提交，再依次执行正式构建、测试、静态预览、Chrome smoke、Pages dry-run 和 prepare，最后由维护者推送两个分支。继续使用相同的自定义域名构建，CNAME 会随每次发布重新生成。

## 排查

| 现象 | 检查 |
| --- | --- |
| 域名根地址的资源 404 | manifest 的 base 应为 `/`；不要发布项目路径包 |
| 模块 MIME 错误 | Network 中检查 `.mjs` 的响应类型和正文；HTML 404 页面通常表示路径或文件遗漏 |
| CNAME 缺失或域名消失 | 重新正式构建；确认 `gh-pages:CNAME` 位于分支根目录且域名一致 |
| prepare 提示旧包或哈希不符 | 在当前源码上重新构建，不手改 dist |
| prepare 提示历史分叉 | 检查本地与远端 gh-pages 提交，人工决定处理；不要强推 |
| Pages 404 | 检查发布分支、根目录、最近部署结果和账户 Pages 权限 |
| HTTPS 尚不可选 | 核对 DNS、域名检查与证书状态，等待传播和签发 |
| 无声音或鼠标未捕获 | 点击开始与画布，确认浏览器允许音频和 Pointer Lock |
