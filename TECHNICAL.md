# 项目技术说明

## 项目概览

本项目是一个前后端分离的 Google Earth Engine + OpenLayers 六角格地理空间分析应用。

- `front/`：前端项目，基于 Vite + Vue 3 + OpenLayers，负责地图展示、六角格加载与采样、图层管理。
- `backend/`：后端项目，基于 Node.js + Express，负责 Google Earth Engine 鉴权、DEM/地表覆盖采样、文件系统浏览与上传。

前端和后端完全独立，分别 `npm install`，分别 `npm run dev`。

## 目录结构

```text
.
├─ backend/
│  ├─ src/
│  │  ├─ app.js                # Express 应用入口
│  │  ├─ config/
│  │  │  ├─ gee.js             # GEE 认证与初始化
│  │  │  └─ datasources.json   # 数据源配置
│  │  ├─ routes/
│  │  │  ├─ gee.js             # GEE 图层、六角格、采样 API
│  │  │  ├─ fs.js              # 文件浏览、读取、上传 API
│  │  │  └─ health.js          # 健康检查
│  │  ├─ services/
│  │  │  └─ geeService.js      # GEE 业务逻辑（采样、过滤、瓦片构建）
│  │  └─ scripts/
│  │     └─ addDemToGeojson.js # L0 DEM 预计算脚本
│  ├─ data/                    # 六角格 GeoJSON 数据目录
│  ├─ output/                  # 采样结果输出目录
│  ├─ .env
│  ├─ .env.example
│  └─ package.json
├─ front/
│  ├─ src/
│  │  ├─ App.vue               # 主应用组件
│  │  ├─ main.js               # Vue 入口
│  │  ├─ api.js                # API 请求封装
│  │  ├─ useMap.js             # OpenLayers 地图逻辑
│  │  ├─ style.css             # 全局样式设计系统
│  │  └─ components/
│  │     ├─ FilePickerDialog.vue # 文件浏览/上传对话框
│  │     ├─ LayerPanel.vue       # 图层管理面板
│  │     └─ DemSettings.vue      # DEM 渲染设置
│  ├─ index.html
│  ├─ package.json
│  └─ vite.config.js
├─ gee-service-account.json    # GEE 服务账号密钥（不提交 Git）
├─ README.md
└─ TECHNICAL.md
```

## 后端架构

### `backend/src/app.js`

Express 应用入口。职责：

- 创建 Express 应用，配置 CORS（默认允许 `http://localhost:5173`）。
- 注册路由：`/api/health`、`/api/gee/*`、`/api/fs/*`。
- 全局错误处理中间件。
- 直接运行时监听 `PORT`（默认 `3000`）。

### `backend/src/config/gee.js`

Earth Engine 配置和初始化模块。职责：

- 读取服务账号 JSON 文件。
- 根据 `.env` 配置代理（支持 `GEE_PROXY`）。
- 调用 `ee.data.authenticateViaPrivateKey` 和服务账号认证。
- 调用 `ee.initialize` 初始化 Earth Engine。
- 单例模式缓存初始化结果。

关键环境变量：

```env
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173
GEE_PROJECT_ID=my-project-94116-map
GEE_CREDENTIALS_PATH=../gee-service-account.json
GEE_PROXY=http://127.0.0.1:7890
GEE_PROXY_INSECURE=1
```

### `backend/src/config/datasources.json`

数据源配置文件。定义了所有可用的 GEE 数据源，每个数据源包含 `id`、`name`、`type`、`description`、`dataset`、`visualization` 等字段。支持三种类型：
- `RGB` — 影像合成（如 Sentinel-2）
- `DEM` — 数字高程模型（如 SRTM）
- `LANDCOVER` — 地表覆盖分类

### `backend/src/services/geeService.js`

GEE 核心业务逻辑。主要函数：

| 函数 | 用途 |
|---|---|
| `getDatasourceCatalog()` | 返回所有数据源配置 |
| `getLayerById(layerId)` | 初始化 GEE 并构建瓦片图层（含 XYZ URL） |
| `filterGeojsonByBounds(geojson, bounds, options)` | 按视图范围过滤 L4 六角格 |
| `sampleDemForHexagons(geojson, options)` | 对六角格中心点采样 DEM 高程 |
| `sampleLandcoverForHexagons(geojson, options)` | 对六角格中心点采样地表覆盖分类 |
| `getTileUrl(map)` | 兼容多种 GEE SDK 返回格式，拼接 XYZ tile URL |

