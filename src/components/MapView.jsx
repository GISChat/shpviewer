import React, { useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getBoundsFromGeoJSON } from '../utils/mapUtils';
import proj4 from 'proj4';

// 定义投影
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
const MERCATOR = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs';

// 确保proj4知道这些投影定义
proj4.defs('EPSG:4326', WGS84);
proj4.defs('EPSG:3857', MERCATOR);

// 地图自动缩放组件
const MapBoundsHandler = ({ layers }) => {
  const map = useMap();

  useEffect(() => {
    if (layers && layers.length > 0) {
      const visibleLayers = layers.filter(layer => layer.visible);
      if (visibleLayers.length > 0) {
        // 计算所有可见图层的边界
        const bounds = visibleLayers.reduce((acc, layer) => {
          const layerBounds = getBoundsFromGeoJSON(layer.data);
          if (!layerBounds) return acc;
          
          if (!acc) return L.latLngBounds(layerBounds);
          return acc.extend(L.latLngBounds(layerBounds));
        }, null);

        if (bounds) {
          console.log('Fitting map to bounds:', bounds);
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      }
    }
  }, [layers, map]);

  return null;
};

const MapView = ({ 
  layers, 
  selectedFeatureId, 
  selectedLayerId, 
  onMapCreated, 
  onFeatureSelect,
  layerRefs 
}) => {
  // GeoJSON样式控制
  const getGeoJSONStyle = useCallback((feature, layerId) => {
    try {
      const isSelected = feature.id === selectedFeatureId && layerId === selectedLayerId;
      return {
        fillColor: isSelected ? '#ff7800' : '#3388ff',
        weight: isSelected ? 3 : 2,
        opacity: 1,
        color: isSelected ? '#ff7800' : '#3388ff',
        fillOpacity: isSelected ? 0.7 : 0.4,
        interactive: true
      };
    } catch (error) {
      console.error('Error in getGeoJSONStyle:', error);
      return {};
    }
  }, [selectedFeatureId, selectedLayerId]);

  // GeoJSON事件处理
  const onEachFeature = useCallback((feature, layer, layerId) => {
    try {
      console.log('Processing feature:', feature.id, 'in layer:', layerId);
      
      // 为feature添加layerId
      feature.layerId = layerId;
      
      // 确保该图层的Map存在
      if (!layerRefs.current.has(layerId)) {
        layerRefs.current.set(layerId, new Map());
      }
      
      // 保存图层引用
      layerRefs.current.get(layerId).set(feature.id, layer);

      // 绑定弹出窗口
      const popupContent = `<div>
        <strong>要素ID:</strong> ${feature.id}<br/>
        <strong>图层:</strong> ${layerId}<br/>
        <strong>属性:</strong><br/>
        ${Object.entries(feature.properties || {})
          .map(([key, value]) => `${key}: ${value}`)
          .join('<br/>')}
      </div>`;
      layer.bindPopup(popupContent);

      layer.on({
        click: () => onFeatureSelect(feature.id, layerId),
        mouseover: () => {
          layer.setStyle({
            weight: 3,
            fillOpacity: 0.6
          });
        },
        mouseout: () => {
          layer.setStyle(getGeoJSONStyle(feature, layerId));
        }
      });
    } catch (error) {
      console.error('Error in onEachFeature:', error);
    }
  }, [onFeatureSelect, getGeoJSONStyle, layerRefs]);

  // 坐标转换函数
  const coordsToLatLng = useCallback((coords) => {
    try {
      if (!Array.isArray(coords) || coords.length !== 2) {
        throw new Error('Invalid coordinate array');
      }

      let [x, y] = coords;
      if (!isFinite(x) || !isFinite(y)) {
        throw new Error('Invalid coordinate values');
      }

      // 如果坐标在经纬度范围内，需要转换为Web Mercator
      if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
        console.log('Converting WGS84 coordinates to Web Mercator:', [x, y]);
        const transformed = proj4('EPSG:4326', 'EPSG:3857', [x, y]);
        [x, y] = transformed;
        console.log('Transformed to Web Mercator:', [x, y]);
      }

      // 确保坐标在Web Mercator范围内
      const maxMercatorBound = 20037508.34;
      x = Math.max(-maxMercatorBound, Math.min(maxMercatorBound, x));
      y = Math.max(-maxMercatorBound, Math.min(maxMercatorBound, y));

      // 转换回经纬度用于显示
      const lng = (x / maxMercatorBound) * 180;
      const lat = (Math.atan(Math.exp(y / maxMercatorBound * Math.PI)) * 180 / Math.PI * 2) - 90;

      console.log('Final display coordinates:', [lat, lng]);
      return [lat, lng];
    } catch (error) {
      console.error('Coordinate conversion error:', error);
      return [0, 0];
    }
  }, []);

  return (
    <MapContainer
      center={[0, 0]}
      zoom={2}
      minZoom={1}
      maxZoom={18}
      style={{ height: '100%', width: '100%' }}
      whenCreated={onMapCreated}
      crs={L.CRS.EPSG3857}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <TileLayer
        url="https://tiles.stadiamaps.com/tiles/stamen_toner_lines/{z}/{x}/{y}{r}.png"
        opacity={0.3}
      />
      <MapBoundsHandler layers={layers} />
      {layers.map(layer => {
        if (!layer.visible) {
          return null;
        }

        console.log('Rendering layer:', {
          id: layer.id,
          name: layer.name,
          featureCount: layer.data.features.length,
          bounds: getBoundsFromGeoJSON(layer.data)
        });

        return (
          <GeoJSON 
            key={layer.id}
            data={layer.data}
            style={(feature) => getGeoJSONStyle(feature, layer.id)}
            onEachFeature={(feature, geoLayer) => onEachFeature(feature, geoLayer, layer.id)}
            coordsToLatLng={coordsToLatLng}
          />
        );
      })}
    </MapContainer>
  );
};

export default MapView;