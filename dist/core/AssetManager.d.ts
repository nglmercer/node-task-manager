import { Emitter } from '../utils/Emitter.js';
import type { ITask, AssetManagerOptions, TaskEvents, UnpackOptions } from '../Types.js';
export declare class AssetManager extends Emitter {
    private options;
    private tasks;
    constructor(options?: AssetManagerOptions);
    on<K extends keyof TaskEvents>(event: K, listener: TaskEvents[K]): () => void;
    private _createTask;
    private _updateTaskProgress;
    private _completeTask;
    private _failTask;
    getTask(taskId: string): ITask | null;
    getAllTasks(): ITask[];
    download(url: string, options?: {
        fileName?: string;
    }): Promise<string>;
    private _executeDownload;
    unpack(archivePath: string, options?: UnpackOptions): Promise<string>;
    private _executeUnpack;
}
//# sourceMappingURL=AssetManager.d.ts.map