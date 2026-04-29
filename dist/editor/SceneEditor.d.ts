/**
 * Scene Editor - Phase 12
 * WYSIWYG editor for scene manipulation
 */
import React from 'react';
interface SceneObject {
    id: string;
    type: 'mesh' | 'light' | 'camera';
    name: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    visible: boolean;
    locked: boolean;
    tags?: string[];
}
interface SceneEditorProps {
    objects: SceneObject[];
    selectedObjectId?: string;
    onObjectSelect?: (objectId: string) => void;
    onObjectUpdate?: (objectId: string, updates: Partial<SceneObject>) => void;
    onObjectAdd?: (object: Omit<SceneObject, 'id'>) => void;
    onObjectDelete?: (objectId: string) => void;
    showGrid?: boolean;
    showAxes?: boolean;
    gridDivisions?: number;
    gridSize?: number;
}
export declare const SceneEditor: React.FC<SceneEditorProps>;
export default SceneEditor;
//# sourceMappingURL=SceneEditor.d.ts.map