// src/adapters/utils.ts
import fs from 'fs';
import path from 'path';

/**
 * Configuración para archivos grandes
 */
export const CHUNK_SIZE = 64 * 1024;
export const HIGH_WATER_MARK = 256 * 1024;
export const MAX_CONCURRENT_FILES = 5;

/**
 * Estima el tamaño de un directorio
 */
export async function estimateDirectorySize(
  directoryPath: string,
  maxDepth: number = 3
): Promise<number> {
  let totalSize = 0;
  const queue: Array<{ path: string; depth: number }> = [
    { path: directoryPath, depth: 0 }
  ];
  let hasError = false;
  let firstError: Error | null = null;

  try {
    await fs.promises.access(directoryPath);
    const stat = await fs.promises.stat(directoryPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${directoryPath}`);
    }
  } catch (err) {
    throw new Error(`Cannot access source directory: ${directoryPath}`);
  }

  while (queue.length > 0) {
    const { path: currentPath, depth } = queue.shift()!;

    try {
      const entries = await fs.promises.readdir(currentPath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory() && depth < maxDepth) {
          queue.push({ path: fullPath, depth: depth + 1 });
        } else if (entry.isFile()) {
          const stat = await fs.promises.stat(fullPath);
          totalSize += stat.size;
        }
      }
    } catch (err) {
      if (currentPath !== directoryPath) {
        console.warn(`Error reading ${currentPath}:`, err);
      } else {
        hasError = true;
        firstError = err as Error;
      }
    }
  }

  if (hasError && firstError) {
    throw firstError;
  }

  return totalSize;
}

/**
 * Detecta el tipo de archivo leyendo los magic bytes
 */
export async function detectFileType(
  filePath: string
): Promise<'zip' | 'gzip' | 'tar' | 'unknown'> {
  const fd = await fs.promises.open(filePath, 'r');
  const buffer = Buffer.alloc(10);

  try {
    await fd.read(buffer, 0, 10, 0);

    // ZIP: 0x50 0x4B (PK)
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      return 'zip';
    }

    // GZIP: 0x1F 0x8B
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return 'gzip';
    }

    // TAR: busca la firma 'ustar' en la posición 257
    const tarBuffer = Buffer.alloc(262);
    await fd.read(tarBuffer, 0, 262, 0);
    const ustarSignature = tarBuffer.slice(257, 262).toString('ascii');
    if (ustarSignature === 'ustar') {
      return 'tar';
    }

    return 'unknown';
  } finally {
    await fd.close();
  }
}

/**
 * Verifica si un archivo es ZIP por extensión o magic bytes
 */
export async function isZipFile(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.zip') return true;

  try {
    const type = await detectFileType(filePath);
    return type === 'zip';
  } catch {
    return false;
  }
}

/**
 * Verifica si un archivo es TAR por extensión o magic bytes
 */
export async function isTarFile(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.tar' || filePath.endsWith('.tar.gz')) return true;

  try {
    const type = await detectFileType(filePath);
    return type === 'tar' || type === 'gzip';
  } catch {
    return false;
  }
}
