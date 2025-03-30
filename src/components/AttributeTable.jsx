import React from 'react';

const AttributeTable = ({ 
  layer, 
  selectedFeatureId, 
  selectedLayerId, 
  onFeatureSelect 
}) => {
  if (!layer || !layer.showTable || !layer.features || layer.features.length === 0) {
    return null;
  }

  // 获取属性表的列名（使用第一个要素的属性）
  const columns = Object.keys(layer.features[0]?.properties || {});

  return (
    <div className="properties-section">
      <div className="properties-header">
        <h3>{layer.name} - 属性表 ({layer.features.length} 个要素)</h3>
      </div>
      
      <div className="table-container">
        <table className="properties-table">
          <thead>
            <tr>
              <th>要素ID</th>
              {columns.map(key => (
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
                onClick={() => onFeatureSelect(feature.id, layer.id)}
              >
                <td>{feature.id}</td>
                {columns.map(key => (
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
  );
};

export default AttributeTable;