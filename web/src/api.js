async function request(path) {
  const response = await fetch(path);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || payload.detail || `Request failed: ${response.status}`);
  }

  return response.json();
}

export function fetchLayers() {
  return request('/api/gee/layers');
}

export function fetchLayer(layerId) {
  return request(`/api/gee/layers/${layerId}`);
}

export function fetchHealth() {
  return request('/api/health');
}
