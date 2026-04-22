/**
 * AOV (Arbitrary Output Variable) System for Infinigen R3F
 * 
 * Implements an AOV management system for handling multiple render outputs
 * with different formats, compression, and storage options.
 * 
 * Based on Blender's AOV system and Infinigen's render pass architecture.
 * 
 * @module render
 */

import {
  WebGLRenderTarget,
  DataTexture,
  Texture,
  FloatType,
  UnsignedByteType,
  RGBAFormat,
  RGBFormat,
  RedFormat,
  PixelFormat,
} from 'three';

/**
 * AOV data types matching common render output formats
 */
export enum AOVDataType {
  /** 8-bit unsigned integer per channel */
  UINT8 = 'uint8',
  /** 16-bit float per channel */
  FLOAT16 = 'float16',
  /** 32-bit float per channel */
  FLOAT32 = 'float32',
  /** Integer ID encoded as float */
  INT_ID = 'int_id',
}

/**
 * AOV channel configurations
 */
export enum AOVChannelConfig {
  /** Single channel (grayscale/depth/ID) */
  SINGLE = 'single',
  /** Three channels (RGB) */
  RGB = 'rgb',
  /** Four channels (RGBA) */
  RGBA = 'rgba',
  /** Two channels (UV/flow) */
  DUAL = 'dual',
}

/**
 * AOV metadata for tracking render outputs
 */
export interface AOVMetadata {
  /** Unique identifier for this AOV */
  id: string;
  /** Human-readable name */
  name: string;
  /** Data type */
  dataType: AOVDataType;
  /** Channel configuration */
  channels: AOVChannelConfig;
  /** Description of what this AOV contains */
  description?: string;
  /** Whether this AOV is currently active */
  enabled: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last modification timestamp */
  modifiedAt: number;
  /** Custom user metadata */
  custom?: Record<string, any>;
}

/**
 * Complete AOV descriptor including render target
 */
export interface AOVDescriptor extends AOVMetadata {
  /** Render target containing the AOV data */
  renderTarget: WebGLRenderTarget;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Bytes per pixel */
  bytesPerPixel: number;
  /** Total size in bytes */
  totalSizeBytes: number;
}

/**
 * Configuration for creating a new AOV
 */
export interface AOVConfig {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Data type (default: FLOAT32) */
  dataType?: AOVDataType;
  /** Channel config (default: RGBA) */
  channels?: AOVChannelConfig;
  /** Description */
  description?: string;
  /** Initially enabled (default: true) */
  enabled?: boolean;
  /** Custom metadata */
  custom?: Record<string, any>;
  /** Minimum filter mode */
  minFilter?: number;
  /** Magnification filter mode */
  magFilter?: number;
  /** Wrap S mode */
  wrapS?: number;
  /** Wrap T mode */
  wrapT?: number;
}

/**
 * AOV System - Manages arbitrary output variables for multi-pass rendering
 */
export class AOVSystem {
  /** Registered AOVs indexed by ID */
  private aovs: Map<string, AOVDescriptor>;
  
  /** Default width for new AOVs */
  private defaultWidth: number;
  
  /** Default height for new AOVs */
  private defaultHeight: number;
  
  /** Memory budget in MB (0 = unlimited) */
  private memoryBudgetMB: number;
  
  /** Current memory usage in bytes */
  private currentMemoryUsage: number;

  constructor(
    defaultWidth: number = 1920,
    defaultHeight: number = 1080,
    memoryBudgetMB: number = 512
  ) {
    this.aovs = new Map();
    this.defaultWidth = defaultWidth;
    this.defaultHeight = defaultHeight;
    this.memoryBudgetMB = memoryBudgetMB * 1024 * 1024;
    this.currentMemoryUsage = 0;
  }

