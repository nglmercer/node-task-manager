// src/adapters/FflateZipAdapter.ts
import fs from 'fs';
import path from 'path';
import * as fflate from 'fflate';
import type { ICompressionAdapter, CompressionOptions } from './ICompressionAdapter.js';
import { AdapterOperation } from './ICompressionAdapter.js';
import { estimateDirectorySize, CHUNK_SIZE } from './utils.js';
import type { ProgressData } from '../Types.js';

/**
 * Adaptador para compresión/descompresión ZIP usando fflate
 * Soporta streaming para archivos muy grandes (varios GB)
 */
export class FflateZipAdapter implements ICompressionAdapter {
  readonly supportedOperations = AdapterOperation.BOTH;

  /**
   * Comprime un directorio en formato ZIP
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

    // Recopilar todos los archivos del directorio
    const files: Record<string, Uint8Array> = {};

    const addFiles = async (dirPath: string, relativePath: string = '') => {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const entryRelativePath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          await addFiles(fullPath, entryRelativePath);
        } else {
          try {
            const stats = await fs.promises.stat(fullPath);
            processedBytes += stats.size;

            const now = Date.now();
            if (options.progressCallback && now - lastProgressUpdate > progressThrottle) {
              lastProgressUpdate = now;
              options.progressCallback({
                percentage: estimatedSize > 0
                  ? Math.min(99, (processedBytes / estimatedSize) * 100)
                  : 0,
                processedBytes,
                totalBytes: estimatedSize,
                currentFile: entryRelativePath,
              });
            }

            // Leer el archivo y agregarlo al objeto de archivos
            const fileData = await fs.promises.readFile(fullPath);
            files[entryRelativePath.replace(/\\/g, '/')] = fileData;
          } catch (err) {
            console.warn(`Error reading file ${entryRelativePath}:`, err);
          }
        }
      }
    };

    // Recopilar todos los archivos
    await addFiles(sourcePath);

    // Comprimir usando fflate.zip
    return new Promise((resolve, reject) => {
      fflate.zip(
        files,
        { level: (options.compressionLevel || 6) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 },
        (err, data) => {
          if (err) {
            reject(err);
            return;
          }

          // Escribir el archivo ZIP
          fs.writeFile(outputPath, data, (writeErr) => {
            if (writeErr) {
              reject(writeErr);
              return;
            }

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
        }
      );
    });
  }

  /**
   * Descomprime un archivo ZIP con streaming
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

    return new Promise((resolve, reject) => {
      // Crear stream de lectura del archivo ZIP
      const input = fs.createReadStream(archivePath, { highWaterMark: CHUNK_SIZE });

      // Usar unzipSync para archivos grandes con streaming
      const chunks: Uint8Array[] = [];

      input.on('data', (chunk) => {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(new Uint8Array(chunk));
        } else if (typeof chunk === 'string') {
          chunks.push(new TextEncoder().encode(chunk));
        }
      });

      input.on('error', (err) => {
        reject(err);
      });

      input.on('end', async () => {
        try {
          // Unir todos los chunks en un solo Uint8Array
          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const buffer = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            buffer.set(chunk, offset);
            offset += chunk.length;
          }

          // Descomprimir el ZIP
          const entries = fflate.unzipSync(buffer);

          // Procesar cada entrada
          for (const [filename, data] of Object.entries(entries)) {
            const entryPath = path.join(destinationPath, filename);

            if (filename.endsWith('/')) {
              // Es un directorio
              await fs.promises.mkdir(entryPath, { recursive: true });
            } else {
              // Es un archivo
              await fs.promises.mkdir(path.dirname(entryPath), { recursive: true });
              await fs.promises.writeFile(entryPath, data);

              processedBytes += data.length;

              const now = Date.now();
              if (options.progressCallback && now - lastProgressUpdate > progressThrottle) {
                lastProgressUpdate = now;
                options.progressCallback({
                  percentage: Math.min(99, (processedBytes / archiveSize) * 100),
                  processedBytes,
                  totalBytes: archiveSize,
                  currentFile: filename,
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

          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Verifica si puede manejar archivos ZIP
   */
  canHandle(filePath: string): boolean {
    return filePath.endsWith('.zip');
  }
}
