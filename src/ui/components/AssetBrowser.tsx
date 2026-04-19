import React, { useState, useMemo } from 'react';
import { AssetCategory, AssetItem } from '../types';

interface AssetBrowserProps {
  categories?: AssetCategory[];
  assets?: AssetItem[];
  onAssetSelect?: (asset: AssetItem) => void;
  onAssetDragStart?: (asset: AssetItem) => void;
}

/**
 * AssetBrowser - Browse and select procedural assets
 */
const AssetBrowser: React.FC<AssetBrowserProps> = ({
  categories = [],
  assets = [],
  onAssetSelect,
  onAssetDragStart,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesCategory = selectedCategory === 'all' || asset.category === selectedCategory;
      const matchesSearch = !searchTerm || 
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [assets, selectedCategory, searchTerm]);

  const categoryList = useMemo(() => {
    const allCategories = ['all', ...new Set(assets.map((a) => a.category))];
    return allCategories.map((cat) => ({
      name: cat,
      count: cat === 'all' ? assets.length : assets.filter((a) => a.category === cat).length,
    }));
  }, [assets]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--panel-bg, #1e1e1e)',
        border: '1px solid var(--panel-border, #333)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: 'var(--panel-header, #252525)',
          borderBottom: '1px solid var(--panel-border, #333)',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: '13px',
            color: 'var(--text-primary, #fff)',
          }}
        >
          Asset Browser
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setViewMode('grid')}
            style={{
              ...iconButtonStyle,
              backgroundColor: viewMode === 'grid' ? 'var(--accent, #4488ff)' : 'transparent',
            }}
          >
            ⊞
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              ...iconButtonStyle,
              backgroundColor: viewMode === 'list' ? 'var(--accent, #4488ff)' : 'transparent',
            }}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Search and Filter */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--panel-border, #333)' }}>
        <input
          type="text"
          placeholder="Search assets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 10px',
            marginBottom: '8px',
            backgroundColor: 'var(--input-bg, #2a2a2a)',
            border: '1px solid var(--input-border, #444)',
            borderRadius: '3px',
            color: 'var(--text-primary, #fff)',
            fontSize: '12px',
          }}
        />
        
        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
          {categoryList.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(cat.name)}
              style={{
                ...categoryButtonStyle,
                backgroundColor: selectedCategory === cat.name ? 'var(--accent, #4488ff)' : 'var(--button-bg, #2a2a2a)',
              }}
            >
              {cat.name.charAt(0).toUpperCase() + cat.name.slice(1)}
              <span style={{ marginLeft: '4px', opacity: 0.7 }}>({cat.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Asset Grid/List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {viewMode === 'grid' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '8px',
            }}
          >
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                viewMode="grid"
                onSelect={() => onAssetSelect?.(asset)}
                onDragStart={() => onAssetDragStart?.(asset)}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                viewMode="list"
                onSelect={() => onAssetSelect?.(asset)}
                onDragStart={() => onAssetDragStart?.(asset)}
              />
            ))}
          </div>
        )}

        {filteredAssets.length === 0 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--text-disabled, #666)',
            }}
          >
            No assets found
          </div>
        )}
      </div>
    </div>
  );
};

const AssetCard: React.FC<{
  asset: AssetItem;
  viewMode: 'grid' | 'list';
  onSelect: () => void;
  onDragStart: () => void;
}> = ({ asset, viewMode, onSelect, onDragStart }) => {
  if (viewMode === 'list') {
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onClick={onSelect}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 12px',
          backgroundColor: 'var(--card-bg, #252525)',
          border: '1px solid var(--card-border, #333)',
          borderRadius: '4px',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent, #4488ff)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--card-border, #333)';
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            backgroundColor: 'var(--thumbnail-bg, #1a1a1a)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
          }}
        >
          📦
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary, #fff)' }}>
            {asset.name}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary, #888)' }}>
            {asset.category} • {asset.tags.join(', ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '8px',
        backgroundColor: 'var(--card-bg, #252525)',
        border: '1px solid var(--card-border, #333)',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent, #4488ff)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--card-border, #333)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div
        style={{
          aspectRatio: '1',
          backgroundColor: 'var(--thumbnail-bg, #1a1a1a)',
          borderRadius: '4px',
          marginBottom: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
        }}
      >
        📦
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: '11px',
          color: 'var(--text-primary, #fff)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {asset.name}
      </div>
      <div
        style={{
          fontSize: '9px',
          color: 'var(--text-secondary, #888)',
          marginTop: '2px',
        }}
      >
        {asset.category}
      </div>
    </div>
  );
};

const iconButtonStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--button-border, #444)',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '14px',
  color: 'var(--text-primary, #fff)',
};

const categoryButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: 'none',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 500,
  cursor: 'pointer',
  color: 'var(--text-primary, #fff)',
  whiteSpace: 'nowrap',
};

export default AssetBrowser;
