// src/adapters/ICompressionAdapter.ts
import type { ProgressData } from '../Types.js';

/**
 * Tipo de operación que soporta el adaptador
 */
export enum AdapterOperation {
  COMPRESS = 'compress',
  DECOMPRESS = 'decompress',
  BOTH = 'both'
}

/**
 * Interfaz base para adaptadores de compresión/descompresión.
 * Permite implementar diferentes librerías de compresión sin modificar el código principal.
 */
export interface ICompressionAdapter {
  /**
   * Operaciones que soporta este adaptador
   */
  readonly supportedOperations: AdapterOperation;

  /**
   * Comprime un directorio en un archivo
   * @param sourcePath - Ruta del directorio fuente
   * @param outputPath - Ruta del archivo de salida
   * @param options - Opciones de compresión
   */
  compress(
    sourcePath: string,
    outputPath: string,
    options?: CompressionOptions
  ): Promise<void>;

  /**
   * Descomprime un archivo en un directorio
   * @param archivePath - Ruta del archivo a descomprimir
   * @param destinationPath - Ruta del directorio destino
   * @param options - Opciones de descompresión
   * @returns Lista de archivos extraídos (opcional)
   */
  decompress(
    archivePath: string,
    destinationPath: string,
    options?: CompressionOptions
  ): Promise<string[] | void>;

  /**
   * Verifica si este adaptador puede manejar el formato del archivo
   * @param filePath - Ruta del archivo a verificar
   * @returns true si el adaptador puede manejar el formato
   */
  canHandle(filePath: string): boolean | Promise<boolean>;
}

/**
 * Opciones de compresión/descompresión
 */
export interface CompressionOptions {
  /** Callback de progreso */
  progressCallback?: (data: ProgressData) => void;
  /** Nivel de compresión (0-9) */
  compressionLevel?: number;
  /** Usar formato ZIP en lugar de TAR */
  useZip?: boolean;
  /** Opciones adicionales específicas del adaptador */
  [key: string]: any;
}

/**
 * Resultado de la detección de tipo de archivo
 */
export interface FileTypeDetection {
  type: 'zip' | 'gzip' | 'tar' | 'unknown';
  confidence: number;
}
