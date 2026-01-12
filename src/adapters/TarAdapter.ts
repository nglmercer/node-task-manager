// src/adapters/TarAdapter.ts
import fs from 'fs';
import path from 'path';
import tar from 'tar';
import zlib from 'zlib';
import type { ICompressionAdapter, CompressionOptions } from './ICompressionAdapter.js';
import { AdapterOperation } from './ICompressionAdapter.js';
import { estimateDirectorySize, CHUNK_SIZE } from './utils.js';
import type { ProgressData } from '../Types.js';

/**
 * Adaptador para compresión/descompresión TAR usando la librería tar
 * Soporta streaming para archivos muy grandes (varios GB)
 */
export class TarAdapter implements ICompressionAdapter {
  readonly supportedOperations = AdapterOperation.BOTH;

  /**
   * Comprime un directorio en formato TAR.GZ con streaming
   */
  async compress(
    sourcePath: string,
    outputPath: string,
    options: CompressionOptions = {}
  ): Promise<void> {
    const estimatedSize = await estimateDirectorySize(sourcePath);
    const files = await fs.promises.readdir(sourcePath);
    let processedBytes = 0;
    let lastProgressUpdate = Date.now();
    const progressThrottle = 100;

    // Usar el método tar.c con gzip: true para crear el archivo comprimido
    await tar.c({
      gzip: true,
      file: outputPath,
      cwd: sourcePath,
      portable: true,
      mode: 0o644,
    }, files);

    if (options.progressCallback) {
      options.progressCallback({
        percentage: 100,
        processedBytes: estimatedSize,
        totalBytes: estimatedSize,
        currentFile: 'Completado',
      });
    }
  }

  /**
   * Descomprime un archivo TAR.GZ con streaming
   */
  async decompress(
    archivePath: string,
    destinationPath: string,
    options: CompressionOptions = {}
  ): Promise<void> {
    const archiveSize = (await fs.promises.stat(archivePath)).size;
    let processedBytes = 0;
    let lastProgressUpdate = Date.now();
    const progressThrottle = 100;

    // Asegurar que el directorio de destino existe
    await fs.promises.mkdir(destinationPath, { recursive: true });

    // Usar el método de streaming con pipeline para asegurar escritura completa
    const input = fs.createReadStream(archivePath, { highWaterMark: CHUNK_SIZE });
    const gunzip = zlib.createGunzip({ chunkSize: CHUNK_SIZE });
    const extract = tar.extract({
      cwd: destinationPath,
      strip: 0,
      strict: false,
    });

    // Manejar progreso durante la descompresión
    extract.on('entry', (entry: any) => {
      if (entry.size) {
        processedBytes += entry.size;

        const now = Date.now();
        if (options.progressCallback && now - lastProgressUpdate > progressThrottle) {
          lastProgressUpdate = now;
          options.progressCallback({
            percentage: Math.min(99, (processedBytes / archiveSize) * 100),
            processedBytes,
            totalBytes: archiveSize,
            currentFile: entry.path,
          });
        }
      }
    });

    // Esperar a que todos los streams se completen
    await new Promise<void>((resolve, reject) => {
      input.on('error', reject);
      gunzip.on('error', reject);
      extract.on('error', reject);
      
      // Esperar a que el stream de extract se complete (no el de entrada)
      extract.on('end', () => {
        if (options.progressCallback) {
          options.progressCallback({
            percentage: 100,
            processedBytes: archiveSize,
            totalBytes: archiveSize,
            currentFile: 'Completado',
          });
        }
        resolve();
      });

      input.pipe(gunzip).pipe(extract);
    });
  }

  /**
   * Verifica si puede manejar archivos TAR
   */
  canHandle(filePath: string): boolean {
    return filePath.endsWith('.tar') || filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz');
  }
}
