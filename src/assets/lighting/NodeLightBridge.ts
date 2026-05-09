/**
 * NodeLightBridge — Connects node executor lights to the LightingOrchestrator
 *
 * When the node executor evaluates a light node (PointLight, SpotLight, SunLight, AreaLight),
 * this bridge creates the corresponding THREE.Light instance and registers it with
 * the LightingOrchestrator so it's managed as part of the scene's lighting.
 *
 * Previously, node executor lights existed but weren't connected to the lighting system.
 * This bridge provides the integration.
 *
 * @module assets/lighting/NodeLightBridge
 */

import * as THREE from 'three';
import {
  createPointLight,
  createSpotLight,
  createSunLight,
} from '@/core/nodes/light/LightNodes';
import type { LightingOrchestrator } from './LightingOrchestrator';

// ============================================================================
// Types
// ============================================================================

/**
 * Light type identifiers matching the node executor's output types.
 */
export type NodeLightType = 'point' | 'spot' | 'sun' | 'directional' | 'area';

/**
 * Result of evaluating a light node from the node executor.
 * This is the structured output that the node executor produces
 * when it encounters a light node.
 */
export interface NodeLightResult {
  /** Type of light */
  type: NodeLightType;
  /** Light color */
  color: THREE.Color;
  /** Light strength/intensity multiplier */
  strength: number;
  /** Position in world space */
  position: THREE.Vector3;
  /** Target position (for spot/directional lights) */
  target?: THREE.Vector3;
  /** Direction vector (for sun/directional lights) */
  direction?: THREE.Vector3;
  /** Spot-specific parameters */
  spot?: {
    angle: number;
    penumbra: number;
    distance: number;
    decay: number;
  };
  /** Point-specific parameters */
  point?: {
    distance: number;
    decay: number;
  };
  /** Area-specific parameters */
  area?: {
    width: number;
    height: number;
    shape: 'rectangle' | 'disk' | 'sphere';
  };
  /** Sun-specific parameters */
  sun?: {
    angle: number;
  };
  /** Node ID for tracking and cleanup */
  nodeId?: string;
}

/**
 * Entry stored by the bridge for each bridged light, enabling cleanup.
 */
interface BridgedLightEntry {
  light: THREE.Light;
  nodeId: string | undefined;
  targetObject: THREE.Object3D | null;
}

// ============================================================================
// NodeLightBridge
// ============================================================================

/**
 * Bridge connecting node executor light results to the LightingOrchestrator.
 *
 * Usage:
 * ```ts
 * const bridge = new NodeLightBridge(orchestrator);
 *
 * // After node executor produces a light result:
 * bridge.bridgeLightNode(nodeResult);
 *
 * // When a node is removed/disposed:
 * bridge.removeBridgedLight(nodeId);
 *
 * // Cleanup all bridged lights:
 * bridge.dispose();
 * ```
 */
export class NodeLightBridge {
  private orchestrator: LightingOrchestrator;
  private bridgedLights: BridgedLightEntry[] = [];

