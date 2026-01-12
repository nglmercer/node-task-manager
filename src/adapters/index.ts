// src/adapters/index.ts
export type { ICompressionAdapter, CompressionOptions, FileTypeDetection } from './ICompressionAdapter.js';
export { CompressionAdapterFactory, getDefaultFactory, resetDefaultFactory, AdapterOperation } from './CompressionAdapterFactory.js';
export { ArchiverZipAdapter } from './ArchiverZipAdapter.js';
export { ArchiverTarAdapter } from './ArchiverTarAdapter.js';
export { YauzlZipAdapter } from './YauzlZipAdapter.js';
export { TarStreamAdapter } from './TarStreamAdapter.js';
export { CHUNK_SIZE, HIGH_WATER_MARK, MAX_CONCURRENT_FILES, estimateDirectorySize, detectFileType, isZipFile, isTarFile } from './utils.js';
