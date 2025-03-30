# ShpViewer

ShpViewer 是一个基于 Web 的 Shapefile 文件查看器，支持在线预览和分析 GIS 数据。项目采用 React 和 Leaflet 构建，提供直观的用户界面和高效的数据处理能力。

## 技术架构

### 核心依赖
- React：用户界面构建
- Leaflet & React-Leaflet：地图显示
- Proj4js：坐标系统转换
- Shapefile：Shapefile 文件解析
- JSZip：ZIP 文件处理

### 项目结构
```
src/
├── components/          # React 组件
│   ├── MapView.jsx     # 地图显示组件
│   ├── LayerControl.jsx # 图层控制组件
│   ├── FileUploader.jsx # 文件上传组件
│   └── AttributeTable.jsx # 属性表组件
├── hooks/              # 自定义 Hooks
│   └── useFileHandler.js # 文件处理逻辑
├── utils/              # 工具函数
│   ├── mapUtils.js     # 地图相关工具
│   └── projection.js   # 投影转换工具
└── App.jsx            # 主应用组件
```

## 设计理念

### 1. 组件化设计
采用组件化设计模式，将功能拆分为独立、可复用的组件：

```javascript
// App.jsx - 主应用组件
function App() {
  const [layers, setLayers] = useState([]);
  const { handleFile } = useFileHandler();

  return (
    <div className="container">
      <MapView layers={layers} />
      <Sidebar>
        <LayerControl layers={layers} />
        <FileUploader onFileUpload={handleFile} />
        <AttributeTable layers={layers} />
      </Sidebar>
    </div>
  );
}
```

### 2. 数据流设计
采用单向数据流设计，确保数据处理的可预测性：

```javascript
// 数据处理流程示例
const processData = async (files) => {
  // 1. 文件解析
  const rawData = await parseFiles(files);
  
  // 2. 投影处理
  const projectionInfo = await detectProjection(rawData);
  
  // 3. 数据转换
  const processedData = await transformData(rawData, projectionInfo);
  
  // 4. 状态更新
  updateLayerState(processedData);
};
```

### 3. 投影处理策略
采用三步验证策略确保坐标系统的正确性：

```javascript
// 投影处理逻辑
const handleProjection = (data) => {
  // 1. 读取 PRJ 文件定义
  const declaredProj = readPrjFile(data.prj);
  
  // 2. 验证实际坐标
  const detectedProj = validateCoordinates(data.coordinates);
  
  // 3. 智能选择投影
  const finalProj = selectProjection(declaredProj, detectedProj);
  
  // 4. 转换到 Web Mercator
  return transformToWebMercator(data, finalProj);
};
```

### 4. 错误处理机制
实现全面的错误处理和用户反馈：

```javascript
// 错误处理示例
const handleError = (error) => {
  // 1. 记录错误
  console.error('Error:', error);
  
  // 2. 用户反馈
  notifyUser(error.message);
  
  // 3. 错误恢复
  recoverFromError(error);
};
```

## 核心功能实现

### 1. 文件处理
```javascript
// useFileHandler.js
const useFileHandler = () => {
  const handleFile = async (files) => {
    try {
      // 1. 文件分类
      const fileMap = categorizeFiles(files);
      
      // 2. 投影检测
      const projection = await detectProjection(fileMap.prj);
      
      // 3. 数据加载
      const features = await loadShapefile(fileMap);
      
      // 4. 创建图层
      return createLayer(features, projection);
    } catch (error) {
      handleError(error);
    }
  };
  
  return { handleFile };
};
```

### 2. 坐标转换
```javascript
// projection.js
export const transformCoordinates = (geojson, fromProj, toProj) => {
  // 1. 验证投影
  validateProjection(fromProj);
  
  // 2. 创建转换函数
  const transform = createTransform(fromProj, toProj);
  
  // 3. 转换坐标
  return transformFeatures(geojson, transform);
};
```

### 3. 地图交互
```javascript
// MapView.jsx
const MapView = ({ layers }) => {
  // 1. 样式控制
  const getStyle = useCallback((feature) => ({
    color: feature.selected ? '#ff7800' : '#3388ff',
    weight: feature.selected ? 3 : 2
  }), []);
  
  // 2. 要素交互
  const onFeatureClick = useCallback((feature) => {
    highlightFeature(feature);
    showAttributes(feature);
  }, []);
  
  return (
    <MapContainer>
      {layers.map(layer => (
        <GeoJSON
          key={layer.id}
          data={layer.data}
          style={getStyle}
          onEachFeature={handleFeature}
        />
      ))}
    </MapContainer>
  );
};
```

## 性能优化

### 1. 数据处理优化
- 使用 Web Workers 处理大文件
- 实现数据分片加载
- 优化坐标转换算法

### 2. 渲染优化
- 使用 React.memo 优化组件重渲染
- 实现虚拟化列表显示大量属性数据
- 优化地图图层渲染

### 3. 内存管理
- 及时释放大文件资源
- 实现图层数据缓存机制
- 控制同时加载的数据量

## 最佳实践

### 1. 文件处理
- 总是验证文件完整性
- 处理所有可能的错误情况
- 提供清晰的用户反馈

### 2. 投影处理
- 优先使用 PRJ 文件定义
- 验证坐标范围合理性
- 处理特殊投影情况

### 3. 用户交互
- 提供清晰的操作反馈
- 实现渐进式加载
- 支持键盘操作

## 开发指南

### 本地开发
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 调试技巧
1. 使用浏览器开发工具监控网络请求
2. 查看控制台日志了解数据处理过程
3. 使用 React DevTools 分析组件性能

## 许可证
MIT License