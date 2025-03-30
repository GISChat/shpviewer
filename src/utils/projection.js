import proj4 from 'proj4';

// 定义常用的坐标系统
const projections = {
  'EPSG:4326': '+proj=longlat +datum=WGS84 +no_defs',
  'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs',
  'EPSG:4269': '+proj=longlat +datum=NAD83 +no_defs', // NAD83
  'EPSG:32600': '+proj=utm +zone=ZONE +datum=WGS84 +units=m +no_defs', // UTM North
  'EPSG:32700': '+proj=utm +zone=ZONE +south +datum=WGS84 +units=m +no_defs', // UTM South
};

// 坐标系统范围定义
const coordinateRanges = {
  'EPSG:4326': {
    x: [-180, 180],
    y: [-90, 90],
    name: 'WGS84',
    type: 'geographic'
  },
  'EPSG:3857': {
    x: [-20037508.34, 20037508.34],
    y: [-20037508.34, 20037508.34],
    name: 'Web Mercator',
    type: 'projected'
  },
  'EPSG:4269': {
    x: [-180, 180],
    y: [-90, 90],
    name: 'NAD83',
    type: 'geographic'
  }
};

// 检测坐标系统类型
export function detectCoordinateSystem(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return null;
  }

  const [x, y] = coordinates;
  
  if (!isFinite(x) || !isFinite(y)) {
    return null;
  }

  // 检查是否是Web Mercator坐标
  if (Math.abs(x) > 180 || Math.abs(y) > 90) {
    if (Math.abs(x) <= 20037508.34 && Math.abs(y) <= 20037508.34) {
      return {
        srid: 'EPSG:3857',
        confidence: 'high',
        type: 'projected',
        name: 'Web Mercator'
      };
    }
  }

  // 检查是否是地理坐标（WGS84或NAD83）
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return {
      srid: 'EPSG:4326',
      confidence: 'high',
      type: 'geographic',
      name: 'WGS84'
    };
  }

  // 检查是否是UTM坐标
  if (x >= 160000 && x <= 834000 && y >= 0 && y <= 10000000) {
    return {
      srid: 'EPSG:32600', // 假设北半球
      confidence: 'medium',
      type: 'projected',
      name: 'UTM'
    };
  }

  return {
    srid: 'UNKNOWN',
    confidence: 'low',
    type: 'unknown',
    name: 'Unknown Coordinate System'
  };
}

// 解析PRJ文件内容
export function parsePrjContent(prjContent) {
  try {
    const cleanContent = prjContent.replace(/\s+/g, ' ').trim();
    console.log('Cleaned PRJ content:', cleanContent);
    return cleanContent;
  } catch (error) {
    console.error('解析PRJ文件失败:', error);
    return null;
  }
}

// 检测投影类型
export function detectProjection(prjContent) {
  if (!prjContent) {
    console.warn('No PRJ content provided');
    return 'EPSG:4326';
  }

  const lowerContent = prjContent.toLowerCase();
  console.log('Detecting projection from:', lowerContent);

  // Web Mercator
  if (lowerContent.includes('mercator') || 
      lowerContent.includes('3857') || 
      lowerContent.includes('3785') || 
      lowerContent.includes('900913')) {
    if (lowerContent.includes('auxiliary_sphere') || 
        lowerContent.includes('popular') || 
        lowerContent.includes('pseudo')) {
      return 'EPSG:3857';
    }
  }

  // WGS84
  if (lowerContent.includes('wgs_1984') || 
      lowerContent.includes('wgs84') || 
      lowerContent.includes('4326')) {
    if (!lowerContent.includes('utm')) {
      return 'EPSG:4326';
    }
  }

  // NAD83
  if (lowerContent.includes('nad_1983') || 
      lowerContent.includes('nad83') || 
      lowerContent.includes('4269')) {
    if (!lowerContent.includes('utm')) {
      return 'EPSG:4269';
    }
  }

  // UTM
  if (lowerContent.includes('utm')) {
    const zoneMatch = lowerContent.match(/zone_(\d+)/i) || 
                     lowerContent.match(/utm(\d+)/i);
    if (zoneMatch) {
      const zone = parseInt(zoneMatch[1]);
      if (lowerContent.includes('south')) {
        return projections['EPSG:32700'].replace('ZONE', zone);
      } else {
        return projections['EPSG:32600'].replace('ZONE', zone);
      }
    }
  }

  console.log('Using default WGS84 projection');
  return 'EPSG:4326';
}

// 转换坐标系统
export function transformCoordinates(geojson, fromProj, toProj = 'EPSG:3857') {
  if (!geojson || !geojson.features) {
    console.warn('Invalid GeoJSON input');
    return geojson;
  }

  try {
    // 如果源投影和目标投影相同，直接返回
    if (fromProj === toProj) {
      console.log('Source and target projections are the same, skipping transformation');
      return geojson;
    }

    // 确保proj4知道这些投影定义
    Object.entries(projections).forEach(([name, def]) => {
      if (!proj4.defs(name)) {
        proj4.defs(name, def);
      }
    });

    // 如果是自定义UTM投影，需要特别处理
    if (fromProj.includes('utm')) {
      proj4.defs(fromProj, fromProj);
    }

    // 创建转换函数
    const transform = proj4(fromProj, toProj);

    // 深拷贝GeoJSON以避免修改原始数据
    const result = JSON.parse(JSON.stringify(geojson));

    // 遍历并转换所有坐标
    const processCoordinates = (coords) => {
      if (!Array.isArray(coords)) {
        return coords;
      }
      
      if (coords.length === 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        try {
          const transformed = transform.forward(coords);
          
          // 验证转换结果
          if (!isFinite(transformed[0]) || !isFinite(transformed[1])) {
            console.warn('Invalid transformation result:', transformed);
            return coords;
          }

          return transformed;
        } catch (error) {
          console.error('Coordinate transformation error:', error);
          return coords;
        }
      }
      
      return coords.map(c => processCoordinates(c));
    };

    // 处理每个要素的几何体
    result.features = result.features.map(feature => {
      if (feature.geometry && feature.geometry.coordinates) {
        feature.geometry.coordinates = processCoordinates(feature.geometry.coordinates);
      }
      return feature;
    });

    console.log('Coordinate transformation completed');
    return result;
  } catch (error) {
    console.error('坐标转换失败:', error);
    return geojson;
  }
}

// 获取目标投影系统
export function getTargetProjection() {
  return 'EPSG:3857';
}