  /**
   * Register a new AOV
   */
  register(config: AOVConfig): AOVDescriptor {
    if (this.aovs.has(config.id)) {
      throw new Error(`AOV with ID '${config.id}' already exists`);
    }

    const dataType = config.dataType ?? AOVDataType.FLOAT32;
    const channels = config.channels ?? AOVChannelConfig.RGBA;
    
    // Determine Three.js format and type
    const { format, type, bytesPerChannel } = this.getFormatAndType(dataType, channels);
    
    // Calculate channel count
    const channelCount = this.getChannelCount(channels);
    
    // Create render target
    const renderTarget = new WebGLRenderTarget(
      this.defaultWidth,
      this.defaultHeight,
      {
        format,
        type,
        minFilter: config.minFilter ?? 1003, // NearestFilter
        magFilter: config.magFilter ?? 1003,
        wrapS: config.wrapS ?? 1000, // ClampToEdgeWrapping
        wrapT: config.wrapT ?? 1000,
        depthBuffer: false,
        stencilBuffer: false,
      }
    );

    // Calculate memory usage
    const bytesPerPixel = bytesPerChannel * channelCount;
    const totalSizeBytes = this.defaultWidth * this.defaultHeight * bytesPerPixel;
    
    // Check memory budget
    if (this.memoryBudgetMB > 0 && 
        this.currentMemoryUsage + totalSizeBytes > this.memoryBudgetMB) {
      renderTarget.dispose();
      throw new Error(
        `Memory budget exceeded. Required: ${this.formatBytes(totalSizeBytes)}, ` +
        `Available: ${this.formatBytes(this.memoryBudgetMB - this.currentMemoryUsage)}`
      );
    }

    const now = Date.now();
    const descriptor: AOVDescriptor = {
      id: config.id,
      name: config.name,
      dataType,
      channels,
      description: config.description,
      enabled: config.enabled ?? true,
      createdAt: now,
      modifiedAt: now,
      custom: config.custom,
      renderTarget,
      width: this.defaultWidth,
      height: this.defaultHeight,
      bytesPerPixel,
      totalSizeBytes,
    };

    this.aovs.set(config.id, descriptor);
    this.currentMemoryUsage += totalSizeBytes;

    return descriptor;
  }

  /**
   * Get an AOV by ID
   */
  get(id: string): AOVDescriptor | undefined {
    return this.aovs.get(id);
  }

  /**
   * Get all registered AOVs
   */
  getAll(): AOVDescriptor[] {
    return Array.from(this.aovs.values());
  }

  /**
   * Get only enabled AOVs
   */
  getEnabled(): AOVDescriptor[] {
    return Array.from(this.aovs.values()).filter(aov => aov.enabled);
  }

  /**
   * Enable or disable an AOV
   */
  setEnabled(id: string, enabled: boolean): void {
    const aov = this.aovs.get(id);
    if (!aov) {
      throw new Error(`AOV with ID '${id}' not found`);
    }
    
    aov.enabled = enabled;
    aov.modifiedAt = Date.now();
  }

  /**
   * Update AOV custom metadata
   */
  updateMetadata(id: string, metadata: Partial<AOVMetadata>): void {
    const aov = this.aovs.get(id);
    if (!aov) {
      throw new Error(`AOV with ID '${id}' not found`);
    }
    
    Object.assign(aov, metadata);
    aov.modifiedAt = Date.now();
  }

  /**
   * Remove an AOV and free its resources
   */
  unregister(id: string): boolean {
    const aov = this.aovs.get(id);
    if (!aov) {
      return false;
    }
    
    aov.renderTarget.dispose();
    this.currentMemoryUsage -= aov.totalSizeBytes;
    this.aovs.delete(id);
    
    return true;
  }

  /**
   * Remove all AOVs and free all resources
   */
  clear(): void {
    this.aovs.forEach(aov => {
      aov.renderTarget.dispose();
    });
    this.aovs.clear();
    this.currentMemoryUsage = 0;
  }

