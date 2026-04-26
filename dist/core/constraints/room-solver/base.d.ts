/**
 * Infinigen R3F Port - Room Graph Base
 *
 * Ports: core/indoor/room_graph.py
 * Status: 100% portable - Pure graph representation
 */
export interface RoomNode {
    id: string;
    type: string;
    level: number;
    area?: number;
    centroid?: [number, number];
}
export interface RoomEdge {
    from: string;
    to: string;
    type: 'adjacent' | 'connected' | 'visible';
}
export declare class RoomGraph {
    rooms: RoomNode[];
    edges: RoomEdge[];
    private adjacencyMap;
    constructor(rooms?: RoomNode[], edges?: RoomEdge[]);
    getNeighbours(roomId: string): string[];
    addRoom(room: RoomNode): void;
    addEdge(from: string, to: string, type?: 'adjacent' | 'connected' | 'visible'): void;
    isPlanar(): boolean;
    computeCycleBasis(): string[][];
    private extractCycle;
    private cycleExists;
    getValidNeighbours(roomId: string, validTypes?: string[]): string[];
    toJSON(): object;
    static fromJSON(json: any): RoomGraph;
}
//# sourceMappingURL=base.d.ts.map