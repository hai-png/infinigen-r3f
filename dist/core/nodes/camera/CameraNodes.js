/**
 * Camera Nodes Module
 * Camera data access, depth of field, and view properties
 * Ported from Blender Geometry Nodes
 */
export class CameraDataNode {
    constructor(inputs = {}) {
        this.category = 'camera';
        this.nodeType = 'camera_data';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            cameraMatrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            depth: 0,
            distance: 0,
        };
    }
    execute(camera) {
        const type = this.inputs.type || 'view_matrix';
        if (type === 'view_matrix') {
            this.outputs.matrix = camera.matrixWorldInverse.toArray();
        }
        else if (type === 'projection_matrix') {
            this.outputs.matrix = camera.projectionMatrix.toArray();
        }
        else if (type === 'view_projection_matrix') {
            const viewProj = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
            this.outputs.matrix = viewProj.toArray();
        }
        this.outputs.cameraMatrixWorld = camera.matrixWorld.toArray();
        // Calculate depth and distance (simplified)
        this.outputs.depth = 0;
        this.outputs.distance = 0;
        return this.outputs;
    }
}
export class DepthOfFieldNode {
    constructor(inputs = {}) {
        this.category = 'camera';
        this.nodeType = 'depth_of_field';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            focusDistance: inputs.focusDistance ?? 10,
            aperture: inputs.fStop ?? 2.8,
            focalLength: inputs.focalLength ?? 50,
            sensorWidth: inputs.sensorWidth ?? 36,
        };
    }
    execute(camera) {
        const focalLength = this.inputs.focalLength ?? camera.focal ?? 50;
        const fStop = this.inputs.fStop ?? 2.8;
        const focusDistance = this.inputs.focusDistance ?? 10;
        const sensorWidth = this.inputs.sensorWidth ?? 36;
        // Calculate aperture diameter: focal_length / f_stop
        const aperture = focalLength / fStop;
        this.outputs = {
            focusDistance,
            aperture,
            focalLength,
            sensorWidth,
        };
        return this.outputs;
    }
}
export class FocalLengthNode {
    constructor(inputs = {}) {
        this.category = 'camera';
        this.nodeType = 'focal_length';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            focalLength: inputs.focalLength ?? 50,
            fov: inputs.fov ?? 39.6,
            sensorWidth: inputs.sensorWidth ?? 36,
        };
    }
    execute(camera) {
        let focalLength = this.inputs.focalLength ?? camera.focal ?? 50;
        const sensorWidth = this.inputs.sensorWidth ?? 36;
        // If FOV is provided, calculate focal length
        if (this.inputs.fov !== undefined) {
            const fovRad = (this.inputs.fov * Math.PI) / 180;
            focalLength = (sensorWidth / 2) / Math.tan(fovRad / 2);
        }
        // Calculate FOV from focal length
        const fov = 2 * Math.atan((sensorWidth / 2) / focalLength) * (180 / Math.PI);
        this.outputs = {
            focalLength,
            fov,
            sensorWidth,
        };
        return this.outputs;
    }
}
export class ViewMatrixNode {
    constructor(inputs = {}) {
        this.category = 'camera';
        this.nodeType = 'view_matrix';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            viewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            inverseViewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        };
    }
    execute(camera) {
        this.outputs.viewMatrix = camera.matrixWorldInverse.toArray();
        this.outputs.inverseViewMatrix = camera.matrixWorld.toArray();
        return this.outputs;
    }
}
// ============================================================================
// Factory Functions
// ============================================================================
export function createCameraDataNode(inputs) {
    return new CameraDataNode(inputs);
}
export function createDepthOfFieldNode(inputs) {
    return new DepthOfFieldNode(inputs);
}
export function createFocalLengthNode(inputs) {
    return new FocalLengthNode(inputs);
}
export function createViewMatrixNode(inputs) {
    return new ViewMatrixNode(inputs);
}
//# sourceMappingURL=CameraNodes.js.map