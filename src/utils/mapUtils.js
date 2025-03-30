import proj4 from 'proj4';

// 定义投影
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
const MERCATOR = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs';

// 确保proj4知道这些投影定义
proj4.defs('EPSG:4326', WGS84);
proj4.defs('EPSG:3857', MERCATOR);

// Web Mercator 的最大边界值
const MAX_MERCATOR_BOUND = 20037508.34;

// 检查坐标是否在 WGS84 范围内
function isWGS84Coordinate(coord) {
  const [x, y] = coord;
  return Math.abs(x) <= 180 && Math.abs(y) <= 90;
}

// 检查坐标是否在 Web Mercator 范围内
function isWebMercatorCoordinate(coord) {
  const [x, y] = coord;
  return Math.abs(x) <= MAX_MERCATOR_BOUND && Math.abs(y) <= MAX_MERCATOR_BOUND;
}

// 将 WGS84 坐标转换为 Web Mercator
function wgs84ToWebMercator(coord) {
  try {
    if (!isWGS84Coordinate(coord)) {
      throw new Error('Coordinates out of WGS84 range');
    }
    return proj4('EPSG:4326', 'EPSG:3857', coord);
  } catch (error) {
    console.error('WGS84 to Web Mercator conversion error:', error);
    return coord;
  }
}

// 将 Web Mercator 坐标转换为 WGS84
function webMercatorToWGS84(coord) {
  try {
    if (!isWebMercatorCoordinate(coord)) {
      throw new Error('Coordinates out of Web Mercator range');
    }
    return proj4('EPSG:3857', 'EPSG:4326', coord);
  } catch (error) {
    console.error('Web Mercator to WGS84 conversion error:', error);
    return coord;
  }
}

// 从GeoJSON计算边界
export const getBoundsFromGeoJSON = (geojson) => {
  if (!geojson || !geojson.features || geojson.features.length === 0) {
    console.warn('Invalid or empty GeoJSON');
    return null;
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  const processCoordinates = (coords) => {
    if (Array.isArray(coords[0])) {
      coords.forEach(processCoordinates);
    } else {
      try {
        let [x, y] = coords;

        // 如果是 WGS84 坐标，先转换为 Web Mercator
        if (isWGS84Coordinate([x, y])) {
          console.log('Converting WGS84 coordinates to Web Mercator:', [x, y]);
          [x, y] = wgs84ToWebMercator([x, y]);
          console.log('Converted to Web Mercator:', [x, y]);
        }

        // 确保坐标在 Web Mercator 范围内
        x = Math.max(-MAX_MERCATOR_BOUND, Math.min(MAX_MERCATOR_BOUND, x));
        y = Math.max(-MAX_MERCATOR_BOUND, Math.min(MAX_MERCATOR_BOUND, y));

        // 转换回 WGS84 用于显示
        const [lng, lat] = webMercatorToWGS84([x, y]);

        if (isFinite(lat) && isFinite(lng)) {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
        }
      } catch (error) {
        console.error('Error processing coordinate:', coords, error);
      }
    }
  };

  try {
    geojson.features.forEach(feature => {
      if (feature.geometry && feature.geometry.coordinates) {
        processCoordinates(feature.geometry.coordinates);
      }
    });

    if (minLat === Infinity || maxLat === -Infinity || minLng === Infinity || maxLng === -Infinity) {
      console.warn('No valid coordinates found in GeoJSON');
      return null;
    }

    console.log('Calculated bounds:', {
      southwest: [minLat, minLng],
      northeast: [maxLat, maxLng]
    });

    return [[minLat, minLng], [maxLat, maxLng]];
  } catch (error) {
    console.error('Error calculating bounds:', error);
    return null;
  }
};

// 添加唯一ID到要素
export const addIdsToFeatures = (features) => {
  return features.map((feature, index) => ({
    ...feature,
    id: `feature-${index}`
  }));
};

// 创建新图层对象
export const createLayer = (geojson, fileName, sourceProjection) => {
  console.log('Creating new layer:', {
    fileName,
    sourceProjection,
    featureCount: geojson.features.length
  });

  const layer = {
    id: `layer-${Date.now()}`,
    name: fileName || `图层 ${Date.now()}`,
    data: geojson,
    features: geojson.features,
    visible: true,
    showTable: true,
    sourceProjection,
    targetProjection: 'EPSG:3857'  // 固定使用 Web Mercator
  };

  // 计算并记录图层边界
  const bounds = getBoundsFromGeoJSON(geojson);
  if (bounds) {
    console.log('Layer bounds:', bounds);
  }

  return layer;
};