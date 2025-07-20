// src/TaskManager.ts (antes AssetManager.ts)

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { Emitter } from '../utils/Emitter.js'; // Asumo que tienes un Emitter similar
import { Task } from './Task.js'; // Asumo que tienes tu clase Task
import * as CompressionService from './services/CompressionService.js';
import { TaskStatus, TaskType } from './Types.js';
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
    ProgressData
} from './Types.js';

// Función para sanitizar nombres de archivo (del código antiguo)
function sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') return 'invalid_name';
    return filename.trim().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+|\.+$/g, '').replace(/_{2,}/g, '_') || 'backup';
}

export class TaskManager extends Emitter {
    private options: Required<AssetManagerOptions>;
    private tasks: Map<string, Task> = new Map();

    constructor(options: AssetManagerOptions = {
        downloadPath: './downloads',
        unpackPath: './unpacked',
        backupPath: './backups',
    }) {
        super();
        this.options = {
            downloadPath: options.downloadPath,
            unpackPath: options.unpackPath,
            backupPath: options.backupPath, // Nueva opción
        };

        // Crear directorios necesarios
        Object.values(this.options).forEach(dir => fs.mkdirSync(dir, { recursive: true }));
    }

    public on<K extends keyof TaskEvents>(event: K, listener: TaskEvents[K]): () => void {
        return super.on(event, listener as (data: any) => void);
    }
    
    // --- Métodos de gestión de Tareas (privados) ---

    private _createTask(type: TaskType, payload: { [key: string]: any }): Task {
        const task = new Task(type, payload);
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
        this.emit('task:completed', task.toObject());
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

    // --- Lógica de Descarga ---

    public async download(url: string, options: { fileName?: string } = {}): Promise<string> {
        const fileName = options.fileName || path.basename(new URL(url).pathname);
        const filePath = path.join(this.options.downloadPath, fileName);
        const task = this._createTask(TaskType.DOWNLOADING, { url, filePath, fileName });
        this._executeDownload(task).catch(error => this._failTask(task, error));
        return task.id;
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

    // --- Lógica de Creación de Backup (Compresión) ---
    
    public async createBackup(sourcePath: string, options: BackupOptions = {}): Promise<string> {
        const baseFolderName = path.basename(sourcePath);
        const extension = options.useZip ? '.zip' : '.tar.gz';
        const defaultFilename = `${sanitizeFilename(baseFolderName)}-${new Date().toISOString().replace(/:/g, '-')}${extension}`;
        const finalFilename = options.outputFilename ? sanitizeFilename(options.outputFilename) : defaultFilename;
        const backupPath = path.join(this.options.backupPath, finalFilename);

        const task = this._createTask(TaskType.BACKUP_COMPRESS, { sourcePath, backupPath, options });
        this._executeBackup(task).catch(error => this._failTask(task, error));
        return task.id;
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
    
    // --- Lógica de Restauración de Backup (Descompresión) ---

    public async restoreBackup(archivePath: string, options: RestoreOptions = {}): Promise<string> {
        const archiveName = path.basename(archivePath);
        const defaultDestFolder = archiveName.replace(/\.(zip|tar\.gz|gz|7z)$/i, '');
        const destinationFolderName = options.destinationFolderName || defaultDestFolder;
        const destinationPath = path.join(this.options.unpackPath, sanitizeFilename(destinationFolderName));

        const task = this._createTask(TaskType.BACKUP_RESTORE, { archivePath, destinationPath, options });
        this._executeRestore(task).catch(error => this._failTask(task, error));
        return task.id;
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

    // --- Lógica de Descompresión Genérica (Usa la misma lógica que restaurar) ---

    public async unpack(archivePath: string, options: UnpackOptions = {}): Promise<string> {
        const destination = options.destination ? path.join(this.options.unpackPath, options.destination) : undefined;

        // Reutilizamos la lógica de restauración, ya que es esencialmente lo mismo
        return this.restoreBackup(archivePath, { destinationFolderName: destination });
    }
}