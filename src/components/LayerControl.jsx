import React from 'react';

const LayerControl = ({ layers, onLayerVisibilityChange, onLayerTableToggle }) => {
  if (layers.length === 0) {
    return null;
  }

  return (
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
                onChange={() => onLayerVisibilityChange(layer.id)}
              />
              <label htmlFor={`visibility-${layer.id}`} className="visibility-label">
                {layer.visible ? '显示' : '隐藏'}
              </label>
            </div>
            <span className="layer-name" title={layer.name}>{layer.name}</span>
            <div className="layer-controls">
              <button
                className={`toggle-table-button ${layer.showTable ? 'active' : ''}`}
                onClick={() => onLayerTableToggle(layer.id)}
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
  );
};

export default LayerControl;