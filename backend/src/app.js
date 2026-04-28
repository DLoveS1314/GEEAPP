/**
 * @fileoverview GEE OpenLayers 后端应用主入口
 * 
 * 本文件创建并配置 Express 服务器，负责：
 * - 设置 CORS 跨域策略
 * - 注册健康检查和 GEE 路由
 * - 配置全局错误处理器
 * 
 * @module app
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import geeRouter from './routes/gee.js';
import fsRouter from './routes/fs.js';

// 获取当前文件的绝对路径（ES Module 中替代 __dirname）
const __filename = fileURLToPath(import.meta.url);

/**
 * 创建 Express 应用实例
 * 
 * @function createApp
 * @returns {express.Express} 配置好的 Express 应用
 */
export function createApp() {
  const app = express();
  
  // 从环境变量读取前端地址，默认允许本地开发端口
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

  // ========== 中间件配置 ==========
  
  /**
   * 配置 CORS（跨域资源共享）
   * 
   * 仅允许指定的前端源访问 API，防止未授权的跨域请求
   */
  app.use(
    cors({
      origin: frontendOrigin,
    })
  );
  
  /**
   * 启用 JSON 请求体解析
   * 
   * 使服务器能够解析 Content-Type: application/json 的请求
   */
  app.use(express.json({ limit: '200mb' }));

  // ========== 路由配置 ==========
  
  /**
   * 根路径处理器
   * 
   * 返回服务器基本信息和可用的 API 端点列表
   */
  app.get('/', (_req, res) => {
    res.json({
      name: 'gee-openlayers-server',
      message: 'Earth Engine backend is running.',
      endpoints: [
        '/api/health',
        '/api/gee/datasources',
        '/api/gee/layers',
        '/api/gee/layers/sentinel-rgb',
        '/api/gee/geojson/hexagons',
        '/api/gee/dem/sample',
      ],
    });
  });

  // 挂载健康检查路由
  app.use('/api/health', healthRouter);
  
  // 挂载 Google Earth Engine 相关路由
  app.use('/api/gee', geeRouter);

  // 挂载文件系统浏览路由
  app.use('/api/fs', fsRouter);

  // ========== 错误处理 ==========
  
  /**
   * 全局错误处理中间件
   * 
   * 捕获所有路由中抛出的错误，并返回统一的 JSON 错误响应
   * 
   * @param {Error} error - 抛出的错误对象
   * @param {express.Request} _req - Express 请求对象
   * @param {express.Response} res - Express 响应对象
   * @param {express.NextFunction} _next - Express 下一个中间件函数
   */
  app.use((error, _req, res, _next) => {
    // 使用错误对象中的状态码，默认为 500（内部服务器错误）
    const status = error.status || 500;
    
    // 如果错误有 cause 属性且为 Error 类型，提取其消息作为详细信息
    const detail = error.cause instanceof Error ? error.cause.message : undefined;

    res.status(status).json({
      error: error.message || 'Internal server error.',
      detail,
    });
  });

  return app;
}

// 导出应用实例供其他模块使用
export const app = createApp();

/**
 * 判断当前模块是否作为主程序运行
 * 
 * 如果是 `node app.js` 直接运行，则启动服务器
 * 如果是被其他模块导入，则仅导出 app 对象
 */
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMainModule) {
  // 从环境变量读取端口号，默认为 3000
  const port = Number(process.env.PORT || 3000);

  // 启动 HTTP 服务器监听请求
  app.listen(port, () => {
    console.log(`GEE backend listening on http://localhost:${port}`);
  });
}
