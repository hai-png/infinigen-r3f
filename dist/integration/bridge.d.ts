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
import { SolverState } from '../constraints/solver/state';
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
        assetUrl?: string;
        stateUpdate?: Partial<SolverState>;
        imageUrl?: string;
        metadata?: any;
    };
    error?: string;
}
export declare class InfinigenBridge {
    private config;
    private ws;
    private pendingTasks;
    private isConnected;
    constructor(config?: Partial<BridgeConfig>);
    /**
     * Establish WebSocket connection to Python backend
     */
    connect(): Promise<void>;
    /**
     * Handle incoming messages from Python
     */
    private handleMessage;
    /**
     * Offload geometry generation to Blender/Infinigen
     * Used for unportable ops: Boolean modifiers, Geo Nodes, Complex Meshes
     */
    generateGeometry(objects: any[], // Serialized JS objects representing constraint state
    options: {
        detail: 'low' | 'high';
        format: 'glb' | 'usd';
    }): Promise<{
        assetUrl: string;
        stateUpdate: Partial<SolverState>;
    }>;
    /**
     * Offload physics simulation (RBD, Fluids, Cloth) to Blender
     */
    runSimulation(initialState: SolverState, duration: number, fps: number): Promise<{
        assetUrl: string;
        stateUpdate: Partial<SolverState>;
    }>;
    /**
     * Request high-fidelity render from Blender Cycles
     */
    renderImage(sceneState: SolverState, settings: {
        resolution: [number, number];
        samples: number;
    }): Promise<{
        imageUrl: string;
    }>;
    /**
     * Generic task executor with timeout
     */
    private executeTask;
    /**
     * Sync current JS state with Python backend state
     */
    syncState(state: SolverState): Promise<void>;
    disconnect(): void;
}
export default InfinigenBridge;
//# sourceMappingURL=bridge.d.ts.map