DEM 采样的核心逻辑：
- 每个六角格取其几何外包矩形中心点
- 用 `ee.Image.sampleRegions` 在该点采样
- 按 `BATCH_SIZE`（500 个/批次）分批调用 GEE，避免超时
- 采样结果写入每个 feature 的 `properties.dem` 字段

### `backend/src/routes/gee.js`

GEE API 路由。完整接口列表：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/gee/datasources` | 返回数据源目录 |
| GET | `/api/gee/layers` | 同 datasources |
| GET | `/api/gee/layers/:layerId` | 返回指定图层的瓦片配置（含 URL） |
| GET | `/api/gee/dem/l0` | 返回预计算的 L0 DEM GeoJSON |
| GET | `/api/gee/geojson/hexagons?minLon&minLat&maxLon&maxLat&limit` | 按视图过滤 L4 六角格 |
| POST | `/api/gee/dem/sample` | DEM 单次采样（<=500 个要素用此接口） |
| POST | `/api/gee/dem/sample-batch` | DEM 分批采样（>500 个要素分批次调用） |
| POST | `/api/gee/landcover/sample-batch` | 地表覆盖分批采样 |

### `backend/src/routes/fs.js`

文件系统 API 路由。与前端 FilePickerDialog 配合使用：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/fs/data-path` | 返回 `backend/data` 的相对路径 |
| POST | `/api/fs/list` | 列出指定目录的文件和子目录 |
| POST | `/api/fs/read-geojson` | 读取并解析 GeoJSON 文件 |
| POST | `/api/fs/upload` | 上传 .geojson/.json 文件到 data 目录 |

关键设计：
- 所有路径基于 `backend/` 根目录解析相对路径，前端不再硬编码绝对路径。
- 安全校验：禁止访问 `data/` 目录之外的文件。
- 上传使用 multer 中间件，仅允许 `.geojson` / `.json`，限制 50MB。
- 同名文件自动追加时间戳防止覆盖。

## 前端架构

### 设计系统 (`front/src/style.css`)

全局样式使用 CSS 变量驱动的设计系统。设计方向：等高线制图美学，深色专业 GIS 工作台风格。

核心设计 Token：

| Token | 值 | 用途 |
|---|---|---|
| `--bg-deep` | `#070b14` | 最深底色 |
| `--bg-surface` | `#0c1526` | 侧边栏背景 |
| `--bg-card` | `#111d33` | 卡片背景 |
| `--bg-elevated` | `#162340` | 输入框/按钮背景 |
| `--accent-blue` | `#4b8bff` | 主色 |
| `--accent-green` | `#2ed573` | DEM 相关 |
| `--accent-amber` | `#f5a623` | 地表覆盖相关 |
| `--font-display` | Space Grotesk | 标题字体 |
| `--font-mono` | JetBrains Mono | 数据/代码字体 |

组件采用一致的 `.card`、`.btn`、`.btn-primary`、`.modal-overlay` 等样式基类。

### `front/src/App.vue`

主应用组件。侧边栏由多个卡片区域组成：
1. **Header** — 应用名称与描述
2. **数据源** — GEE 图层下拉选择 + 加载按钮
3. **六角格操作** — 加载六角格（从文件或视图）、采样 DEM、采样地表覆盖、切换显示模式
4. **图层管理** — 由 LayerPanel 组件实现
5. **图层信息** — 当前图层的元数据
6. **状态** — 操作状态与错误信息

地图区域显示坐标指示器（鼠标位置的经纬度）。

### `front/src/api.js`

统一 API 请求封装。所有请求通过内部 `request()` 函数处理，自动设置 JSON Content-Type、解析错误消息。

接口函数：

| 函数 | 请求地址 |
|---|---|
| `fetchDataSources()` | `GET /api/gee/datasources` |
| `fetchLayers()` | `GET /api/gee/layers` |
| `fetchLayer(layerId)` | `GET /api/gee/layers/:layerId` |
| `fetchHexagonGeojson({bounds, limit})` | `GET /api/gee/geojson/hexagons?minLon&minLat&maxLon&maxLat&limit` |
| `sampleDem(payload)` | `POST /api/gee/dem/sample` |
| `fetchHealth()` | `GET /api/health` |

