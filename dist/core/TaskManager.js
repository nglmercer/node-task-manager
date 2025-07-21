// src/TaskManager.ts (antes AssetManager.ts)
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { Emitter } from '../utils/Emitter.js'; // Asumo que tienes un Emitter similar
import { Task } from './Task.js'; // Asumo que tienes tu clase Task
import * as CompressionService from '../services/CompressionService.js';
import { TaskStatus, TaskType } from '../Types.js';
const processPath = (...args) => path.join(process.cwd(), ...args);
// Función para sanitizar nombres de archivo (del código antiguo)
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string')
        return 'invalid_name';
    return filename.trim().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+|\.+$/g, '').replace(/_{2,}/g, '_') || 'backup';
}
export class TaskManager extends Emitter {
    options;
    tasks = new Map();
    constructor(options = {
        downloadPath: processPath('./downloads'),
        unpackPath: processPath('./unpacked'),
        backupPath: processPath('./backups'),
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
    on(event, listener) {
        return super.on(event, listener);
    }
    // --- Métodos de gestión de Tareas (privados) ---
    _createTask(type, payload, onComplete) {
        const task = new Task(type, payload, onComplete);
        this.tasks.set(task.id, task);
        this.emit('task:created', task.toObject());
        return task;
    }
    _startTask(task) {
        task.status = TaskStatus.IN_PROGRESS;
        task.updatedAt = new Date();
        this.emit('task:started', task.toObject());
    }
    _updateTaskProgress(task, progressData, details = {}) {
        task.progress = Math.min(100, Math.round(progressData.percentage ?? task.progress));
        task.updatedAt = new Date();
        task.details = { ...task.details, ...progressData, ...details };
        this.emit('task:progress', task.toObject());
    }
    _completeTask(task, result) {
        task.status = TaskStatus.COMPLETED;
        task.progress = 100;
        task.result = result;
        task.updatedAt = new Date();
        const taskObject = task.toObject();
        this.emit('task:completed', taskObject);
        // NUEVO: Lógica para ejecutar el callback onComplete.
        if (task.onCompleteCallback && typeof task.onCompleteCallback === 'function') {
            try {
                // Se ejecuta de forma asíncrona para no bloquear el flujo principal.
                setTimeout(() => task.onCompleteCallback(result, taskObject), 0);
            }
            catch (e) {
                console.error(`Error executing onComplete callback for task ${task.id}:`, e);
                // Opcional: podrías emitir un evento 'task:callback_error'
            }
        }
    }
    _failTask(task, error) {
        task.status = TaskStatus.FAILED;
        task.error = error.message;
        task.updatedAt = new Date();
        this.emit('task:failed', task.toObject());
    }
    // --- Métodos públicos ---
    getTask(taskId) {
        const task = this.tasks.get(taskId);
        return task ? task.toObject() : null;
    }
    getAllTasks() {
        return Array.from(this.tasks.values()).map(task => task.toObject());
    }
    // --- Lógica de Descarga ---
    async download(url, options = {}) {
        const fileName = options.fileName || path.basename(new URL(url).pathname);
        const filePath = path.join(this.options.downloadPath, fileName);
        const task = this._createTask(TaskType.DOWNLOADING, { url, filePath, fileName }, options.onComplete);
        this._executeDownload(task).catch(error => this._failTask(task, error));
        return task.id;
    }
    async _executeDownload(task) {
        this._startTask(task);
        const { url, filePath } = task.payload;
        const response = await axios({
            method: 'GET', url, responseType: 'stream',
            headers: { 'User-Agent': 'My-TS-Library/1.0' },
        });
        const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        let processedBytes = 0;
        response.data.on('data', (chunk) => {
            processedBytes += chunk.length;
            if (totalBytes > 0) {
                const percentage = (processedBytes / totalBytes) * 100;
                this._updateTaskProgress(task, { percentage, processedBytes, totalBytes });
            }
        });
        await pipeline(response.data, fs.createWriteStream(filePath));
        const finalStats = fs.statSync(filePath);
        this._completeTask(task, { filePath, size: finalStats.size });
    }
    // --- Lógica de Creación de Backup (Compresión) ---
    async createBackup(sourcePath, options = {}) {
        const baseFolderName = path.basename(sourcePath);
        const extension = options.useZip ? '.zip' : '.tar.gz';
        const defaultFilename = `${sanitizeFilename(baseFolderName)}-${new Date().toISOString().replace(/:/g, '-')}${extension}`;
        const finalFilename = options.outputFilename ? sanitizeFilename(options.outputFilename) : defaultFilename;
        const backupPath = path.join(this.options.backupPath, finalFilename);
        const task = this._createTask(TaskType.BACKUP_COMPRESS, { sourcePath, backupPath, options }, options.onComplete);
        this._executeBackup(task).catch(error => this._failTask(task, error));
        return task.id;
    }
    async _executeBackup(task) {
        this._startTask(task);
        const { sourcePath, backupPath, options } = task.payload;
        const progressCallback = (progressData) => {
            this._updateTaskProgress(task, progressData);
        };
        await CompressionService.compressDirectory(sourcePath, backupPath, { ...options, progressCallback });
        const finalStats = await fs.promises.stat(backupPath);
        this._completeTask(task, { backupPath, size: finalStats.size });
    }
    // --- Lógica de Restauración de Backup (Descompresión) ---
    async restoreBackup(archivePath, options = {}) {
        const archiveName = path.basename(archivePath);
        const defaultDestFolder = archiveName.replace(/\.(zip|tar\.gz|gz|7z)$/i, '');
        const destinationFolderName = options.destinationFolderName || defaultDestFolder;
        const destinationPath = path.join(this.options.unpackPath, sanitizeFilename(destinationFolderName));
        const task = this._createTask(TaskType.BACKUP_RESTORE, { archivePath, destinationPath, options }, options.onComplete);
        this._executeRestore(task).catch(error => this._failTask(task, error));
        return task.id;
    }
    async _executeRestore(task) {
        this._startTask(task);
        const { archivePath, destinationPath } = task.payload;
        await fs.promises.mkdir(destinationPath, { recursive: true });
        const progressCallback = (progressData) => {
            this._updateTaskProgress(task, progressData);
        };
        await CompressionService.decompressArchive(archivePath, destinationPath, { progressCallback });
        this._completeTask(task, { destinationPath });
    }
    // --- Lógica de Descompresión Genérica (Usa la misma lógica que restaurar) ---
    async unpack(archivePath, options = {}) {
        const archiveName = path.basename(archivePath);
        const defaultUnpackDir = archiveName.replace(/\.(zip|tar\.gz|gz|7z)$/i, '');
        const unpackDirName = options.destination || defaultUnpackDir;
        const unpackPath = path.join(this.options.unpackPath, sanitizeFilename(unpackDirName));
        const task = this._createTask(TaskType.UNPACKING, { archivePath, unpackPath, options }, options.onComplete);
        this._executeUnpack(task).catch(error => this._failTask(task, error));
        return task.id;
    }
    async _executeUnpack(task) {
        this._startTask(task);
        const { archivePath, unpackPath, options } = task.payload;
        await fs.promises.mkdir(unpackPath, { recursive: true });
        const progressCallback = (progressData) => {
            this._updateTaskProgress(task, progressData);
        };
        const files = await CompressionService.decompressArchive(archivePath, unpackPath, { progressCallback });
        if (options.deleteAfterUnpack) {
            await fs.promises.unlink(archivePath);
        }
        this._completeTask(task, { unpackDir: unpackPath, files });
    }
}
//# sourceMappingURL=TaskManager.js.map