// src/core/TaskManager.ts

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { Emitter } from '../utils/Emitter.js';
import { Task } from './Task.js';
import * as CompressionService from '../services/CompressionService.js';
import { TaskStatus, TaskType } from '../Types.js';
import type { 
    ITask, 
    DownloadResult, 
    UnpackResult, 
    AssetManagerOptions, 
    TaskEvents, 
    UnpackOptions,
    BackupOptions,
    BackupResult,
    RestoreOptions,
    RestoreResult,
    ProgressData,
    DownloadOptions,
    OnCompleteCallback,
} from '../Types.js';

const processPath = (...args: string[]) => path.join(process.cwd(), ...args);

function sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') return 'invalid_name';
    return filename.trim()
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/^\.+|\.+$/g, '')
        .replace(/_{2,}/g, '_') || 'backup';
}

// NUEVO: Interfaz para el retorno de las operaciones
interface TaskOperation<T> {
    taskId: string;
    promise: Promise<T>;
}

export class TaskManager extends Emitter {
    private options: Required<AssetManagerOptions>;
    private tasks: Map<string, Task> = new Map();

    constructor(options: AssetManagerOptions = {
        downloadPath: processPath('./downloads'),
        unpackPath: processPath('./unpacked'),
        backupPath: processPath('./backups'),
    }) {
        super();
        this.options = {
            downloadPath: options.downloadPath,
            unpackPath: options.unpackPath,
            backupPath: options.backupPath,
        };

        Object.values(this.options).forEach(dir => 
            fs.mkdirSync(dir, { recursive: true })
        );
    }

    public on<K extends keyof TaskEvents>(event: K, listener: TaskEvents[K]): () => void {
        return super.on(event, listener as (data: any) => void);
    }
    
    // --- Métodos de gestión de Tareas (privados) ---

    private _createTask(type: TaskType, payload: { [key: string]: any }, onComplete?: OnCompleteCallback<any>): Task {
        const task = new Task(type, payload, onComplete);
        this.tasks.set(task.id, task);
        this.emit('task:created', task.toObject());
        return task;
    }
    
    private _startTask(task: Task): void {
        task.status = TaskStatus.IN_PROGRESS;
        task.updatedAt = new Date();
        this.emit('task:started', task.toObject());
    }

    private _updateTaskProgress(task: Task, progressData: Partial<ProgressData>, details: object = {}): void {
        task.progress = Math.min(100, Math.round(progressData.percentage ?? task.progress));
        task.updatedAt = new Date();
        task.details = { ...task.details, ...progressData, ...details };
        this.emit('task:progress', task.toObject());
    }

    private _completeTask(task: Task, result: ITask['result']): void {
        task.status = TaskStatus.COMPLETED;
        task.progress = 100;
        task.result = result;
        task.updatedAt = new Date();
        const taskObject = task.toObject();
        this.emit('task:completed', taskObject);

        if (task.onCompleteCallback && typeof task.onCompleteCallback === 'function') {
            try {
                setTimeout(() => task.onCompleteCallback!(result, taskObject), 0);
            } catch (e) {
                console.error(`Error executing onComplete callback for task ${task.id}:`, e);
            }
        }
    }

    private _failTask(task: Task, error: Error): void {
        task.status = TaskStatus.FAILED;
        task.error = error.message;
        task.updatedAt = new Date();
        this.emit('task:failed', task.toObject());
    }

    // --- Métodos públicos ---

    public getTask(taskId: string): ITask | null {
        const task = this.tasks.get(taskId);
        return task ? task.toObject() : null;
    }

    public getAllTasks(): ITask[] {
        return Array.from(this.tasks.values()).map(task => task.toObject());
    }

    // NUEVO: Método para esperar a que una tarea termine
    public waitForTask<T = any>(taskId: string): Promise<T> {
        const task = this.tasks.get(taskId);
        if (!task) {
            return Promise.reject(new Error(`Task ${taskId} not found`));
        }

        // Si la tarea ya terminó, retornar inmediatamente
        if (task.status === TaskStatus.COMPLETED) {
            return Promise.resolve(task.result as T);
        }
        if (task.status === TaskStatus.FAILED) {
            return Promise.reject(new Error(task.error || 'Task failed'));
        }

        // Esperar a que la tarea termine
        return new Promise((resolve, reject) => {
            let unsubCompleted: (() => void) | undefined;
            let unsubFailed: (() => void) | undefined;

            const cleanup = () => {
                if (unsubCompleted) unsubCompleted();
                if (unsubFailed) unsubFailed();
            };

            const onCompleted = (completedTask: ITask) => {
                if (completedTask.id === taskId) {
                    cleanup();
                    resolve(completedTask.result as T);
                }
            };

            const onFailed = (failedTask: ITask) => {
                if (failedTask.id === taskId) {
                    cleanup();
                    reject(new Error(failedTask.error || 'Task failed'));
                }
            };

            unsubCompleted = this.on('task:completed', onCompleted);
            unsubFailed = this.on('task:failed', onFailed);
        });
    }

    // --- Lógica de Descarga (MODIFICADA) ---

    public download(url: string, options: DownloadOptions = {}): TaskOperation<DownloadResult> {
        const fileName = options.fileName || path.basename(new URL(url).pathname);
        const filePath = path.join(this.options.downloadPath, fileName);
        const task = this._createTask(
            TaskType.DOWNLOADING,
            { url, filePath, fileName },
            options.onComplete
        );

        const promise = this._executeDownload(task)
            .then(() => task.result as DownloadResult)
            .catch(error => {
                this._failTask(task, error);
                throw error;
            });
        // Evitar rechazos no manejados cuando el consumidor no espera la promesa
        promise.catch(() => {});

        return { taskId: task.id, promise };
    }

