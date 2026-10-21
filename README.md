# 次元造物 · 虚拟角色一键换装与 3D 化

上传一张二次元角色立绘，用一句话描述想换的服装，由通义万相 **wan2.7-image-pro** 生成换装结果，再一键切到 360° 3D 展示。

界面是一屏式「控制台 + 全息舞台」布局：左侧控制台（上传底图、换装描述、生成按钮），右侧展示区（示例图 / AI 结果图 / 3D 模型），底部是 AI 点评卡片。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | 原生 HTML + CSS + JS，单文件，无构建步骤 |
| 3D | `@google/model-viewer` 3.5.0（CDN 引入） |
| 后端（线上） | EdgeOne Pages Cloud Functions，Node.js 20 |
| 后端（本地） | Node.js + Express（与线上共用同一份核心逻辑） |
| 图像生成 | 阿里云百炼 · 通义万相 `wan2.7-image-pro`，同步调用 |
| 3D 生成 | Tripo3D v3 `generation/image-to-model`（图生 3D），直传图片 URL，异步任务 + 轮询 |

## 目录结构

```
ai-virtual-tryon/
├── public/
│   └── index.html            # 前端单文件（样式与逻辑内联），也是线上静态产物
├── cloud-functions/          # EdgeOne Pages 云函数，文件路径即路由
│   ├── _lib/                 # 共享模块（不导出 handler，不会注册成路由）
│   │   ├── wan.js            # 通义万相调用核心
│   │   ├── three.js          # Tripo 图生 3D + 降级逻辑
│   │   ├── env.js            # 环境变量读取（context.env / process.env）
│   │   └── http.js           # JSON 响应 / CORS
│   └── api/
│       ├── health.js         # → /api/health
│       ├── tryon.js          # → /api/tryon
│       ├── create3d.js       # → /api/create3d
│       └── check3d.js        # → /api/check3d
├── server.js                 # 本地开发入口（Express，路由与线上一致）
├── edgeone.json              # 云函数最长执行时间等运行配置
├── .env.example
└── package.json
```

## 本地运行

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# 编辑 .env，填入 ALIYUN_API_KEY
npm start
```

浏览器打开 <http://localhost:3000>。开发时可用 `npm run dev`（Node 20+ 的 `--watch` 热重启）。

## 部署到 EdgeOne Pages

整套服务可以免费跑在腾讯 EdgeOne Pages 上：静态页面走 CDN，接口走 Cloud Functions，前端与后端同域，不需要单独准备服务器。

**1. 推送代码到 GitHub**（`.env` 已被忽略，不会上传）

**2. 控制台新建项目** → 「导入 Git 仓库」→ 选中本仓库

**3. 构建配置**（这是最关键的一步）

| 配置项 | 填什么 |
|---|---|
| 框架预设 | 其他 / 无框架（Vanilla） |
| 构建命令 | 留空（没有构建步骤） |
| 输出目录 | `public` |
| Node 版本 | 20.x |

**4. 加速区域**：选「全球（不含中国大陆）」——这样绑定自定义域名**不需要 ICP 备案**；代价是云函数默认部署在新加坡，调用阿里云北京接口会多几十毫秒。

**5. 环境变量**：项目设置 → 环境变量，新增 `ALIYUN_API_KEY`（建议勾选加密）。变量值就是百炼控制台里的 API Key。

**6. 重新部署**，然后访问 `/api/health` 确认返回 `api_key_configured: true`。

**7. 绑定域名**：项目设置 → 域名管理 → 添加自定义域名 → 按提示在腾讯云 DNS 加一条 CNAME，SSL 证书自动签发。

`edgeone.json` 里已经把云函数最长执行时间调到 60 秒（平台默认只有 30 秒，换装通常要 10–20 秒，留足余量，上限可到 120 秒）。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `ALIYUN_API_KEY` | 是 | 阿里云百炼 API Key；本地写在 `.env`，线上写在 EdgeOne 环境变量 |
| `DASHSCOPE_HOST` | 否 | 默认 `https://dashscope.aliyuncs.com`；新加坡地域用 `https://dashscope-intl.aliyuncs.com` |
| `WAN_MODEL` | 否 | 默认 `wan2.7-image-pro`，可换 `wan2.7-image` |
| `WAN_SIZE` | 否 | 默认 `2K`；有图片输入时最高就是 2K |
| `WAN_TIMEOUT_MS` | 否 | 单次调用超时，默认 55000 |
| `TRIPO_API_KEY` | 否 | Tripo 的 Key（`tsk_` 开头）。不填则 3D 走演示模型。注意 `tcli_` 开头的是 Client ID，不能用于认证 |
| `TRIPO_HOST` | 否 | 默认 `https://openapi.tripo3d.com/v3`（国内可直连）；国际站 `https://openapi.tripo3d.ai/v3` 在国内会被 DNS 污染 |
| `TRIPO_MODEL_VERSION` | 否 | 默认 `v3.1-20260211`（高模，约 139 万面/42MB，网页端很重）；网页展示建议改 `P1-20260311`（游戏就绪，500–25K 面） |
| `TRIPO_FACE_LIMIT` | 否 | 面数上限，设了才传 `face_limit`；例如 `30000` |
| `TRIPO_TEXTURE_QUALITY` | 否 | `standard` / `detailed` |
| `TRIPO_TIMEOUT_MS` | 否 | Tripo 单次请求超时，默认 25000 |
| `PORT` | 否 | 本地服务端口，默认 `3000` |
| `DEMO_MODEL_URL` | 否 | Tripo 不可用时的演示模型地址 |

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，返回 `model` 与 `api_key_configured`，前端据此显示在线状态 |
| POST | `/api/tryon` | 换装。入参 `{ image_base64, prompt }`，出参 `{ success, image_url, elapsed_ms }` |
| POST | `/api/create3d` | 提交 3D 任务，入参 `{ image_url }`；返回 `task_id`、`demo`（是否降级）、`message` |
| GET | `/api/check3d?task_id=` | 查询 3D 任务，返回 `status`、`progress`、`model_url`、`preview_url` |

