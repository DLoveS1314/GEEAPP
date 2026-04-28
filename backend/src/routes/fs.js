/**
 * @fileoverview 文件系统路由模块
 *
 * 提供文件浏览、读取、上传等功能：
 * - GET  /data-path  —— 返回 backend/data 相对路径
 * - POST /list       —— 列出指定目录内容
 * - POST /read-geojson —— 读取 GeoJSON 文件
 * - POST /upload     —— 上传文件到 data 目录
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目根目录（backend/）
const backendRoot = path.resolve(__dirname, '..', '..');
// 数据目录：backend/data
const dataDir = path.resolve(backendRoot, 'data');

// 确保 data 目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const router = Router();

// ========== multer 配置 ==========
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, dataDir);
  },
  filename: (_req, file, cb) => {
    // 保留原始文件名，避免覆盖冲突时加时间戳
    const targetPath = path.resolve(dataDir, file.originalname);
    if (fs.existsSync(targetPath)) {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      cb(null, `${base}_${Date.now()}${ext}`);
    } else {
      cb(null, file.originalname);
    }
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.geojson' || ext === '.json') {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .geojson 或 .json 文件'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ========== 路由 ==========

/**
 * GET /api/fs/data-path
 * 返回 backend/data 目录的相对于项目根目录的路径
 */
router.get('/data-path', (_req, res) => {
  // 返回相对于 backend/ 的相对路径，前端可据此拼接请求
  const relativePath = path.relative(backendRoot, dataDir);
  res.json({ path: relativePath });
});

/**
 * POST /api/fs/list
 * 列出指定目录下的文件和子目录
 */
router.post('/list', (req, res, next) => {
  try {
    const { path: dirPath } = req.body;

    if (!dirPath || typeof dirPath !== 'string') {
      return res.status(400).json({ error: 'path 参数必须提供' });
    }

    const resolvedPath = path.resolve(backendRoot, dirPath);

    // 安全校验：禁止访问 data 目录之外
    if (!resolvedPath.startsWith(dataDir)) {
      return res.status(403).json({ error: '不允许访问 data 目录之外的路径' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: '目录不存在' });
    }

    if (!fs.statSync(resolvedPath).isDirectory()) {
      return res.status(400).json({ error: '路径不是目录' });
    }

    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const items = entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    res.json({ path: resolvedPath, items });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/fs/read-geojson
 * 读取并解析 GeoJSON 文件
 */
router.post('/read-geojson', (req, res, next) => {
  try {
    const { path: filePath } = req.body;

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'path 参数必须提供' });
    }

    const resolvedPath = path.resolve(backendRoot, filePath);

    // 安全校验：禁止访问 data 目录之外
    if (!resolvedPath.startsWith(dataDir)) {
      return res.status(403).json({ error: '不允许访问 data 目录之外的路径' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    if (fs.statSync(resolvedPath).isDirectory()) {
      return res.status(400).json({ error: '路径是目录，不是文件' });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext !== '.geojson' && ext !== '.json') {
      return res.status(400).json({ error: '仅支持 .geojson 或 .json 文件' });
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const geojson = JSON.parse(content);

    if (!geojson.type || !geojson.features) {
      return res.status(400).json({ error: '文件内容不是有效的 GeoJSON 格式' });
    }

    res.json(geojson);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: '文件内容不是有效的 JSON 格式' });
    }
    next(error);
  }
});

/**
 * POST /api/fs/upload
 * 上传文件到 data 目录
 */
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: '文件大小不能超过 50MB' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    // 返回上传后的相对路径（相对于 backend/）
    const relativePath = path.relative(backendRoot, req.file.path);

    res.json({
      message: '上传成功',
      fileName: req.file.filename,
      path: relativePath
    });
  });
});

export default router;