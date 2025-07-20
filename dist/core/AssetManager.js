// src/AssetManager.ts
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import decompress from 'decompress';
import { pipeline } from 'stream/promises';
import { Emitter } from '../utils/Emitter.js';
import { Task } from './Task.js';
import { TaskStatus, TaskType } from '../Types.js';
export class AssetManager extends Emitter {
    options;
    tasks = new Map();
    constructor(options = {
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
    on(event, listener) {
        return super.on(event, listener);
    }
    _createTask(type, payload) {
        const task = new Task(type, payload);
        this.tasks.set(task.id, task);
        this.emit('task:created', task.toObject());
        return task;
    }
    _updateTaskProgress(task, progress, data = {}) {
        task.progress = Math.min(100, Math.round(progress));
        task.updatedAt = new Date();
        Object.assign(task.payload, data);
        this.emit('task:progress', task.toObject());
    }
    _completeTask(task, result) {
        task.status = TaskStatus.COMPLETED;
        task.progress = 100;
        task.result = result;
        task.updatedAt = new Date();
        this.emit('task:completed', task.toObject());
    }
    _failTask(task, error) {
        task.status = TaskStatus.FAILED;
        task.error = error.message;
        task.updatedAt = new Date();
        this.emit('task:failed', task.toObject());
    }
    getTask(taskId) {
        const task = this.tasks.get(taskId);
        return task ? task.toObject() : null;
    }
    getAllTasks() {
        return Array.from(this.tasks.values()).map(task => task.toObject());
    }
    async download(url, options = {}) {
        const fileName = options.fileName || path.basename(new URL(url).pathname);
        const filePath = path.join(this.options.downloadPath, fileName);
        const task = this._createTask(TaskType.DOWNLOADING, { url, filePath, fileName });
        this._executeDownload(task).catch(error => this._failTask(task, error));
        return task.id;
    }
    async _executeDownload(task) {
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
        response.data.on('data', (chunk) => {
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
    async unpack(archivePath, options = {}) {
        const archiveName = path.basename(archivePath);
        const defaultUnpackDir = archiveName.replace(/\.(zip|tar\.gz|gz|7z)$/i, '');
        const unpackDir = path.join(this.options.unpackPath, options.destination || defaultUnpackDir);
        const task = this._createTask(TaskType.UNPACKING, { archivePath, unpackDir });
        this._executeUnpack(task, options).catch(error => this._failTask(task, error));
        return task.id;
    }
    async _executeUnpack(task, options) {
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
//# sourceMappingURL=AssetManager.js.map