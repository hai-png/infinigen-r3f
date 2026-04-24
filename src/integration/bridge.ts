/**
 * Infinigen Hybrid Bridge
 * 
 * Enables seamless communication between the R3F (TypeScript) frontend
 * and the original Infinigen (Python/Blender) backend for unportable tasks.
 * 
 * Architecture:
 * 1. Local TS Solver handles logic, placement, and constraints.
 * 2. Heavy tasks (Geo Gen, Sim, Render) are offloaded to Python via HTTP/WebSocket.
 * 3. Python returns GLB/GLTF assets or state updates.
 */

import { Scene, Object3D } from 'three';
import { SolverState } from '../constraints/solver/state';
import { Relation } from '../constraints/language';

export interface BridgeConfig {
  endpoint: string;
  timeoutMs: number;
  autoConnect: boolean;
}

export interface TaskRequest {
  taskId: string;
  type: 'GENERATE_GEOMETRY' | 'RUN_SIMULATION' | 'RENDER_IMAGE' | 'BAKE_PHYSICS';
  payload: any;
  priority: 'low' | 'normal' | 'high';
}

export interface TaskResponse {
  taskId: string;
  status: 'success' | 'error' | 'progress';
  progress?: number;
  data?: {
    assetUrl?: string; // URL to generated .glb/.gltf
    stateUpdate?: Partial<SolverState>;
    imageUrl?: string;
    metadata?: any;
  };
  error?: string;
}

export class InfinigenBridge {
  private config: BridgeConfig;
  private ws: WebSocket | null = null;
  private pendingTasks: Map<string, {
    resolve: (res: TaskResponse) => void;
    reject: (err: Error) => void;
    onProgress?: (prog: number) => void;
  }> = new Map();
  private isConnected: boolean = false;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = {
      endpoint: config.endpoint || 'ws://localhost:8765', // Default Infinigen Bridge Server
      timeoutMs: config.timeoutMs || 30000,
      autoConnect: config.autoConnect ?? true,
    };

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  /**
   * Establish WebSocket connection to Python backend
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.endpoint);

        this.ws.onopen = () => {
          this.isConnected = true;
          console.log('[InfinigenBridge] Connected to Python backend');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          console.warn('[InfinigenBridge] Disconnected from backend');
        };

        this.ws.onerror = (err) => {
          console.error('[InfinigenBridge] Connection error:', err);
          reject(err);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Handle incoming messages from Python
   */
  private handleMessage(response: TaskResponse) {
    const pending = this.pendingTasks.get(response.taskId);
    if (!pending) return;

    if (response.status === 'progress') {
      pending.onProgress?.(response.progress || 0);
      return;
    }

    this.pendingTasks.delete(response.taskId);
    if (response.status === 'success') {
      pending.resolve(response);
    } else {
      pending.reject(new Error(response.error || 'Unknown task failure'));
    }
  }

  /**
   * Offload geometry generation to Blender/Infinigen
   * Used for unportable ops: Boolean modifiers, Geo Nodes, Complex Meshes
   */
  public async generateGeometry(
    objects: any[], // Serialized JS objects representing constraint state
    options: { detail: 'low' | 'high'; format: 'glb' | 'usd' }
  ): Promise<{ assetUrl: string; stateUpdate: Partial<SolverState> }> {
    const taskId = `geo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const response = await this.executeTask({
      taskId,
      type: 'GENERATE_GEOMETRY',
      payload: { objects, options },
      priority: 'high'
    });

    return { 
      assetUrl: response.data?.assetUrl || '', 
      stateUpdate: response.data?.stateUpdate || {} 
    };
  }

  /**
   * Offload physics simulation (RBD, Fluids, Cloth) to Blender
   */
  public async runSimulation(
    initialState: SolverState,
    duration: number,
    fps: number
  ): Promise<{ assetUrl: string; stateUpdate: Partial<SolverState> }> {
    const taskId = `sim_${Date.now()}`;
    
    const response = await this.executeTask({
      taskId,
      type: 'RUN_SIMULATION',
      payload: { state: initialState, duration, fps },
      priority: 'normal'
    });

    return { 
      assetUrl: response.data?.assetUrl || '', 
      stateUpdate: response.data?.stateUpdate || {} 
    };
  }

  /**
   * Request high-fidelity render from Blender Cycles
   */
  public async renderImage(
    sceneState: SolverState,
    settings: { resolution: [number, number]; samples: number }
  ): Promise<{ imageUrl: string }> {
    const taskId = `render_${Date.now()}`;
    
    const response = await this.executeTask({
      taskId,
      type: 'RENDER_IMAGE',
      payload: { state: sceneState, settings },
      priority: 'low'
    });

    return { imageUrl: response.data?.imageUrl || '' };
  }

  /**
   * Generic task executor with timeout
   */
  private executeTask(request: TaskRequest): Promise<TaskResponse> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.ws) {
        reject(new Error('Bridge not connected. Ensure Python backend is running.'));
        return;
      }

      const timeout = setTimeout(() => {
        this.pendingTasks.delete(request.taskId);
        reject(new Error(`Task ${request.taskId} timed out`));
      }, this.config.timeoutMs);

      this.pendingTasks.set(request.taskId, {
        resolve: (res) => {
          clearTimeout(timeout);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.ws.send(JSON.stringify(request));
    });
  }

  /**
   * Sync current JS state with Python backend state
   */
  public async syncState(state: SolverState): Promise<void> {
    if (!this.isConnected || !this.ws) return;
    
    this.ws.send(JSON.stringify({
      type: 'SYNC_STATE',
      payload: state
    }));
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export default InfinigenBridge;
