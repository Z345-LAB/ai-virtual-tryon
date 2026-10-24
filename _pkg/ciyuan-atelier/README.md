# 次元造物 · AI 虚拟角色换装与 3D 化

> 上传一张二次元角色图，用一句话描述想换的服装，10 秒生成新造型，再一键变成可 360° 旋转的 3D 模型。

**在线演示**：<https://aitry.online>

**赛道**：第九届传智杯 · AI创新应用挑战赛（基于 Vibe Coding 的全栈应用速成挑战赛）

---

## 它解决什么问题

给二次元角色换一套衣服，传统流程是：找画师 → 描述需求 → 等稿 → 改稿，一套几百到几千元、几天周期。

这个项目把这件事压到 **一句话 + 10 秒**：上传角色图，写「换成赛博朋克机甲服」，直接出版式一致的换装图；再点一下，同一个造型变成可在网页里 360° 旋转的 3D 模型。

适用场景：同人创作试造型、游戏/漫剧前期概念预演、虚拟主播形象迭代、AI 绘画工作流的中间环节。

## 效果链路

```
角色图 + 一句话描述
      ↓  通义万相 wan2.7-image-pro（同步调用，约 10 秒）
   换装结果图（1–2MB）
      ↓  Tripo v3 generation/image-to-model（异步任务，约 80 秒）
   可旋转的 3D 模型（.glb，约 5MB）
```

---

## 10 分钟极速复现（复现性声明 + 重现指南）

### 复现性声明

本项目**完全可复现**：无数据库、无私有依赖、无编译步骤。
所有外部服务均为公开商业 API（阿里云百炼、Tripo），仅需自备密钥即可运行；
前端不依赖任何第三方 CDN（3D 渲染组件已本地托管），断网环境下页面仍可正常打开。

### 1. 环境要求

| 项 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | **≥ 18**（推荐 20 LTS） | `node -v` 自检 |
| npm | 随 Node 附带 | `npm -v` 自检 |
| 操作系统 | Windows / macOS / Linux | 均可 |
| 浏览器 | Chrome 90+ / Edge 90+ / Safari 15+ | 3D 需 WebGL 支持 |
| 网络 | 可访问阿里云与 Tripo 接口 | 仅生成时需要 |

不需要：数据库、Redis、Docker、任何云账号。

### 2. 依赖清单

**后端**（`package.json`，共 3 个直接依赖）：

| 包 | 版本 | 用途 |
| --- | --- | --- |
| express | ^4.21.2 | 本地 HTTP 服务 |
| cors | ^2.8.5 | 跨域预检（线上同域部署时其实用不到，保留以便分离部署） |
| dotenv | ^16.4.5 | 读取 `.env` 环境变量 |

**前端**：零依赖。`public/vendor/model-viewer.min.js` 为本地托管的 Web Component，随仓库提供，无需 npm 安装。

**云函数**：零依赖。`cloud-functions/_lib` 仅使用 Node 内置模块（`https`、`fetch`、`URL`）。

### 3. 环境变量

**演示包内已预填可用的密钥**（`.env` 文件），开箱即可运行，无需申请。
若想改用你自己的密钥，替换 `.env` 里对应两行即可；`.env.example` 为空白模板，逐项都有注释说明。

| 获取方式 | 阿里云百炼控制台 → API-KEY 管理；Tripo 开发者平台 → API Keys |
| --- | --- |

完整变量清单：

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ALIYUN_API_KEY` | **是** | — | 阿里云百炼 API Key，用于 2D 换装 |
| `TRIPO_API_KEY` | **是** | — | Tripo API Key，用于 3D 生成 |
| `WAN_MODEL` | 否 | `wan2.7-image-pro` | 换装模型 |
| `WAN_SIZE` | 否 | `2K` | 出图尺寸（1K 约 1.6MB / 2K 约 5.4MB） |
| `WAN_TIMEOUT_MS` | 否 | `55000` | 万相请求超时（毫秒） |
| `DASHSCOPE_HOST` | 否 | `https://dashscope.aliyuncs.com` | 万相服务域名（新加坡区改为 `dashscope-intl`） |
| `TRIPO_MODEL_VERSION` | 否 | `v3.1-20260211` | 3D 模型版本（可选 `P1-20260311` 低模） |
| `TRIPO_MULTIVIEW` | 否 | `on` | `on` 走四视图重建（更准），`off` 走单图（省 10 credits） |
| `TRIPO_FACE_LIMIT` | 否 | 不设（全精度） | 设数值可限面数，仅在弱网演示时使用 |
| `TRIPO_TEXTURE_QUALITY` | 否 | 不设（standard） | 可设 `detailed`，贴图更细但多花约 10 credits |
| `TRIPO_SMART_LOW_POLY` | 否 | 不设 | 设为 `true` 时额外请求智能减面 |
| `TRIPO_HOST` | 否 | `https://openapi.tripo3d.com/v3` | Tripo 国内站（国际站 `.ai` 域名国内被污染） |
| `TRIPO_TIMEOUT_MS` | 否 | `25000` | Tripo 请求超时（毫秒） |
| `DEMO_MODEL_URL` | 否 | `/models/robot.glb` | 内置演示模型路径（仅在明确标注时使用） |
| `PORT` | 否 | `3000` | 本地端口 |

