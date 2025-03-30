import React, { useState, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import JSZip from 'jszip';
import * as shapefile from 'shapefile';
import './App.css';

function App() {
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [allFeatures, setAllFeatures] = useState([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [showTable, setShowTable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const mapRef = useRef(null);

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
      fillOpacity: isSelected ? 0.7 : 0.4
    };
  }, [selectedFeatureId]);

  // GeoJSON事件处理
  const onEachFeature = useCallback((feature, layer) => {
    layer.on({
      click: () => {
        setSelectedFeatureId(feature.id);
        // 确保选中的要素属性行可见
        const element = document.getElementById(`row-${feature.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }, []);

  return (
    <div className="container">
      <div className="map-container">
        <MapContainer
          center={[0, 0]}
          zoom={2}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
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
          className="dropzone"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
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
              <p>正在处理文件...</p>
            ) : (
              <>
                <p>拖放或点击上传文件</p>
                <p className="small">支持的文件：.shp, .shx, .dbf, .prj, .cpg 或包含这些文件的 .zip</p>
                {error && <p className="error">{error}</p>}
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
                        onClick={() => setSelectedFeatureId(feature.id)}
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