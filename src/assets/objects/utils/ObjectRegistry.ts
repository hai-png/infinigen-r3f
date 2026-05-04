/**
 * @deprecated This module is deprecated. Import from '../ObjectRegistry' instead.
 *
 * The ObjectRegistry and RegistrableObject have been consolidated into the canonical
 * ObjectRegistry module at src/assets/objects/ObjectRegistry.ts.
 *
 * - ObjectRegistry  → import { ObjectRegistry } from '../ObjectRegistry'
 * - RegistrableObject → import { RegistrableObject } from '../ObjectRegistry'
 *   (or use ClassObjectRegistry for class-constructor registration)
 */

export { ObjectRegistry, ClassObjectRegistry } from '../ObjectRegistry';
export type { RegistrableObject } from '../ObjectRegistry';
