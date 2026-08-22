# 猪周期观察 V1

这是从当前已发布的 ChatGPT Site 项目导出的 V1 源码基线。导出对应 Site 版本 17，源码提交为 `bf7481065a39b87884ee67fd4af4241af6cc65a4`。

## 技术栈

- React 19
- Next.js App Router 结构
- Vinext（通过 Vite 构建 Next.js 兼容应用）
- Vite 8
- Cloudflare Vite 插件与 Wrangler 配置
- TypeScript

当前项目不是标准的 `next dev / next build` 配置，而是 ChatGPT Sites 使用的 Vinext + Cloudflare 构建配置。

## Node.js 要求

使用 Node.js 22 或更高版本。当前 Vinext/Cloudflare 依赖声明要求 Node.js `>=22`。

## 安装与运行

安装依赖：

```bash
npm ci
```

本地开发：

```bash
npm run dev
```

生产构建：

```bash
npm run build
```

本地启动生产构建：

```bash
npm run start
```

## 项目入口与数据位置

- 页面入口：`app/page.tsx`
- 根布局与页面元数据：`app/layout.tsx`
- 全局样式：`app/globals.css`
- 股票、ETF、猪价历史数据：`app/marketHistory.ts`
- 最新指标值、数据日期、来源、计算和图表逻辑：`app/page.tsx`
- Next.js 配置：`next.config.ts`
- Vinext/Vite/Cloudflare 构建配置：`vite.config.ts`
- Cloudflare Worker 配置：`wrangler.jsonc`
- ChatGPT Sites 项目标识：`.openai/hosting.json`

当前数据全部保存在源码中。项目没有运行时爬虫、`fetch`、后端 API、数据库、D1 或 R2 依赖。

## 环境变量与敏感信息

当前项目不需要环境变量，也未发现密码、Token、API Key、Session、私钥或其他凭证，因此未创建空的 `.env.example`。

`.openai/hosting.json` 中的 `project_id` 是 ChatGPT Sites 项目标识，不是认证凭证。

## ChatGPT Sites / Cloudflare 专属部分

以下内容按当前真实源码原样保留，没有在导出时替换：

1. `.openai/hosting.json`
   - 保存 ChatGPT Sites 的项目标识，D1 和 R2 当前均为 `null`。
   - Vercel 不使用此文件；迁移分支中可以保留作来源记录，或确认备份后移除。

2. `vite.config.ts`
   - 使用 `vinext`、`@vinext/cloudflare/cache/cdn-adapter` 和 `@cloudflare/vite-plugin`。
   - `terminal.local` 是 Sites 内部预览允许域名；Vercel 不需要。

3. `wrangler.jsonc`
   - 定义 Cloudflare Worker、静态资源和缓存配置。
   - Vercel 不读取该文件。

4. `package.json`
   - `build` 使用 `vinext build`，并把 Sites 托管清单复制到 `dist/.openai`。
   - `deploy:vinext` 使用 `vinext-cloudflare`，不适用于 Vercel。

## 迁移到 Vercel 时的处理建议

先把本 ZIP 原样提交到 GitHub，作为 V1 唯一源码基线。随后在单独迁移分支中：

1. 将构建方式从 Vinext/Cloudflare 改为标准 Next.js；
2. 把脚本改为 `next dev`、`next build`、`next start`；
3. 移除 Vinext、Cloudflare Vite 插件和 Wrangler 相关依赖与配置；
4. 保留 `app/page.tsx`、`app/layout.tsx`、`app/globals.css` 和 `app/marketHistory.ts` 的页面、样式、数据与计算逻辑；
5. 重新生成锁文件并在本地通过生产构建后，再导入 Vercel。

这些 Vercel 适配修改未包含在本源码包中，避免改变已验收的 V1 基线。

## 文件树

```text
pig-cycle-observer-v1/
├── .openai/
│   └── hosting.json
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── marketHistory.ts
│   └── page.tsx
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── next-env.d.ts
├── next.config.ts
├── package-lock.json
├── package.json
├── tsconfig.json
├── tsconfig.tsbuildinfo
├── vite.config.ts
└── wrangler.jsonc
```

项目当前没有 `public`、`src`、`components` 或独立 `data` 目录；相关内容均按实际结构保存在 `app` 目录中。
