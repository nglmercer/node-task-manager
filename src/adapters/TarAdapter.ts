// src/adapters/TarAdapter.ts
import fs from 'fs';
import path from 'path';
import tar from 'tar-stream';
import zlib from 'zlib';
import type { ICompressionAdapter, CompressionOptions } from './ICompressionAdapter.js';
import { AdapterOperation } from './ICompressionAdapter.js';
import { estimateDirectorySize, CHUNK_SIZE } from './utils.js';
import type { ProgressData } from '../Types.js';

/**
 * Adaptador para compresión/descompresión TAR usando la librería tar-stream
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
    let processedBytes = 0;
    let lastProgressUpdate = Date.now();
    const progressThrottle = 100;

    return new Promise<void>((resolve, reject) => {
      const pack = tar.pack();
      const gzip = zlib.createGzip();
      const output = fs.createWriteStream(outputPath);

      // Manejar errores
      pack.on('error', reject);
      gzip.on('error', reject);
      output.on('error', reject);
      output.on('finish', () => {
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

      // Función recursiva para agregar archivos al tar
      const addDirectory = async (dirPath: string, relativePath: string = '') => {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const entryRelativePath = path.join(relativePath, entry.name);

          if (entry.isDirectory()) {
            // Agregar directorio
            pack.entry({
              name: entryRelativePath + '/',
              type: 'directory',
              mode: 0o755,
            });

            await addDirectory(fullPath, entryRelativePath);
          } else if (entry.isFile()) {
            const stat = await fs.promises.stat(fullPath);

            // Agregar archivo
            const entryStream = fs.createReadStream(fullPath);
            const entry = pack.entry({
              name: entryRelativePath,
              size: stat.size,
              mode: 0o644,
              mtime: stat.mtime,
            }, (err) => {
              if (err) {
                reject(err);
                return;
              }
            });

            entryStream.on('error', reject);
            entry.on('error', reject);

            entryStream.pipe(entry);

            await new Promise<void>((resolveEntry, rejectEntry) => {
              entry.on('finish', resolveEntry);
              entry.on('error', rejectEntry);
            });

            processedBytes += stat.size;

            const now = Date.now();
            if (options.progressCallback && now - lastProgressUpdate > progressThrottle) {
              lastProgressUpdate = now;
              options.progressCallback({
                percentage: Math.min(99, (processedBytes / estimatedSize) * 100),
                processedBytes,
                totalBytes: estimatedSize,
                currentFile: entryRelativePath,
              });
            }
          }
        }
      };

      // Iniciar el proceso de compresión
      addDirectory(sourcePath)
        .then(() => {
          pack.finalize();
        })
        .catch(reject);

      // Conectar los streams
      pack.pipe(gzip).pipe(output);
    });
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

    return new Promise<void>((resolve, reject) => {
      const input = fs.createReadStream(archivePath, { highWaterMark: CHUNK_SIZE });
      const gunzip = zlib.createGunzip({ chunkSize: CHUNK_SIZE });
      const extract = tar.extract();

      input.on('error', reject);
      gunzip.on('error', reject);
      extract.on('error', reject);

      // Manejar cada entrada del tar
      extract.on('entry', (header, stream, next) => {
        const fullPath = path.join(destinationPath, header.name);

        // Actualizar progreso
        if (header.size) {
          processedBytes += header.size;

          const now = Date.now();
          if (options.progressCallback && now - lastProgressUpdate > progressThrottle) {
            lastProgressUpdate = now;
            options.progressCallback({
              percentage: Math.min(99, (processedBytes / archiveSize) * 100),
              processedBytes,
              totalBytes: archiveSize,
              currentFile: header.name,
            });
          }
        }

        if (header.type === 'directory') {
          // Crear directorio
          fs.promises.mkdir(fullPath, { recursive: true })
            .then(() => next())
            .catch(next);
        } else {
          // Crear directorio padre si no existe
          const parentDir = path.dirname(fullPath);
          fs.promises.mkdir(parentDir, { recursive: true })
            .then(() => {
              const output = fs.createWriteStream(fullPath, { mode: header.mode || 0o644 });
              output.on('error', next);
              output.on('finish', () => next());

              stream.on('error', next);
              stream.pipe(output);
            })
            .catch(next);
        }
      });

      // Cuando termine la extracción
      extract.on('finish', () => {
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

      // Conectar los streams
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
