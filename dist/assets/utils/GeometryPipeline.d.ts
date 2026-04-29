/**
 * GeometryPipeline - Utilities for geometry processing and manipulation
 * Provides mesh processing, optimization, and transformation utilities
 */
import { BufferGeometry, Mesh, Matrix4 } from 'three';
export declare class GeometryPipeline {
    /**
     * Merge multiple geometries into a single geometry
     */
    static mergeGeometries(geometries: BufferGeometry[], useGroups?: boolean): BufferGeometry;
    /**
     * Optimize geometry by removing duplicate vertices
     */
    static optimizeGeometry(geometry: BufferGeometry): BufferGeometry;
    /**
     * Center geometry at origin
     */
    static centerGeometry(geometry: BufferGeometry): BufferGeometry;
    /**
     * Scale geometry to fit within bounds
     */
    static scaleToFit(geometry: BufferGeometry, targetSize: number): BufferGeometry;
    /**
     * Apply transformation matrix to geometry
     */
    static applyTransform(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry;
    /**
     * Convert mesh to buffer geometry
     */
    static meshToGeometry(mesh: Mesh): BufferGeometry;
}
export default GeometryPipeline;
//# sourceMappingURL=GeometryPipeline.d.ts.map