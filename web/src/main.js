import 'ol/ol.css';
import './style.css';
import { fetchHealth, fetchLayer, fetchLayers } from './api.js';
import { createMap } from './map.js';

const layerSelect = document.querySelector('#layerSelect');
const reloadButton = document.querySelector('#reloadButton');
const statusText = document.querySelector('#statusText');
const layerMeta = document.querySelector('#layerMeta');

const mapController = createMap('map');

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.dataset.error = String(isError);
}

function renderMeta(layer) {
  layerMeta.innerHTML = [
    ['名称', layer.name],
    ['数据集', layer.dataset],
    ['Project', layer.projectId],
    ['说明', layer.description],
  ]
    .map(([label, value]) => `<dt>${label}</dt><dd>${value || '-'}</dd>`)
    .join('');
}

async function loadLayer(layerId) {
  setStatus('正在请求 Earth Engine 图层...');

  const layer = await fetchLayer(layerId);

  if (!layer.url) {
    throw new Error('Earth Engine did not return a tile URL.');
  }

  mapController.setGeeLayer(layer);
  renderMeta(layer);
  setStatus(`图层已加载：${layer.name}`);
}

async function bootstrap() {
  try {
    const [{ layers }, health] = await Promise.all([fetchLayers(), fetchHealth()]);

    layerSelect.innerHTML = layers
      .map((layer) => `<option value="${layer.id}">${layer.name}</option>`)
      .join('');

    setStatus(`后端就绪，当前 GEE Project: ${health.gee.projectId}`);

    if (layers[0]) {
      await loadLayer(layers[0].id);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

layerSelect.addEventListener('change', async (event) => {
  try {
    await loadLayer(event.target.value);
  } catch (error) {
    setStatus(error.message, true);
  }
});

reloadButton.addEventListener('click', async () => {
  try {
    await loadLayer(layerSelect.value);
  } catch (error) {
    setStatus(error.message, true);
  }
});

bootstrap();
