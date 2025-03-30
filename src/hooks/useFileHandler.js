import { useState } from 'react';
import JSZip from 'jszip';
import * as shapefile from 'shapefile';
import { addIdsToFeatures, createLayer } from '../utils/mapUtils';
import { transformCoordinates, parsePrjContent, detectProjection, detectCoordinateSystem } from '../utils/projection';

const useFileHandler = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 检查坐标范围是否与投影一致
  const validateProjection = (coordinates, projectionSrid) => {
    const detectedSystem = detectCoordinateSystem(coordinates);
    if (!detectedSystem) return projectionSrid;

    console.log('Coordinate system validation:', {
      declaredProjection: projectionSrid,
      detectedSystem: detectedSystem
    });

    // 如果检测结果的置信度高，且与声明的投影不同，使用检测到的投影
    if (detectedSystem.confidence === 'high' && detectedSystem.srid !== projectionSrid) {
      console.log('Projection mismatch detected, using detected projection:', detectedSystem.srid);
      return detectedSystem.srid;
    }

    return projectionSrid;
  };

  const handleFile = async (files) => {
    try {
      setLoading(true);
      setError(null);
      const fileMap = {};
      let fileName = '';

      console.log('Processing files:', files);

      // 处理多个文件或ZIP文件
      if (files[0]?.name.endsWith('.zip')) {
        const zip = new JSZip();
        const contents = await zip.loadAsync(files[0]);
        fileName = files[0].name.split('.')[0];
        
        for (const [filename, zipEntry] of Object.entries(contents.files)) {
          const ext = filename.split('.').pop().toLowerCase();
          if (['shp', 'dbf', 'shx', 'prj', 'cpg'].includes(ext)) {
            fileMap[ext] = await zipEntry.async('arraybuffer');
          }
        }
      } else {
        // 处理多个单独的文件
        fileName = files[0]?.name.split('.')[0];
        for (const file of files) {
          const ext = file.name.split('.').pop().toLowerCase();
          if (['shp', 'dbf', 'shx', 'prj', 'cpg'].includes(ext)) {
            fileMap[ext] = await file.arrayBuffer();
          }
        }
      }

      // 检查必需文件
      if (!fileMap.shp) {
        throw new Error('缺少.shp文件');
      }

      // 1. 首先读取并解析 prj 文件
      let declaredProjection = 'EPSG:4326'; // 默认假设是 WGS84
      if (fileMap.prj) {
        try {
          const decoder = new TextDecoder('utf-8');
          const prjContent = decoder.decode(fileMap.prj);
          console.log('PRJ content:', prjContent);
          
          const parsedPrj = parsePrjContent(prjContent);
          declaredProjection = detectProjection(parsedPrj);
          console.log('Declared projection from PRJ:', declaredProjection);
        } catch (error) {
          console.warn('Error parsing PRJ file:', error);
        }
      }

      // 2. 解析 shapefile 并检查实际数据
      console.log('Opening shapefile...');
      const source = await shapefile.open(fileMap.shp, fileMap.dbf);
      const features = [];
      let result;
      while ((result = await source.read()) && !result.done) {
        features.push(result.value);
      }

      console.log('Features loaded:', features.length);

      // 添加唯一ID到每个要素
      const featuresWithIds = addIdsToFeatures(features);
      
      let geojson = {
        type: 'FeatureCollection',
        features: featuresWithIds
      };

      // 3. 检查第一个要素的坐标范围，验证投影
      let actualProjection = declaredProjection;
      if (geojson.features.length > 0) {
        const firstFeature = geojson.features[0];
        if (firstFeature.geometry && firstFeature.geometry.coordinates) {
          const coords = Array.isArray(firstFeature.geometry.coordinates[0]) ? 
            firstFeature.geometry.coordinates[0] : 
            firstFeature.geometry.coordinates;
          
          console.log('Sample coordinates:', coords);
          actualProjection = validateProjection(coords, declaredProjection);
        }
      }

      console.log('Using projection:', actualProjection);

      // 4. 如果不是 EPSG:3857，进行转换
      let finalGeoJSON = geojson;
      if (actualProjection !== 'EPSG:3857') {
        console.log('Converting coordinates from', actualProjection, 'to EPSG:3857');
        finalGeoJSON = transformCoordinates(geojson, actualProjection, 'EPSG:3857');
        
        if (!finalGeoJSON || !finalGeoJSON.features) {
          throw new Error('投影转换返回了无效的 GeoJSON');
        }

        // 验证转换结果
        const validFeatures = finalGeoJSON.features.filter(f => 
          f.geometry && 
          f.geometry.coordinates && 
          Array.isArray(f.geometry.coordinates)
        );

        if (validFeatures.length === 0) {
          throw new Error('转换后没有有效的要素');
        }

        if (validFeatures.length !== finalGeoJSON.features.length) {
          console.warn(`部分要素转换失败: ${validFeatures.length}/${finalGeoJSON.features.length}`);
        }

        finalGeoJSON = {
          type: 'FeatureCollection',
          features: validFeatures
        };
      }

      // 创建新图层
      const newLayer = createLayer(finalGeoJSON, fileName, actualProjection);

      console.log('Layer created:', {
        id: newLayer.id,
        name: newLayer.name,
        featureCount: finalGeoJSON.features.length,
        sourceProjection: actualProjection,
        targetProjection: 'EPSG:3857'
      });

      return newLayer;

    } catch (error) {
      console.error('Error processing file:', error);
      setError(error.message || '处理文件时发生错误');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    handleFile
  };
};

export default useFileHandler;