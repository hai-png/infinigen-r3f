import React from 'react';
import { SceneGraphNode } from '../types';
interface SceneInspectorProps {
    sceneGraph?: SceneGraphNode[];
    selectedNodeId?: string;
    onSelectNode?: (nodeId: string) => void;
    onToggleVisibility?: (nodeId: string) => void;
    onToggleLock?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
}
/**
 * SceneInspector - Tree view inspector for scene hierarchy
 */
declare const SceneInspector: React.FC<SceneInspectorProps>;
export default SceneInspector;
//# sourceMappingURL=SceneInspector.d.ts.map