import React from 'react';
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
declare const AssetBrowser: React.FC<AssetBrowserProps>;
export default AssetBrowser;
//# sourceMappingURL=AssetBrowser.d.ts.map