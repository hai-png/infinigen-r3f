/**
 * Particle Editor - Phase 12
 * Interactive particle system editor with real-time preview
 */
import React from 'react';
export interface ParticleSystemConfig {
    id: string;
    name: string;
    emissionRate: number;
    lifetime: number;
    speed: number;
    spread: number;
    gravity: [number, number, number];
    size: number;
    colorStart: string;
    colorEnd: string;
    shape: 'point' | 'sphere' | 'box' | 'cone';
}
interface ParticleEditorProps {
    system: ParticleSystemConfig;
    onUpdate?: (system: ParticleSystemConfig) => void;
}
export declare const ParticleEditor: React.FC<ParticleEditorProps>;
export default ParticleEditor;
//# sourceMappingURL=ParticleEditor.d.ts.map