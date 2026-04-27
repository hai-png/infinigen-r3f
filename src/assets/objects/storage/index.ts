/**
 * Storage Module Index
 * 
 * Central export point for all storage furniture generators.
 */

export * from './CabinetGenerator';
export * from './DrawerUnit';
export * from './ShelfGenerator';
export * from './WardrobeGenerator';

export type { CabinetConfig, CabinetStyle } from './CabinetGenerator';
export type { DrawerUnitConfig, DrawerType } from './DrawerUnit';
export type { ShelfConfig, ShelfStyle } from './ShelfGenerator';
export type { WardrobeConfig, WardrobeType, DoorStyle } from './WardrobeGenerator';
