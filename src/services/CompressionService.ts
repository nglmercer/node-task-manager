// src/services/CompressionService.ts
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import archiver from 'archiver';
import tar from 'tar-stream';
import { pipeline } from 'stream/promises';
import type { ProgressData } from '../Types.js';

// Configuración para archivos grandes
const CHUNK_SIZE = 64 * 1024; // 64KB chunks para lectura
const HIGH_WATER_MARK = 256 * 1024; // 256KB buffer máximo
const MAX_CONCURRENT_FILES = 5; // Límite de archivos simultáneos

interface ServiceOptions {
    progressCallback?: (data: ProgressData) => void;
    compressionLevel?: number;
    useZip?: boolean;
}

/**
 * Obtiene tamaño estimado sin cargar todo en memoria
 */
async function estimateDirectorySize(directoryPath: string, maxDepth: number = 3): Promise<number> {
    let totalSize = 0;
    const queue: Array<{ path: string; depth: number }> = [{ path: directoryPath, depth: 0 }];
    let hasError = false;
    let firstError: Error | null = null;
    
    // Verificar que el directorio raíz existe
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
            const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
            
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
            // Solo loguear errores en subdirectorios, no el raíz
            if (currentPath !== directoryPath) {
                console.warn(`Error reading ${currentPath}:`, err);
            } else {
                hasError = true;
                firstError = err as Error;
            }
        }
    }
    
    // Si hubo error en el directorio raíz, lanzar excepción
    if (hasError && firstError) {
        throw firstError;
    }
    
    return totalSize;
}

/**
 * Comprime directorio de forma optimizada para archivos GB
 */
export async function compressDirectory(
    sourcePath: string, 
    outputPath: string, 
    options: ServiceOptions = {}
): Promise<void> {
    // Estimación rápida del tamaño (no exacta pero suficiente)
    const estimatedSize = await estimateDirectorySize(sourcePath);
    let processedBytes = 0;
    let currentFileName: string | undefined;

    const output = fs.createWriteStream(outputPath, {
        highWaterMark: HIGH_WATER_MARK
    });

    const format = options.useZip ? 'zip' : 'tar';
    const archive = archiver(format, {
        gzip: !options.useZip,
        gzipOptions: {
            level: options.compressionLevel || 6, // Nivel 6 es buen balance
            memLevel: 8, // Reduce uso de memoria
            chunkSize: CHUNK_SIZE
        },
        zlib: { 
            level: options.compressionLevel || 6,
            memLevel: 8,
            chunkSize: CHUNK_SIZE
        },
        // Configuración crítica para archivos grandes
        statConcurrency: MAX_CONCURRENT_FILES,
        highWaterMark: HIGH_WATER_MARK
    });

    return new Promise((resolve, reject) => {
        let lastProgressUpdate = Date.now();
        const progressThrottle = 100; // Actualizar cada 100ms máximo

        archive.on('entry', (entryData: any) => {
            currentFileName = entryData.name || entryData.sourcePath;
            
            if (entryData.stats?.size) {
                processedBytes += entryData.stats.size;
            }

            // Throttle de actualizaciones de progreso
            const now = Date.now();
            if (options.progressCallback && now - lastProgressUpdate > progressThrottle) {
                lastProgressUpdate = now;
                options.progressCallback({
                    percentage: estimatedSize > 0 ? 
                        Math.min(99, (processedBytes / estimatedSize) * 100) : 0,
                    processedBytes,
                    totalBytes: estimatedSize,
                    currentFile: currentFileName
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
                    currentFile: 'Completado'
                });
            }
            resolve();
        });

        output.on('error', (err) => {
            archive.destroy();
            reject(err);
        });

        // Manejo de backpressure
        archive.pipe(output);
        
        // Usar glob con límites para no cargar todo en memoria
        archive.directory(sourcePath, false);
        archive.finalize();
    });
}
/**
 * Detecta el tipo real de archivo leyendo sus magic bytes
 */
