export declare enum TaskStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export declare enum TaskType {
    DOWNLOADING = "downloading",
    UNPACKING = "unpacking",
    BACKUP_COMPRESS = "backup_compress",
    BACKUP_RESTORE = "backup_restore"
}
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
export interface ProgressData {
    percentage: number;
    processedBytes: number;
    totalBytes: number;
    currentFile?: string;
}
export type ResultsTypes = DownloadResult | UnpackResult | BackupResult | RestoreResult | null;
export interface ITask {
    id: string;
    type: TaskType;
    status: TaskStatus;
    progress: number;
    payload: {
        [key: string]: any;
    };
    details: {
        [key: string]: any;
    };
    error: string | null;
    result: DownloadResult | UnpackResult | BackupResult | RestoreResult | null;
    createdAt: Date;
    updatedAt: Date;
}
export interface AssetManagerOptions {
    downloadPath: string;
    unpackPath: string;
    backupPath: string;
}
export interface UnpackOptions {
    destination?: string;
    deleteAfterUnpack?: boolean;
}
export interface BackupOptions {
    outputFilename?: string;
    useZip?: boolean;
    compressionLevel?: number;
    exclude?: string[];
}
export interface RestoreOptions {
    destinationFolderName?: string;
}
export type TaskEvents = {
    'task:created': (task: ITask) => void;
    'task:started': (task: ITask) => void;
    'task:progress': (task: ITask) => void;
    'task:completed': (task: ITask) => void;
    'task:failed': (task: ITask) => void;
};
//# sourceMappingURL=Types.d.ts.map