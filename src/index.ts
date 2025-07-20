// --- Clase Principal ---
// Exportamos la clase TaskManager, que es la interfaz principal de la librería.
export { TaskManager } from './core/TaskManager.js';

// --- Tipos y Enums ---
// Exportamos todos los tipos, enums e interfaces.
// Esto es crucial para que los usuarios puedan tipar sus variables y listeners.
export type {
    ITask,
    AssetManagerOptions, // Podrías renombrar esto a TaskManagerOptions en types.ts para consistencia
    BackupOptions,
    RestoreOptions,
    UnpackOptions,
    DownloadResult,
    UnpackResult,
    BackupResult,
    RestoreResult,
    ProgressData,
    TaskEvents,
    ResultsTypes
} from './Types.js';

export { TaskStatus, TaskType } from './Types.js';

// Nota: No exportamos Task, Emitter o CompressionService directamente,
// ya que son detalles de implementación. Los usuarios interactúan a través de TaskManager.
// Esto mantiene la API pública más limpia y fácil de usar.