/**
 * Infinigen R3F Port - Room Graph Base
 *
 * Ports: core/indoor/room_graph.py
 * Status: 100% portable - Pure graph representation
 */
export class RoomGraph {
    constructor(rooms = [], edges = []) {
        this.rooms = rooms;
        this.edges = edges;
        this.adjacencyMap = new Map();
        for (const room of rooms) {
            this.adjacencyMap.set(room.id, new Set());
        }
        for (const edge of edges) {
            if (edge.type === 'adjacent') {
                this.adjacencyMap.get(edge.from)?.add(edge.to);
                this.adjacencyMap.get(edge.to)?.add(edge.from);
            }
        }
    }
    getNeighbours(roomId) {
        return Array.from(this.adjacencyMap.get(roomId) || []);
    }
    addRoom(room) {
        this.rooms.push(room);
        this.adjacencyMap.set(room.id, new Set());
    }
    addEdge(from, to, type = 'adjacent') {
        this.edges.push({ from, to, type });
        if (type === 'adjacent') {
            this.adjacencyMap.get(from)?.add(to);
            this.adjacencyMap.get(to)?.add(from);
        }
    }
    isPlanar() {
        const n = this.rooms.length;
        const e = this.edges.filter(e => e.type === 'adjacent').length;
        return e <= 3 * n - 6;
    }
    computeCycleBasis() {
        const cycles = [];
        const visited = new Set();
        const parent = new Map();
        if (this.rooms.length === 0)
            return cycles;
        const queue = [this.rooms[0].id];
        parent.set(queue[0], null);
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current))
                continue;
            visited.add(current);
            const neighbours = this.getNeighbours(current);
            for (const neighbour of neighbours) {
                if (!parent.has(neighbour)) {
                    parent.set(neighbour, current);
                    queue.push(neighbour);
                }
                else if (neighbour !== parent.get(current)) {
                    const cycle = this.extractCycle(current, neighbour, parent);
                    if (cycle.length > 0 && !this.cycleExists(cycle, cycles)) {
                        cycles.push(cycle);
                    }
                }
            }
        }
        return cycles;
    }
    extractCycle(node1, node2, parent) {
        const path1 = [];
        const path2 = [];
        let current = node1;
        while (current !== null) {
            path1.push(current);
            current = parent.get(current) || null;
        }
        current = node2;
        while (current !== null) {
            path2.push(current);
            current = parent.get(current) || null;
        }
        const set1 = new Set(path1);
        const lca = path2.find(n => set1.has(n));
        if (!lca)
            return [];
        const cycle = [];
        for (const n of path1) {
            cycle.push(n);
            if (n === lca)
                break;
        }
        for (let i = path2.indexOf(lca) - 1; i >= 0; i--) {
            cycle.push(path2[i]);
        }
        return cycle;
    }
    cycleExists(cycle, cycles) {
        const cycleSet = new Set(cycle);
        for (const existing of cycles) {
            if (existing.length === cycle.length) {
                const existingSet = new Set(existing);
                let same = true;
                for (const node of cycle) {
                    if (!existingSet.has(node)) {
                        same = false;
                        break;
                    }
                }
                if (same)
                    return true;
            }
        }
        return false;
    }
    getValidNeighbours(roomId, validTypes) {
        const neighbours = this.getNeighbours(roomId);
        if (!validTypes)
            return neighbours;
        return neighbours.filter(id => {
            const room = this.rooms.find(r => r.id === id);
            return room && validTypes.includes(room.type);
        });
    }
    toJSON() {
        return { rooms: this.rooms, edges: this.edges };
    }
    static fromJSON(json) {
        return new RoomGraph(json.rooms || [], json.edges || []);
    }
}
//# sourceMappingURL=base.js.map