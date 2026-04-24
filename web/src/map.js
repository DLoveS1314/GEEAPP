import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import { fromLonLat } from 'ol/proj.js';

export function createMap(target) {
  const baseLayer = new TileLayer({
    source: new OSM(),
  });

  const geeLayer = new TileLayer({
    opacity: 0.85,
  });

  const map = new Map({
    target,
    layers: [baseLayer, geeLayer],
    view: new View({
      center: fromLonLat([116.55, 40.1]),
      zoom: 8,
    }),
  });

  return {
    map,
    setGeeLayer(layerConfig) {
      geeLayer.setSource(
        new XYZ({
          url: layerConfig.url,
          crossOrigin: 'anonymous',
          attributions: layerConfig.attribution,
        })
      );

      map.getView().animate({
        center: fromLonLat(layerConfig.center || [116.55, 40.1]),
        zoom: layerConfig.zoom || 8,
        duration: 400,
      });
    },
  };
}
