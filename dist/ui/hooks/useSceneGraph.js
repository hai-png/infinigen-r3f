import { useState, useCallback } from 'react';
/**
 * useSceneGraph - Hook for managing and querying scene graph
 */
export function useSceneGraph(initialGraph = []) {
    const [sceneGraph, setSceneGraph] = useState(initialGraph);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const selectNode = useCallback((nodeId) => {
        setSelectedNodeId(nodeId);
    }, []);
    const toggleVisibility = useCallback((nodeId) => {
        setSceneGraph((prev) => updateNodeInGraph(prev, nodeId, {
            visible: !(findNode(prev, nodeId)?.visible ?? true),
        }));
    }, []);
    const toggleLock = useCallback((nodeId) => {
        setSceneGraph((prev) => updateNodeInGraph(prev, nodeId, {
            locked: !(findNode(prev, nodeId)?.locked ?? false),
        }));
    }, []);
    const deleteNode = useCallback((nodeId) => {
        setSceneGraph((prev) => deleteNodeFromGraph(prev, nodeId));
        if (selectedNodeId === nodeId) {
            setSelectedNodeId(null);
        }
    }, [selectedNodeId]);
    const addNode = useCallback((parentNode, newNode) => {
        setSceneGraph((prev) => {
            if (!parentNode) {
                return [...prev, newNode];
            }
            return addNodeToGraph(prev, parentNode, newNode);
        });
    }, []);
    const updateNode = useCallback((nodeId, updates) => {
        setSceneGraph((prev) => updateNodeInGraph(prev, nodeId, updates));
    }, []);
    const findNodeById = useCallback((nodeId) => {
        return findNode(sceneGraph, nodeId);
    }, [sceneGraph]);
    const getAllNodes = useCallback(() => {
        return flattenGraph(sceneGraph);
    }, [sceneGraph]);
    return {
        sceneGraph,
        selectedNodeId,
        selectNode,
        toggleVisibility,
        toggleLock,
        deleteNode,
        addNode,
        updateNode,
        findNodeById,
        getAllNodes,
    };
}
function findNode(graph, nodeId) {
    for (const node of graph) {
        if (node.id === nodeId)
            return node;
        if (node.children.length > 0) {
            const found = findNode(node.children, nodeId);
            if (found)
                return found;
        }
    }
    return null;
}
function updateNodeInGraph(graph, nodeId, updates) {
    return graph.map((node) => {
        if (node.id === nodeId) {
            return { ...node, ...updates };
        }
        if (node.children.length > 0) {
            return {
                ...node,
                children: updateNodeInGraph(node.children, nodeId, updates),
            };
        }
        return node;
    });
}
function addNodeToGraph(graph, parentNodeId, newNode) {
    return graph.map((node) => {
        if (node.id === parentNodeId) {
            return { ...node, children: [...node.children, newNode] };
        }
        if (node.children.length > 0) {
            return {
                ...node,
                children: addNodeToGraph(node.children, parentNodeId, newNode),
            };
        }
        return node;
    });
}
function deleteNodeFromGraph(graph, nodeId) {
    return graph
        .filter((node) => node.id !== nodeId)
        .map((node) => ({
        ...node,
        children: deleteNodeFromGraph(node.children, nodeId),
    }));
}
function flattenGraph(graph) {
    const result = [];
    for (const node of graph) {
        result.push(node);
        if (node.children.length > 0) {
            result.push(...flattenGraph(node.children));
        }
    }
    return result;
}
//# sourceMappingURL=useSceneGraph.js.map