    private async _executeDownload(task: Task): Promise<void> {
        this._startTask(task);
        const { url, filePath } = task.payload;

        const response = await axios({
            method: 'GET', url, responseType: 'stream',
            headers: { 'User-Agent': 'My-TS-Library/1.0' },
        });

        const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        let processedBytes = 0;

        response.data.on('data', (chunk: Buffer) => {
            processedBytes += chunk.length;
            if (totalBytes > 0) {
                const percentage = (processedBytes / totalBytes) * 100;
                this._updateTaskProgress(task, { percentage, processedBytes, totalBytes });
            }
        });

        await pipeline(response.data, fs.createWriteStream(filePath));
        const finalStats = fs.statSync(filePath);
        this._completeTask(task, { filePath, size: finalStats.size } as DownloadResult);
    }

    // --- Lógica de Creación de Backup (MODIFICADA) ---
    
    public createBackup(sourcePath: string, options: BackupOptions = {}): TaskOperation<BackupResult> {
        const baseFolderName = path.basename(sourcePath);
        const extension = options.useZip ? '.zip' : '.tar.gz';
        const defaultFilename = `${sanitizeFilename(baseFolderName)}-${new Date().toISOString().replace(/:/g, '-')}${extension}`;
        const finalFilename = options.outputFilename ? sanitizeFilename(options.outputFilename) : defaultFilename;
        const backupPath = path.join(this.options.backupPath, finalFilename);

        const task = this._createTask(
            TaskType.BACKUP_COMPRESS,
            { sourcePath, backupPath, options },
            options.onComplete
        );

        const promise = this._executeBackup(task)
            .then(() => task.result as BackupResult)
            .catch(error => {
                this._failTask(task, error);
                throw error;
            });
        // Evitar rechazos no manejados cuando el consumidor no espera la promesa
        promise.catch(() => {});

        return { taskId: task.id, promise };
    }

    private async _executeBackup(task: Task): Promise<void> {
        this._startTask(task);
        const { sourcePath, backupPath, options } = task.payload;
        
        const progressCallback = (progressData: ProgressData) => {
            this._updateTaskProgress(task, progressData);
        };

        await CompressionService.compressDirectory(sourcePath, backupPath, { ...options, progressCallback });
        
        const finalStats = await fs.promises.stat(backupPath);
        this._completeTask(task, { backupPath, size: finalStats.size } as BackupResult);
    }
    
    // --- Lógica de Restauración de Backup (MODIFICADA) ---

    public restoreBackup(archivePath: string, options: RestoreOptions = {}): TaskOperation<RestoreResult> {
        const archiveName = path.basename(archivePath);
        const defaultDestFolder = archiveName.replace(/\.(zip|tar\.gz|gz|7z)$/i, '');
        const destinationFolderName = options.destinationFolderName || defaultDestFolder;
        const destinationPath = path.join(this.options.unpackPath, sanitizeFilename(destinationFolderName));

        const task = this._createTask(
            TaskType.BACKUP_RESTORE,
            { archivePath, destinationPath, options },
            options.onComplete
        );

        const promise = this._executeRestore(task)
            .then(() => task.result as RestoreResult)
            .catch(error => {
                this._failTask(task, error);
                throw error;
            });
        // Evitar rechazos no manejados cuando el consumidor no espera la promesa
        promise.catch(() => {});

        return { taskId: task.id, promise };
    }

    private async _executeRestore(task: Task): Promise<void> {
        this._startTask(task);
        const { archivePath, destinationPath } = task.payload;
        
        await fs.promises.mkdir(destinationPath, { recursive: true });

        const progressCallback = (progressData: ProgressData) => {
            this._updateTaskProgress(task, progressData);
        };

        await CompressionService.decompressArchive(archivePath, destinationPath, { progressCallback });
        
        this._completeTask(task, { destinationPath } as RestoreResult);
    }

    // --- Lógica de Descompresión Genérica (MODIFICADA) ---

    public unpack(archivePath: string, options: UnpackOptions = {}): TaskOperation<UnpackResult> {
        const archiveName = path.basename(archivePath);
        const defaultUnpackDir = archiveName.replace(/\.(zip|tar\.gz|gz|7z)$/i, '');
        const unpackDirName = options.destination || defaultUnpackDir;
        const unpackPath = path.join(this.options.unpackPath, sanitizeFilename(unpackDirName));

        const task = this._createTask(
            TaskType.UNPACKING,
            { archivePath, unpackPath, options },
            options.onComplete
        );

        const promise = this._executeUnpack(task)
            .then(() => task.result as UnpackResult)
            .catch(error => {
                this._failTask(task, error);
                throw error;
            });
        // Evitar rechazos no manejados cuando el consumidor no espera la promesa
        promise.catch(() => {});

        return { taskId: task.id, promise };
    }

    private async _executeUnpack(task: Task): Promise<void> {
        this._startTask(task);
        const { archivePath, unpackPath, options } = task.payload as {
            archivePath: string;
            unpackPath: string;
            options: UnpackOptions;
        };

        await fs.promises.mkdir(unpackPath, { recursive: true });
        
        const progressCallback = (progressData: ProgressData) => {
            this._updateTaskProgress(task, progressData);
        };

        const files = await CompressionService.decompressArchive(archivePath, unpackPath, { progressCallback });
        
        if (options.deleteAfterUnpack) {
            await fs.promises.unlink(archivePath);
        }

        this._completeTask(task, { unpackDir: unpackPath, files } as UnpackResult);
    }
}