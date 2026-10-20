# 次元造物 · 虚拟角色一键换装与 3D 化

上传一张二次元角色立绘，用一句话描述想换的服装，由通义万相 **wan2.7-image-pro** 生成换装结果，再一键切到 360° 3D 展示。

界面是一屏式"控制台 + 全息舞台"布局：左侧控制台（上传底图、换装描述、生成按钮），右侧展示区（示例图 / AI 结果图 / 3D 模型），底部是 AI 点评卡片。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | 原生 HTML + CSS + JS，单文件，无构建步骤 |
| 3D | `@google/model-viewer` 3.5.0（CDN 引入） |
| 后端 | Node.js 18+ / Express 4 |
| 图像生成 | 阿里云百炼 · 通义万相 `wan2.7-image-pro`（异步任务 + 轮询） |

## 目录结构

```
ai-virtual-tryon/
├── index.html            # 单文件前端（样式与逻辑内联）
├── functions/
│   └── tryon.js          # Express 服务：换装接口 + 3D 接口 + 健康检查
├── public/               # 预留：需要本地静态素材时放这里（可不存在）
├── .env.example          # 环境变量模板
├── package.json
└── README.md
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置密钥：复制模板后填入自己的 API Key
cp .env.example .env      # Windows: copy .env.example .env

# 3. 启动
npm start
```

浏览器打开 <http://localhost:3000> 即可。开发时可用 `npm run dev`（Node 18+ 的 `--watch` 热重启）。

> 前端也可以直接双击打开（`file://`）或挂到 Live Server 上，会自动把接口指向 `localhost:3000`；但同源访问最稳。若改了后端端口，记得同步 `index.html` 顶部的 `BACKEND_PORT`。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `ALIYUN_API_KEY` | 是 | 阿里云百炼 API Key，未配置时换装接口返回明确提示 |
| `PORT` | 否 | 服务端口，默认 `3000` |
| `DASHSCOPE_HOST` | 否 | 默认 `https://dashscope.aliyuncs.com`；新加坡地域用 `https://dashscope-intl.aliyuncs.com` |
| `WAN_MODEL` | 否 | 默认 `wan2.7-image-pro`，可换 `wan2.7-image` |
| `DEMO_MODEL_URL` | 否 | 3D 演示模型地址 |

`.env` 已在 `.gitignore` 中，不会被提交。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，返回 `model` 与 `api_key_configured`，前端用它显示在线状态 |
| POST | `/functions/tryon` | 换装。入参 `{ image_base64, prompt }`，出参 `{ success, task_id, image_url }` |
| POST | `/functions/create3d` | 提交 3D 任务，入参 `{ image_url }`，返回 `task_id` |
| GET | `/functions/check3d?task_id=` | 查询 3D 任务，返回 `status` 与 `model_url` |

换装接口内部流程：创建异步任务（`X-DashScope-Async: enable`）→ 每 3 秒轮询 `/api/v1/tasks/{task_id}` → 最多 150 秒 → 解析 `output.choices[0].message.content[].image` 返回。

## 实现状态

- [x] 底图上传 / 拖拽 / 压缩（长边 1280、白底 JPEG，规避透明通道限制）
- [x] 一句话换装，含分阶段加载提示与耗时计时
- [x] 结果图淡入展示、AI 点评打字机效果
- [x] 一键体验（内置示例图，无需上传）
- [x] 3D 展示容器与加载态（**当前为演示实现**：6 秒后返回 Astronaut 演示模型）
- [ ] 接入真实图生 3D（Tripo3D / Meshy），只需替换 `create3d` 与 `check3d`
- [ ] 历史记录与作品保存

## 注意事项

- 换装按生成张数计费（wan2.7-image-pro 约 0.5 元/张），调试时注意调用次数。
- 结果图是临时链接，**有效期 24 小时**，需要长期保存请及时下载。
- 输入图片要求：JPG / PNG / WEBP，宽高均在 240–8000 像素之间，单图不超过 20MB；PNG 不支持透明通道，前端已统一压成白底 JPEG。
- 有图片输入时输出上限为 2K，4K 仅文生图场景支持。