换装走**同步调用**：一次请求直接拿图，实测 10–20 秒返回。相比异步任务 + 轮询，少一次任务创建、少 N 次查询，更适合跑在云函数里（云函数单次执行有时长上限）。

## 实现状态

- [x] 底图上传 / 拖拽 / 压缩（长边 1280、白底 JPEG，规避透明通道限制）
- [x] 一句话换装，含分阶段加载提示与耗时计时
- [x] 结果图淡入展示、AI 点评打字机效果
- [x] 一键体验（内置示例图，无需上传）
- [x] 前后端同域部署到 EdgeOne Pages，无服务器形态
- [x] 接入 Tripo v3 图生 3D：换装结果图 → 建任务（直传 URL，无需上传）→ 轮询进度 → 加载 glb
- [x] 3D 全链路降级：没配 Key、余额不足、网络不通时自动回退演示模型并说明原因
- [ ] 3D 模型的持久化保存（Tripo 输出链接只有 5 分钟有效期）
- [ ] 历史记录与作品保存

## 注意事项

- 换装按生成张数计费（wan2.7-image-pro 约 0.5 元/张），调试时注意调用次数。
- 结果图是临时链接，**有效期 24 小时**，需要长期保存请及时下载。
- 输入图片要求：JPG / PNG / WEBP，宽高均在 240–8000 像素之间，单图不超过 20MB；PNG 不支持透明通道，前端统一压成白底 JPEG。
- 有一张图片输入时输出上限为 2K，4K 仅文生图场景支持。
- EdgeOne Pages 云函数的请求/响应体上限是 6MB，本项目只回传图片 URL，远低于限制。
- Tripo 的模型下载链接**只有 5 分钟有效期**，页面会立刻加载；刷新后需要重新生成，长期保存请下载到自己的存储。
- Tripo API 是**独立计费**的另一条业务线（100 credits = $1，图生 3D 约 20–30 credits/次），**Studio 网页订阅的积分不能用于 API**。API 余额为 0 时自动降级为演示模型，状态栏会显示余额。
- Tripo 模型链接如果没带 CORS 头，`model-viewer` 拉不到 glb，此时会自动改为显示模型预览图。
