// src/adapters/CompressionAdapterFactory.ts
import type { ICompressionAdapter } from './ICompressionAdapter.js';
import { AdapterOperation } from './ICompressionAdapter.js';

// Re-exportar AdapterOperation para que pueda ser usado por otros módulos
export { AdapterOperation };

/**
 * Factory para crear y gestionar adaptadores de compresión.
 * Permite registrar adaptadores personalizados y seleccionar el apropiado
 * según el tipo de archivo.
 */
export class CompressionAdapterFactory {
  private adapters: ICompressionAdapter[] = [];

  constructor(customAdapters: ICompressionAdapter[] = []) {
    // Adaptadores por defecto se cargarán dinámicamente
    // para evitar dependencias circulares
    this.adapters = [...customAdapters];
  }

  /**
   * Obtiene el adaptador apropiado para el archivo especificado
   * @param filePath - Ruta del archivo a procesar
   * @param operation - Tipo de operación (compress o decompress)
   * @returns El adaptador que puede manejar el formato
   * @throws Error si no se encuentra un adaptador adecuado
   */
  async getAdapter(filePath: string, operation: AdapterOperation = AdapterOperation.BOTH): Promise<ICompressionAdapter> {
    for (const adapter of this.adapters) {
      const canHandle = await adapter.canHandle(filePath);
      
      // Verificar si el adaptador soporta la operación requerida
      const supportsOperation =
        operation === AdapterOperation.BOTH ||
        (adapter as any).supportedOperations === AdapterOperation.BOTH ||
        (adapter as any).supportedOperations === operation;
      
      if (canHandle && supportsOperation) {
        return adapter;
      }
    }
    throw new Error(
      `No adapter found for file: ${filePath} (operation: ${operation}). ` +
      `Available adapters: ${this.adapters.map(a => a.constructor.name).join(', ')}`
    );
  }

  /**
   * Registra un nuevo adaptador con alta prioridad
   * @param adapter - Adaptador a registrar
   */
  registerAdapter(adapter: ICompressionAdapter): void {
    this.adapters.unshift(adapter); // Prioridad a adaptadores personalizados
  }

  /**
   * Obtiene todos los adaptadores registrados
   * @returns Lista de adaptadores
   */
  getAdapters(): ICompressionAdapter[] {
    return [...this.adapters];
  }

  /**
   * Elimina un adaptador por su nombre de clase
   * @param adapterName - Nombre de la clase del adaptador
   * @returns true si se eliminó el adaptador
   */
  removeAdapter(adapterName: string): boolean {
    const index = this.adapters.findIndex(
      a => a.constructor.name === adapterName
    );
    if (index !== -1) {
      this.adapters.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Verifica si hay un adaptador disponible para el archivo
   * @param filePath - Ruta del archivo a verificar
   * @returns true si hay un adaptador disponible
   */
  async hasAdapter(filePath: string): Promise<boolean> {
    for (const adapter of this.adapters) {
      const canHandle = await adapter.canHandle(filePath);
      if (canHandle) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Singleton de la factory por defecto
 */
let defaultFactory: CompressionAdapterFactory | null = null;

/**
 * Obtiene la factory por defecto
 * @returns Instancia de CompressionAdapterFactory
 */
export function getDefaultFactory(): CompressionAdapterFactory {
  if (!defaultFactory) {
    defaultFactory = new CompressionAdapterFactory();
  }
  return defaultFactory;
}

/**
 * Reinicia la factory por defecto (útil para tests)
 */
export function resetDefaultFactory(): void {
  defaultFactory = null;
}
