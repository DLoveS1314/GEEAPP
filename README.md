# Google Earth Engine + OpenLayers Framework

最小可运行前后端框架：

- 后端：Node.js + Express
- 前端：Vite + OpenLayers
- Earth Engine：服务账号 JSON 私钥仅在后端使用

## 目录结构

```text
.
├─ gee-service-account.json
├─ server/
└─ web/
```

## 前置条件

1. 已有可用的 Google Cloud Project
2. 已启用 Earth Engine API
3. 服务账号已具备 Earth Engine 使用权限
4. 根目录存在 `gee-service-account.json`

## 安装

```bash
npm install
```

## 启动

1. 可选：复制 `server/.env.example` 为 `server/.env` 并按需修改
2. 启动后端和前端：

```bash
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

## 关键接口

- `GET /api/health`
- `GET /api/gee/layers`
- `GET /api/gee/layers/sentinel-rgb`
- `GET /api/gee/layers/ndvi`

## 构建前端

```bash
npm run build
```

## 安全说明

- `gee-service-account.json` 已加入 `.gitignore`
- 私钥只在后端读取，前端只接收 Earth Engine 图层 URL
- 你在对话中暴露过完整私钥，从安全角度建议尽快在 Google Cloud 中轮换该密钥

## 常见问题

### Earth Engine 初始化失败

检查以下几点：

- `GEE_PROJECT_ID` 是否正确
- Cloud Project 是否已启用 Earth Engine API
- 服务账号是否已被 Earth Engine 授权
- `gee-service-account.json` 路径是否正确
