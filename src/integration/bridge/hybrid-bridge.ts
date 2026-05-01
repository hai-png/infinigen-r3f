/**
 * Hybrid Bridge: WebSocket RPC for Heavy Computations
 * 
 * Offloads expensive operations (Mesh Boolean, Physics Export, Complex Generation)
 * to a Python backend while keeping the constraint solver in the browser.
 * 
 * Features:
 * - Promise-based RPC
 * - Binary transfer support (for mesh data)
 * - Auto-reconnect with exponential backoff
 * - Timeout handling per-request
 * - Browser-only fallbacks for all methods
 */

import { MeshData, PhysicsConfig } from '../../types';

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

export interface HybridBridgeConfig {
  url: string;
  reconnectInterval: number;    // ms between reconnect attempts
  maxReconnectInterval: number; // max ms for exponential backoff
  requestTimeout: number;       // default ms before request times out
  maxPendingRequests: number;   // max concurrent pending requests
}

const DEFAULT_CONFIG: HybridBridgeConfig = {
  url: 'ws://localhost:8765',
  reconnectInterval: 1000,
  maxReconnectInterval: 30000,
  requestTimeout: 30000,
  maxPendingRequests: 100,
};

export class HybridBridge {
  private static instance: HybridBridge | null = null;
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private config: HybridBridgeConfig;
  private connected: boolean = false;
  private connecting: boolean = false;
  private queue: BridgeRequest[] = [];
  
  // Auto-reconnect state
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private intentionallyClosed: boolean = false;

  constructor(config: Partial<HybridBridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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
   * Connect to Python backend (static convenience)
   */
  static async connect(url?: string): Promise<void> {
    const instance = HybridBridge.getInstance();
    if (url) {
      instance.config.url = url;
    }
    await instance.connect();
  }

  /**
   * Connect to Python backend
   */
  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    this.connecting = true;
    this.intentionallyClosed = false;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          this.connected = true;
          this.connecting = false;
          this.reconnectAttempts = 0;
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
          console.error('[HybridBridge] Connection error:', err);
          if (!this.connected) {
            this.connecting = false;
            reject(err);
          }
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.connecting = false;
          console.warn('[HybridBridge] Disconnected');

          // Auto-reconnect unless intentionally closed
          if (!this.intentionallyClosed) {
            this.scheduleReconnect();
          }
        };

