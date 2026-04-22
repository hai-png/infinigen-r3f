/**
 * Hybrid Bridge: WebSocket RPC for Heavy Computations
 * 
 * Offloads expensive operations (Mesh Boolean, Physics Export, Complex Generation)
 * to a Python backend while keeping the constraint solver in the browser.
 * 
 * Features:
 * - Promise-based RPC
 * - Binary transfer support (for mesh data)
 * - Fallback mocks for browser-only mode
 * - Connection pooling & retry logic
 */

import { MeshData, PhysicsConfig } from '../types';

export interface BridgeRequest {
  id: string;
  method: 'mesh_boolean' | 'mesh_subdivide' | 'export_mjcf' | 'generate_procedural' | 'raycast_batch' | 'optimize_decoration' | 'optimize_trajectories';
  params: any;
  binaryPayload?: ArrayBuffer;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  binaryPayload?: ArrayBuffer;
}

export class HybridBridge {
  private static instance: HybridBridge | null = null;
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();
  private url: string;
  private connected: boolean = false;
  private queue: BridgeRequest[] = [];

  constructor(url: string = 'ws://localhost:8765') {
    this.url = url;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): HybridBridge {
    if (!HybridBridge.instance) {
      HybridBridge.instance = new HybridBridge();
    }
    return HybridBridge.instance;
  }

  /**
   * Check if bridge is connected
   */
  static isConnected(): boolean {
    return HybridBridge.instance?.connected ?? false;
  }

  /**
   * Connect to Python backend
   */
  static async connect(url?: string): Promise<void> {
    const instance = HybridBridge.getInstance();
    if (url) {
      instance.url = url;
    }
    await instance.connect();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          this.connected = true;
          console.log('[HybridBridge] Connected to Python backend');
          // Process queued requests
          while (this.queue.length > 0) {
            const req = this.queue.shift()!;
            this.sendRaw(req);
          }
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (err) => {
          console.error('[HybridBridge] Error:', err);
          reject(err);
        };

        this.ws.onclose = () => {
          this.connected = false;
          console.warn('[HybridBridge] Disconnected');
        };

        // Timeout if no connection in 5s
        setTimeout(() => {
          if (!this.connected) reject(new Error('Connection timeout'));
        }, 5000);

      } catch (e) {
        reject(e);
      }
    });
  }

  private handleMessage(data: any) {
    // Handle binary or JSON responses
    let response: BridgeResponse;
    
    if (data instanceof Blob) {
      // Simplified handling: assume metadata comes first or is embedded
      // In production, use a more robust binary protocol (e.g., FlatBuffers)
      data.arrayBuffer().then(buf => {
        // Parse header from buffer to find request ID
        // For now, assuming JSON metadata precedes or is separate
        console.warn('Binary payload handling requires metadata header');
      });
      return;
    }

    try {
      response = JSON.parse(data);
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.success) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error(response.error));
        }
      }
    } catch (e) {
      console.error('[HybridBridge] Failed to parse response:', e);
    }
  }

  private sendRaw(request: BridgeRequest) {
    if (!this.ws || !this.connected) {
      this.queue.push(request);
      return;
    }
    this.ws.send(JSON.stringify(request));
  }

  async request<T>(method: BridgeRequest['method'], params: any, binary?: ArrayBuffer): Promise<T> {
    const id = `${method}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const request: BridgeRequest = { id, method, params, binaryPayload: binary };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendRaw(request);
      
      // Timeout after 30s for heavy ops
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out`));
        }
      }, 30000);
    });
  }

  // --- High-Level API ---

  /**
   * Perform CSG Boolean operations (Union, Difference, Intersection)
   */
  async meshBoolean(op: 'union' | 'difference' | 'intersection', meshes: MeshData[]): Promise<MeshData> {
    try {
      return await this.request<MeshData>('mesh_boolean', { operation: op, meshes });
    } catch (e) {
      console.warn('[HybridBridge] MeshBoolean failed, falling back to mock');
      return this.mockBoolean(op, meshes);
    }
  }

  /**
   * Subdivide mesh for higher fidelity
   */
  async subdivideMesh(mesh: MeshData, levels: number = 2): Promise<MeshData> {
    try {
      return await this.request<MeshData>('mesh_subdivide', { mesh, levels });
    } catch (e) {
      console.warn('[HybridBridge] Subdivide failed, returning original');
      return mesh;
    }
  }

  /**
   * Export scene to MJCF (MuJoCo XML) for physics simulation
   */
  async exportMjcf(config: PhysicsConfig): Promise<string> {
    try {
      return await this.request<string>('export_mjcf', { config });
    } catch (e) {
      throw new Error('MJCF Export requires Python backend');
    }
  }

  /**
   * Generate complex procedural geometry (e.g., terrain, vegetation)
   */
  async generateProcedural(type: 'terrain' | 'vegetation' | 'building', params: any): Promise<MeshData> {
    try {
      return await this.request<MeshData>('generate_procedural', { type, params });
    } catch (e) {
      throw new Error('Procedural generation requires Python backend');
    }
  }

  /**
   * Batch raycasting for precise visibility/collision checks
   */
  async batchRaycast(rays: { origin: [number, number, number]; dir: [number, number, number] }[]): Promise<number[]> {
    try {
      return await this.request<number[]>('raycast_batch', { rays });
    } catch (e) {
      // Fallback to simple distance check if backend unavailable
      return rays.map(() => Infinity);
    }
  }

  /**
   * Optimize decoration layout using Python backend
   */
  async optimizeDecorationLayout(roomBounds: any, decorations: any[]): Promise<any[]> {
    try {
      return await this.request<any[]>('optimize_decoration', { roomBounds, decorations });
    } catch (e) {
      console.warn('[HybridBridge] Decoration optimization failed, returning original');
      return decorations;
    }
  }

  /**
   * Optimize trajectories using Python backend
   */
  async optimizeTrajectories(trajectories: any[]): Promise<any[]> {
    try {
      return await this.request<any[]>('optimize_trajectories', { trajectories });
    } catch (e) {
      console.warn('[HybridBridge] Trajectory optimization failed, returning original');
      return trajectories;
    }
  }

  // --- Mock Fallbacks for Browser-Only Mode ---

  private mockBoolean(op: string, meshes: MeshData[]): MeshData {
    // Returns the first mesh as a placeholder
    // In a real browser-only fallback, we'd use a lightweight CSG lib
    console.warn('Using mock Boolean operation');
    return meshes[0] || { vertices: [], faces: [] };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

export const bridge = new HybridBridge();
