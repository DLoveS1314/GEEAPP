/**
 * @fileoverview DEM 采样脚本
 * 
 * 本脚本从六角格 GeoJSON 文件读取中心点，
 * 使用 Google Earth Engine 的 SRTM DEM 数据采样高程值，
 * 将结果保存为带有 DEM 属性的新 GeoJSON 文件
 * 
 * 使用方法：
 *   npm run dem:l0
 * 
 * 环境变量配置：
 * - DEM_BATCH_SIZE: 每批次采样的要素数量（默认 100）
 * - DEM_LIMIT: 最多处理的要素数量（默认 100）
 * 
 * @module scripts/addDemToGeojson
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ee from '@google/earthengine';
import { ensureEarthEngineInitialized } from '../config/gee.js';

// 获取脚本所在目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');

// ========== 文件路径配置 ==========

/**
 * 输入文件路径
 * 
 * 原始的六角格 GeoJSON 文件（仅包含几何，不含 DEM）
 */
const inputPath = path.resolve(backendRoot, 'data', 'L0.geojson');

/**
 * 输出目录
 */
const outputDir = path.resolve(backendRoot, 'output');

/**
 * 输出文件路径
 * 
 * 保存带有 DEM 高程值的六角格 GeoJSON
 */
const outputPath = path.resolve(outputDir, 'L0_dem.geojson');

// ========== 批处理参数 ==========

/**
 * 每批次处理的要素数量
 * 
 * 分批处理可避免单次请求数据量过大导致超时
 */
const batchSize = Number(process.env.DEM_BATCH_SIZE || 1000);

/**
 * 最多处理的要素数量
 * 
 * 限制处理数量可用于快速测试
 */
const featureLimit = Number(process.env.DEM_LIMIT || 100);

/**
 * 无效数据标记值
 * 
 * SRTM 数据中使用 -9999 表示无效/无数据区域
 */
const noDataValue = -9999;

// ========== 辅助函数 ==========

/**
 * 执行 Earth Engine 对象的 evaluate 方法
 * 
 * 将 GEE 服务器端对象转换为本地 JavaScript 对象
 * 
 * @function evaluate
 * @param {ee.ComputedObject} serverObject - GEE 服务器端对象
 * @returns {Promise<any>} 解析后的本地 JavaScript 值
 */
function evaluate(serverObject) {
  return new Promise((resolve, reject) => {
    // evaluate 是 GEE 的异步方法，将服务器端计算结果返回客户端
    serverObject.evaluate((result, error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

/**
 * 从 GeoJSON 要素读取中心点坐标
 * 
 * @function readCenter
 * @param {Object} feature - GeoJSON 要素
 * @param {number} index - 要素索引（用于错误报告）
 * @returns {{centerLon: number, centerLat: number}} 中心点经纬度
 * @throws {Error} 当坐标缺失或无效时抛出错误
 */
function readCenter(feature, index) {
  const centerLon = Number(feature?.properties?.center_lon);
  const centerLat = Number(feature?.properties?.center_lat);

  // 验证坐标是否为有效数字
  if (!Number.isFinite(centerLon) || !Number.isFinite(centerLat)) {
    throw new Error(`Feature at index ${index} is missing valid center_lon/center_lat.`);
  }

  return { centerLon, centerLat };
}

/**
 * 将一批要素转换为 Earth Engine 点集合
 * 
 * @function createPointCollection
 * @param {Array<Object>} features - GeoJSON 要素数组
 * @param {number} startIndex - 起始索引（用于追踪原始位置）
 * @returns {ee.FeatureCollection} GEE 点要素集合
 */
function createPointCollection(features, startIndex) {
  // 将每个 GeoJSON 要素转换为 GEE 点要素
  const points = features.map((feature, offset) => {
    const inputIndex = startIndex + offset;
    const { centerLon, centerLat } = readCenter(feature, inputIndex);

    // 创建点要素，附带原始索引用于后续匹配
    return ee.Feature(ee.Geometry.Point([centerLon, centerLat]), {
      input_index: inputIndex,
    });
  });

  return ee.FeatureCollection(points);
}

/**
 * 对一批点进行 DEM 采样
 * 
 * @function sampleDemBatch
 * @param {ee.Image} demImage - DEM 图像（如 SRTM）
 * @param {Array<Object>} features - GeoJSON 要素数组
 * @param {number} startIndex - 起始索引
 * @returns {Promise<Map<number, number|null>>} 索引到高程值的映射
 */
async function sampleDemBatch(demImage, features, startIndex) {
  // 创建点集合
  const points = createPointCollection(features, startIndex);
  
  // 在点位置采样 DEM 值
  const samples = demImage.sampleRegions({
    collection: points,
    scale: 30,  // 30 米分辨率（SRTM 原生分辨率）
    geometries: false,  // 不返回几何，仅属性
  });

  // 执行采样并获取结果
  const result = await evaluate(samples);
  const values = new Map();

  // 构建索引 -> 高程值的映射
  for (const sample of result.features || []) {
    const inputIndex = sample.properties.input_index;
    const elevation = sample.properties.elevation;
    // 将无效值转换为 null
    values.set(inputIndex, elevation === noDataValue ? null : elevation);
  }

  return values;
}

// ========== 主函数 ==========

/**
 * 主执行函数
 * 
 * 流程：
 * 1. 读取输入 GeoJSON
 * 2. 初始化 Earth Engine
 * 3. 分批采样 DEM 值
 * 4. 写入输出文件
 */
async function main() {
  console.log(`[DEM] Reading ${inputPath}`);
  
  // 读取输入文件
  const raw = await fs.readFile(inputPath, 'utf8');
  const geojson = JSON.parse(raw);

  // 验证文件格式
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Input file must be a GeoJSON FeatureCollection.');
  }

  // 限制处理数量（用于测试或节省时间）
  geojson.features = geojson.features.slice(0, featureLimit);

  // 初始化 Earth Engine
  await ensureEarthEngineInitialized();

  // 加载 SRTM 高程数据
  // USGS/SRTMGL1_003: 全球 1 弧秒（约 30 米）数字高程模型
  const demImage = ee.Image('USGS/SRTMGL1_003')
    .select('elevation')  // 选择高程波段
    .unmask(noDataValue);  // 将掩膜值替换为 -9999

  console.log(`[DEM] Sampling ${geojson.features.length} features with batch size ${batchSize}`);

  // 分批处理所有要素
  for (let start = 0; start < geojson.features.length; start += batchSize) {
    const end = Math.min(start + batchSize, geojson.features.length);
    const batch = geojson.features.slice(start, end);
    
    // 采样当前批次
    const values = await sampleDemBatch(demImage, batch, start);

    // 将 DEM 值写入要素属性
    for (let index = start; index < end; index += 1) {
      geojson.features[index].properties = {
        ...geojson.features[index].properties,
        dem: values.has(index) ? values.get(index) : null,
      };
    }

    console.log(`[DEM] Processed ${end}/${geojson.features.length}`);
  }

  // 创建输出目录（如果不存在）
  await fs.mkdir(outputDir, { recursive: true });
  
  // 写入输出文件
  await fs.writeFile(outputPath, `${JSON.stringify(geojson)}\n`, 'utf8');

  console.log(`[DEM] Saved ${outputPath}`);
}

// 执行主函数并处理错误
main().catch((error) => {
  console.error('[DEM] Failed:', error.message || error);
  if (error.stack) console.error(error.stack);
  process.exitCode = 1;
});