  /**
   * Resize all AOVs to new dimensions
   */
  resize(width: number, height: number): void {
    const oldWidth = this.defaultWidth;
    const oldHeight = this.defaultHeight;
    
    this.defaultWidth = width;
    this.defaultHeight = height;
    
    // Recreate all AOVs at new size
    const existingAOVs = Array.from(this.aovs.entries());
    this.currentMemoryUsage = 0;
    
    for (const [id, oldAov] of existingAOVs) {
      // Store config
      const config: AOVConfig = {
        id: oldAov.id,
        name: oldAov.name,
        dataType: oldAov.dataType,
        channels: oldAov.channels,
        description: oldAov.description,
        enabled: oldAov.enabled,
        custom: oldAov.custom,
      };
      
      // Dispose old render target
      oldAov.renderTarget.dispose();
      
      // Recreate
      const newAov = this.register(config);
      this.aovs.set(id, newAov);
    }
  }

  /**
   * Get total memory usage in bytes
   */
  getMemoryUsage(): number {
    return this.currentMemoryUsage;
  }

  /**
   * Get total memory usage formatted as human-readable string
   */
  getMemoryUsageFormatted(): string {
    return this.formatBytes(this.currentMemoryUsage);
  }

  /**
   * Export AOV data to typed array
   */
  exportData(id: string): Float32Array | Uint8Array | null {
    const aov = this.aovs.get(id);
    if (!aov) {
      return null;
    }

    const gl = (aov.renderTarget as any).__gl;
    if (!gl) {
      console.warn('AOV render target not bound to WebGL context');
      return null;
    }

    const { width, height } = aov;
    const isFloat = aov.dataType === AOVDataType.FLOAT32 || 
                    aov.dataType === AOVDataType.FLOAT16;
    
    const data = isFloat
      ? new Float32Array(width * height * 4)
      : new Uint8Array(width * height * 4);

    // Save current framebuffer
    const currentFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    
    // Read pixels
    gl.bindFramebuffer(gl.FRAMEBUFFER, aov.renderTarget.framebuffer);
    gl.readPixels(
      0, 0, width, height,
      gl.RGBA,
      isFloat ? gl.FLOAT : gl.UNSIGNED_BYTE,
      data
    );
    
    // Restore framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, currentFramebuffer);
    
    return data;
  }

  /**
   * Create standard AOV set for typical rendering workflow
   */
  createStandardSet(): string[] {
    const standardAOVs: AOVConfig[] = [
      {
        id: 'beauty',
        name: 'Beauty Pass',
        dataType: AOVDataType.UINT8,
        channels: AOVChannelConfig.RGBA,
        description: 'Final composited beauty render',
      },
      {
        id: 'depth',
        name: 'Depth Pass',
        dataType: AOVDataType.FLOAT32,
        channels: AOVChannelConfig.SINGLE,
        description: 'Camera-space depth in meters',
      },
      {
        id: 'normal',
        name: 'Normal Pass',
        dataType: AOVDataType.FLOAT16,
        channels: AOVChannelConfig.RGB,
        description: 'World-space surface normals',
      },
      {
        id: 'albedo',
        name: 'Albedo Pass',
        dataType: AOVDataType.UINT8,
        channels: AOVChannelConfig.RGBA,
        description: 'Base color without lighting',
      },
      {
        id: 'instance_id',
        name: 'Instance ID Pass',
        dataType: AOVDataType.INT_ID,
        channels: AOVChannelConfig.SINGLE,
        description: 'Unique instance identifiers for segmentation',
      },
      {
        id: 'material_id',
        name: 'Material ID Pass',
        dataType: AOVDataType.INT_ID,
        channels: AOVChannelConfig.SINGLE,
        description: 'Material identifiers for segmentation',
      },
      {
        id: 'roughness',
        name: 'Roughness Pass',
        dataType: AOVDataType.UINT8,
        channels: AOVChannelConfig.SINGLE,
        description: 'Surface roughness values',
      },
      {
        id: 'metalness',
        name: 'Metalness Pass',
        dataType: AOVDataType.UINT8,
        channels: AOVChannelConfig.SINGLE,
        description: 'Surface metalness values',
      },
      {
        id: 'emission',
        name: 'Emission Pass',
        dataType: AOVDataType.FLOAT16,
        channels: AOVChannelConfig.RGB,
        description: 'Emissive light contribution',
      },
      {
        id: 'position',
        name: 'Position Pass',
        dataType: AOVDataType.FLOAT32,
        channels: AOVChannelConfig.RGB,
        description: 'World-space positions',
      },
    ];

    const createdIds: string[] = [];
    
    for (const config of standardAOVs) {
      try {
        this.register(config);
        createdIds.push(config.id);
      } catch (error) {
        console.warn(`Failed to create standard AOV '${config.id}':`, error);
      }
    }
    
    return createdIds;
  }

