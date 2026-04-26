# 项目技术说明

## 项目概览

本项目是一个前后端分离的 Google Earth Engine + OpenLayers 示例应用。

- `front/`：前端项目，基于 Vite + OpenLayers，负责地图展示、图层切换和调用后端 API。
- `backend/`：后端项目，基于 Node.js + Express，负责 Google Earth Engine 鉴权、生成地图瓦片 URL，并向前端提供 API。
- `gee-service-account.json`：Google Cloud 服务账号密钥文件，只由后端读取，前端不会直接接触私钥。

前端和后端已经完全拆分，分别 `npm install`，分别 `npm run dev`，不再通过根目录 workspace 或统一脚本启动。

## 目录结构

```text
.
├─ backend/
│  ├─ src/
│  │  ├─ app.js
│  │  ├─ config/
│  │  │  └─ gee.js
│  │  ├─ routes/
│  │  │  ├─ gee.js
│  │  │  └─ health.js
│  │  └─ services/
│  │     └─ geeService.js
│  ├─ .env
│  ├─ .env.example
│  ├─ package.json
│  └─ package-lock.json
├─ front/
│  ├─ src/
│  │  ├─ api.js
│  │  ├─ main.js
│  │  ├─ map.js
│  │  └─ style.css
│  ├─ index.html
│  ├─ package.json
│  ├─ package-lock.json
│  └─ vite.config.js
├─ gee-service-account.json
├─ README.md
└─ TECHNICAL.md
```

## 后端架构

### `backend/src/app.js`

后端入口文件，职责包括：

- 创建 Express 应用。
- 配置 CORS，默认允许 `http://localhost:5173`。
- 注册健康检查接口。
- 注册 Earth Engine 图层接口。
- 统一处理接口错误。
- 在直接运行时监听 `PORT`，默认 `3000`。

主要路由：

- `GET /`：返回后端基础信息。
- `GET /api/health`：检查后端和 Earth Engine 初始化状态。
- `GET /api/gee/layers`：返回可用图层列表。
- `GET /api/gee/layers/:layerId`：返回指定图层的瓦片配置。

### `backend/src/config/gee.js`

Earth Engine 配置和初始化模块，职责包括：

- 读取服务账号 JSON 文件。
- 根据 `.env` 配置代理。
- 调用 `ee.data.authenticateViaPrivateKey` 完成服务账号认证。
- 调用 `ee.initialize` 初始化 Earth Engine。
- 缓存初始化 Promise，避免每次请求重复初始化。

关键环境变量：

```env
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173
GEE_PROJECT_ID=my-project-94116-map
GEE_CREDENTIALS_PATH=../gee-service-account.json
GEE_PROXY=http://127.0.0.1:7890
GEE_PROXY_INSECURE=1
```

说明：

- `GEE_PROJECT_ID`：Google Cloud Project ID。
- `GEE_CREDENTIALS_PATH`：服务账号密钥路径，相对于 `backend/`。
- `GEE_PROXY`：访问 Google API 时使用的代理地址。
- `GEE_PROXY_INSECURE=1`：开发环境下允许本地代理的自签名证书。

### `backend/src/services/geeService.js`

Earth Engine 业务服务模块，职责包括：

- 定义示例区域，北京范围。
- 构建 Sentinel-2 RGB 影像。
- 构建 Sentinel-2 NDVI 影像。
- 调用 Earth Engine `image.getMap` 生成地图瓦片信息。
- 兼容不同 Earth Engine SDK 返回格式，生成前端可用的 XYZ tile URL。

当前支持的图层：

- `sentinel-rgb`：Sentinel-2 RGB 中值合成图。
- `ndvi`：Sentinel-2 NDVI 图层。

瓦片 URL 兼容逻辑会尝试读取：

- `map.urlFormat`
- `map.url_format`
- `map.tile_fetcher.url_format`
- `map.mapid` + `map.token`

如果 SDK 只返回 `mapid` 和 `token`，后端会自动拼接：

```text
https://earthengine.googleapis.com/v1/{mapid}/tiles/{z}/{x}/{y}?token={token}
```

或旧格式：

