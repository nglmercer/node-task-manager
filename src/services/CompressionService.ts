// src/services/CompressionService.ts
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import archiver from 'archiver';
import tar from 'tar-stream';
import type { ProgressData } from '../Types.js';

// Función para obtener el tamaño total de un directorio
async function getDirectorySize(directoryPath: string): Promise<number> {
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    const sizes = await Promise.all(
        entries.map(entry => {
            const fullPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                return getDirectorySize(fullPath);
            }
            return fs.promises.stat(fullPath).then(stat => stat.size);
        })
    );
    return sizes.reduce((acc, size) => acc + size, 0);
}

// Opciones para las funciones de compresión/descompresión
interface ServiceOptions {
    progressCallback?: (data: ProgressData) => void;
    compressionLevel?: number;
    useZip?: boolean;
}

/**
 * Comprime un directorio en un archivo .zip o .tar.gz con reporte de progreso.
 */
export async function compressDirectory(sourcePath: string, outputPath: string, options: ServiceOptions = {}): Promise<void> {
    const totalSize = await getDirectorySize(sourcePath);
    const output = fs.createWriteStream(outputPath);
    const format = options.useZip ? 'zip' : 'tar';
    const archive = archiver(format, {
        gzip: !options.useZip,
        zlib: { level: options.compressionLevel || 9 }
    });

    let currentFileName: string | undefined;

    return new Promise((resolve, reject) => {
        archive.on('entry', (entryData: any) => {
            currentFileName = entryData.name || entryData.sourcePath;
        });

        archive.on('progress', (progress) => {
            if (options.progressCallback) {
                options.progressCallback({
                    percentage: totalSize > 0 ? (progress.fs.processedBytes / totalSize) * 100 : 0,
                    processedBytes: progress.fs.processedBytes,
                    totalBytes: totalSize,
                    currentFile: currentFileName
                });
            }
        });

        archive.on('warning', (err) => {
            if (err.code !== 'ENOENT') {
                console.warn('Archiver warning:', err);
            }
        });
        archive.on('error', reject);
        output.on('close', resolve);
        output.on('error', reject);
        
        archive.pipe(output);
        archive.directory(sourcePath, false);
        archive.finalize();
    });
}

/**
 * Descomprime un archivo .zip o .tar.gz con reporte de progreso.
 */
export async function decompressArchive(archivePath: string, destinationPath: string, options: ServiceOptions = {}): Promise<string[] | void> {
    const ext = path.extname(archivePath).toLowerCase();
    
    // Para .zip, usamos 'decompress'
    if (ext === '.zip') {
        const decompress = (await import('decompress')).default;
        if (options.progressCallback) {
            options.progressCallback({ 
                percentage: 10, 
                processedBytes: 0, 
                totalBytes: 0, 
                currentFile: 'Iniciando descompresión...' 
            });
        }
        
        const files = await decompress(archivePath, destinationPath);
        
        if (options.progressCallback) {
            options.progressCallback({ 
                percentage: 100, 
                processedBytes: 0, 
                totalBytes: 0, 
                currentFile: 'Finalizado.' 
            });
        }
        
        return files.map(f => f.path);
    }

    // Para .tar.gz o .gz
    if (ext === '.gz' || archivePath.endsWith('.tar.gz')) {
        return decompressTarGz(archivePath, destinationPath, options);
    }

    throw new Error(`Unsupported archive format: ${ext}`);
}

/**
 * Descomprime archivos .tar.gz con mejor manejo de progreso y errores
 */
async function decompressTarGz(archivePath: string, destinationPath: string, options: ServiceOptions = {}): Promise<void> {
    const archiveSize = (await fs.promises.stat(archivePath)).size;
    let processedBytes = 0;
    let entriesProcessed = 0;
    
    const readStream = fs.createReadStream(archivePath);
    const gunzip = zlib.createGunzip();
    const extractor = tar.extract();

    return new Promise((resolve, reject) => {
        let isResolved = false;

        const safeResolve = () => {
            if (!isResolved) {
                isResolved = true;
                resolve();
            }
        };

        const safeReject = (error: Error) => {
            if (!isResolved) {
                isResolved = true;
                reject(error);
            }
        };

        extractor.on('entry', (header, stream, next) => {
            entriesProcessed++;
            const entryPath = path.join(destinationPath, header.name);
            
            if (options.progressCallback && entriesProcessed % 5 === 0) {
                options.progressCallback({
                    percentage: Math.min(95, (processedBytes / archiveSize) * 100),
                    processedBytes,
                    totalBytes: archiveSize,
                    currentFile: header.name,
                });
            }

            if (header.type === 'directory') {
                fs.promises.mkdir(entryPath, { recursive: true })
                    .then(() => {
                        stream.resume();
                        next();
                    })
                    .catch(safeReject);
            } else {
                fs.promises.mkdir(path.dirname(entryPath), { recursive: true })
                    .then(() => {
                        const writeStream = fs.createWriteStream(entryPath);
                        
                        writeStream.on('error', safeReject);
                        stream.on('error', safeReject);
                        
                        stream.pipe(writeStream);
                        
                        writeStream.on('finish', () => {
                            next();
                        });
                    })
                    .catch(safeReject);
            }
        });
        
        gunzip.on('data', (chunk) => {
            processedBytes += chunk.length;
        });

        extractor.on('finish', () => {
            if (options.progressCallback) {
                options.progressCallback({
                    percentage: 100,
                    processedBytes: archiveSize,
                    totalBytes: archiveSize,
                    currentFile: 'Completado',
                });
            }
            safeResolve();
        });

        extractor.on('error', safeReject);
        gunzip.on('error', safeReject);
        readStream.on('error', safeReject);
        
        readStream.pipe(gunzip).pipe(extractor);
    });
}