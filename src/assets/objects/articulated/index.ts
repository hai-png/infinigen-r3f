/**
 * Articulated Objects Index
 * 
 * Exports all 18 articulated object generators matching Infinigen's categories.
 * Each generator produces a THREE.Group with visible meshes, JointInfo metadata,
 * and MJCF XML export capability.
 */

// Base types and utilities
export {
  type JointType,
  type JointInfo,
  type ArticulatedObjectConfig,
  type ArticulatedObjectResult,
  ArticulatedObjectBase,
  generateMJCF,
  validateMJCF,
} from './types';

// URDF Export
export {
  type URDFJointType,
  type URDFLink,
  type URDFJoint,
  type URDFGeometry,
  type URDFOrigin,
  type URDFInertial,
  type URDFJointLimit,
  type URDFJointDynamics,
  type URDFExportOptions,
  type ValidationResult,
  generateURDF,
  validateURDF,
  jointTypeToURDF,
  estimateInertia,
} from './URDFExporter';

// USD Export
export {
  generateUSD,
  generateUSDCrate,
} from './USDExporter';

// Kinematic Compiler extensions
export {
  type KinematicNodeEntry,
  KinematicNodeTree,
  compileKinematicTree,
  RigidBodyNode,
  RigidBodySkeleton,
} from '../../../sim/kinematic/KinematicCompiler';

// 18 Articulated Object Generators
export { DoorGenerator } from './DoorGenerator';
export { DrawerGenerator } from './DrawerGenerator';
export { CabinetGenerator } from './CabinetGenerator';
export { WindowGenerator } from './WindowGenerator';
export { ToasterGenerator } from './ToasterGenerator';
export { RefrigeratorGenerator } from './RefrigeratorGenerator';
export { OvenGenerator } from './OvenGenerator';
export { MicrowaveGenerator } from './MicrowaveGenerator';
export { DishwasherGenerator } from './DishwasherGenerator';
export { LampGenerator } from './LampGenerator';
export { TrashCanGenerator } from './TrashCanGenerator';
export { BoxGenerator } from './BoxGenerator';
export { FaucetGenerator } from './FaucetGenerator';
export { PepperGrinderGenerator } from './PepperGrinderGenerator';
export { DoorHandleGenerator } from './DoorHandleGenerator';
export { PliersGenerator } from './PliersGenerator';
export { CooktopGenerator } from './CooktopGenerator';
export { SoapDispenserGenerator } from './SoapDispenserGenerator';

// Registry integration
import { ObjectRegistry } from '../ObjectRegistry';
import { DoorGenerator } from './DoorGenerator';
import { DrawerGenerator } from './DrawerGenerator';
import { CabinetGenerator } from './CabinetGenerator';
import { WindowGenerator } from './WindowGenerator';
import { ToasterGenerator } from './ToasterGenerator';
import { RefrigeratorGenerator } from './RefrigeratorGenerator';
import { OvenGenerator } from './OvenGenerator';
import { MicrowaveGenerator } from './MicrowaveGenerator';
import { DishwasherGenerator } from './DishwasherGenerator';
import { LampGenerator } from './LampGenerator';
import { TrashCanGenerator } from './TrashCanGenerator';
import { BoxGenerator } from './BoxGenerator';
import { FaucetGenerator } from './FaucetGenerator';
import { PepperGrinderGenerator } from './PepperGrinderGenerator';
import { DoorHandleGenerator } from './DoorHandleGenerator';
import { PliersGenerator } from './PliersGenerator';
import { CooktopGenerator } from './CooktopGenerator';
import { SoapDispenserGenerator } from './SoapDispenserGenerator';

// Register all articulated object generators
ObjectRegistry.register('Door', 'articulated', DoorGenerator, ['hinged', 'door', 'furniture']);
ObjectRegistry.register('Drawer', 'articulated', DrawerGenerator, ['sliding', 'drawer', 'furniture']);
ObjectRegistry.register('Cabinet', 'articulated', CabinetGenerator, ['hinged', 'cabinet', 'furniture']);
ObjectRegistry.register('Window', 'articulated', WindowGenerator, ['hinged', 'window', 'architectural']);
ObjectRegistry.register('Toaster', 'articulated', ToasterGenerator, ['prismatic', 'appliance', 'kitchen']);
ObjectRegistry.register('Refrigerator', 'articulated', RefrigeratorGenerator, ['hinged', 'appliance', 'kitchen']);
ObjectRegistry.register('Oven', 'articulated', OvenGenerator, ['hinged', 'appliance', 'kitchen']);
ObjectRegistry.register('Microwave', 'articulated', MicrowaveGenerator, ['hinged', 'appliance', 'kitchen']);
ObjectRegistry.register('Dishwasher', 'articulated', DishwasherGenerator, ['hinged', 'appliance', 'kitchen']);
ObjectRegistry.register('Lamp', 'articulated', LampGenerator, ['ball', 'lighting', 'furniture']);
ObjectRegistry.register('TrashCan', 'articulated', TrashCanGenerator, ['hinged', 'container', 'bathroom']);
ObjectRegistry.register('Box', 'articulated', BoxGenerator, ['hinged', 'container', 'storage']);
ObjectRegistry.register('Faucet', 'articulated', FaucetGenerator, ['hinged', 'fixture', 'bathroom']);
ObjectRegistry.register('PepperGrinder', 'articulated', PepperGrinderGenerator, ['hinged', 'tool', 'kitchen']);
ObjectRegistry.register('DoorHandle', 'articulated', DoorHandleGenerator, ['hinged', 'hardware', 'door']);
ObjectRegistry.register('Pliers', 'articulated', PliersGenerator, ['hinged', 'tool', 'hardware']);
ObjectRegistry.register('Cooktop', 'articulated', CooktopGenerator, ['hinged', 'appliance', 'kitchen']);
ObjectRegistry.register('SoapDispenser', 'articulated', SoapDispenserGenerator, ['prismatic', 'fixture', 'bathroom']);

/**
 * Convenience: create any articulated object by name
 */
export function createArticulatedObject(
  name: string,
  config?: Partial<import('./types').ArticulatedObjectConfig>
): import('./types').ArticulatedObjectResult | null {
  const generators: Record<string, new () => import('./types').ArticulatedObjectBase> = {
    door: DoorGenerator,
    drawer: DrawerGenerator,
    cabinet: CabinetGenerator,
    window: WindowGenerator,
    toaster: ToasterGenerator,
    refrigerator: RefrigeratorGenerator,
    oven: OvenGenerator,
    microwave: MicrowaveGenerator,
    dishwasher: DishwasherGenerator,
    lamp: LampGenerator,
    trashcan: TrashCanGenerator,
    box: BoxGenerator,
    faucet: FaucetGenerator,
    peppergrinder: PepperGrinderGenerator,
    doorhandle: DoorHandleGenerator,
    pliers: PliersGenerator,
    cooktop: CooktopGenerator,
    soapdispenser: SoapDispenserGenerator,
  };

  const key = name.toLowerCase().replace(/[\s_-]/g, '');
  const GeneratorClass = generators[key];
  if (!GeneratorClass) return null;

  const generator = new GeneratorClass();
  return generator.generate(config);
}

/**
 * Get all available articulated object names
 */
export function getArticulatedObjectNames(): string[] {
  return [
    'Door', 'Drawer', 'Cabinet', 'Window', 'Toaster',
    'Refrigerator', 'Oven', 'Microwave', 'Dishwasher', 'Lamp',
    'TrashCan', 'Box', 'Faucet', 'PepperGrinder', 'DoorHandle',
    'Pliers', 'Cooktop', 'SoapDispenser',
  ];
}
