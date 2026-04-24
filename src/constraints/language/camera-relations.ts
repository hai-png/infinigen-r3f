export const CameraRelations = { Frames: "frames", HasLineOfSight: "hasLineOfSight", MaintainsShotSize: "maintainsShotSize" };
export function Frames(camera: any, subject: any): any { return { type: "Frames", camera, subject }; }
export function HasLineOfSight(camera: any, subject: any): any { return { type: "HasLineOfSight", camera, subject }; }
export default CameraRelations;