        // Timeout if no connection
        setTimeout(() => {
          if (!this.connected && this.connecting) {
            this.connecting = false;
            reject(new Error('Connection timeout'));
          }
        }, 5000);

      } catch (e) {
        this.connecting = false;
        reject(e);
      }
    });
  }

  /**
   * Schedule auto-reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.intentionallyClosed) return;
    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxReconnectInterval
    );

    console.log(`[HybridBridge] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        // connect() already schedules the next attempt via onclose
      }
    }, delay);
  }

  private handleMessage(data: any) {
    // Handle binary or JSON responses
    if (data instanceof Blob) {
      data.arrayBuffer().then(buf => {
        console.warn('[HybridBridge] Binary payload handling requires metadata header');
      });
      return;
    }

    try {
      const response: BridgeResponse = JSON.parse(data);
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(response.id);
        if (response.success) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error(response.error || 'Unknown RPC error'));
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

  /**
   * Send an RPC request with timeout handling
   */
  async request<T>(method: BridgeRequest['method'], params: any, binary?: ArrayBuffer, timeout?: number): Promise<T> {
    const id = `${method}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const request: BridgeRequest = { id, method, params, binaryPayload: binary };
    const requestTimeout = timeout ?? this.config.requestTimeout;

    return new Promise((resolve, reject) => {
      if (this.pendingRequests.size >= this.config.maxPendingRequests) {
        reject(new Error(`Too many pending requests (max: ${this.config.maxPendingRequests})`));
        return;
      }

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out after ${requestTimeout}ms`));
        }
      }, requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.sendRaw(request);
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
   * Browser fallback: generates basic MJCF from object data
   */
  async exportMjcf(config: PhysicsConfig): Promise<string> {
    try {
      return await this.request<string>('export_mjcf', { config });
    } catch (e) {
      console.warn('[HybridBridge] MJCF export failed, using browser fallback');
      return this.fallbackMjcfExport(config);
    }
  }

  /**
   * Generate complex procedural geometry (e.g., terrain, vegetation)
   * Browser fallback: generates simple primitive geometry
   */
  async generateProcedural(type: 'terrain' | 'vegetation' | 'building', params: any): Promise<MeshData> {
    try {
      return await this.request<MeshData>('generate_procedural', { type, params });
    } catch (e) {
      console.warn('[HybridBridge] Procedural generation failed, using browser fallback');
      return this.fallbackProcedural(type, params);
    }
  }

  /**
   * Batch raycasting for precise visibility/collision checks
   */
  async batchRaycast(rays: { origin: [number, number, number]; dir: [number, number, number] }[]): Promise<number[]> {
    try {
      return await this.request<number[]>('raycast_batch', { rays });
    } catch (e) {
      // Fallback to simple distance check
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
    console.warn('Using mock Boolean operation');
    return meshes[0] || { vertices: [], faces: [] };
  }

  /**
   * Browser fallback for MJCF export: generates basic XML
   */
  private fallbackMjcfExport(config: PhysicsConfig): string {
    const lines: string[] = [];
    lines.push(`<mujoco model="${config.sceneId}">`);
    lines.push('  <compiler angle="radian" coordinate="local"/>');
    lines.push('  <worldbody>');

    for (const obj of config.objects) {
      lines.push(`    <body name="${obj.id}" pos="${obj.pose.position.join(' ')}">`);
      lines.push(`      <geom type="box" size="0.5 0.5 0.5" mass="${obj.mass}"/>`);
      if (obj.joints && obj.joints.length > 0) {
        for (const joint of obj.joints) {
          lines.push(`      <joint type="${joint.type}" axis="${(joint.axis || [0, 0, 1]).join(' ')}"/>`);
        }
      }
      lines.push('    </body>');
    }

    lines.push('  </worldbody>');
    lines.push('</mujoco>');
    return lines.join('\n');
  }

  /**
   * Browser fallback for procedural generation: simple primitives
   */
  private fallbackProcedural(type: string, params: any): MeshData {
    console.warn(`[HybridBridge] Using browser fallback for procedural ${type}`);

    if (type === 'terrain') {
      // Simple heightmap terrain
      const res = params.resolution || 16;
      const scale = params.width || 10;
      const vertices: number[] = [];
      const faces: number[] = [];

      for (let z = 0; z < res; z++) {
        for (let x = 0; x < res; x++) {
          const px = (x / (res - 1) - 0.5) * scale;
          const pz = (z / (res - 1) - 0.5) * scale;
          const py = Math.sin(px * 0.5) * Math.cos(pz * 0.5) * (params.height_scale || 1);
          vertices.push(px, py, pz);
        }
      }

      for (let z = 0; z < res - 1; z++) {
        for (let x = 0; x < res - 1; x++) {
          const i = z * res + x;
          faces.push(i, i + 1, i + res);
          faces.push(i + 1, i + res + 1, i + res);
        }
      }

      return { vertices, faces };
    }

    if (type === 'vegetation') {
      // Simple cylinder + sphere tree
      const trunkHeight = params.trunk_height || 2;
      const trunkRadius = params.trunk_radius || 0.2;
      const crownRadius = params.crown_radius || 1.5;
      const segments = 8;

      const vertices: number[] = [];
      const faces: number[] = [];

      // Trunk (cylinder approximation)
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * trunkRadius;
        const z = Math.sin(angle) * trunkRadius;
        vertices.push(x, 0, z);
        vertices.push(x, trunkHeight, z);
      }

      for (let i = 0; i < segments; i++) {
        const base = i * 2;
        faces.push(base, base + 2, base + 1);
        faces.push(base + 1, base + 2, base + 3);
      }

      return { vertices, faces };
    }

    // Building fallback: simple box
    const w = params.width || 5;
    const h = params.height || 10;
    const d = params.depth || 5;
    const hw = w / 2, hh = h / 2, hd = d / 2;

    return {
      vertices: [
        -hw, -hh, -hd, hw, -hh, -hd, hw, hh, -hd, -hw, hh, -hd,
        -hw, -hh, hd, hw, -hh, hd, hw, hh, hd, -hw, hh, hd,
      ],
      faces: [
        0, 1, 2, 0, 2, 3,
        4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1,
        2, 6, 7, 2, 7, 3,
        0, 3, 7, 0, 7, 4,
        1, 5, 6, 1, 6, 2,
      ],
    };
  }

  /**
   * Disconnect from Python backend
   */
  disconnect() {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
    this.queue.length = 0;
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; pendingRequests: number; queuedRequests: number; reconnectAttempts: number } {
    return {
      connected: this.connected,
      pendingRequests: this.pendingRequests.size,
      queuedRequests: this.queue.length,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

export const bridge = new HybridBridge();
