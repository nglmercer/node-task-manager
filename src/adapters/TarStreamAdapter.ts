// src/adapters/TarStreamAdapter.ts
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import tar from 'tar-stream';
import { pipeline } from 'stream/promises';
import type { ICompressionAdapter, CompressionOptions } from './ICompressionAdapter.js';
import { AdapterOperation } from './ICompressionAdapter.js';
import { isTarFile, CHUNK_SIZE, HIGH_WATER_MARK, MAX_CONCURRENT_FILES } from './utils.js';

/**
 * Adaptador para descompresión TAR usando tar-stream
 */
export class TarStreamAdapter implements ICompressionAdapter {
  readonly supportedOperations = AdapterOperation.DECOMPRESS;
  /**
   * Comprime un directorio en formato TAR
   * Nota: Este adaptador solo soporta descompresión. Para compresión TAR,
   * usa ArchiverTarAdapter.
   */
  async compress(
    sourcePath: string,
    outputPath: string,
    options: CompressionOptions = {}
  ): Promise<void> {
    throw new Error(
      'TarStreamAdapter does not support compression. ' +
      'Use ArchiverTarAdapter for TAR compression.'
    );
  }

  /**
   * Descomprime un archivo TAR
   */
  async decompress(
    archivePath: string,
    destinationPath: string,
    options: CompressionOptions = {}
  ): Promise<void> {
    const archiveSize = (await fs.promises.stat(archivePath)).size;
    let processedBytes = 0;
    let lastProgressUpdate = Date.now();

    await fs.promises.mkdir(destinationPath, { recursive: true });

    const readStream = fs.createReadStream(archivePath, {
      highWaterMark: HIGH_WATER_MARK,
    });

    const gunzip = zlib.createGunzip({
      chunkSize: CHUNK_SIZE,
    });

    const extractor = tar.extract();

    return new Promise((resolve, reject) => {
      let isResolved = false;
      let activeWrites = 0;
      const maxConcurrentWrites = MAX_CONCURRENT_FILES;
      const pendingEntries: Array<() => void> = [];

      const safeResolve = () => {
        if (!isResolved && activeWrites === 0) {
          isResolved = true;
          resolve();
        }
      };

      const safeReject = (error: Error) => {
        if (!isResolved) {
          isResolved = true;
          readStream.destroy();
          gunzip.destroy();
          extractor.destroy();
          reject(error);
        }
      };

      const processNextEntry = () => {
        if (pendingEntries.length > 0 && activeWrites < maxConcurrentWrites) {
          const next = pendingEntries.shift();
          next?.();
        }
      };

      extractor.on('entry', (header, stream, next) => {
        const entryPath = path.join(destinationPath, header.name);

        const processEntry = async () => {
          activeWrites++;

          try {
            if (header.type === 'directory') {
              await fs.promises.mkdir(entryPath, { recursive: true });
              stream.resume();
            } else {
              await fs.promises.mkdir(path.dirname(entryPath), {
                recursive: true,
              });

              const writeStream = fs.createWriteStream(entryPath, {
                highWaterMark: HIGH_WATER_MARK,
              });

              await pipeline(stream, writeStream);

              // Restaurar permisos originales del archivo
              if (header.mode) {
                await fs.promises.chmod(entryPath, header.mode);
              }
            }

            processedBytes += header.size || 0;

            const now = Date.now();
            if (options.progressCallback && now - lastProgressUpdate > 100) {
              lastProgressUpdate = now;
              options.progressCallback({
                percentage: Math.min(99, (processedBytes / archiveSize) * 100),
                processedBytes,
                totalBytes: archiveSize,
                currentFile: header.name,
              });
            }
          } catch (err) {
            safeReject(err as Error);
          } finally {
            activeWrites--;
            next();
            processNextEntry();
          }
        };

        if (activeWrites < maxConcurrentWrites) {
          processEntry();
        } else {
          pendingEntries.push(processEntry);
        }
      });

      extractor.on('finish', () => {
        if (activeWrites === 0) {
          if (options.progressCallback) {
            options.progressCallback({
              percentage: 100,
              processedBytes: archiveSize,
              totalBytes: archiveSize,
              currentFile: 'Completado',
            });
          }
          safeResolve();
        }
      });

      extractor.on('error', safeReject);
      gunzip.on('error', safeReject);
      readStream.on('error', safeReject);

      readStream.pipe(gunzip).pipe(extractor);
    });
  }

  /**
   * Verifica si puede manejar archivos TAR
   */
  async canHandle(filePath: string): Promise<boolean> {
    return isTarFile(filePath);
  }
}
