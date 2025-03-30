import React, { useState, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import JSZip from 'jszip';
import * as shapefile from 'shapefile';
import L from 'leaflet';
import { 
  transformCoordinates, 
  parsePrjContent, 
  detectProjection, 
  getTargetProjection 
} from './utils/projection';
import './App.css';

// 使用Web墨卡托投影（如果为false则使用WGS84）
const USE_WEB_MERCATOR = false;

// 从GeoJSON计算边界
const getBoundsFromGeoJSON = (geojson) => {
  if (!geojson || !geojson.features || geojson.features.length === 0) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const processCoordinates = (coords) => {
    if (Array.isArray(coords[0])) {
      coords.forEach(processCoordinates);
    } else {
      const [lng, lat] = coords;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  };

  geojson.features.forEach(feature => {
    if (feature.geometry && feature.geometry.coordinates) {
      processCoordinates(feature.geometry.coordinates);
    }
  });

  if (minLng === Infinity || maxLng === -Infinity || minLat === Infinity || maxLat === -Infinity) {
    return null;
  }

  return [[minLat, minLng], [maxLat, maxLng]];
};

function App() {
  // 多图层数据管理
  const [layers, setLayers] = useState([]);
  const githubUrl = 'https://github.com/GISChat/shpviewer';
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);

  // 当地图组件加载完成时获取地图实例
  const onMapCreated = useCallback((mapInstance) => {
    setMap(mapInstance);
  }, []);

  // 为每个要素生成唯一ID
  const addIdsToFeatures = (features) => {
    return features.map((feature, index) => ({
      ...feature,
      id: `feature-${index}`
    }));
  };

  const handleFile = async (files) => {
    try {
      setLoading(true);
      setError(null);
      const fileMap = {};
      let fileName = '';

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

      // 获取投影信息
      let sourceProjection = 'EPSG:4326'; // 默认使用WGS84
      if (fileMap.prj) {
        const decoder = new TextDecoder('utf-8');
        const prjContent = decoder.decode(fileMap.prj);
        const parsedPrj = parsePrjContent(prjContent);
        sourceProjection = detectProjection(parsedPrj);
      }

      // 解析shapefile
      const source = await shapefile.open(fileMap.shp, fileMap.dbf);
      const features = [];
      let result;
      while ((result = await source.read()) && !result.done) {
        features.push(result.value);
      }

      // 添加唯一ID到每个要素
      const featuresWithIds = addIdsToFeatures(features);
      
      let geojson = {
        type: 'FeatureCollection',
        features: featuresWithIds
      };

      // 进行投影转换
      const targetProjection = getTargetProjection(USE_WEB_MERCATOR);
      if (sourceProjection !== targetProjection) {
        geojson = transformCoordinates(geojson, sourceProjection, targetProjection);
      }

      // 创建新图层
      const newLayer = {
        id: `layer-${Date.now()}`,
        name: fileName || `图层 ${layers.length + 1}`,
        data: geojson,
        features: geojson.features,
        visible: true,
        showTable: true,
        sourceProjection,
        targetProjection
      };

      setLayers(prevLayers => [...prevLayers, newLayer]);
      setSelectedLayerId(newLayer.id);

      // 如果这是第一个图层，设置地图视图
      if (layers.length === 0 && map) {
        const bounds = getBoundsFromGeoJSON(geojson);
        if (bounds) {
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      }
    } catch (error) {
      console.error('Error processing file:', error);
      setError(error.message || '处理文件时发生错误');
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files || e.target.files;
    if (files.length > 0) {
      handleFile(files);
    }
  }, []);

  // GeoJSON样式控制
  const getGeoJSONStyle = useCallback((feature, layerId) => {
    const isSelected = feature.id === selectedFeatureId && layerId === selectedLayerId;
    return {
      fillColor: isSelected ? '#ff7800' : '#3388ff',
      weight: isSelected ? 3 : 2,
      opacity: 1,
      color: isSelected ? '#ff7800' : '#3388ff',
      fillOpacity: isSelected ? 0.7 : 0.4,
      interactive: true
    };
  }, [selectedFeatureId, selectedLayerId]);

  // 存储所有图层的引用，使用嵌套Map：layerId -> featureId -> layer
  const layerRefs = useRef(new Map());

  // 用于重置所有图层样式的函数
  const resetAllLayerStyles = useCallback(() => {
    layerRefs.current.forEach((featureMap, layerId) => {
      featureMap.forEach((layer, featureId) => {
        if (layer && layer.setStyle) {
          const feature = layer.feature;
          layer.setStyle(getGeoJSONStyle(feature, layerId));
        }
      });
    });
  }, [getGeoJSONStyle]);

  // 高亮显示选中的要素
  const highlightFeature = useCallback((featureId, layerId) => {
    setSelectedFeatureId(featureId);
    setSelectedLayerId(layerId);
    resetAllLayerStyles();

    // 获取要素的图层并调整地图视图
    const featureLayer = layerRefs.current.get(layerId)?.get(featureId);
    if (featureLayer && map) {
      const bounds = featureLayer.getBounds();
      map.fitBounds(bounds.pad(0.5), {
        animate: true,
        duration: 1
      });
    }

    // 确保选中的要素属性行可见
    const element = document.getElementById(`row-${layerId}-${featureId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [map, resetAllLayerStyles]);

  // GeoJSON事件处理
  const onEachFeature = useCallback((feature, layer, layerId) => {
    // 为feature添加layerId
    feature.layerId = layerId;
    
    // 确保该图层的Map存在
    if (!layerRefs.current.has(layerId)) {
      layerRefs.current.set(layerId, new Map());
    }
    
    // 保存图层引用
    layerRefs.current.get(layerId).set(feature.id, layer);

    layer.on({
      click: () => {
        highlightFeature(feature.id, layerId);
      }
    });
  }, [highlightFeature]);

  return (
    <div className="container">
      <a href={githubUrl} className="github-link" target="_blank" rel="noopener noreferrer">
        <svg height="32" width="32" viewBox="0 0 16 16" version="1.1" aria-hidden="true">
          <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
        </svg>
      </a>
      <div className="map-container">
        <MapContainer
          center={[0, 0]}
          zoom={2}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
          whenCreated={onMapCreated}
          crs={USE_WEB_MERCATOR ? L.CRS.EPSG3857 : L.CRS.EPSG4326}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {layers.map(layer => (
            <GeoJSON 
              key={layer.id}
              data={layer.data}
              style={(feature) => getGeoJSONStyle(feature, layer.id)}
              onEachFeature={(feature, geoLayer) => onEachFeature(feature, geoLayer, layer.id)}
              {...(!layer.visible && { style: { opacity: 0, fillOpacity: 0 } })}
            />
          ))}
        </MapContainer>
      </div>
      <div className="sidebar">
        {layers.length > 0 && (
          <div className="layers-control">
            <h3>图层控制面板</h3>
            {layers.map(layer => (
              <div key={layer.id} className={`layer-item ${layer.visible ? 'active' : ''}`}>
                <div className="layer-header">
                  <div className="layer-visibility">
                    <input
                      type="checkbox"
                      id={`visibility-${layer.id}`}
                      checked={layer.visible}
                      onChange={() => {
                        setLayers(prevLayers =>
                          prevLayers.map(l =>
                            l.id === layer.id ? { ...l, visible: !l.visible } : l
                          )
                        );
                      }}
                    />
                    <label htmlFor={`visibility-${layer.id}`} className="visibility-label">
                      {layer.visible ? '显示' : '隐藏'}
                    </label>
                  </div>
                  <span className="layer-name" title={layer.name}>{layer.name}</span>
                  <div className="layer-controls">
                    <button
                      className={`toggle-table-button ${layer.showTable ? 'active' : ''}`}
                      onClick={() => {
                        setLayers(prevLayers =>
                          prevLayers.map(l =>
                            l.id === layer.id ? { ...l, showTable: !l.showTable } : l
                          )
                        );
                      }}
                      title={layer.showTable ? '隐藏属性表' : '显示属性表'}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d={layer.showTable 
                          ? "M3 10h18M3 14h18M3 18h18M3 6h18" 
                          : "M3 9h18M3 15h18"} 
                        />
                      </svg>
                      {layer.showTable ? '隐藏属性' : '显示属性'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div
          className={`dropzone ${loading ? 'loading' : ''}`}
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add('drag-over');
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('drag-over');
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".shp,.shx,.dbf,.prj,.cpg,.zip"
            style={{ display: 'none' }}
            onChange={onDrop}
            multiple
          />
          <div className="dropzone-content">
            {loading ? (
              <div className="loading-container">
                <div className="loading-spinner" />
                <p>正在处理文件...</p>
              </div>
            ) : (
              <>
                <div className="upload-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 10V9C7 6.23858 9.23858 4 12 4C14.7614 4 17 6.23858 17 9V10C19.2091 10 21 11.7909 21 14C21 15.4806 20.1956 16.8084 19 17.5M7 10C4.79086 10 3 11.7909 3 14C3 15.4806 3.80443 16.8084 5 17.5M7 10C7.43285 10 7.84965 10.0688 8.24006 10.1959M12 12V21M12 12L15 15M12 12L9 15" 
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="upload-text">拖放或点击上传文件</p>
                <p>在线分析 shape file</p>
                <p>(不保存数据)</p>
                <p className="small">支持的文件：.shp, .shx, .dbf, .prj, .cpg 或包含这些文件的 .zip</p>
                {error && (
                  <div className="error">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" 
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span>{error}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {layers.map(layer => (
          layer.showTable && (
            <div key={layer.id} className="properties-section">
              <div className="properties-header">
                <h3>{layer.name} - 属性表 ({layer.features.length} 个要素)</h3>
              </div>
              
              <div className="table-container">
                <table className="properties-table">
                  <thead>
                    <tr>
                      <th>要素ID</th>
                      {/* 使用第一个要素的属性来生成表头 */}
                      {Object.keys(layer.features[0]?.properties || {}).map(key => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {layer.features.map((feature) => (
                      <tr 
                        key={`${layer.id}-${feature.id}`}
                        id={`row-${layer.id}-${feature.id}`}
                        className={feature.id === selectedFeatureId && layer.id === selectedLayerId ? 'selected' : ''}
                        onClick={() => highlightFeature(feature.id, layer.id)}
                      >
                        <td>{feature.id}</td>
                        {Object.keys(layer.features[0]?.properties || {}).map(key => (
                          <td key={`${layer.id}-${feature.id}-${key}`}>
                            {String(feature.properties?.[key] || '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

export default App;