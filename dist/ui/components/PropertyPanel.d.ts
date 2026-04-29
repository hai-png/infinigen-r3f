/**
 * PropertyPanel - Interactive property editor for scene objects
 *
 * Provides a comprehensive UI for editing object properties, materials,
 * transforms, and custom parameters in real-time.
 */
import React from 'react';
import * as THREE from 'three';
export interface PropertyPanelProps {
    /** Selected object to edit */
    selectedObject?: THREE.Object3D | null;
    /** Read-only mode */
    readOnly?: boolean;
    /** Show advanced properties */
    showAdvanced?: boolean;
    /** Callback when property changes */
    onPropertyChange?: (path: string, value: any) => void;
    /** Custom property editors */
    customEditors?: Record<string, React.ComponentType<any>>;
}
/**
 * Main Property Panel Component
 */
export declare const PropertyPanel: React.FC<PropertyPanelProps>;
export default PropertyPanel;
//# sourceMappingURL=PropertyPanel.d.ts.map