async function detectFileType(filePath: string): Promise<'zip' | 'gzip' | 'tar' | 'unknown'> {
    const fd = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(10);
    
    try {
        await fd.read(buffer, 0, 10, 0);
        
        // ZIP: 50 4B (PK)
        if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
            return 'zip';
        }
        
        // GZIP: 1F 8B
        if (buffer[0] === 0x1F && buffer[1] === 0x8B) {
            return 'gzip';
        }
        
        // TAR: "ustar" en offset 257
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
 * Descomprime archivo optimizado para GB
 */
export async function decompressArchive(
    archivePath: string, 
    destinationPath: string, 
    options: ServiceOptions = {}
): Promise<string[] | void> {
    // Detectar el tipo real del archivo
    const fileType = await detectFileType(archivePath);
    
    // Si no se puede detectar, usar la extensión como fallback
    if (fileType === 'unknown') {
        const ext = path.extname(archivePath).toLowerCase();
        if (ext === '.zip') {
            return decompressZipStreaming(archivePath, destinationPath, options);
        }
        if (ext === '.gz' || archivePath.endsWith('.tar.gz')) {
            return decompressTarGz(archivePath, destinationPath, options);
        }
        throw new Error(`Unsupported archive format: ${ext}`);
    }
    
    // Usar el tipo detectado
    if (fileType === 'zip') {
        return decompressZipStreaming(archivePath, destinationPath, options);
    }
    
    if (fileType === 'gzip' || fileType === 'tar') {
        return decompressTarGz(archivePath, destinationPath, options);
    }
    
    throw new Error(`Unsupported file type detected: ${fileType}`);
}

/**
 * Descompresión ZIP con streaming real (sin cargar todo en memoria)
 */
async function decompressZipStreaming(
    archivePath: string,
    destinationPath: string,
    options: ServiceOptions = {}
): Promise<string[]> {
    // Usar yauzl para streaming real en lugar de decompress
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
                await fs.promises.mkdir(path.dirname(entryPath), { recursive: true });
                
                const readStream = await entry.openReadStream();
                const writeStream = fs.createWriteStream(entryPath, {
                    highWaterMark: HIGH_WATER_MARK
                });

                await pipeline(readStream, writeStream);
                processedBytes += entry.uncompressedSize;

                // Throttle de progreso
                const now = Date.now();
                if (options.progressCallback && now - lastProgressUpdate > 100) {
                    lastProgressUpdate = now;
                    options.progressCallback({
                        percentage: Math.min(99, (processedBytes / archiveSize) * 100),
                        processedBytes,
                        totalBytes: archiveSize,
                        currentFile: entry.filename
                    });
                }
            }
        }

        if (options.progressCallback) {
            options.progressCallback({
                percentage: 100,
                processedBytes: archiveSize,
                totalBytes: archiveSize,
                currentFile: 'Completado'
            });
        }

        return extractedFiles;
    } finally {
        await zipFile.close();
    }
}

/**
 * Descompresión TAR.GZ optimizada
 */
async function decompressTarGz(
    archivePath: string, 
    destinationPath: string, 
    options: ServiceOptions = {}
): Promise<void> {
    const archiveSize = (await fs.promises.stat(archivePath)).size;
    let processedBytes = 0;
    let lastProgressUpdate = Date.now();

    await fs.promises.mkdir(destinationPath, { recursive: true });

    const readStream = fs.createReadStream(archivePath, {
        highWaterMark: HIGH_WATER_MARK
    });

    const gunzip = zlib.createGunzip({
        chunkSize: CHUNK_SIZE
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
                        await fs.promises.mkdir(path.dirname(entryPath), { recursive: true });
                        
                        const writeStream = fs.createWriteStream(entryPath, {
                            highWaterMark: HIGH_WATER_MARK
                        });

                        await pipeline(stream, writeStream);
                    }

                    processedBytes += header.size || 0;

                    // Throttle de progreso
                    const now = Date.now();
                    if (options.progressCallback && now - lastProgressUpdate > 100) {
                        lastProgressUpdate = now;
                        options.progressCallback({
                            percentage: Math.min(99, (processedBytes / archiveSize) * 100),
                            processedBytes,
                            totalBytes: archiveSize,
                            currentFile: header.name
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
                        currentFile: 'Completado'
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