
import proj4 from 'proj4';

// 定义常用的坐标系统
const projections = {
  // WGS84
  'EPSG:4326': '+proj=longlat +datum=WGS84 +no_defs',
  // Web墨卡托
  'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs',
};

// 解析PRJ文件内容
export function parsePrjContent(prjContent) {
  try {
    // 移除多余的空白字符和换行符
    const cleanContent = prjContent.replace(/\s+/g, ' ').trim();
    return cleanContent;
  } catch (error) {
    console.error('解析PRJ文件失败:', error);
    return null;
  }
}

// 转换坐标系统
export function transformCoordinates(geojson, fromProj, toProj = 'EPSG:4326') {
  if (!geojson || !fromProj) return geojson;

  try {
    // 如果源投影和目标投影相同，直接返回
    if (fromProj === toProj) return geojson;

    // 确保proj4知道这些投影定义
    if (!proj4.defs(fromProj)) {
      proj4.defs(fromProj, fromProj);
    }
    if (!proj4.defs(toProj)) {
      proj4.defs(toProj, projections[toProj]);
    }

    // 创建转换函数
    const transform = proj4(fromProj, toProj);

    // 深拷贝GeoJSON以避免修改原始数据
    const result = JSON.parse(JSON.stringify(geojson));

    // 遍历并转换所有坐标
    const processCoordinates = (coords) => {
      if (!Array.isArray(coords)) return coords;
      
      if (coords.length === 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        // 这是一个坐标点
        const transformed = transform.forward(coords);
        return transformed;
      }
      
      // 递归处理嵌套数组
      return coords.map(c => processCoordinates(c));
    };

    // 处理每个要素的几何体
    result.features = result.features.map(feature => {
      if (feature.geometry && feature.geometry.coordinates) {
        feature.geometry.coordinates = processCoordinates(feature.geometry.coordinates);
      }
      return feature;
    });

    return result;
  } catch (error) {
    console.error('坐标转换失败:', error);
    return geojson;
  }
}

// 检测投影类型
export function detectProjection(prjContent) {
  if (!prjContent) return 'EPSG:4326'; // 默认使用WGS84

  const lowerContent = prjContent.toLowerCase();
  
  // 检查常见的投影标识
  if (lowerContent.includes('wgs84') || lowerContent.includes('wgs_84')) {
    return 'EPSG:4326';
  }
  if (lowerContent.includes('web_mercator') || lowerContent.includes('pseudo_mercator')) {
    return 'EPSG:3857';
  }

  // 如果无法识别，返回原始投影字符串
  return prjContent;
}

// 获取目标投影系统
export function getTargetProjection(useWebMercator = false) {
  return useWebMercator ? 'EPSG:3857' : 'EPSG:4326';
}