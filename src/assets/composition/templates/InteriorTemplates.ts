/**
 * Interior Composition Templates for Infinigen
 * 
 * Pre-defined templates for common interior scenes and room layouts.
 */

import { Vector3, Quaternion } from 'three';
import type { CompositionTemplate } from '../types';

/**
 * Living Room Template
 */
export const livingRoomTemplate: CompositionTemplate = {
  id: 'living_room_basic',
  name: 'Basic Living Room',
  description: 'A simple living room arrangement with sofa, coffee table, and TV',
  tags: ['interior', 'residential', 'living', 'furniture'],
  objects: [
    {
      id: 'sofa_main',
      category: 'furniture.sofa',
      variant: 'three_seater',
      position: new Vector3(0, 0, -2),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'fabric', color: 'gray' },
    },
    {
      id: 'coffee_table',
      category: 'furniture.table.coffee',
      position: new Vector3(0, 0, 0.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'wood' },
    },
    {
      id: 'tv_stand',
      category: 'furniture.entertainment',
      position: new Vector3(0, 0, 3.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'wood' },
    },
    {
      id: 'tv',
      category: 'electronics.tv',
      position: new Vector3(0, 1.2, 3.3),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      scale: new Vector3(1, 1, 1),
      parent: 'tv_stand',
    },
    {
      id: 'armchair_left',
      category: 'furniture.chair.armchair',
      position: new Vector3(-2, 0, -1),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 6),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'fabric' },
    },
    {
      id: 'armchair_right',
      category: 'furniture.chair.armchair',
      position: new Vector3(2, 0, -1),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 6),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'fabric' },
    },
    {
      id: 'floor_lamp_left',
      category: 'lighting.lamp.floor',
      position: new Vector3(-2.5, 0, -2.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
    },
    {
      id: 'floor_lamp_right',
      category: 'lighting.lamp.floor',
      position: new Vector3(2.5, 0, -2.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
    },
    {
      id: 'rug_center',
      category: 'decor.rug',
      position: new Vector3(0, 0.01, 0),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(2.5, 1, 3.5),
      metadata: { material: 'wool', pattern: 'geometric' },
    },
    {
      id: 'plant_corner',
      category: 'plant.indoor.large',
      position: new Vector3(-3, 0, 3),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
    },
  ],
  rules: [
    'separation',
    'center_object',
  ],
  constraints: [
    {
      id: 'sofa_tv_distance',
      type: 'distance',
      source: 'sofa_main',
      target: 'tv',
      parameters: { min: 2.5, max: 4.0, required: true },
    },
    {
      id: 'coffee_table_proximity',
      type: 'distance',
      source: 'coffee_table',
      target: 'sofa_main',
      parameters: { min: 0.3, max: 0.8, required: false },
    },
    {
      id: 'no_collision',
      type: 'collision',
      parameters: { required: true },
    },
  ],
  variables: [
    {
      name: 'roomWidth',
      type: 'number',
      defaultValue: 5,
      min: 3,
      max: 10,
    },
    {
      name: 'roomDepth',
      type: 'number',
      defaultValue: 6,
      min: 4,
      max: 12,
    },
    {
      name: 'style',
      type: 'string',
      defaultValue: 'modern',
      options: ['modern', 'traditional', 'minimalist', 'rustic'],
    },
  ],
};

/**
 * Bedroom Template
 */