其他 API 调用（文件浏览、上传、采样批次等）在组件中直接使用 `fetch`。

### `front/src/useMap.js`

OpenLayers 地图逻辑封装。使用 Composition API 的 `useMap()` 函数返回所有地图操作方法：

| 方法 | 用途 |
|---|---|
| `initMap(target)` | 初始化地图（GEE 图层 + 六角格矢量层 + 高亮层 + Popup） |
| `setGeeLayer(layerConfig)` | 设置 GEE 瓦片图层 |
| `setDemHexagons(geojson, config, options)` | 用 DEM 色带渲染六角格 |
| `setRawHexagons(geojson, options)` | 用绿色边框原始样式渲染六角格 |
| `setLandcoverHexagons(geojson, options)` | 用地表覆盖分类色渲染六角格 |
| `setRawDataStyle()` | 切换为带 DEM 标签的原始样式 |
| `updateLayerVisibility(layerId, visible)` | 切换图层可见性 |
| `updateLayerDemStyle(config)` | 更新 DEM 色带配置 |
| `getViewBounds()` | 获取当前视图的经纬度范围 |

地图交互：
- **pointermove** — 实时更新鼠标坐标
- **click** — 选中要素、高亮、显示属性 Popup（支持 DEM 和地表覆盖字段）

### `front/src/components/FilePickerDialog.vue`

文件浏览/上传对话框组件。功能：
- 打开时从 `GET /api/fs/data-path` 获取 `data/` 目录的相对路径
- 目录浏览：双击进入子目录，单击选中文件
- 文件上传：拖拽或点击选择 `.geojson` / `.json` 文件，通过 `POST /api/fs/upload` 上传到 `data/` 目录
- 上传成功后刷新文件列表
- 确认选择后通过 `file-selected` 事件返回相对路径，由父组件调用 `/api/fs/read-geojson` 读取

### `front/src/components/LayerPanel.vue`

图层管理面板。展示当前所有图层的开关和操作按钮：
- 可见性切换（SVG 眼睛图标）
- 图层类型徽标（GEE / DEM / LC）
- DEM 图层：渲染设置齿轮按钮、导出下载按钮
- DEM 色带预览条（显示当前颜色渐变范围）

### `front/src/components/DemSettings.vue`

DEM 渲染设置模态框。控件：
- 颜色渐变方案选择（默认 / 地形 / 光谱）带实时预览条
- 最小/最大高程范围输入
- 等高线显示开关 + 间距设置
- 平滑过渡开关
- 自定义 toggle switch UI

### `front/vite.config.js`

Vite 开发服务器配置。所有 `/api` 请求代理到后端 `http://localhost:3000`。

## 六角格采样流程

### DEM 采样

```text
用户点击 "采样 DEM"
        ↓
前端判断六角格数量
        ↓
≤500 个 → POST /api/gee/dem/sample
        ↓       (geojson + datasourceId + scale)
>500 个 → POST /api/gee/dem/sample-batch (分批)
        ↓       每次 500 个六角格
后端取每个六角格中心点
        ↓
用 ee.Image.sampleRegions 采样 elevation
        ↓
返回带 dem 属性的 GeoJSON
        ↓
前端用 DEM 色带函数（createDemStyle）渲染
```

### 地表覆盖采样

流程同 DEM，但采样字段为 `landcover`，使用地表覆盖分类色（LANDCOVER_COLORS）和中文标签（LANDCOVER_LABELS）。

### 六角格加载

两种方式：
1. **从文件加载** — 用户通过 FilePickerDialog 选择本地文件，调用 `POST /api/fs/read-geojson` 读取
2. **从视图加载** — 取当前地图范围，调用 `GET /api/gee/geojson/hexagons?bounds&limit=500`

## 请求流程

### 页面初始化流程

```text
浏览器打开 http://localhost:5173
        ↓
main.js 挂载 Vue 应用
        ↓
App.vue onMounted → initMap + bootstrap()
        ↓
bootstrap → fetchDataSources()
        ↓
Vite proxy 转发到 localhost:3000
        ↓
后端返回数据源列表
        ↓
默认选中第一个数据源 → loadLayer()
        ↓
后端初始化 GEE → 构建影像 → 调用 getMap
        ↓
返回 XYZ tile URL
        ↓
OpenLayers 加载 GEE 瓦片
```

