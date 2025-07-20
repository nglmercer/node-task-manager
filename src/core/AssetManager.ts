// src/AssetManager.ts
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import decompress from 'decompress';
import { pipeline } from 'stream/promises';
import { Emitter } from '../utils/Emitter.js';
import { Task } from './Task.js';
import { TaskStatus, TaskType  } from './Types.js';
import type { ITask, DownloadResult, UnpackResult,AssetManagerOptions,TaskEvents,UnpackOptions } from './Types.js';

export class AssetManager extends Emitter {
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
            backupPath: options.backupPath,
        };

        fs.mkdirSync(this.options.downloadPath, { recursive: true });
        fs.mkdirSync(this.options.unpackPath, { recursive: true });
    }

    // Sobrescribimos 'on' para tener tipado fuerte en los eventos
    public on<K extends keyof TaskEvents>(event: K, listener: TaskEvents[K]): () => void {
        return super.on(event, listener as (data: any) => void);
    }

    private _createTask(type: TaskType, payload: { [key: string]: any }): Task {
        const task = new Task(type, payload);
        this.tasks.set(task.id, task);
        this.emit('task:created', task.toObject());
        return task;
    }

    private _updateTaskProgress(task: Task, progress: number, data: object = {}): void {
        task.progress = Math.min(100, Math.round(progress));
        task.updatedAt = new Date();
        Object.assign(task.payload, data);
        this.emit('task:progress', task.toObject());
    }

    private _completeTask(task: Task, result: DownloadResult | UnpackResult): void {
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

    public getTask(taskId: string): ITask | null {
        const task = this.tasks.get(taskId);
        return task ? task.toObject() : null;
    }

    public getAllTasks(): ITask[] {
        return Array.from(this.tasks.values()).map(task => task.toObject());
    }

    public async download(url: string, options: { fileName?: string } = {}): Promise<string> {
        const fileName = options.fileName || path.basename(new URL(url).pathname);
        const filePath = path.join(this.options.downloadPath, fileName);
        const task = this._createTask(TaskType.DOWNLOADING, { url, filePath, fileName });
        this._executeDownload(task).catch(error => this._failTask(task, error));
        return task.id;
    }

    private async _executeDownload(task: Task): Promise<void> {
        task.status = TaskStatus.IN_PROGRESS;
        this.emit('task:started', task.toObject());
        const { url, filePath } = task.payload;

        const response = await axios({
            method: 'GET',
            url,
            responseType: 'stream',
            headers: { 'User-Agent': 'EasyAssetManager/1.1' },
        });

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        response.data.on('data', (chunk: Buffer) => {
            downloadedSize += chunk.length;
            if (totalSize > 0) {
                const progress = (downloadedSize / totalSize) * 100;
                this._updateTaskProgress(task, progress, { totalSize, downloadedSize });
            }
        });

        await pipeline(response.data, fs.createWriteStream(filePath));
        const finalStats = fs.statSync(filePath);
        this._completeTask(task, { filePath, size: finalStats.size });
    }

    public async unpack(archivePath: string, options: UnpackOptions = {}): Promise<string> {
        const archiveName = path.basename(archivePath);
        const defaultUnpackDir = archiveName.replace(/\.(zip|tar\.gz|gz|7z)$/i, '');
        const unpackDir = path.join(this.options.unpackPath, options.destination || defaultUnpackDir);
        const task = this._createTask(TaskType.UNPACKING, { archivePath, unpackDir });
        this._executeUnpack(task, options).catch(error => this._failTask(task, error));
        return task.id;
    }

    private async _executeUnpack(task: Task, options: UnpackOptions): Promise<void> {
        task.status = TaskStatus.IN_PROGRESS;
        this.emit('task:started', task.toObject());
        this._updateTaskProgress(task, 10);

        const { archivePath, unpackDir } = task.payload;
        await fs.promises.mkdir(unpackDir, { recursive: true });

        await decompress(archivePath, unpackDir);
        this._updateTaskProgress(task, 90);

        if (options.deleteAfterUnpack) {
            await fs.promises.unlink(archivePath);
        }
        
        this._completeTask(task, { unpackDir });
    }
}