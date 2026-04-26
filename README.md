# Google Earth Engine + OpenLayers Framework

最小可运行前后端框架：

- 后端：Node.js + Express
- 前端：Vite + OpenLayers
- Earth Engine：服务账号 JSON 私钥仅在后端使用

## 目录结构

```text
.
├─ gee-service-account.json
├─ backend/
└─ front/
```

## 前置条件

1. 已有可用的 Google Cloud Project
2. 已启用 Earth Engine API
3. 服务账号已具备 Earth Engine 使用权限
4. 根目录存在 `gee-service-account.json`

## 安装

前端和后端分别安装依赖，不在根目录统一安装：

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

## 启动

1. 可选：复制 `backend/.env.example` 为 `backend/.env` 并按需修改
2. 分别在两个终端启动后端和前端

后端：

```bash
cd backend
npm run dev
```

前端：

```bash
cd front
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
cd front
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

### self-signed certificate

如果后端报错：

```text
Earth Engine authentication failed: request to https://www.googleapis.com/oauth2/v4/token failed, reason: self-signed certificate
```

通常是本地代理或网络网关使用了自签名 HTTPS 证书。开发环境可在 `backend/.env` 中启用：

```env
GEE_PROXY=http://127.0.0.1:7890
GEE_PROXY_INSECURE=1
```

修改后重启后端：

```bash
cd backend
npm run dev
```