### 文件浏览/上传流程

```text
用户点击 "加载六角格"
        ↓
FilePickerDialog openDialog()
        ↓
GET /api/fs/data-path → 获取 data/ 相对路径
        ↓
POST /api/fs/list → 列出目录文件
        ↓
用户拖拽文件到上传区
        ↓
POST /api/fs/upload (multipart/form-data)
        ↓
multer 校验并保存到 backend/data/
        ↓
用户选择文件 → emit('file-selected', relativePath)
        ↓
App.vue handleFileSelected → loadHexagons(filePath)
        ↓
POST /api/fs/read-geojson → 读取解析 GeoJSON
        ↓
前端渲染六角格
```

## 安装流程

后端：

```bash
cd backend
npm install
```

前端：

```bash
cd front
npm install
```

## 启动流程

终端 1 — 后端：

```bash
cd backend
npm run dev
```

终端 2 — 前端：

```bash
cd front
npm run dev
```

访问 `http://localhost:5173`。

## 验证流程

### 1. 验证后端依赖安装

```bash
cd backend && npm install
```

预期：命令成功完成，`node_modules/` 和 `package-lock.json` 存在。

### 2. 验证前端依赖安装

```bash
cd front && npm install
```

预期：命令成功完成，`node_modules/` 和 `package-lock.json` 存在。

### 3. 验证后端模块可加载

```bash
cd backend
node -e "import('./src/app.js').then(() => console.log('ok'))"
```

预期：输出 `ok`。

### 4. 验证后端启动

```bash
cd backend && npm run dev
```

访问 `http://localhost:3000`，返回 JSON 包含后端名称和接口列表。

### 5. 验证健康检查

访问 `http://localhost:3000/api/health`，返回 JSON 包含后端和 GEE 初始化状态。

### 6. 验证数据源接口

访问 `http://localhost:3000/api/gee/datasources`，返回数据源数组。每个数据源包含 `id`、`name`、`type`、`description`、`dataset`、`visualization`。

### 7. 验证瓦片图层接口

访问 `http://localhost:3000/api/gee/layers/dem-srtm`，返回包含 `url` 字段的 JSON，`url` 不为 null。

### 8. 验证文件系统接口

```bash
# 获取 data 路径
curl http://localhost:3000/api/fs/data-path

# 列出 data 目录
curl -X POST http://localhost:3000/api/fs/list -H "Content-Type: application/json" -d '{"path":"data"}'
```

### 9. 验证前端构建

```bash
cd front && npm run build
```

预期：Vite build 成功，`front/dist/` 生成。

### 10. 验证完整页面

启动前后端后访问 `http://localhost:5173`，预期：
- 页面显示地图（台湾区域）
- 侧边栏显示 GEE 数据源、六角格操作按钮、图层管理
- 状态栏显示图层加载信息
- 鼠标移动时坐标指示器更新
- 点击要素弹出属性信息

## 常见问题

### Earth Engine authentication failed: self-signed certificate

本地代理使用自签名证书时：

```env
GEE_PROXY=http://127.0.0.1:7890
GEE_PROXY_INSECURE=1
```

修改后重启后端。

### Earth Engine did not return a tile URL

1. 直接访问 `http://localhost:3000/api/gee/layers/dem-srtm`
2. 检查返回 JSON 是否包含 `url`
3. 如果为空，检查 `geeService.js` 的 `getTileUrl` 函数是否兼容当前 SDK 返回格式

### 前端地图空白

- 后端是否启动
- GEE 图层接口是否成功
- 返回的 tile URL 是否有效
- 本地网络或代理是否阻断 Google API

### 服务账号认证失败

- `gee-service-account.json` 是否存在
- JSON 是否有效（`client_email`、`private_key`）
- Google Cloud Project 是否启用 Earth Engine API
- `GEE_PROJECT_ID` 是否正确

## 安全说明

- `gee-service-account.json` 不提交 Git
- `.env` 不提交 Git
- 私钥只允许后端读取
- 文件系统 API 做了路径安全校验，禁止访问 `data/` 目录之外
- 上传文件类型限制为 `.geojson` / `.json`，大小限制 50MB