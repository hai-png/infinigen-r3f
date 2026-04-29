/**
 * Material Editor - Phase 12
 * Interactive material property editor with real-time preview
 */
import React from 'react';
export interface MaterialProperties {
    id: string;
    name: string;
    type: 'standard' | 'physical' | 'toon' | 'emissive';
    color: string;
    metalness: number;
    roughness: number;
    transmission?: number;
    thickness?: number;
    emissive?: string;
    emissiveIntensity?: number;
    normalScale?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    sheen?: number;
    sheenColor?: string;
    ior?: number;
}
interface MaterialEditorProps {
    material: MaterialProperties;
    onUpdate?: (material: MaterialProperties) => void;
    onPreviewChange?: (previewType: string) => void;
}
export declare const MaterialEditor: React.FC<MaterialEditorProps>;
export default MaterialEditor;
//# sourceMappingURL=MaterialEditor.d.ts.map