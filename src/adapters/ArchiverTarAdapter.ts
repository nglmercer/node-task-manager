// src/adapters/ArchiverTarAdapter.ts
import fs from 'fs';
import archiver from 'archiver';
import type { ICompressionAdapter, CompressionOptions } from './ICompressionAdapter.js';
import { AdapterOperation } from './ICompressionAdapter.js';
import { estimateDirectorySize, CHUNK_SIZE, HIGH_WATER_MARK } from './utils.js';

/**
 * Adaptador para compresión TAR usando archiver
 */
export class ArchiverTarAdapter implements ICompressionAdapter {
  readonly supportedOperations = AdapterOperation.COMPRESS;
  /**
   * Comprime un directorio en formato TAR
   */
  async compress(
    sourcePath: string,
    outputPath: string,
    options: CompressionOptions = {}
  ): Promise<void> {
    const estimatedSize = await estimateDirectorySize(sourcePath);
    let processedBytes = 0;
    let currentFileName: string | undefined;

    const output = fs.createWriteStream(outputPath, {
      highWaterMark: HIGH_WATER_MARK,
    });

    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: {
        level: options.compressionLevel || 6,
        memLevel: 8,
        chunkSize: CHUNK_SIZE,
      },
      statConcurrency: 5,
      highWaterMark: HIGH_WATER_MARK,
    });

    return new Promise((resolve, reject) => {
      let lastProgressUpdate = Date.now();
      const progressThrottle = 100;

      archive.on('entry', (entryData: any) => {
        currentFileName = entryData.name || entryData.sourcePath;

        if (entryData.stats?.size) {
          processedBytes += entryData.stats.size;
        }

        const now = Date.now();
        if (options.progressCallback && now - lastProgressUpdate > progressThrottle) {
          lastProgressUpdate = now;
          options.progressCallback({
            percentage:
              estimatedSize > 0
                ? Math.min(99, (processedBytes / estimatedSize) * 100)
                : 0,
            processedBytes,
            totalBytes: estimatedSize,
            currentFile: currentFileName,
          });
        }
      });

      archive.on('warning', (err) => {
        if (err.code !== 'ENOENT') {
          console.warn('Archiver warning:', err);
        }
      });

      archive.on('error', (err) => {
        output.destroy();
        reject(err);
      });

      output.on('close', () => {
        if (options.progressCallback) {
          options.progressCallback({
            percentage: 100,
            processedBytes: estimatedSize,
            totalBytes: estimatedSize,
            currentFile: 'Completado',
          });
        }
        resolve();
      });

      output.on('error', (err) => {
        archive.destroy();
        reject(err);
      });

      archive.pipe(output);
      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }

  /**
   * Descomprime un archivo TAR
   * Nota: Este adaptador solo soporta compresión. Para descompresión TAR,
   * usa TarStreamAdapter.
   */
  async decompress(
    archivePath: string,
    destinationPath: string,
    options: CompressionOptions = {}
  ): Promise<void> {
    throw new Error(
      'ArchiverTarAdapter does not support decompression. ' +
      'Use TarStreamAdapter for TAR decompression.'
    );
  }

  /**
   * Verifica si puede manejar archivos TAR
   */
  canHandle(filePath: string): boolean {
    return filePath.endsWith('.tar') || filePath.endsWith('.tar.gz');
  }
}
