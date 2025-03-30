import React, { useState, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import JSZip from 'jszip';
import * as shapefile from 'shapefile';
import './App.css';

function App() {
  const [geoJsonData, setGeoJsonData] = useState(null);
  const githubUrl = 'https://github.com/GISChat/shpviewer';
  const [allFeatures, setAllFeatures] = useState([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [showTable, setShowTable] = useState(true);
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
      setSelectedFeatureId(null);
      const fileMap = {};

      // 处理多个文件或ZIP文件
      if (files[0]?.name.endsWith('.zip')) {
        const zip = new JSZip();
        const contents = await zip.loadAsync(files[0]);
        
        for (const [filename, zipEntry] of Object.entries(contents.files)) {
          const ext = filename.split('.').pop().toLowerCase();
          if (['shp', 'dbf', 'shx', 'prj', 'cpg'].includes(ext)) {
            fileMap[ext] = await zipEntry.async('arraybuffer');
          }
        }
      } else {
        // 处理多个单独的文件
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

      // 解析shapefile
      const source = await shapefile.open(fileMap.shp, fileMap.dbf);
      const features = [];
      let result;
      while ((result = await source.read()) && !result.done) {
        features.push(result.value);
      }

      // 添加唯一ID到每个要素
      const featuresWithIds = addIdsToFeatures(features);
      
      const geojson = {
        type: 'FeatureCollection',
        features: featuresWithIds
      };

      setGeoJsonData(geojson);
      setAllFeatures(featuresWithIds);
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
  const getGeoJSONStyle = useCallback((feature) => {
    const isSelected = feature.id === selectedFeatureId;
    return {
      fillColor: isSelected ? '#ff7800' : '#3388ff',
      weight: isSelected ? 3 : 2,
      opacity: 1,
      color: isSelected ? '#ff7800' : '#3388ff',
      fillOpacity: isSelected ? 0.7 : 0.4,
      // 添加交互状态
      interactive: true
    };
  }, [selectedFeatureId]);

  // 用于重置所有图层样式的函数
  const resetLayerStyles = useCallback((layer) => {
    if (layer && layer.setStyle) {
      layer.setStyle(getGeoJSONStyle(layer.feature));
    }
  }, [getGeoJSONStyle]);

  // 存储所有图层的引用
  const layerRefs = useRef(new Map());

  // GeoJSON事件处理
  const onEachFeature = useCallback((feature, layer) => {
    // 保存图层引用
    layerRefs.current.set(feature.id, layer);

    layer.on({
      click: () => {
        setSelectedFeatureId(feature.id);
        // 更新所有图层的样式
        layerRefs.current.forEach((l) => {
          resetLayerStyles(l);
        });
        // 确保选中的要素属性行可见
        const element = document.getElementById(`row-${feature.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }, [resetLayerStyles]);

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
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {geoJsonData && (
            <GeoJSON 
              data={geoJsonData}
              style={getGeoJSONStyle}
              onEachFeature={onEachFeature}
            />
          )}
        </MapContainer>
      </div>
      <div className="sidebar">
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

        {allFeatures.length > 0 && (
          <div className="properties-section">
            <div className="properties-header">
              <h3>属性表 ({allFeatures.length} 个要素)</h3>
              <button 
                className="toggle-button"
                onClick={() => setShowTable(!showTable)}
              >
                {showTable ? '隐藏表格' : '显示表格'}
              </button>
            </div>
            
            {showTable && (
              <div className="table-container">
                <table className="properties-table">
                  <thead>
                    <tr>
                      <th>要素ID</th>
                      {/* 使用第一个要素的属性来生成表头 */}
                      {Object.keys(allFeatures[0]?.properties || {}).map(key => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allFeatures.map((feature) => (
                      <tr 
                        key={feature.id}
                        id={`row-${feature.id}`}
                        className={feature.id === selectedFeatureId ? 'selected' : ''}
                        onClick={() => {
                          setSelectedFeatureId(feature.id);
                          // 更新所有图层的样式
                          layerRefs.current.forEach((l) => {
                            resetLayerStyles(l);
                          });
                          // 获取要素的图层
                          const layer = layerRefs.current.get(feature.id);
                          if (layer) {
                            // 获取要素的边界
                            const bounds = layer.getBounds();
                            // 将地图视图平滑地飞到要素位置，并自动调整缩放级别
                            // 添加一些边距以显示周围内容
                            mapRef.current.fitBounds(bounds.pad(0.5), {
                              animate: true,
                              duration: 1
                            });
                          }
                        }}
                      >
                        <td>{feature.id}</td>
                        {Object.keys(allFeatures[0]?.properties || {}).map(key => (
                          <td key={`${feature.id}-${key}`}>
                            {String(feature.properties?.[key] || '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;