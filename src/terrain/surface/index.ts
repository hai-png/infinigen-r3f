/**
 * Surface Module Index
 *
 * Exports all surface kernel types and utilities
 */

export {
  SurfaceKernel,
  SurfaceKernelRegistry,
  surfaceKernelRegistry,
  SurfaceVar,
  KernelDataType,
} from './SurfaceKernel';

export type {
  SurfaceVertex,
  SurfaceMesh,
  KernelParam,
  KernelSpec,
} from './SurfaceKernel';

export {
  DirtSurface,
} from './DirtSurface';

export type {
  DirtParams,
} from './DirtSurface';

export {
  SnowSurface,
} from './SnowSurface';

export type {
  SnowParams,
} from './SnowSurface';

export {
  StoneSurface,
} from './StoneSurface';

export type {
  StoneParams,
} from './StoneSurface';

export {
  SandSurface,
} from './SandSurface';

export type {
  SandParams,
} from './SandSurface';

export {
  IceSurface,
} from './IceSurface';

export type {
  IceParams,
} from './IceSurface';

export {
  MudSurface,
} from './MudSurface';

export type {
  MudParams,
} from './MudSurface';