export const bedroomTemplate: CompositionTemplate = {
  id: 'bedroom_basic',
  name: 'Basic Bedroom',
  description: 'A simple bedroom with bed, nightstands, and dresser',
  tags: ['interior', 'residential', 'bedroom', 'furniture'],
  objects: [
    {
      id: 'bed_main',
      category: 'furniture.bed.double',
      position: new Vector3(0, 0, 0),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'wood', bedding: 'linen' },
    },
    {
      id: 'nightstand_left',
      category: 'furniture.nightstand',
      position: new Vector3(-1.2, 0, 0.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'wood' },
    },
    {
      id: 'nightstand_right',
      category: 'furniture.nightstand',
      position: new Vector3(1.2, 0, 0.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'wood' },
    },
    {
      id: 'lamp_left',
      category: 'lighting.lamp.table',
      position: new Vector3(-1.2, 0.6, 0.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(0.5, 0.5, 0.5),
      parent: 'nightstand_left',
    },
    {
      id: 'lamp_right',
      category: 'lighting.lamp.table',
      position: new Vector3(1.2, 0.6, 0.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(0.5, 0.5, 0.5),
      parent: 'nightstand_right',
    },
    {
      id: 'dresser',
      category: 'furniture.dresser',
      position: new Vector3(2.5, 0, -1),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'wood' },
    },
    {
      id: 'mirror',
      category: 'decor.mirror.wall',
      position: new Vector3(2.5, 1.5, -1.1),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
      scale: new Vector3(1, 1, 1),
      parent: 'dresser',
    },
    {
      id: 'rug_bed',
      category: 'decor.rug',
      position: new Vector3(0, 0.01, 1.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(2, 1, 2.5),
      metadata: { material: 'wool' },
    },
  ],
  rules: [
    'symmetry',
    'separation',
  ],
  constraints: [
    {
      id: 'nightstand_bed_adjacent',
      type: 'distance',
      source: 'nightstand_left',
      target: 'bed_main',
      parameters: { min: 0.1, max: 0.3, required: true },
    },
    {
      id: 'dresser_clearance',
      type: 'distance',
      source: 'dresser',
      target: 'bed_main',
      parameters: { min: 0.8, required: true },
    },
    {
      id: 'no_collision',
      type: 'collision',
      parameters: { required: true },
    },
  ],
  variables: [
    {
      name: 'bedSize',
      type: 'string',
      defaultValue: 'queen',
      options: ['twin', 'full', 'queen', 'king'],
    },
    {
      name: 'roomStyle',
      type: 'string',
      defaultValue: 'contemporary',
      options: ['contemporary', 'traditional', 'minimalist'],
    },
  ],
};

/**
 * Kitchen Template
 */
export const kitchenTemplate: CompositionTemplate = {
  id: 'kitchen_basic',
  name: 'Basic Kitchen',
  description: 'A simple kitchen layout with counters, appliances, and island',
  tags: ['interior', 'residential', 'kitchen', 'appliances'],
  objects: [
    {
      id: 'counter_base',
      category: 'architectural.counter',
      position: new Vector3(-2, 0.9, 2.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 3),
      metadata: { material: 'granite', length: 3 },
    },
    {
      id: 'stove',
      category: 'appliance.stove',
      position: new Vector3(-2, 0.9, 1.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
      parent: 'counter_base',
    },
    {
      id: 'sink',
      category: 'fixture.sink.kitchen',
      position: new Vector3(-2, 0.9, 3.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
      parent: 'counter_base',
    },
    {
      id: 'refrigerator',
      category: 'appliance.refrigerator',
      position: new Vector3(-3.5, 0, 2.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
      scale: new Vector3(1, 1, 1),
    },
    {
      id: 'island',
      category: 'furniture.table.kitchen_island',
      position: new Vector3(1, 0.9, 0),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'granite', hasSeating: true },
    },
    {
      id: 'stool_1',
      category: 'furniture.stool.bar',
      position: new Vector3(0.5, 0, 0),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
    },
    {
      id: 'stool_2',
      category: 'furniture.stool.bar',
      position: new Vector3(1, 0, 0),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
    },
    {
      id: 'stool_3',
      category: 'furniture.stool.bar',
      position: new Vector3(1.5, 0, 0),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
    },
    {
      id: 'pendant_light_1',
      category: 'lighting.pendant',
      position: new Vector3(0.5, 2.5, 0),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
    },
    {
      id: 'pendant_light_2',
      category: 'lighting.pendant',
      position: new Vector3(1.5, 2.5, 0),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
    },
  ],
  rules: [
    'align_objects',
    'separation',
  ],
  constraints: [
    {
      id: 'work_triangle',
      type: 'distance',
      source: 'stove',
      target: 'refrigerator',
      parameters: { min: 1.2, max: 2.7, required: false }, // Work triangle principle
    },
    {
      id: 'stool_spacing',
      type: 'distance',
      source: 'stool_1',
      target: 'stool_2',
      parameters: { min: 0.6, required: true },
    },
    {
      id: 'no_collision',
      type: 'collision',
      parameters: { required: true },
    },
  ],
  variables: [
    {
      name: 'layoutType',
      type: 'string',
      defaultValue: 'L',
      options: ['L', 'U', 'galley', 'island'],
    },
    {
      name: 'counterMaterial',
      type: 'string',
      defaultValue: 'granite',
      options: ['granite', 'marble', 'quartz', 'butcher_block'],
    },
  ],
};

/**
 * Office Template
 */
export const officeTemplate: CompositionTemplate = {
  id: 'office_basic',
  name: 'Basic Home Office',
  description: 'A simple home office with desk, chair, and storage',
  tags: ['interior', 'office', 'workspace', 'furniture'],
  objects: [
    {
      id: 'desk_main',
      category: 'furniture.desk',
      position: new Vector3(0, 0.75, 2),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      scale: new Vector3(1.5, 1, 1),
      metadata: { material: 'wood', shape: 'rectangular' },
    },
    {
      id: 'chair_office',
      category: 'furniture.chair.office',
      position: new Vector3(0, 0, 1),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
      metadata: { material: 'mesh', ergonomic: true },
    },
    {
      id: 'monitor',
      category: 'electronics.monitor',
      position: new Vector3(0, 1.3, 1.9),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      scale: new Vector3(1, 1, 1),
      parent: 'desk_main',
    },
    {
      id: 'bookshelf',
      category: 'furniture.shelf.bookcase',
      position: new Vector3(-2, 0, 0),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
      scale: new Vector3(1, 1, 1),
      metadata: { shelves: 5 },
    },
    {
      id: 'filing_cabinet',
      category: 'furniture.storage.filing',
      position: new Vector3(1.5, 0, 2),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      scale: new Vector3(1, 1, 1),
    },
    {
      id: 'desk_lamp',
      category: 'lighting.lamp.desk',
      position: new Vector3(0.6, 1.3, 1.8),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      scale: new Vector3(1, 1, 1),
      parent: 'desk_main',
    },
    {
      id: 'floor_lamp',
      category: 'lighting.lamp.floor',
      position: new Vector3(-1.5, 0, 0.5),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0),
      scale: new Vector3(1, 1, 1),
    },
    {
      id: 'plant_desk',
      category: 'plant.indoor.small',
      position: new Vector3(-0.6, 1.3, 1.8),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      scale: new Vector3(0.5, 0.5, 0.5),
      parent: 'desk_main',
    },
  ],
  rules: [
    'center_object',
    'separation',
  ],
  constraints: [
    {
      id: 'chair_desk_proximity',
      type: 'distance',
      source: 'chair_office',
      target: 'desk_main',
      parameters: { min: 0.2, max: 0.5, required: true },
    },
    {
      id: 'monitor_viewing_distance',
      type: 'distance',
      source: 'monitor',
      target: 'chair_office',
      parameters: { min: 0.5, max: 0.8, required: false },
    },
    {
      id: 'no_collision',
      type: 'collision',
      parameters: { required: true },
    },
  ],
  variables: [
    {
      name: 'deskSize',
      type: 'string',
      defaultValue: 'standard',
      options: ['compact', 'standard', 'executive', 'standing'],
    },
    {
      name: 'storageNeeds',
      type: 'string',
      defaultValue: 'moderate',
      options: ['minimal', 'moderate', 'extensive'],
    },
  ],
};

// Export all interior templates
export const interiorTemplates: CompositionTemplate[] = [
  livingRoomTemplate,
  bedroomTemplate,
  kitchenTemplate,
  officeTemplate,
];
