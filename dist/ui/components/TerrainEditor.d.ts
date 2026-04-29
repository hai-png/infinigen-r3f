/**
 * Terrain Editor - Phase 12
 * Interactive terrain manipulation tools with sculpting, painting, and erosion
 */
import React from 'react';
export interface TerrainBrush {
    type: 'sculpt' | 'smooth' | 'flatten' | 'noise' | 'paint';
    size: number;
    strength: number;
    falloff: 'constant' | 'linear' | 'smooth' | 'sharp';
}
export interface TerrainConfig {
    width: number;
    depth: number;
    resolution: number;
    heightScale: number;
    waterLevel: number;
}
interface TerrainEditorProps {
    terrainConfig: TerrainConfig;
    onUpdate?: (config: TerrainConfig) => void;
    onBrushApply?: (brush: TerrainBrush, position: [number, number]) => void;
}
export declare const TerrainEditor: React.FC<TerrainEditorProps>;
export default TerrainEditor;
//# sourceMappingURL=TerrainEditor.d.ts.map