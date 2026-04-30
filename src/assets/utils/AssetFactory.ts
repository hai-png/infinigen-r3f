import * as THREE from 'three';
import { SeededRandom } from '../../core/util/math/index';

export interface AssetConfig {
  seed?: number;
  [key: string]: any;
}

export interface AssetParameters extends AssetConfig {
  [key: string]: any;
}

export abstract class AssetFactory<TConfig = AssetConfig, TResult = THREE.Object3D> {
  protected seed: number;
  protected rng: SeededRandom;
  
  constructor(seed?: number) {
    this.seed = seed ?? Math.random() * 10000;
    this.rng = new SeededRandom(this.seed);
  }

  abstract getDefaultConfig(): TConfig;
  abstract generate(config?: Partial<TConfig>): TResult;
}
