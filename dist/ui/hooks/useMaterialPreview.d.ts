/**
 * useMaterialPreview - Hook for material preview rendering
 * Provides optimized preview generation for material editor
 */
import * as THREE from 'three';
export interface PreviewConfig {
    resolution: number;
    environment: 'studio' | 'outdoor' | 'indoor' | 'none';
    lighting: 'default' | 'dramatic' | 'soft';
    background: 'transparent' | 'grid' | 'gradient' | 'color';
    backgroundColor?: string;
}
export interface MaterialPreviewResult {
    dataUrl: string;
    texture: THREE.Texture | null;
    loading: boolean;
    error?: string;
}
export declare const useMaterialPreview: (material: THREE.Material | null, config?: Partial<PreviewConfig>) => MaterialPreviewResult;
export default useMaterialPreview;
//# sourceMappingURL=useMaterialPreview.d.ts.map