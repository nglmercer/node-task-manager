// src/services/CompressionService.ts
import type { ICompressionAdapter, CompressionOptions } from '../adapters/ICompressionAdapter.js';
import { CompressionAdapterFactory, AdapterOperation } from '../adapters/CompressionAdapterFactory.js';
import { ArchiverZipAdapter } from '../adapters/ArchiverZipAdapter.js';
import { ArchiverTarAdapter } from '../adapters/ArchiverTarAdapter.js';
import { YauzlZipAdapter } from '../adapters/YauzlZipAdapter.js';
import { TarStreamAdapter } from '../adapters/TarStreamAdapter.js';
import type { ProgressData } from '../Types.js';

/**
 * Opciones de servicio para compresión/descompresión
 */
export interface ServiceOptions {
  /** Callback de progreso */
  progressCallback?: (data: ProgressData) => void;
  /** Nivel de compresión (0-9) */
  compressionLevel?: number;
  /** Usar formato ZIP en lugar de TAR */
  useZip?: boolean;
}

/**
 * Servicio de compresión/descompresión que usa el patrón Adapter.
 * Permite flexibilidad para usar diferentes implementaciones de compresión.
 */
export class CompressionService {
  private factory: CompressionAdapterFactory;

  /**
   * Crea una instancia de CompressionService
   * @param customAdapters - Adaptadores personalizados opcionales
   */
  constructor(customAdapters: ICompressionAdapter[] = []) {
    // Crear factory con adaptadores por defecto y personalizados
    // IMPORTANTE: Orden de adaptadores por prioridad
    // Los adaptadores de descompresión tienen prioridad para descomprimir
    this.factory = new CompressionAdapterFactory([
      // Adaptadores personalizados (mayor prioridad)
      ...customAdapters,
      // Adaptadores por defecto (ordenados por prioridad)
      new YauzlZipAdapter(),      // ZIP decompression
      new TarStreamAdapter(),         // TAR decompression
      new ArchiverZipAdapter(),       // ZIP compression
      new ArchiverTarAdapter(),       // TAR compression
    ]);
  }

  /**
   * Comprime un directorio en un archivo
   * @param sourcePath - Ruta del directorio fuente
   * @param outputPath - Ruta del archivo de salida
   * @param options - Opciones de compresión
   */
  async compressDirectory(
    sourcePath: string,
    outputPath: string,
    options: ServiceOptions = {}
  ): Promise<void> {
    const adapter = await this.factory.getAdapter(outputPath, AdapterOperation.COMPRESS);
    return adapter.compress(sourcePath, outputPath, options);
  }

  /**
   * Descomprime un archivo en un directorio
   * @param archivePath - Ruta del archivo a descomprimir
   * @param destinationPath - Ruta del directorio destino
   * @param options - Opciones de descompresión
   * @returns Lista de archivos extraídos (si el adaptador lo soporta)
   */
  async decompressArchive(
    archivePath: string,
    destinationPath: string,
    options: ServiceOptions = {}
  ): Promise<string[] | void> {
    const adapter = await this.factory.getAdapter(archivePath, AdapterOperation.DECOMPRESS);
    return adapter.decompress(archivePath, destinationPath, options);
  }

  /**
   * Registra un nuevo adaptador personalizado
   * @param adapter - Adaptador a registrar
   */
  registerAdapter(adapter: ICompressionAdapter): void {
    this.factory.registerAdapter(adapter);
  }

  /**
   * Obtiene la factory de adaptadores
   * @returns Instancia de CompressionAdapterFactory
   */
  getFactory(): CompressionAdapterFactory {
    return this.factory;
  }

  /**
   * Verifica si hay un adaptador disponible para el archivo
   * @param filePath - Ruta del archivo a verificar
   * @returns true si hay un adaptador disponible
   */
  async hasAdapter(filePath: string): Promise<boolean> {
    return this.factory.hasAdapter(filePath);
  }
}

/**
 * Instancia por defecto del servicio de compresión
 */
let defaultService: CompressionService | null = null;

/**
 * Obtiene la instancia por defecto del servicio de compresión
 * @returns Instancia de CompressionService
 */
export function getDefaultCompressionService(): CompressionService {
  if (!defaultService) {
    defaultService = new CompressionService();
  }
  return defaultService;
}

/**
 * Reinicia la instancia por defecto del servicio (útil para tests)
 */
export function resetDefaultCompressionService(): void {
  defaultService = null;
}

// ============================================
// Funciones de compatibilidad (API anterior)
// ============================================

/**
 * Comprime un directorio usando el servicio por defecto
 * @param sourcePath - Ruta del directorio fuente
 * @param outputPath - Ruta del archivo de salida
 * @param options - Opciones de compresión
 */
export async function compressDirectory(
  sourcePath: string,
  outputPath: string,
  options: ServiceOptions = {}
): Promise<void> {
  const service = getDefaultCompressionService();
  return service.compressDirectory(sourcePath, outputPath, options);
}

/**
 * Descomprime un archivo usando el servicio por defecto
 * @param archivePath - Ruta del archivo a descomprimir
 * @param destinationPath - Ruta del directorio destino
 * @param options - Opciones de descompresión
 * @returns Lista de archivos extraídos (si el adaptador lo soporta)
 */
export async function decompressArchive(
  archivePath: string,
  destinationPath: string,
  options: ServiceOptions = {}
): Promise<string[] | void> {
  const service = getDefaultCompressionService();
  return service.decompressArchive(archivePath, destinationPath, options);
}
