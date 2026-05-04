/**
 * Hybrid Bridge: WebSocket RPC for Heavy Computations
 * 
 * Offloads expensive operations (Mesh Boolean, Physics Export, Complex Generation)
 * to a Python backend while keeping the constraint solver in the browser.
 * 
 * Features:
 * - Promise-based RPC
 * - Binary transfer support (for mesh data, images, heightmaps)
 * - Binary frame protocol: 4-byte length prefix + JSON header + binary payload
 * - Auto-reconnect with exponential backoff
 * - Timeout handling per-request
 * - Browser-only fallbacks for all methods
 */

import { MeshData, PhysicsConfig } from '../../types';
import { SeededRandom } from '@/core/util/MathUtils';
import { Logger } from '@/core/util/Logger';

/** All supported RPC method names (text + binary) */
export type BridgeMethod =
  | 'mesh_boolean' | 'mesh_subdivide' | 'export_mjcf'
  | 'generate_procedural' | 'raycast_batch'
  | 'optimize_decoration' | 'optimize_trajectories'
  | 'transfer_image' | 'transfer_geometry' | 'transfer_heightmap';

export interface BridgeRequest {
  id: string;
  method: BridgeMethod;
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

/**
 * Binary message transferred over WebSocket as a single binary frame.
 *
 * Wire format (little-endian):
 *   [4 bytes: JSON header length N][N bytes: JSON header][remaining bytes: binary payload]
 *
 * The JSON header contains { type, method, id, contentType, payloadLength } so the
 * receiver knows how to parse the rest of the frame.
 */
export interface BinaryMessage {
  /** Discriminator — always `'binary'` */
  type: 'binary';
  /** RPC method name */
  method: string;
  /** Correlation ID matching a pending request */
  id: string;
  /** The binary payload */
  payload: ArrayBuffer;
  /** MIME type describing the payload (e.g. `image/png`, `application/octet-stream`) */
  contentType: string;
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

  // Monotonic counter for unique request IDs (replaces Math.random)
  private static _requestCounter: number = 0;

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
        this.ws.binaryType = 'arraybuffer'; // required for binary frame support

        this.ws.onopen = () => {
          this.connected = true;
          this.connecting = false;
          this.reconnectAttempts = 0;
          Logger.info('HybridBridge', 'Connected to Python backend');

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
          Logger.error('HybridBridge', 'Connection error:', err);
          if (!this.connected) {
            this.connecting = false;
            reject(err);
          }
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.connecting = false;
          Logger.warn('HybridBridge', 'Disconnected');

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

    Logger.info('HybridBridge', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (err) {
        // Silently fall back - connect() already schedules the next attempt via onclose
        Logger.debug('HybridBridge', 'reconnect fallback:', err);
      }
    }, delay);
  }

