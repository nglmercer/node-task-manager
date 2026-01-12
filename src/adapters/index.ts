// src/adapters/index.ts
export type { ICompressionAdapter, CompressionOptions, FileTypeDetection } from './ICompressionAdapter.js';
export { CompressionAdapterFactory, getDefaultFactory, resetDefaultFactory, AdapterOperation } from './CompressionAdapterFactory.js';

// Adaptadores con fflate y tar (ligeros y con streaming)
export { FflateZipAdapter } from './FflateZipAdapter.js';
export { TarAdapter } from './TarAdapter.js';

export { CHUNK_SIZE, HIGH_WATER_MARK, MAX_CONCURRENT_FILES, estimateDirectorySize, detectFileType, isZipFile, isTarFile } from './utils.js';
