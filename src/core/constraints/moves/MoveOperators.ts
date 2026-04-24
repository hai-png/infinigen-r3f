/**
 * Move Operators for Simulated Annealing
 * Ported from original Infinigen's move system
 */

import { Object3D, Vector3, Euler } from 'three';
import { ConstraintDomain, Constraint } from '../core/ConstraintTypes';

export enum MoveType {
  SWAP = 'swap',
  POSE = 'pose',
  ADD = 'add',
  DELETE = 'delete',
  REASSIGN = 'reassign',
}

export interface Move {
  id: string;
  type: MoveType;
  objectId?: string;
  targetObjectId?: string;
  position?: Vector3;
  rotation?: Euler;
  scale?: Vector3;
  roomId?: string;
  
  // For undo functionality
  previousState?: {
    position?: Vector3;
    rotation?: Euler;
    scale?: Vector3;
    roomId?: string;
  };
}

export interface MoveResult {
  success: boolean;
  energyChange: number;
  message?: string;
}

/**
 * SwapMove: Exchange positions of two objects
 */
export class SwapMoveOperator {
  constructor(private domain: ConstraintDomain) {}

  execute(move: Move): MoveResult {
    if (!move.objectId || !move.targetObjectId) {
      return { success: false, energyChange: 0, message: 'Missing object IDs for swap' };
    }

    const obj1 = this.domain.objects.get(move.objectId);
    const obj2 = this.domain.objects.get(move.targetObjectId);

    if (!obj1 || !obj2) {
      return { success: false, energyChange: 0, message: 'One or both objects not found' };
    }

    // Store previous states
    move.previousState = {
      position: obj1.position.clone(),
      rotation: obj1.rotation.clone(),
    };

    // Swap positions
    const tempPos = obj1.position.clone();
    obj1.position.copy(obj2.position);
    obj2.position.copy(tempPos);

    return {
      success: true,
      energyChange: 0, // Will be calculated by annealer
      message: `Swapped ${move.objectId} and ${move.targetObjectId}`,
    };
  }

  undo(move: Move): boolean {
    if (!move.objectId || !move.targetObjectId || !move.previousState) {
      return false;
    }

    const obj1 = this.domain.objects.get(move.objectId);
    const obj2 = this.domain.objects.get(move.targetObjectId);

    if (!obj1 || !obj2) return false;

    // Swap back
    const tempPos = obj1.position.clone();
    obj1.position.copy(obj2.position);
    obj2.position.copy(tempPos);

    return true;
  }
}

/**
 * PoseMove: Change position/rotation/scale of an object
 */
export class PoseMoveOperator {
  constructor(private domain: ConstraintDomain) {}

  execute(move: Move): MoveResult {
    if (!move.objectId) {
      return { success: false, energyChange: 0, message: 'Missing object ID for pose' };
    }

    const obj = this.domain.objects.get(move.objectId);
    if (!obj) {
      return { success: false, energyChange: 0, message: 'Object not found' };
    }

    // Store previous state
    move.previousState = {
      position: obj.position.clone(),
      rotation: obj.rotation.clone(),
      scale: obj.scale.clone(),
    };

    // Apply new pose
    if (move.position) obj.position.copy(move.position);
    if (move.rotation) obj.rotation.copy(move.rotation);
    if (move.scale) obj.scale.copy(move.scale);

    return {
      success: true,
      energyChange: 0,
      message: `Updated pose of ${move.objectId}`,
    };
  }

  undo(move: Move): boolean {
    if (!move.objectId || !move.previousState) {
      return false;
    }

    const obj = this.domain.objects.get(move.objectId);
    if (!obj) return false;

    if (move.previousState.position) obj.position.copy(move.previousState.position);
    if (move.previousState.rotation) obj.rotation.copy(move.previousState.rotation);
    if (move.previousState.scale) obj.scale.copy(move.previousState.scale);

    return true;
  }
}

/**
 * AddMove: Add a new object to the scene
 */
export class AddMoveOperator {
  constructor(private domain: ConstraintDomain) {}

  execute(move: Move): MoveResult {
    if (!move.objectId || !move.position) {
      return { success: false, energyChange: 0, message: 'Missing object ID or position for add' };
    }

    // Create new object (simplified - in real implementation would load from asset library)
    const newObj = new Object3D();
    newObj.name = move.objectId;
    newObj.position.copy(move.position);
    
    if (move.rotation) newObj.rotation.copy(move.rotation);
    if (move.scale) newObj.scale.copy(move.scale);

    this.domain.objects.set(move.objectId, newObj);

    if (move.roomId) {
      const room = this.domain.rooms.get(move.roomId);
      if (room) {
        room.objects.add(move.objectId);
      }
    }

    return {
      success: true,
      energyChange: 0,
      message: `Added object ${move.objectId}`,
    };
  }

  undo(move: Move): boolean {
    if (!move.objectId) return false;

    const obj = this.domain.objects.get(move.objectId);
    if (!obj) return false;

    // Remove from room
    if (move.roomId) {
      const room = this.domain.rooms.get(move.roomId);
      if (room) {
        room.objects.delete(move.objectId);
      }
    }

    // Remove from domain
    this.domain.objects.delete(move.objectId);

    return true;
  }
}