```text
https://earthengine.googleapis.com/map/{mapid}/{z}/{x}/{y}?token={token}
```

### `backend/src/routes/gee.js`

Earth Engine API 路由模块：

- `GET /api/gee/layers` 调用 `getLayerCatalog()`。
- `GET /api/gee/layers/:layerId` 调用 `getLayerById(layerId)`。

### `backend/src/routes/health.js`

健康检查模块，用于确认后端服务和 Earth Engine 初始化状态。

## 前端架构

### `front/src/api.js`

前端 API 封装模块，职责包括：

- 统一发起 `fetch` 请求。
- 统一处理非 2xx 响应。
- 暴露健康检查、图层列表、图层详情接口。

接口函数：

- `fetchHealth()`：请求 `/api/health`。
- `fetchLayers()`：请求 `/api/gee/layers`。
- `fetchLayer(layerId)`：请求 `/api/gee/layers/:layerId`。

### `front/src/map.js`

OpenLayers 地图模块，职责包括：

- 创建基础 OSM 地图。
- 创建 Earth Engine 图层占位层。
- 使用后端返回的 `layerConfig.url` 创建 `XYZ` 数据源。
- 图层加载后自动移动视图到配置中心点。

### `front/src/main.js`

前端主流程模块，职责包括：

- 初始化地图。
- 请求后端健康状态。
- 请求可用图层列表。
- 默认加载第一个图层。
- 处理图层切换和刷新按钮。
- 在页面上展示图层元数据和错误信息。

### `front/vite.config.js`

Vite 开发服务器配置：

```js
server: {
  host: '0.0.0.0',
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```

前端开发环境中，所有 `/api` 请求都会被 Vite 代理到后端 `http://localhost:3000`。

## 请求流程

### 页面初始化流程

```text
浏览器打开 http://localhost:5173
        ↓
front/src/main.js 初始化 OpenLayers 地图
        ↓
请求 /api/health 和 /api/gee/layers
        ↓
Vite proxy 转发到 http://localhost:3000
        ↓
backend Express 处理请求
        ↓
后端初始化 Earth Engine
        ↓
返回图层列表和健康状态
        ↓
前端默认请求第一个图层
        ↓
后端调用 Earth Engine image.getMap
        ↓
返回 XYZ tile URL
        ↓
OpenLayers 加载 Earth Engine 瓦片
```

### 图层加载流程

```text
用户选择图层
        ↓
front 调用 /api/gee/layers/:layerId
        ↓
backend 根据 layerId 构建 Earth Engine Image
        ↓
Earth Engine 返回 map 信息
        ↓
backend 解析或拼接 tile URL
        ↓
front 使用 OpenLayers XYZ 加载瓦片
```

## 安装流程

前后端分别安装。

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

分别打开两个终端。

终端 1，启动后端：

```bash
cd backend
npm run dev
```

成功后应看到类似输出：

```text
GEE backend listening on http://localhost:3000
```

终端 2，启动前端：

```bash
cd front
npm run dev
```

成功后访问：

```text
http://localhost:5173
```

## 验证流程

### 1. 验证后端依赖安装

```bash
cd backend
npm install
```

预期结果：

- 命令成功完成。
- `backend/node_modules/` 存在。
- `backend/package-lock.json` 存在。

### 2. 验证前端依赖安装

```bash
cd front
npm install
```

预期结果：

- 命令成功完成。
- `front/node_modules/` 存在。
- `front/package-lock.json` 存在。

### 3. 验证后端模块可加载

```bash
cd backend
node -e "import('./src/app.js').then(() => console.log('backend import ok'))"
```

预期结果：

```text
backend import ok
```

### 4. 验证后端启动

```bash
cd backend
npm run dev
```

访问：

```text
http://localhost:3000
```

预期返回 JSON，包含后端名称和接口列表。

### 5. 验证健康检查接口

访问：

```text
http://localhost:3000/api/health
```

预期结果：

- 返回 JSON。
- 包含后端状态。
- 包含 Earth Engine 初始化信息或错误详情。

如果 Earth Engine 认证失败，优先检查：