### 4. 三步跑起来

**方式 A：网盘包（已预填密钥，最省事）**

```bash
# ① 解压后进入目录（无需 clone，也不用复制 .env，包内已带）
cd ciyuan-atelier

# ② 装依赖（首次约 1 分钟）
npm install

# ③ 启动
npm start
```

Windows 用户也可以**直接双击 `start.bat`**，它会自动检查 Node、自动装依赖、自动启动。

> 注意：包内 `.env` 已预填可用密钥，**不要**执行 `cp .env.example .env`，那会用空模板覆盖掉。

**方式 B：从 GitHub 克隆（仓库不含密钥）**

```bash
git clone https://github.com/Z345-LAB/ai-virtual-tryon.git
cd ai-virtual-tryon
npm install
cp .env.example .env     # Windows: copy .env.example .env
# 打开 .env，填入 ALIYUN_API_KEY 与 TRIPO_API_KEY（见下方变量表）
npm start
```

看到下面这行即成功：

```
✅ 本地服务已启动: http://localhost:3000
   模型: wan2.7-image-pro | API Key: 已配置
```

浏览器打开 <http://localhost:3000>，点「一键体验」→ 30 秒出三张候选 → 选定 → 生成 3D。

### 5. 演示密钥的额度说明（如实告知）

演示包内的密钥**只用于本次评审复现**，且额度有限：

| 资源 | 额度 | 折算 |
| --- | --- | --- |
| Tripo（3D） | 约 150 credits | 完整四视图重建约 30–40 credits/次，约可用 4 次 |
| 通义万相（2D） | 按张计费 | 单张约 10 秒，额度较充裕 |

额度用尽后的行为（不会静默失败）：

| 功能 | 表现 |
| --- | --- |
| 页面、上传、历史、微调描述 | ✅ 不受影响 |
| 2D 换装 | 明确提示具体错误原因 |
| 3D 生成 | 明确提示服务不可用，**保留换装图**，不拿演示模型冒充 |

想体验完整效果又不消耗额度，可直接访问线上地址 <https://aitry.online>。

### 6. 三步验证（确认不是"看起来能跑"）

| 验证 | 方法 | 预期 |
| --- | --- | --- |
| 服务活着 | `curl http://localhost:3000/api/health` | `{"ok":true,"api_key_configured":true,"tripo_key_configured":true,...}` |
| 密钥生效 | 同上，看两个 `*_configured` | 都应为 `true` |
| 业务通 | 页面上点「一键体验」 | 30 秒内出现三张候选图 |

> 未配置密钥也能启动，但不会白屏假装成功：换装会明确提示"未配置 ALIYUN_API_KEY"，
> 3D 会明确提示"服务不可用"并保留换装图，**不会用演示模型冒充结果**。

### 7. 常见问题

| 现象 | 原因与解决 |
| --- | --- |
| `npm install` 报错 | 换国内镜像：`npm config set registry https://registry.npmmirror.com` |
| 端口被占用 | 改 `.env` 里的 `PORT=3001` |
| 页面提示"连不上后端" | 启动窗口被关闭，重新 `npm start` |
| 提示未配置 Key | `.env` 与 `server.js` 不在同一目录，或键名拼写错误 |
| 3D 提示不可用 | 第三方服务临时故障，换装图会保留，稍后重试 |

### 8. 不想装环境？

直接访问线上地址：**<https://aitry.online>** （功能与本地完全一致）


## 部署（EdgeOne Pages）

| 配置项  | 值                                                         |
| ---- | --------------------------------------------------------- |
| 框架预设 | 其他 / 无框架                                                  |
| 构建命令 | 留空                                                        |
| 输出目录 | `public`                                                  |
| 加速区域 | 全球（不含中国大陆）→ 免 ICP 备案                                      |
| 环境变量 | `ALIYUN_API_KEY`、`TRIPO_API_KEY`（`TRIPO_FACE_LIMIT` 默认不设＝全精度） |

部署后访问 `/api/health` 自检，`api_key_configured` 与 `tripo_key_configured` 都为 `true` 即配置正确。
该接口只返回四项（`ok` / 两个密钥状态 / `time`），不暴露模型名、服务商地址与密钥长度。

---

## 技术栈

| 层     | 选型                                     | 选型理由                             |
| ----- | -------------------------------------- | -------------------------------- |
| 前端    | 原生 HTML + CSS + JS，单文件                 | 无构建步骤，EdgeOne 直接静态托管，改一行就能上线     |
| 3D 渲染 | `@google/model-viewer` 3.5.0（本地托管）     | 一个标签拿到旋转/缩放/光照，不必自己搭 Three.js 场景 |
| 后端    | EdgeOne Pages Cloud Functions（Node 20） | 与静态资源同域，免二次跨域配置，免费额度够用           |
| 本地开发  | Express（与线上共用同一份 `_lib`）               | 本地调通的行为可以直接相信线上                  |
| 图像生成  | 通义万相 `wan2.7-image-pro`，同步调用           | 一次请求拿图，约 10 秒，适合云函数 60 秒执行上限     |
| 3D 生成 | Tripo v3 `generation/image-to-model`   | 支持直接传公网图片 URL，免去 multipart 上传    |

