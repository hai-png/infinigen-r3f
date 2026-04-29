/**
 * Camera Rig UI - Phase 12
 * Cinematic camera rig controls with multi-camera support
 */
import React from 'react';
export interface CameraRigConfig {
    id: string;
    name: string;
    type: 'single' | 'stereo' | 'multi' | 'orbital' | 'dolly';
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
    aperture: number;
    focusDistance: number;
}
interface CameraRigUIProps {
    rigs: CameraRigConfig[];
    activeRigId?: string;
    onRigSelect?: (rigId: string) => void;
    onRigUpdate?: (rigId: string, updates: Partial<CameraRigConfig>) => void;
    onRigAdd?: () => void;
    onRigDelete?: (rigId: string) => void;
}
export declare const CameraRigUI: React.FC<CameraRigUIProps>;
export default CameraRigUI;
//# sourceMappingURL=CameraRigUI.d.ts.map