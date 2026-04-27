import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

const router = Router();

router.post('/list', (req, res, next) => {
  try {
    const { path: dirPath } = req.body;

    if (!dirPath || typeof dirPath !== 'string') {
      return res.status(400).json({ error: 'path 参数必须提供' });
    }

    const resolvedPath = path.resolve(dirPath);

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

router.post('/read-geojson', (req, res, next) => {
  try {
    const { path: filePath } = req.body;

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'path 参数必须提供' });
    }

    const resolvedPath = path.resolve(filePath);

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

export default router;