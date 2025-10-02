// src/services/CompressionService.ts
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import archiver from 'archiver';
import tar from 'tar-stream';
import type { ProgressData } from '../Types.js';

// Función para obtener el tamaño total de un directorio (esencial para el progreso)
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

    return new Promise((resolve, reject) => {
        archive.on('progress', (progress) => {
            if (options.progressCallback) {
                const entry = (progress as any).entries?.latest;
                options.progressCallback({
                    percentage: totalSize > 0 ? (progress.fs.processedBytes / totalSize) * 100 : 0,
                    processedBytes: progress.fs.processedBytes,
                    totalBytes: totalSize,
                    currentFile: entry?.name || entry?.sourcePath || undefined
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
        
        archive.pipe(output);
        archive.directory(sourcePath, false);
        archive.finalize();
    });
}

/**
 * Descomprime un archivo .tar.gz con reporte de progreso.
 * Nota: El progreso para .zip con 'decompress' es más limitado.
 */
export async function decompressArchive(archivePath: string, destinationPath: string, options: ServiceOptions = {}): Promise<void> {
    // Para .zip, usamos 'decompress' que no tiene un buen hook de progreso.
    if (path.extname(archivePath) === '.zip') {
        const decompress = (await import('decompress')).default;
        if (options.progressCallback) {
            options.progressCallback({ percentage: 25, processedBytes: 0, totalBytes: 0, currentFile: 'Iniciando descompresión...' });
        }
        await decompress(archivePath, destinationPath);
        if (options.progressCallback) {
            options.progressCallback({ percentage: 100, processedBytes: 0, totalBytes: 0, currentFile: 'Finalizado.' });
        }
        return;
    }

    // Para .tar.gz, podemos reportar progreso por cada archivo extraído.
    const archiveSize = (await fs.promises.stat(archivePath)).size;
    let processedBytes = 0;
    
    const readStream = fs.createReadStream(archivePath);
    const gunzip = zlib.createGunzip();
    const extractor = tar.extract();

    return new Promise((resolve, reject) => {
        extractor.on('entry', (header, stream, next) => {
            const entryPath = path.join(destinationPath, header.name);
            if (header.type === 'directory') {
                fs.promises.mkdir(entryPath, { recursive: true }).then(next).catch(reject);
            } else {
                // Ensure parent directory exists
                fs.promises.mkdir(path.dirname(entryPath), { recursive: true })
                    .then(() => {
                        const writeStream = fs.createWriteStream(entryPath);
                        stream.pipe(writeStream);
                        writeStream.on('finish', next); // Wait for write to complete
                        writeStream.on('error', reject);
                        stream.on('error', reject);
                    })
                    .catch(reject);
            }
            stream.resume(); // Important: consume the stream
        });
        
        gunzip.on('data', (chunk) => {
            processedBytes += chunk.length;
            if (options.progressCallback) {
                 options.progressCallback({
                    percentage: (processedBytes / archiveSize) * 100,
                    processedBytes,
                    totalBytes: archiveSize,
                 });
            }
        });

        extractor.on('finish', resolve);
        extractor.on('error', reject);
        
        readStream.pipe(gunzip).pipe(extractor);
    });
}