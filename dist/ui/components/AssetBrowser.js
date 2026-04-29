import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
/**
 * AssetBrowser - Browse and select procedural assets
 */
const AssetBrowser = ({ categories = [], assets = [], onAssetSelect, onAssetDragStart, }) => {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('grid');
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
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            backgroundColor: 'var(--panel-bg, #1e1e1e)',
            border: '1px solid var(--panel-border, #333)',
            borderRadius: '4px',
            overflow: 'hidden',
        }, children: [_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: 'var(--panel-header, #252525)',
                    borderBottom: '1px solid var(--panel-border, #333)',
                }, children: [_jsx("span", { style: {
                            fontWeight: 600,
                            fontSize: '13px',
                            color: 'var(--text-primary, #fff)',
                        }, children: "Asset Browser" }), _jsxs("div", { style: { display: 'flex', gap: '4px' }, children: [_jsx("button", { onClick: () => setViewMode('grid'), style: {
                                    ...iconButtonStyle,
                                    backgroundColor: viewMode === 'grid' ? 'var(--accent, #4488ff)' : 'transparent',
                                }, children: "\u229E" }), _jsx("button", { onClick: () => setViewMode('list'), style: {
                                    ...iconButtonStyle,
                                    backgroundColor: viewMode === 'list' ? 'var(--accent, #4488ff)' : 'transparent',
                                }, children: "\u2630" })] })] }), _jsxs("div", { style: { padding: '8px 12px', borderBottom: '1px solid var(--panel-border, #333)' }, children: [_jsx("input", { type: "text", placeholder: "Search assets...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), style: {
                            width: '100%',
                            padding: '6px 10px',
                            marginBottom: '8px',
                            backgroundColor: 'var(--input-bg, #2a2a2a)',
                            border: '1px solid var(--input-border, #444)',
                            borderRadius: '3px',
                            color: 'var(--text-primary, #fff)',
                            fontSize: '12px',
                        } }), _jsx("div", { style: { display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }, children: categoryList.map((cat) => (_jsxs("button", { onClick: () => setSelectedCategory(cat.name), style: {
                                ...categoryButtonStyle,
                                backgroundColor: selectedCategory === cat.name ? 'var(--accent, #4488ff)' : 'var(--button-bg, #2a2a2a)',
                            }, children: [cat.name.charAt(0).toUpperCase() + cat.name.slice(1), _jsxs("span", { style: { marginLeft: '4px', opacity: 0.7 }, children: ["(", cat.count, ")"] })] }, cat.name))) })] }), _jsxs("div", { style: {
                    flex: 1,
                    overflowY: 'auto',
                    padding: '8px',
                }, children: [viewMode === 'grid' ? (_jsx("div", { style: {
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                            gap: '8px',
                        }, children: filteredAssets.map((asset) => (_jsx(AssetCard, { asset: asset, viewMode: "grid", onSelect: () => onAssetSelect?.(asset), onDragStart: () => onAssetDragStart?.(asset) }, asset.id))) })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: '4px' }, children: filteredAssets.map((asset) => (_jsx(AssetCard, { asset: asset, viewMode: "list", onSelect: () => onAssetSelect?.(asset), onDragStart: () => onAssetDragStart?.(asset) }, asset.id))) })), filteredAssets.length === 0 && (_jsx("div", { style: {
                            padding: '40px 20px',
                            textAlign: 'center',
                            color: 'var(--text-disabled, #666)',
                        }, children: "No assets found" }))] })] }));
};
const AssetCard = ({ asset, viewMode, onSelect, onDragStart }) => {
    if (viewMode === 'list') {
        return (_jsxs("div", { draggable: true, onDragStart: onDragStart, onClick: onSelect, style: {
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 12px',
                backgroundColor: 'var(--card-bg, #252525)',
                border: '1px solid var(--card-border, #333)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s',
            }, onMouseEnter: (e) => {
                e.currentTarget.style.borderColor = 'var(--accent, #4488ff)';
            }, onMouseLeave: (e) => {
                e.currentTarget.style.borderColor = 'var(--card-border, #333)';
            }, children: [_jsx("div", { style: {
                        width: '40px',
                        height: '40px',
                        backgroundColor: 'var(--thumbnail-bg, #1a1a1a)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                    }, children: "\uD83D\uDCE6" }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: '12px', color: 'var(--text-primary, #fff)' }, children: asset.name }), _jsxs("div", { style: { fontSize: '10px', color: 'var(--text-secondary, #888)' }, children: [asset.category, " \u2022 ", asset.tags.join(', ')] })] })] }));
    }
    return (_jsxs("div", { draggable: true, onDragStart: onDragStart, onClick: onSelect, style: {
            display: 'flex',
            flexDirection: 'column',
            padding: '8px',
            backgroundColor: 'var(--card-bg, #252525)',
            border: '1px solid var(--card-border, #333)',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s',
        }, onMouseEnter: (e) => {
            e.currentTarget.style.borderColor = 'var(--accent, #4488ff)';
            e.currentTarget.style.transform = 'translateY(-2px)';
        }, onMouseLeave: (e) => {
            e.currentTarget.style.borderColor = 'var(--card-border, #333)';
            e.currentTarget.style.transform = 'translateY(0)';
        }, children: [_jsx("div", { style: {
                    aspectRatio: '1',
                    backgroundColor: 'var(--thumbnail-bg, #1a1a1a)',
                    borderRadius: '4px',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '32px',
                }, children: "\uD83D\uDCE6" }), _jsx("div", { style: {
                    fontWeight: 600,
                    fontSize: '11px',
                    color: 'var(--text-primary, #fff)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }, children: asset.name }), _jsx("div", { style: {
                    fontSize: '9px',
                    color: 'var(--text-secondary, #888)',
                    marginTop: '2px',
                }, children: asset.category })] }));
};
const iconButtonStyle = {
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
const categoryButtonStyle = {
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
//# sourceMappingURL=AssetBrowser.js.map