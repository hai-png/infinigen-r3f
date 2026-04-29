/**
 * UVMapper - Utilities for UV mapping and texture coordinate generation
 * Provides automatic UV unwrapping and mapping utilities
 */
import { BufferGeometry } from 'three';
export declare class UVMapper {
    /**
     * Generate planar UV coordinates for a geometry
     */
    static generatePlanarUVs(geometry: BufferGeometry, axis?: 'x' | 'y' | 'z'): BufferGeometry;
    /**
     * Generate spherical UV coordinates for a geometry
     */
    static generateSphericalUVs(geometry: BufferGeometry): BufferGeometry;
    /**
     * Generate cylindrical UV coordinates for a geometry
     */
    static generateCylindricalUVs(geometry: BufferGeometry, axis?: 'x' | 'y' | 'z'): BufferGeometry;
    /**
     * Generate box UV coordinates for a geometry
     */
    static generateBoxUVs(geometry: BufferGeometry): BufferGeometry;
    /**
     * Auto-generate appropriate UV coordinates based on geometry type
     */
    static autoGenerateUVs(geometry: BufferGeometry): BufferGeometry;
}
export default UVMapper;
//# sourceMappingURL=UVMapper.d.ts.map