/**
 * DeleteMove: Remove an object from the scene
 */
export class DeleteMoveOperator {
  constructor(private domain: ConstraintDomain) {}

  execute(move: Move): MoveResult {
    if (!move.objectId) {
      return { success: false, energyChange: 0, message: 'Missing object ID for delete' };
    }

    const obj = this.domain.objects.get(move.objectId);
    if (!obj) {
      return { success: false, energyChange: 0, message: 'Object not found' };
    }

    // Store previous state for undo
    move.previousState = {
      position: obj.position.clone(),
      rotation: obj.rotation.clone(),
      scale: obj.scale.clone(),
    };

    // Find and store room membership
    for (const [roomId, room] of this.domain.rooms.entries()) {
      if (room.objects.has(move.objectId)) {
        move.previousState!.roomId = roomId;
        room.objects.delete(move.objectId);
        break;
      }
    }

    this.domain.objects.delete(move.objectId);

    return {
      success: true,
      energyChange: 0,
      message: `Deleted object ${move.objectId}`,
    };
  }

  undo(move: Move): boolean {
    if (!move.objectId || !move.previousState) {
      return false;
    }

    // Recreate object
    const newObj = new Object3D();
    newObj.name = move.objectId;
    if (move.previousState.position) newObj.position.copy(move.previousState.position);
    if (move.previousState.rotation) newObj.rotation.copy(move.previousState.rotation);
    if (move.previousState.scale) newObj.scale.copy(move.previousState.scale);

    this.domain.objects.set(move.objectId, newObj);

    // Restore room membership
    if (move.previousState.roomId) {
      const room = this.domain.rooms.get(move.previousState.roomId);
      if (room) {
        room.objects.add(move.objectId);
      }
    }

    return true;
  }
}

/**
 * ReassignMove: Move object from one room to another
 */
export class ReassignMoveOperator {
  constructor(private domain: ConstraintDomain) {}

  execute(move: Move): MoveResult {
    if (!move.objectId || !move.roomId) {
      return { success: false, energyChange: 0, message: 'Missing object ID or room ID for reassign' };
    }

    const obj = this.domain.objects.get(move.objectId);
    if (!obj) {
      return { success: false, energyChange: 0, message: 'Object not found' };
    }

    const targetRoom = this.domain.rooms.get(move.roomId);
    if (!targetRoom) {
      return { success: false, energyChange: 0, message: 'Target room not found' };
    }

    // Store previous room
    for (const [roomId, room] of this.domain.rooms.entries()) {
      if (room.objects.has(move.objectId)) {
        move.previousState = { roomId };
        room.objects.delete(move.objectId);
        break;
      }
    }

    // Add to new room
    targetRoom.objects.add(move.objectId);

    // Optionally move to room center
    const centerX = (targetRoom.bounds.min[0] + targetRoom.bounds.max[0]) / 2;
    const centerY = (targetRoom.bounds.min[1] + targetRoom.bounds.max[1]) / 2;
    const centerZ = (targetRoom.bounds.min[2] + targetRoom.bounds.max[2]) / 2;
    obj.position.set(centerX, centerY, centerZ);

    return {
      success: true,
      energyChange: 0,
      message: `Reassigned ${move.objectId} to room ${move.roomId}`,
    };
  }

  undo(move: Move): boolean {
    if (!move.objectId || !move.previousState?.roomId) {
      return false;
    }

    const obj = this.domain.objects.get(move.objectId);
    if (!obj) return false;

    // Remove from current room
    for (const [roomId, room] of this.domain.rooms.entries()) {
      if (room.objects.has(move.objectId)) {
        room.objects.delete(move.objectId);
        break;
      }
    }

    // Restore to previous room
    const previousRoom = this.domain.rooms.get(move.previousState.roomId!);
    if (previousRoom) {
      previousRoom.objects.add(move.objectId);
    }

    return true;
  }
}

/**
 * MoveOperatorFactory: Creates appropriate move operators
 */
export class MoveOperatorFactory {
  private operators: Map<MoveType, any>;

  constructor(domain: ConstraintDomain) {
    this.operators = new Map([
      [MoveType.SWAP, new SwapMoveOperator(domain)],
      [MoveType.POSE, new PoseMoveOperator(domain)],
      [MoveType.ADD, new AddMoveOperator(domain)],
      [MoveType.DELETE, new DeleteMoveOperator(domain)],
      [MoveType.REASSIGN, new ReassignMoveOperator(domain)],
    ]);
  }

  getOperator(type: MoveType): any {
    return this.operators.get(type);
  }

  executeMove(move: Move): MoveResult {
    const operator = this.getOperator(move.type);
    if (!operator) {
      return { success: false, energyChange: 0, message: `Unknown move type: ${move.type}` };
    }
    return operator.execute(move);
  }

  undoMove(move: Move): boolean {
    const operator = this.getOperator(move.type);
    if (!operator) return false;
    return operator.undo(move);
  }
}
