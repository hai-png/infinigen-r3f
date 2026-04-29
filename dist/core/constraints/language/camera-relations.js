export const CameraRelations = { Frames: "frames", HasLineOfSight: "hasLineOfSight", MaintainsShotSize: "maintainsShotSize" };
export function Frames(camera, subject) { return { type: "Frames", camera, subject }; }
export function HasLineOfSight(camera, subject) { return { type: "HasLineOfSight", camera, subject }; }
export default CameraRelations;
//# sourceMappingURL=camera-relations.js.map