  constructor(orchestrator: LightingOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Bridge a node executor light result into the LightingOrchestrator.
   *
   * Creates the corresponding THREE.Light from the node result data
   * and registers it with the orchestrator. Uses the light factory
   * functions from LightNodes when possible for consistency.
   *
   * @param nodeResult - The structured result from evaluating a light node
   * @returns The created THREE.Light instance
   */
  bridgeLightNode(nodeResult: NodeLightResult): THREE.Light {
    let light: THREE.Light;
    let targetObject: THREE.Object3D | null = null;

    switch (nodeResult.type) {
      case 'point': {
        light = this.createPointLightFromNode(nodeResult);
        break;
      }
      case 'spot': {
        const result = this.createSpotLightFromNode(nodeResult);
        light = result.light;
        targetObject = result.target;
        break;
      }
      case 'sun':
      case 'directional': {
        const result = this.createSunLightFromNode(nodeResult);
        light = result.light;
        targetObject = result.target;
        break;
      }
      case 'area': {
        light = this.createAreaLightFromNode(nodeResult);
        break;
      }
      default: {
        // Fallback: create a basic point light
        light = new THREE.PointLight(nodeResult.color, nodeResult.strength);
        light.position.copy(nodeResult.position);
        break;
      }
    }

    // Register with the orchestrator
    this.orchestrator.addSceneLight(light);

    // Track for cleanup
    const entry: BridgedLightEntry = {
      light,
      nodeId: nodeResult.nodeId,
      targetObject,
    };
    this.bridgedLights.push(entry);

    return light;
  }

  /**
   * Bridge multiple node light results at once.
   *
   * @param nodeResults - Array of node light results
   * @returns Array of created THREE.Light instances
   */
  bridgeLightNodes(nodeResults: NodeLightResult[]): THREE.Light[] {
    return nodeResults.map((result) => this.bridgeLightNode(result));
  }

  /**
   * Remove a bridged light by its node ID.
   *
   * @param nodeId - The node ID to remove
   * @returns true if a light was found and removed, false otherwise
   */
  removeBridgedLight(nodeId: string): boolean {
    const index = this.bridgedLights.findIndex(
      (entry) => entry.nodeId === nodeId,
    );
    if (index < 0) return false;

    const entry = this.bridgedLights[index];
    this.orchestrator.removeSceneLight(entry.light);

    // Dispose the light
    if (
      entry.light instanceof THREE.DirectionalLight ||
      entry.light instanceof THREE.PointLight ||
      entry.light instanceof THREE.SpotLight
    ) {
      entry.light.dispose();
    }

    // Remove target object from scene
    if (entry.targetObject) {
      entry.targetObject.parent?.remove(entry.targetObject);
    }

    this.bridgedLights.splice(index, 1);
    return true;
  }

  /**
   * Get all currently bridged lights.
   */
  getBridgedLights(): ReadonlyArray<{ light: THREE.Light; nodeId: string | undefined }> {
    return this.bridgedLights.map((entry) => ({
      light: entry.light,
      nodeId: entry.nodeId,
    }));
  }

  /**
   * Get the number of currently bridged lights.
   */
  get count(): number {
    return this.bridgedLights.length;
  }

  /**
   * Dispose all bridged lights and clear the bridge.
   */
  dispose(): void {
    for (const entry of this.bridgedLights) {
      this.orchestrator.removeSceneLight(entry.light);

      if (
        entry.light instanceof THREE.DirectionalLight ||
        entry.light instanceof THREE.PointLight ||
        entry.light instanceof THREE.SpotLight
      ) {
        entry.light.dispose();
      }

      if (entry.targetObject) {
        entry.targetObject.parent?.remove(entry.targetObject);
      }
    }
    this.bridgedLights = [];
  }

  // ===========================================================================
  // Private helpers — create lights from node results
  // ===========================================================================

  private createPointLightFromNode(result: NodeLightResult): THREE.PointLight {
    const distance = result.point?.distance ?? 0;
    const decay = result.point?.decay ?? 2;
    return createPointLight(
      result.color,
      result.strength,
      result.position,
      1, // intensity factor
      distance,
      decay,
    );
  }

  private createSpotLightFromNode(result: NodeLightResult): {
    light: THREE.SpotLight;
    target: THREE.Object3D | null;
  } {
    const targetPos = result.target ?? new THREE.Vector3(0, 0, 0);
    const angle = result.spot?.angle ?? Math.PI / 6;
    const penumbra = result.spot?.penumbra ?? 0;
    const distance = result.spot?.distance ?? 0;
    const decay = result.spot?.decay ?? 2;

    const light = createSpotLight(
      result.color,
      result.strength,
      result.position,
      targetPos,
      1, // intensity factor
      distance,
      angle,
      penumbra,
      decay,
    );

    // createSpotLight sets target.position but we need to add
    // the target to the scene for it to work
    let target: THREE.Object3D | null = null;
    if (result.target) {
      target = light.target;
      // The caller is responsible for adding target to the scene
      // We track it for cleanup
    }

    return { light, target };
  }

  private createSunLightFromNode(result: NodeLightResult): {
    light: THREE.DirectionalLight;
    target: THREE.Object3D | null;
  } {
    const direction = result.direction ?? new THREE.Vector3(0, -1, 0);
    const light = createSunLight(
      result.color,
      result.strength,
      direction,
      1, // intensity factor
    );

    // SunLight target is at origin by default
    const target = light.target;

    return { light, target };
  }

  private createAreaLightFromNode(result: NodeLightResult): THREE.RectAreaLight {
    const width = result.area?.width ?? 1;
    const height = result.area?.height ?? 1;

    const light = new THREE.RectAreaLight(
      result.color,
      result.strength,
      width,
      height,
    );
    light.position.copy(result.position);

    return light;
  }
}

// ============================================================================
// Convenience function
// ============================================================================

/**
 * Quick utility to bridge a single node light result to an orchestrator.
 * Creates a temporary bridge, bridges the light, and returns both.
 *
 * For multiple lights, prefer creating a NodeLightBridge instance.
 */
export function bridgeLightNode(
  nodeResult: NodeLightResult,
  orchestrator: LightingOrchestrator,
): { light: THREE.Light; bridge: NodeLightBridge } {
  const bridge = new NodeLightBridge(orchestrator);
  const light = bridge.bridgeLightNode(nodeResult);
  return { light, bridge };
}
