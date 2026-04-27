import { ref } from 'vue'
import Map from 'ol/Map.js'
import View from 'ol/View.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import XYZ from 'ol/source/XYZ.js'
import GeoJSON from 'ol/format/GeoJSON.js'
import { fromLonLat, transformExtent, toLonLat } from 'ol/proj.js'
import { Fill, Stroke, Style, Text } from 'ol/style.js'
import Overlay from 'ol/Overlay.js'

let map = null
let geeLayer = null
let demHexLayer = null
let highlightLayer = null
let popupOverlay = null
let selectedFeature = null

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
    const label = Number.isFinite(dem) ? `${Math.round(dem)}m` : ''
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

function createRawHexagonStyle() {
  return new Style({
    fill: new Fill({
      color: 'rgba(34, 197, 94, 0.08)',
    }),
    stroke: new Stroke({
      color: 'rgba(34, 197, 94, 0.9)',
      width: 1.2,
    }),
  })
}

function createHighlightStyle() {
  return new Style({
    fill: new Fill({
      color: 'rgba(255, 215, 0, 0.3)',
    }),
    stroke: new Stroke({
      color: 'rgba(255, 215, 0, 0.95)',
      width: 2.5,
    }),
  })
}

export function useMap() {
  const mapRef = ref(null)
  const mouseCoord = ref({ lon: '', lat: '' })
  const selectedFeatureInfo = ref(null)

  function initMap(target) {
    if (!target) return

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

    highlightLayer = new VectorLayer({
      source: new VectorSource(),
      style: createHighlightStyle(),
      opacity: 1,
      visible: true,
      zIndex: 999,
    })

    const popupEl = document.createElement('div')
    popupEl.className = 'ol-popup'
    popupEl.innerHTML = '<div class="ol-popup-content"></div>'
    document.body.appendChild(popupEl)

    popupOverlay = new Overlay({
      element: popupEl,
      positioning: 'bottom-center',
      offset: [0, -10],
      autoPan: { animation: { duration: 250 } },
    })

    map = new Map({
      target,
      layers: [geeLayer, demHexLayer, highlightLayer],
      overlays: [popupOverlay],
      view: new View({
        center: fromLonLat([121.334757975, 25.09106329]),
        zoom: 11,
      }),
    })

    target.$map = map
    mapRef.value = map

    map.on('pointermove', function(evt) {
      const lonLat = toLonLat(evt.coordinate)
      mouseCoord.value = {
        lon: lonLat[0].toFixed(6),
        lat: lonLat[1].toFixed(6),
      }
    })

    map.on('click', function(evt) {
      const feature = map.forEachFeatureAtPixel(evt.pixel, function(feat) {
        return feat
      })

      const hlSource = highlightLayer.getSource()
      hlSource.clear()
      selectedFeature = null

      const popupContent = popupOverlay.getElement().querySelector('.ol-popup-content')
      popupOverlay.setPosition(undefined)

      if (feature && feature.getGeometry()) {
        selectedFeature = feature
        hlSource.addFeature(feature)
        popupOverlay.setPosition(evt.coordinate)

        const props = feature.getProperties()
        const ignored = ['geometry']
        let html = '<table class="popup-table">'
        for (const [key, value] of Object.entries(props)) {
          if (ignored.includes(key)) continue
          const val = Number.isFinite(value) ? Number(value).toLocaleString() : String(value ?? '')
          if (key === 'dem' && val) {
            html += `<tr><td>高程 (DEM)</td><td>${val}m</td></tr>`
          } else if (val) {
            html += `<tr><td>${key}</td><td>${val}</td></tr>`
          }
        }
        html += '</table>'
        popupContent.innerHTML = html
      }

      if (selectedFeatureInfo.value !== null) {
        selectedFeatureInfo.value = null
      }
    })
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

    const center = layerConfig.center || [121.334757975, 25.09106329]
    const zoom = layerConfig.zoom || 11

    map.getView().animate({
      center: fromLonLat(center),
      zoom,
      duration: 400,
    })
  }

  function setDemHexagons(geojson, config = {}, options = {}) {
    if (!demHexLayer || !map) return

    const features = new GeoJSON().readFeatures(geojson, {
      featureProjection: 'EPSG:3857',
    })

    if (config.minDem == null || config.maxDem == null) {
      let min = Infinity
      let max = -Infinity
      for (const f of features) {
        const dem = Number(f.get('dem'))
        if (Number.isFinite(dem)) {
          if (dem < min) min = dem
          if (dem > max) max = dem
        }
      }
      if (Number.isFinite(min)) {
        config = { ...config, minDem: min, maxDem: max }
      }
    }

    const source = new VectorSource({ features })
    demHexLayer.setSource(source)
    demHexLayer.setStyle(createDemStyle(config))

    if (options.fit !== false && features.length > 0) {
      map.getView().fit(source.getExtent(), {
        padding: [60, 60, 60, 60],
        duration: 500,
        maxZoom: 10,
      })
    }

    highlightLayer.getSource().clear()
    selectedFeature = null
    popupOverlay.setPosition(undefined)
  }

  function setRawHexagons(geojson, options = {}) {
    if (!demHexLayer || !map) return

    const source = new VectorSource({
      features: new GeoJSON().readFeatures(geojson, {
        featureProjection: 'EPSG:3857',
      }),
    })

    demHexLayer.setSource(source)
    demHexLayer.setStyle(createRawHexagonStyle())

    if (options.fit !== false && source.getFeatures().length > 0) {
      map.getView().fit(source.getExtent(), {
        padding: [60, 60, 60, 60],
        duration: 500,
        maxZoom: 12,
      })
    }

    highlightLayer.getSource().clear()
    selectedFeature = null
    popupOverlay.setPosition(undefined)
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

    if (layerId === 'gee' && geeLayer) {
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

  function getViewBounds() {
    if (!map) return null

    const size = map.getSize()
    if (!size) return null

    const extent = map.getView().calculateExtent(size)
    return transformExtent(extent, 'EPSG:3857', 'EPSG:4326')
  }

  return {
    mapRef,
    mouseCoord,
    selectedFeatureInfo,
    initMap,
    setGeeLayer,
    setDemHexagons,
    setRawHexagons,
    addLayer,
    removeLayer,
    updateLayerVisibility,
    updateLayerDemStyle,
    setRawDataStyle,
    getViewBounds
  }
}