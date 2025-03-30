import React, { useState, useRef } from 'react';
import MapView from './components/MapView';
import LayerControl from './components/LayerControl';
import FileUploader from './components/FileUploader';
import AttributeTable from './components/AttributeTable';
import useFileHandler from './hooks/useFileHandler';
import { getBoundsFromGeoJSON } from './utils/mapUtils';
import './App.css';

function App() {
  // 状态管理
  const [layers, setLayers] = useState([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [map, setMap] = useState(null);
  const layerRefs = useRef(new Map());
  const { loading, error, handleFile } = useFileHandler();
  const githubUrl = 'https://github.com/GISChat/shpviewer';

  // 文件上传处理
  const onFileUpload = async (files) => {
    const newLayer = await handleFile(files);
    if (newLayer) {
      setLayers(prevLayers => [...prevLayers, newLayer]);
      setSelectedLayerId(newLayer.id);

      // 如果这是第一个图层，设置地图视图
      if (layers.length === 0 && map) {
        const bounds = getBoundsFromGeoJSON(newLayer.data);
        if (bounds) {
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      }
    }
  };

  // 图层可见性切换
  const handleLayerVisibilityChange = (layerId) => {
    setLayers(prevLayers =>
      prevLayers.map(l =>
        l.id === layerId ? { ...l, visible: !l.visible } : l
      )
    );
  };

  // 属性表显示切换
  const handleLayerTableToggle = (layerId) => {
    setLayers(prevLayers =>
      prevLayers.map(l =>
        l.id === layerId ? { ...l, showTable: !l.showTable } : l
      )
    );
  };

  // 要素选择处理
  const handleFeatureSelect = (featureId, layerId) => {
    setSelectedFeatureId(featureId);
    setSelectedLayerId(layerId);

    // 获取要素的图层并调整地图视图
    const featureLayer = layerRefs.current.get(layerId)?.get(featureId);
    if (featureLayer && map) {
      const bounds = featureLayer.getBounds();
      map.fitBounds(bounds.pad(0.5), {
        animate: true,
        duration: 1,
        maxZoom: 18
      });
    }

    // 确保选中的要素属性行可见
    const element = document.getElementById(`row-${layerId}-${featureId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="container">
      <a href={githubUrl} className="github-link" target="_blank" rel="noopener noreferrer">
        <svg height="32" width="32" viewBox="0 0 16 16" version="1.1" aria-hidden="true">
          <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
        </svg>
      </a>
      <div className="map-container">
        <MapView
          layers={layers}
          selectedFeatureId={selectedFeatureId}
          selectedLayerId={selectedLayerId}
          onMapCreated={setMap}
          onFeatureSelect={handleFeatureSelect}
          layerRefs={layerRefs}
        />
      </div>
      <div className="sidebar">
        <LayerControl
          layers={layers}
          onLayerVisibilityChange={handleLayerVisibilityChange}
          onLayerTableToggle={handleLayerTableToggle}
        />
        <FileUploader
          loading={loading}
          error={error}
          onFileUpload={onFileUpload}
        />
        {layers.map(layer => (
          <AttributeTable
            key={layer.id}
            layer={layer}
            selectedFeatureId={selectedFeatureId}
            selectedLayerId={selectedLayerId}
            onFeatureSelect={handleFeatureSelect}
          />
        ))}
      </div>
    </div>
  );
}

export default App;