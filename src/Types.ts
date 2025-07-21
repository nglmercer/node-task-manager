// src/Types.ts

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
    UNPACKING = "unpacking", // MODIFICADO: Añadido para diferenciar de restore
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
    [key: string]: any;
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
    currentFile?: string;
}
export type ResultsTypes = DownloadResult | UnpackResult | BackupResult | RestoreResult | null;

// --- INTERFAZ DE TAREA ---
export interface ITask {
    id: string;
    type: TaskType;
    status: TaskStatus;
    progress: number;
    payload: { [key: string]: any };
    details: { [key: string]: any };
    error: string | null;
    result: ResultsTypes;
    createdAt: Date;
    updatedAt: Date;
}

// --- OPCIONES PARA LOS MÉTODOS (MODIFICADAS) ---

// NUEVO: Tipo genérico para el callback para evitar repetición
export type OnCompleteCallback<T> = (result: T, task: ITask) => void;

export interface AssetManagerOptions {
    downloadPath: string;
    unpackPath: string;
    backupPath: string;
}

// NUEVO: Interfaz de opciones específica para el método download
export interface DownloadOptions {
    fileName?: string;
    onComplete?: OnCompleteCallback<DownloadResult>;
}

export interface UnpackOptions {
    destination?: string;
    deleteAfterUnpack?: boolean;
    onComplete?: OnCompleteCallback<UnpackResult>;
}

export interface BackupOptions {
    outputFilename?: string;
    useZip?: boolean;
    compressionLevel?: number;
    exclude?: string[];
    onComplete?: OnCompleteCallback<BackupResult>;
}

export interface RestoreOptions {
    destinationFolderName?: string;
    onComplete?: OnCompleteCallback<RestoreResult>;
}

// --- EVENTOS ---
export type TaskEvents = {
    'task:created': (task: ITask) => void;
    'task:started': (task: ITask) => void;
    'task:progress': (task: ITask) => void;
    'task:completed': (task: ITask) => void;
    'task:failed': (task: ITask) => void;
};