  private handleMessage(data: any) {
    // --- Binary frame ---------------------------------------------------
    // When binaryType='arraybuffer', incoming binary frames arrive as ArrayBuffer.
    if (data instanceof ArrayBuffer) {
      this.handleBinaryFrame(data);
      return;
    }

    // --- Blob fallback (some browsers) ----------------------------------
    if (data instanceof Blob) {
      data.arrayBuffer().then(buf => this.handleBinaryFrame(buf)).catch(() => {
        Logger.warn('HybridBridge', 'Failed to read Blob binary frame');
      });
      return;
    }

    // --- JSON text frame ------------------------------------------------
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
      Logger.error('HybridBridge', 'Failed to parse response:', e);
    }
  }

  // -----------------------------------------------------------------------
  // Binary frame protocol
  // -----------------------------------------------------------------------

  /**
   * Decode a binary WebSocket frame:
   *   [4 bytes LE: header length N][N bytes: JSON header][rest: binary payload]
   */
  private handleBinaryFrame(buffer: ArrayBuffer): void {
    try {
      const view = new DataView(buffer);
      const headerLength = view.getUint32(0, true); // little-endian

      if (headerLength > buffer.byteLength - 4) {
        Logger.error('HybridBridge', 'Binary frame header length exceeds buffer');
        return;
      }

      const headerBytes = new Uint8Array(buffer, 4, headerLength);
      const headerJson  = new TextDecoder().decode(headerBytes);
      const header      = JSON.parse(headerJson);

      const payloadOffset = 4 + headerLength;
      const payloadLength = buffer.byteLength - payloadOffset;
      const payload       = buffer.slice(payloadOffset, payloadOffset + payloadLength);

      // Route the decoded binary message
      const msg: BinaryMessage = {
        type: header.type ?? 'binary',
        method: header.method ?? header.id ?? '',
        id: header.id ?? '',
        payload,
        contentType: header.contentType ?? 'application/octet-stream',
      };

      this.routeBinaryMessage(msg);
    } catch (e) {
      Logger.error('HybridBridge', 'Failed to decode binary frame:', e);
    }
  }

  /**
   * Encode a BinaryMessage into a single ArrayBuffer:
   *   [4 bytes LE: header length N][N bytes: JSON header][payload bytes]
   */
  static encodeBinaryMessage(msg: BinaryMessage): ArrayBuffer {
    const headerObj = {
      type: msg.type,
      method: msg.method,
      id: msg.id,
      contentType: msg.contentType,
      payloadLength: msg.payload.byteLength,
    };
    const headerJson = JSON.stringify(headerObj);
    const headerBytes = new TextEncoder().encode(headerJson);

    const totalLength = 4 + headerBytes.byteLength + msg.payload.byteLength;
    const buffer = new ArrayBuffer(totalLength);
    const view   = new DataView(buffer);

    // Write 4-byte LE header length
    view.setUint32(0, headerBytes.byteLength, true);

    // Write JSON header
    const headerDest = new Uint8Array(buffer, 4, headerBytes.byteLength);
    headerDest.set(headerBytes);

    // Write binary payload
    const payloadDest = new Uint8Array(buffer, 4 + headerBytes.byteLength);
    payloadDest.set(new Uint8Array(msg.payload));

    return buffer;
  }

  /**
   * Route a decoded BinaryMessage to the appropriate handler.
   */
  private routeBinaryMessage(msg: BinaryMessage): void {
    // If the message correlates to a pending request, resolve it
    const pending = this.pendingRequests.get(msg.id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(msg.id);
      pending.resolve({ payload: msg.payload, contentType: msg.contentType, method: msg.method });
      return;
    }

    // Otherwise, dispatch to registered binary handlers
    const handler = this.binaryHandlers.get(msg.method);
    if (handler) {
      handler(msg);
    } else {
      Logger.warn('HybridBridge', `No binary handler for method '${msg.method}'`);
    }
  }

  /** Registered binary-message handlers keyed by method name. */
  private binaryHandlers: Map<string, (msg: BinaryMessage) => void> = new Map();

  /** Register a handler for incoming binary messages of a given method. */
  onBinary(method: string, handler: (msg: BinaryMessage) => void): void {
    this.binaryHandlers.set(method, handler);
  }

  private sendRaw(request: BridgeRequest) {
    if (!this.ws || !this.connected) {
      this.queue.push(request);
      return;
    }

    // If the request carries a binary payload, send as a binary frame
    if (request.binaryPayload && request.binaryPayload.byteLength > 0) {
      const msg: BinaryMessage = {
        type: 'binary',
        method: request.method,
        id: request.id,
        payload: request.binaryPayload,
        contentType: request.params?.contentType ?? 'application/octet-stream',
      };
      const frame = HybridBridge.encodeBinaryMessage(msg);
      this.ws.send(frame);
    } else {
      this.ws.send(JSON.stringify(request));
    }
  }

  /**
   * Send an RPC request with timeout handling
   */
  async request<T>(method: BridgeRequest['method'], params: any, binary?: ArrayBuffer, timeout?: number): Promise<T> {
    const id = `${method}-${Date.now()}-${(HybridBridge._requestCounter++).toString(36)}`;
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

  // --- Binary Transfer RPC Methods ---

  /**
   * Transfer a rendered image to the Python backend for processing / saving.
   *
   * @param imageData  Raw pixel data (e.g. from a WebGL readPixels call)
   * @param width      Image width in pixels
   * @param height     Image height in pixels
   * @param format     Pixel format string (e.g. 'rgba8', 'rgb8', 'float16')
   */
  async transferImage(imageData: ArrayBuffer, width: number, height: number, format: string = 'rgba8'): Promise<{ saved: boolean; path?: string }> {
    try {
      return await this.request<{ saved: boolean; path?: string }>(
        'transfer_image',
        { width, height, format, contentType: `image/${format}` },
        imageData,
      );
    } catch (e) {
      Logger.warn('HybridBridge', 'Image transfer failed:', e);
      return { saved: false };
    }
  }

  /**
   * Transfer serialised geometry (e.g. GLB / OBJ bytes) to the Python backend.
   *
   * @param geometryData  Serialised geometry as raw bytes
   */
  async transferGeometry(geometryData: ArrayBuffer): Promise<{ received: boolean; vertexCount?: number }> {
    try {
      return await this.request<{ received: boolean; vertexCount?: number }>(
        'transfer_geometry',
        { contentType: 'application/octet-stream' },
        geometryData,
      );
    } catch (e) {
      Logger.warn('HybridBridge', 'Geometry transfer failed:', e);
      return { received: false };
    }
  }

  /**
   * Transfer a terrain heightmap to the Python backend.
   *
   * @param data    Float32Array of height values (row-major)
   * @param width   Grid width
   * @param height  Grid height
   */
  async transferHeightMap(data: Float32Array, width: number, height: number): Promise<{ received: boolean; min?: number; max?: number }> {
    try {
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      return await this.request<{ received: boolean; min?: number; max?: number }>(
        'transfer_heightmap',
        { width, height, contentType: 'application/x-heightmap-float32' },
        buffer,
      );
    } catch (e) {
      Logger.warn('HybridBridge', 'Heightmap transfer failed:', e);
      return { received: false };
    }
  }

  // --- High-Level API ---

  /**
   * Perform CSG Boolean operations (Union, Difference, Intersection)
   */
  async meshBoolean(op: 'union' | 'difference' | 'intersection', meshes: MeshData[]): Promise<MeshData> {
    try {
      return await this.request<MeshData>('mesh_boolean', { operation: op, meshes });
    } catch (e) {
      Logger.warn('HybridBridge', 'MeshBoolean failed, falling back to mock');
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
      Logger.warn('HybridBridge', 'Subdivide failed, returning original');
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
      Logger.warn('HybridBridge', 'MJCF export failed, using browser fallback');
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
      Logger.warn('HybridBridge', 'Procedural generation failed, using browser fallback');
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
      Logger.debug('HybridBridge', 'batchRaycast fallback:', e);
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
      Logger.warn('HybridBridge', 'Decoration optimization failed, returning original');
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
      Logger.warn('HybridBridge', 'Trajectory optimization failed, returning original');
      return trajectories;
    }
  }

  // --- Mock Fallbacks for Browser-Only Mode ---

  private mockBoolean(op: string, meshes: MeshData[]): MeshData {
    Logger.warn('HybridBridge', 'Using mock Boolean operation');
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
    Logger.warn('HybridBridge', `Using browser fallback for procedural ${type}`);

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