- `gee-service-account.json` 是否存在于项目根目录。
- `GEE_PROJECT_ID` 是否正确。
- 服务账号是否有 Earth Engine 权限。
- 本地代理是否可用。
- 是否需要 `GEE_PROXY_INSECURE=1`。

### 6. 验证图层列表接口

访问：

```text
http://localhost:3000/api/gee/layers
```

预期结果：

```json
{
  "layers": [
    {
      "id": "sentinel-rgb",
      "name": "Sentinel-2 RGB"
    },
    {
      "id": "ndvi",
      "name": "Sentinel-2 NDVI"
    }
  ]
}
```

实际返回会包含更多字段。

### 7. 验证单个图层接口

访问：

```text
http://localhost:3000/api/gee/layers/sentinel-rgb
```

预期结果：

- 返回 JSON。
- `url` 字段不是 `null`。
- `type` 为 `xyz`。
- 包含 `center`、`zoom`、`bounds`、`dataset` 等字段。

重点检查：

```json
{
  "type": "xyz",
  "url": "https://.../{z}/{x}/{y}..."
}
```

如果 `url` 为空，说明 Earth Engine 没有返回可用瓦片信息，需要检查 `backend/src/services/geeService.js` 中的 URL 解析逻辑。

### 8. 验证前端构建

```bash
cd front
npm run build
```

预期结果：

- Vite build 成功。
- `front/dist/` 生成。

### 9. 验证前端页面

启动前后端后访问：

```text
http://localhost:5173
```

预期结果：

- 页面显示地图。
- 状态栏显示后端就绪。
- 图层下拉框包含 Sentinel-2 RGB 和 NDVI。
- 默认图层成功加载。
- 切换图层后地图瓦片更新。

### 10. 验证代理转发

前端运行在 `5173`，后端运行在 `3000`。

在浏览器访问前端时，前端请求：

```text
/api/gee/layers
```

Vite 应转发到：

```text
http://localhost:3000/api/gee/layers
```

如果前端报 `404` 或网络错误，检查：

- 后端是否启动。
- `front/vite.config.js` 中 proxy 是否正确。
- 请求路径是否以 `/api` 开头。

## 常见问题

### Earth Engine authentication failed: self-signed certificate

原因：本地代理或网络网关使用了自签名 HTTPS 证书，Node 默认不信任。

开发环境解决方式：

```env
GEE_PROXY=http://127.0.0.1:7890
GEE_PROXY_INSECURE=1
```

修改后重启后端。

### Earth Engine did not return a tile URL

原因：前端收到的图层配置中 `url` 为空。

排查顺序：

1. 直接访问 `http://localhost:3000/api/gee/layers/sentinel-rgb`。
2. 检查返回 JSON 是否包含 `url`。
3. 如果 `url` 为空，检查 Earth Engine `getMap` 返回结构。
4. 检查 `backend/src/services/geeService.js` 的 `getTileUrl` 是否兼容当前 SDK 返回字段。

### 前端地图空白

可能原因：

- 后端没有启动。
- Earth Engine 图层接口失败。
- 返回的 tile URL 无效。
- 浏览器无法访问 Google tile 地址。
- 本地网络或代理阻断 Google API。

### 服务账号认证失败

检查：

- `gee-service-account.json` 是否存在。
- JSON 是否有效。
- `client_email` 和 `private_key` 是否存在。
- Google Cloud Project 是否启用 Earth Engine API。
- 服务账号是否被授权使用 Earth Engine。
- `GEE_PROJECT_ID` 是否和服务账号所在项目匹配。

## 安全说明

- `gee-service-account.json` 不应提交到 Git。
- `.env` 不应提交到 Git。
- 私钥只允许后端读取。
- 前端只接收瓦片 URL 和元数据，不接收服务账号私钥。
- 如果私钥曾经泄露，应立即在 Google Cloud 中轮换服务账号密钥。

## 当前验证结果

当前项目已完成以下验证：

- `backend` 和 `front` 已拆成两个独立项目。
- 两个项目可以分别 `npm install`。
- 后端模块导入验证通过。
- 前端 `npm run build` 验证通过。
- 后端已兼容多种 Earth Engine tile URL 返回格式。