## 目录结构

```
ai-virtual-tryon/
├── public/                        # 静态产物（EdgeOne 输出目录）
│   ├── index.html                 # 单文件前端
│   ├── models/robot.glb           # 本地演示模型（464KB）
│   └── vendor/model-viewer.min.js # 本地托管的 3D 组件
├── cloud-functions/               # 云函数，文件路径即路由
│   ├── _lib/                      # 共享核心（不导出 handler，不注册为路由）
│   │   ├── wan.js                 # 通义万相调用
│   │   ├── three.js               # Tripo 调用 + 降级策略
│   │   ├── net.js                 # 请求层（fetch / node:https 双通道）
│   │   ├── env.js                 # 环境变量读取
│   │   └── http.js                # JSON 响应与 CORS
│   └── api/
│       ├── health.js              # → /api/health
│       ├── tryon.js               # → /api/tryon
│       ├── create3d.js            # → /api/create3d
│       └── check3d.js             # → /api/check3d
├── server.js                      # 本地 Express 入口
├── edgeone.json                   # 云函数最长执行时间 60s
└── docs/
    ├── ai-history/                # AI 协同开发记录（Prompt 快照）
    └── technical-design.md        # 技术文档
```

## 接口

| 方法   | 路径                      | 入参                         | 出参                                             |
| ---- | ----------------------- | -------------------------- | ---------------------------------------------- |
| GET  | `/api/health`           | —                          | 模型名、Key 配置状态、运行时自检、3D 参数                       |
| POST | `/api/tryon`            | `{ image_base64, prompt }` | `{ success, image_url, elapsed_ms }`           |
| POST | `/api/create3d`         | `{ image_url }`            | `{ success, task_id, demo }`                   |
| GET  | `/api/check3d?task_id=` | —                          | `{ status, progress, model_url, preview_url }` |

## 三个关键设计

**1. 同步调用而非异步轮询**  
万相的异步接口要「建任务 + 每 3 秒轮询」，最长 150 秒，超过云函数 60 秒上限。改用同步接口后一次请求拿到图，实测 10 秒——**比轮询还快**，同时把架构复杂度降了一档。

**2. 3D 任务无状态化**  
`task_id` 形如 `t3d_<base36 时间戳>`，状态由时间推导，不依赖服务端内存。这样云函数扩容到任意节点都能算出同一结果。

**3. 失败可见 + 可重试**  
没配 Key / 余额不足 / 网络超时 / 模型加载失败，任何一种都会**明确写出原因并保留已有结果**，允许重试。外部服务不可控，但「页面假死」和「拿假结果冒充」都是产品缺陷——所以 3D 失败时不会退回演示模型，宁可让你看到失败。

## 成本与限制

| 项 | 数值 |
| --- | --- |
| 2D 换装 | 约 0.5 元/张，一次出三张 ≈ 1.5 元（万相按张计费） |
| 3D 生成（四视图） | 约 30–40 credits ≈ 0.3–0.4 美元/次（扩视图 10 + 重建 20–30） |
| 3D 生成（单图） | 约 20–30 credits（设 `TRIPO_MULTIVIEW=off` 可省 10） |
| 完整链路耗时 | 三候选约 30 秒 + 3D 约 100–120 秒 |
| 结果图有效期 | 24 小时（阿里云 OSS 临时链接） |
| 3D 模型有效期 | 5 分钟（Tripo 输出链接），已缓存进本地历史则不受限 |

**已知限制**：

- 3D 生成速度受制于第三方服务，现场演示需预留 2 分钟；全精度模型约 145 万面 / 40 MB，弱网加载慢
  （弱网可设 `TRIPO_FACE_LIMIT=30000` 压到约 5 MB，代价是侧脸与五官变糊）
- 历史只存在浏览器本地（IndexedDB，最多 20 条），换设备或清缓存即丢失，不做云端同步
- 单次请求受云函数 60 秒上限约束，因此 3D 采用「建任务 + 前端轮询」而非一次等待

## AI 协同开发

本项目全程采用人机协同完成：**人负责定义目标、拍板取舍、真机验证与代码推送；AI 负责读代码、定位问题、实现与实测。**

开发过程中的关键对话、被推翻的错误推断，以及每一步对应的提交，记录在 [`docs/ai-history/`](docs/ai-history/README.md)。

## 提交历史

提交按关注点拆分（`feat` / `fix` / `refactor` / `docs` / `perf`），每个提交对应一个可验证的功能点或一次明确的问题修复，未使用一次性提交。

## 许可

仅用于参赛与学习演示。生成内容的使用请遵守阿里云百炼与 Tripo 各自的服务条款。