  /**
   * Serialize AOV system state to JSON
   */
  toJSON(): any {
    return {
      defaultWidth: this.defaultWidth,
      defaultHeight: this.defaultHeight,
      memoryBudgetMB: this.memoryBudgetMB / (1024 * 1024),
      currentMemoryUsage: this.currentMemoryUsage,
      aovs: Array.from(this.aovs.values()).map(aov => ({
        id: aov.id,
        name: aov.name,
        dataType: aov.dataType,
        channels: aov.channels,
        description: aov.description,
        enabled: aov.enabled,
        createdAt: aov.createdAt,
        modifiedAt: aov.modifiedAt,
        custom: aov.custom,
        width: aov.width,
        height: aov.height,
        bytesPerPixel: aov.bytesPerPixel,
        totalSizeBytes: aov.totalSizeBytes,
      })),
    };
  }

  /**
   * Deserialize AOV system state from JSON
   */
  fromJSON(json: any): void {
    this.clear();
    
    this.defaultWidth = json.defaultWidth ?? 1920;
    this.defaultHeight = json.defaultHeight ?? 1080;
    this.memoryBudgetMB = (json.memoryBudgetMB ?? 512) * 1024 * 1024;
    
    if (Array.isArray(json.aovs)) {
      for (const aovData of json.aovs) {
        try {
          this.register({
            id: aovData.id,
            name: aovData.name,
            dataType: aovData.dataType,
            channels: aovData.channels,
            description: aovData.description,
            enabled: aovData.enabled,
            custom: aovData.custom,
          });
        } catch (error) {
          console.warn(`Failed to restore AOV '${aovData.id}':`, error);
        }
      }
    }
  }

  /**
   * Helper: Get Three.js format and type from AOV data type
   */
  private getFormatAndType(
    dataType: AOVDataType,
    channels: AOVChannelConfig
  ): { format: PixelFormat; type: number; bytesPerChannel: number } {
    let format: PixelFormat;
    let type: number;
    let bytesPerChannel: number;

    switch (dataType) {
      case AOVDataType.FLOAT32:
        type = FloatType;
        bytesPerChannel = 4;
        break;
      case AOVDataType.FLOAT16:
        type = FloatType; // Use HalfFloatType if available
        bytesPerChannel = 2;
        break;
      case AOVDataType.UINT8:
      case AOVDataType.INT_ID:
      default:
        type = UnsignedByteType;
        bytesPerChannel = 1;
        break;
    }

    switch (channels) {
      case AOVChannelConfig.SINGLE:
        format = RedFormat;
        break;
      case AOVChannelConfig.DUAL:
        format = RGFormat as PixelFormat; // May need extension
        break;
      case AOVChannelConfig.RGB:
        format = RGBFormat;
        break;
      case AOVChannelConfig.RGBA:
      default:
        format = RGBAFormat;
        break;
    }

    return { format, type, bytesPerChannel };
  }

  /**
   * Helper: Get channel count from channel config
   */
  private getChannelCount(channels: AOVChannelConfig): number {
    switch (channels) {
      case AOVChannelConfig.SINGLE:
        return 1;
      case AOVChannelConfig.DUAL:
        return 2;
      case AOVChannelConfig.RGB:
        return 3;
      case AOVChannelConfig.RGBA:
      default:
        return 4;
    }
  }

  /**
   * Helper: Format bytes as human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Add missing RGFormat to PixelFormat type
declare module 'three' {
  const RGFormat: PixelFormat;
}

export default AOVSystem;
