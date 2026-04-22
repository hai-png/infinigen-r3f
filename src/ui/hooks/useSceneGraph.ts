import React, { useState, useCallback } from 'react';
import { SceneGraphNode } from '../types';

/**
 * useSceneGraph - Hook for managing and querying scene graph
 */
export function useSceneGraph(initialGraph: SceneGraphNode[] = []) {
  const [sceneGraph, setSceneGraph] = useState<SceneGraphNode[]>(initialGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const toggleVisibility = useCallback((nodeId: string) => {
    setSceneGraph((prev) => updateNodeInGraph(prev, nodeId, {
      visible: !(findNode(prev, nodeId)?.visible ?? true),
    }));
  }, []);

  const toggleLock = useCallback((nodeId: string) => {
    setSceneGraph((prev) => updateNodeInGraph(prev, nodeId, {
      locked: !(findNode(prev, nodeId)?.locked ?? false),
    }));
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setSceneGraph((prev) => deleteNodeFromGraph(prev, nodeId));
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId]);

  const addNode = useCallback((parentNode: string | null, newNode: SceneGraphNode) => {
    setSceneGraph((prev) => {
      if (!parentNode) {
        return [...prev, newNode];
      }
      return addNodeToGraph(prev, parentNode, newNode);
    });
  }, []);

  const updateNode = useCallback((nodeId: string, updates: Partial<SceneGraphNode>) => {
    setSceneGraph((prev) => updateNodeInGraph(prev, nodeId, updates));
  }, []);

  const findNodeById = useCallback((nodeId: string): SceneGraphNode | null => {
    return findNode(sceneGraph, nodeId);
  }, [sceneGraph]);

  const getAllNodes = useCallback((): SceneGraphNode[] => {
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

function findNode(graph: SceneGraphNode[], nodeId: string): SceneGraphNode | null {
  for (const node of graph) {
    if (node.id === nodeId) return node;
    if (node.children.length > 0) {
      const found = findNode(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function updateNodeInGraph(
  graph: SceneGraphNode[],
  nodeId: string,
  updates: Partial<SceneGraphNode>
): SceneGraphNode[] {
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

function addNodeToGraph(
  graph: SceneGraphNode[],
  parentNodeId: string,
  newNode: SceneGraphNode
): SceneGraphNode[] {
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

function deleteNodeFromGraph(graph: SceneGraphNode[], nodeId: string): SceneGraphNode[] {
  return graph
    .filter((node) => node.id !== nodeId)
    .map((node) => ({
      ...node,
      children: deleteNodeFromGraph(node.children, nodeId),
    }));
}

function flattenGraph(graph: SceneGraphNode[]): SceneGraphNode[] {
  const result: SceneGraphNode[] = [];
  for (const node of graph) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...flattenGraph(node.children));
    }
  }
  return result;
}
