import { Emitter } from '../utils/Emitter.js';
import type { ITask, AssetManagerOptions, TaskEvents, UnpackOptions, BackupOptions, RestoreOptions, DownloadOptions } from '../Types.js';
export declare class TaskManager extends Emitter {
    private options;
    private tasks;
    constructor(options?: AssetManagerOptions);
    on<K extends keyof TaskEvents>(event: K, listener: TaskEvents[K]): () => void;
    private _createTask;
    private _startTask;
    private _updateTaskProgress;
    private _completeTask;
    private _failTask;
    getTask(taskId: string): ITask | null;
    getAllTasks(): ITask[];
    download(url: string, options?: DownloadOptions): Promise<string>;
    private _executeDownload;
    createBackup(sourcePath: string, options?: BackupOptions): Promise<string>;
    private _executeBackup;
    restoreBackup(archivePath: string, options?: RestoreOptions): Promise<string>;
    private _executeRestore;
    unpack(archivePath: string, options?: UnpackOptions): Promise<string>;
    private _executeUnpack;
}
//# sourceMappingURL=TaskManager.d.ts.map