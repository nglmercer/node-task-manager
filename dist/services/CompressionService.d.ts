import type { ProgressData } from '../Types.js';
interface ServiceOptions {
    progressCallback?: (data: ProgressData) => void;
    compressionLevel?: number;
    useZip?: boolean;
}
/**
 * Comprime un directorio en un archivo .zip o .tar.gz con reporte de progreso.
 */
export declare function compressDirectory(sourcePath: string, outputPath: string, options?: ServiceOptions): Promise<void>;
/**
 * Descomprime un archivo .tar.gz con reporte de progreso.
 * Nota: El progreso para .zip con 'decompress' es más limitado.
 */
export declare function decompressArchive(archivePath: string, destinationPath: string, options?: ServiceOptions): Promise<void>;
export {};
//# sourceMappingURL=CompressionService.d.ts.map