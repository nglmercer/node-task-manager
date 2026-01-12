// src/adapters/YauzlZipAdapter.ts
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { ICompressionAdapter, CompressionOptions } from './ICompressionAdapter.js';
import { AdapterOperation } from './ICompressionAdapter.js';
import { isZipFile, CHUNK_SIZE, HIGH_WATER_MARK } from './utils.js';

/**
 * Adaptador para descompresión ZIP usando yauzl-promise
 */
export class YauzlZipAdapter implements ICompressionAdapter {
  readonly supportedOperations = AdapterOperation.DECOMPRESS;
  /**
   * Comprime un directorio en formato ZIP
   * Nota: Este adaptador solo soporta descompresión. Para compresión ZIP,
   * usa ArchiverZipAdapter.
   */
  async compress(
    sourcePath: string,
    outputPath: string,
    options: CompressionOptions = {}
  ): Promise<void> {
    throw new Error(
      'YauzlZipAdapter does not support compression. ' +
      'Use ArchiverZipAdapter for ZIP compression.'
    );
  }

  /**
   * Descomprime un archivo ZIP
   */
  async decompress(
    archivePath: string,
    destinationPath: string,
    options: CompressionOptions = {}
  ): Promise<string[]> {
    const yauzl = await import('yauzl-promise');
    const zipFile = await yauzl.open(archivePath);
    const extractedFiles: string[] = [];
    const archiveSize = (await fs.promises.stat(archivePath)).size;
    let processedBytes = 0;
    let lastProgressUpdate = Date.now();

    try {
      await fs.promises.mkdir(destinationPath, { recursive: true });

      for await (const entry of zipFile) {
        const entryPath = path.join(destinationPath, entry.filename);
        extractedFiles.push(entry.filename);

        if (entry.filename.endsWith('/')) {
          await fs.promises.mkdir(entryPath, { recursive: true });
        } else {
          await fs.promises.mkdir(path.dirname(entryPath), {
            recursive: true,
          });

          const readStream = await entry.openReadStream();
          const writeStream = fs.createWriteStream(entryPath, {
            highWaterMark: HIGH_WATER_MARK,
          });

          await pipeline(readStream, writeStream);

          // Restaurar permisos de ejecución para archivos ejecutables
          const externalAttrs = (entry as any).externalFileAttributes;
          if (externalAttrs) {
            const unixMode = (externalAttrs >>> 16) & 0xffff;
            if (unixMode) {
              await fs.promises.chmod(entryPath, unixMode);
            }
          }

          processedBytes += entry.uncompressedSize;

          const now = Date.now();
          if (options.progressCallback && now - lastProgressUpdate > 100) {
            lastProgressUpdate = now;
            options.progressCallback({
              percentage: Math.min(99, (processedBytes / archiveSize) * 100),
              processedBytes,
              totalBytes: archiveSize,
              currentFile: entry.filename,
            });
          }
        }
      }

      if (options.progressCallback) {
        options.progressCallback({
          percentage: 100,
          processedBytes: archiveSize,
          totalBytes: archiveSize,
          currentFile: 'Completado',
        });
      }

      return extractedFiles;
    } finally {
      await zipFile.close();
    }
  }

  /**
   * Verifica si puede manejar archivos ZIP
   */
  async canHandle(filePath: string): Promise<boolean> {
    return isZipFile(filePath);
  }
}
