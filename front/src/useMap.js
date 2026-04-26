import { ref } from 'vue'
import Map from 'ol/Map.js'
import View from 'ol/View.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import OSM from 'ol/source/OSM.js'
import VectorSource from 'ol/source/Vector.js'
import XYZ from 'ol/source/XYZ.js'
import GeoJSON from 'ol/format/GeoJSON.js'
import { fromLonLat, toLonLat } from 'ol/proj.js'
import { Fill, Stroke, Style, Text } from 'ol/style.js'
import { easeOut } from 'ol/easing.js'

let map = null
let geeLayer = null
let demHexLayer = null
let baseLayer = null

function getDemColor(dem, config = {}) {
  const {
    colorRamp = 'default',
    minDem = 0,
    maxDem = 5000,
    smoothTransitions = true
  } = config

  if (!Number.isFinite(dem)) return 'rgba(120, 120, 120, 0.35)'

  const colorRamps = {
    default: [
      [44, 123, 182],
      [171, 217, 233],
      [255, 255, 191],
      [253, 174, 97],
      [215, 25, 28]
    ],
    terrain: [
      [0, 51, 0],
      [34, 102, 34],
      [102, 153, 51],
      [153, 153, 102],
      [204, 153, 102],
      [153, 153, 153],
      [255, 255, 255]
    ],
    spectral: [
      [153, 0, 153],
      [0, 0, 255],
      [0, 255, 255],
      [0, 255, 0],
      [255, 255, 0],
      [255, 0, 0]
    ]
  }

  const colors = colorRamps[colorRamp] || colorRamps.default
  const range = maxDem - minDem
  
  if (dem <= minDem) {
    const c = colors[0]
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.7)`
  }
  if (dem >= maxDem) {
    const c = colors[colors.length - 1]
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.7)`
  }

  const normalizedDem = (dem - minDem) / range
  const segmentCount = colors.length - 1
  const segmentIndex = Math.min(
    Math.floor(normalizedDem * segmentCount),
    segmentCount - 1
  )
  const segmentT = (normalizedDem * segmentCount) - segmentIndex

  const c1 = colors[segmentIndex]
  const c2 = colors[segmentIndex + 1]

  const r = Math.round(c1[0] + (c2[0] - c1[0]) * segmentT)
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * segmentT)
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * segmentT)

  return `rgba(${r}, ${g}, ${b}, 0.7)`
}

function createDemStyle(config = {}) {
  return function(feature) {
    const dem = Number(feature.get('dem'))

    return new Style({
      fill: new Fill({
        color: getDemColor(dem, config),
      }),
      stroke: new Stroke({
        color: 'rgba(34, 34, 34, 0.85)',
        width: 1,
      }),
    })
  }
}

function createRawDataStyle() {
  return function(feature) {
    const dem = Number(feature.get('dem'))
    const label = dem !== null && dem !== undefined ? `${dem}m` : ''

    return new Style({
      fill: new Fill({
        color: 'rgba(59, 130, 246, 0.15)',
      }),
      stroke: new Stroke({
        color: 'rgba(59, 130, 246, 0.9)',
        width: 1.5,
      }),
      text: new Text({
        text: label,
        font: '11px Inter, Segoe UI, sans-serif',
        fill: new Fill({
          color: 'rgba(255, 255, 255, 0.95)',
        }),
        stroke: new Stroke({
          color: 'rgba(0, 0, 0, 0.8)',
          width: 2,
        }),
      }),
    })
  }
}

export function useMap() {
  const mapRef = ref(null)

  function initMap(target) {
    if (!target) return

    baseLayer = new TileLayer({
      source: new OSM(),
      visible: true,
    })

    geeLayer = new TileLayer({
      opacity: 0.85,
      visible: true,
    })

    demHexLayer = new VectorLayer({
      source: new VectorSource(),
      style: createDemStyle(),
      opacity: 0.9,
      visible: true,
    })

    map = new Map({
      target,
      layers: [baseLayer, geeLayer, demHexLayer],
      view: new View({
        center: fromLonLat([116.55, 40.1]),
        zoom: 8,
      }),
    })

    target.$map = map
    mapRef.value = map
  }

  function setGeeLayer(layerConfig) {
    if (!geeLayer || !map) return

    geeLayer.setSource(
      new XYZ({
        url: layerConfig.url,
        crossOrigin: 'anonymous',
        attributions: layerConfig.attribution,
      })
    )

    geeLayer.setVisible(true)

    const center = layerConfig.center || [116.55, 40.1]
    const zoom = layerConfig.zoom || 8

    map.getView().animate({
      center: fromLonLat(center),
      zoom,
      duration: 400,
    })
  }

  function setDemHexagons(geojson, config = {}) {
    if (!demHexLayer || !map) return

    const source = new VectorSource({
      features: new GeoJSON().readFeatures(geojson, {
        featureProjection: 'EPSG:3857',
      }),
    })

    demHexLayer.setSource(source)
    demHexLayer.setStyle(createDemStyle(config))

    if (source.getFeatures().length > 0) {
      map.getView().fit(source.getExtent(), {
        padding: [60, 60, 60, 60],
        duration: 500,
        maxZoom: 10,
      })
    }
  }

  function addLayer(layer) {
    if (!map) return
    map.addLayer(layer)
  }

  function removeLayer(layer) {
    if (!map) return
    map.removeLayer(layer)
  }

  function updateLayerVisibility(layerId, visible) {
    if (!map) return

    const layers = map.getLayers().getArray()
    
    if (layerId === 'base' && baseLayer) {
      baseLayer.setVisible(visible)
    } else if (layerId === 'gee' && geeLayer) {
      geeLayer.setVisible(visible)
    } else if (layerId === 'dem' && demHexLayer) {
      demHexLayer.setVisible(visible)
    }
  }

  function updateLayerDemStyle(config) {
    if (!demHexLayer) return
    demHexLayer.setStyle(createDemStyle(config))
  }

  function setRawDataStyle() {
    if (!demHexLayer) return
    demHexLayer.setStyle(createRawDataStyle())
  }

  return {
    mapRef,
    initMap,
    setGeeLayer,
    setDemHexagons,
    addLayer,
    removeLayer,
    updateLayerVisibility,
    updateLayerDemStyle,
    setRawDataStyle
  }
}
