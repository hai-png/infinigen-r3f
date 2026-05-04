/**
 * IO Module - Input/Output Utilities for Infinigen R3F
 * 
 * This module provides file I/O capabilities including:
 * - OpenEXR export for HDR images
 * - Multi-pass export support
 * - Metadata embedding
 * 
 * @module io
 */

export {
  EXRExporter,
  EXRCompression,
  EXRPixelType,
  type EXRChannel,
  type EXRChannelData,
  type EXRMetadata,
  type EXRExportConfig,
  EXR_PIXEL_TYPE_UINT,
  EXR_PIXEL_TYPE_HALF,
  EXR_PIXEL_TYPE_FLOAT,
  EXR_COMPRESSION_NONE,
  EXR_COMPRESSION_RLE,
  EXR_COMPRESSION_ZIPS,
  EXR_COMPRESSION_ZIP,
  EXR_COMPRESSION_PIZ,
  EXR_COMPRESSION_PXR24,
  EXR_COMPRESSION_B44,
  EXR_COMPRESSION_B44A,
  EXR_COMPRESSION_DWAA,
  EXR_COMPRESSION_DWAB,
  EXR_LINE_ORDER_INCREASING_Y,
  EXR_LINE_ORDER_DECREASING_Y,
  EXR_LINE_ORDER_RANDOM_Y,
  writeGroundTruthEXR,
  splitInterleavedChannel,
  undoReorderScanlineBytes,
} from './exr-exporter';
