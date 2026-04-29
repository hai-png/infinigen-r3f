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
export declare class HybridBridge {
    private static instance;
    private ws;
    private pendingRequests;
    private url;
    private connected;
    private queue;
    constructor(url?: string);
    /**
     * Get singleton instance
     */
    static getInstance(): HybridBridge;
    /**
     * Check if bridge is connected
     */
    static isConnected(): boolean;
    /**
     * Connect to Python backend
     */
    static connect(url?: string): Promise<void>;
    connect(): Promise<void>;
    private handleMessage;
    private sendRaw;
    request<T>(method: BridgeRequest['method'], params: any, binary?: ArrayBuffer): Promise<T>;
    /**
     * Perform CSG Boolean operations (Union, Difference, Intersection)
     */
    meshBoolean(op: 'union' | 'difference' | 'intersection', meshes: MeshData[]): Promise<MeshData>;
    /**
     * Subdivide mesh for higher fidelity
     */
    subdivideMesh(mesh: MeshData, levels?: number): Promise<MeshData>;
    /**
     * Export scene to MJCF (MuJoCo XML) for physics simulation
     */
    exportMjcf(config: PhysicsConfig): Promise<string>;
    /**
     * Generate complex procedural geometry (e.g., terrain, vegetation)
     */
    generateProcedural(type: 'terrain' | 'vegetation' | 'building', params: any): Promise<MeshData>;
    /**
     * Batch raycasting for precise visibility/collision checks
     */
    batchRaycast(rays: {
        origin: [number, number, number];
        dir: [number, number, number];
    }[]): Promise<number[]>;
    /**
     * Optimize decoration layout using Python backend
     */
    optimizeDecorationLayout(roomBounds: any, decorations: any[]): Promise<any[]>;
    /**
     * Optimize trajectories using Python backend
     */
    optimizeTrajectories(trajectories: any[]): Promise<any[]>;
    private mockBoolean;
    disconnect(): void;
}
export declare const bridge: HybridBridge;
//# sourceMappingURL=hybrid-bridge.d.ts.map