/**
 * Infinigen R3F Port - Floor Plan Generation
 * Ports: core/indoor/floor_plan.py
 */
import { Vector2 } from 'three';
export class FloorPlanGenerator {
    constructor(params = {}) {
        this.params = {
            minRoomArea: params.minRoomArea ?? 4.0,
            maxRoomArea: params.maxRoomArea ?? 50.0,
            aspectRatioMin: params.aspectRatioMin ?? 0.5,
            aspectRatioMax: params.aspectRatioMax ?? 2.0,
        };
    }
    generate(roomGraph) {
        const contours = [];
        const cycles = roomGraph.computeCycleBasis();
        for (let i = 0; i < Math.min(roomGraph.rooms.length, cycles.length); i++) {
            const room = roomGraph.rooms[i];
            const cycle = cycles[i];
            const contour = this.generateRoomContour(room.id, cycle);
            if (contour && this.validateContour(contour)) {
                contours.push(contour);
            }
        }
        return contours;
    }
    generateRoomContour(roomId, cycle) {
        if (cycle.length < 3)
            return null;
        const vertices = cycle.map((_, i) => {
            const angle = (2 * Math.PI * i) / cycle.length;
            return new Vector2(Math.cos(angle) * 5, Math.sin(angle) * 5);
        });
        let area = 0;
        for (let i = 0; i < vertices.length; i++) {
            const j = (i + 1) % vertices.length;
            area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
        }
        area = Math.abs(area) / 2;
        const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
        const cy = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
        return { vertices, area, centroid: new Vector2(cx, cy), roomId };
    }
    validateContour(contour) {
        if (contour.area < this.params.minRoomArea || contour.area > this.params.maxRoomArea)
            return false;
        const xs = contour.vertices.map(v => v.x);
        const ys = contour.vertices.map(v => v.y);
        const w = Math.max(...xs) - Math.min(...xs);
        const h = Math.max(...ys) - Math.min(...ys);
        if (w === 0 || h === 0)
            return false;
        const ar = Math.max(w, h) / Math.min(w, h);
        return ar >= this.params.aspectRatioMin && ar <= this.params.aspectRatioMax;
    }
}
//# sourceMappingURL=floor-plan.js.map