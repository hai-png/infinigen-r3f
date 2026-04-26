import { SceneGraphNode } from '../types';
/**
 * useSceneGraph - Hook for managing and querying scene graph
 */
export declare function useSceneGraph(initialGraph?: SceneGraphNode[]): {
    sceneGraph: SceneGraphNode[];
    selectedNodeId: string | null;
    selectNode: (nodeId: string | null) => void;
    toggleVisibility: (nodeId: string) => void;
    toggleLock: (nodeId: string) => void;
    deleteNode: (nodeId: string) => void;
    addNode: (parentNode: string | null, newNode: SceneGraphNode) => void;
    updateNode: (nodeId: string, updates: Partial<SceneGraphNode>) => void;
    findNodeById: (nodeId: string) => SceneGraphNode | null;
    getAllNodes: () => SceneGraphNode[];
};
//# sourceMappingURL=useSceneGraph.d.ts.map