// src/types.ts

// --- ENUMS ---
export enum TaskStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled'
};

export enum TaskType {
    DOWNLOADING = "downloading",
    UNPACKING = "unpacking",
    // Nuevos tipos de tarea
    BACKUP_COMPRESS = "backup_compress",
    BACKUP_RESTORE = "backup_restore",
};

// --- INTERFACES DE RESULTADOS ---
export interface DownloadResult {
    filePath: string;
    size: number;
}

export interface UnpackResult {
    unpackDir: string;
}

export interface BackupResult {
    backupPath: string;
    size: number;
}

export interface RestoreResult {
    destinationPath: string;
}

// --- INTERFAZ DE PROGRESO ---
export interface ProgressData {
    percentage: number;
    processedBytes: number;
    totalBytes: number;
    currentFile?: string; // Archivo actual que se está procesando
}
export type ResultsTypes = DownloadResult | UnpackResult | BackupResult | RestoreResult | null;
// --- INTERFAZ DE TAREA (Actualizada) ---
export interface ITask {
    id: string;
    type: TaskType;
    status: TaskStatus;
    progress: number;
    payload: { [key: string]: any }; // Datos iniciales de la tarea
    details: { [key: string]: any }; // Datos que se actualizan con el progreso
    error: string | null;
    result: DownloadResult | UnpackResult | BackupResult | RestoreResult | null;
    createdAt: Date;
    updatedAt: Date;
}

// --- OPCIONES PARA LOS MÉTODOS ---
export interface AssetManagerOptions {
    downloadPath: string; // Ya no es opcional
    unpackPath: string;  // Ya no es opcional
    backupPath: string;  // Ya no es opcional
}

export interface UnpackOptions {
    destination?: string;
    deleteAfterUnpack?: boolean;
}

export interface BackupOptions {
    outputFilename?: string; // Nombre opcional para el archivo de backup
    useZip?: boolean; // true para .zip, false para .tar.gz (defecto)
    compressionLevel?: number; // Nivel de compresión
    exclude?: string[]; // Patrones a excluir
}

export interface RestoreOptions {
    destinationFolderName?: string; // Nombre de la carpeta de destino
}

// --- EVENTOS (Actualizado) ---
// No se necesitan cambios aquí, pero es bueno tenerlo de referencia
export type TaskEvents = {
    'task:created': (task: ITask) => void;
    'task:started': (task: ITask) => void;
    'task:progress': (task: ITask) => void;
    'task:completed': (task: ITask) => void;
    'task:failed': (task: ITask) => void;
};