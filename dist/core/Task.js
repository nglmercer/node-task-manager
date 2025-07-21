// src/Task.ts
import { v4 as uuidv4 } from 'uuid';
import { TaskStatus, TaskType } from '../Types.js';
export class Task {
    id;
    type;
    status;
    progress;
    payload;
    error;
    result;
    createdAt;
    updatedAt;
    details = {};
    onCompleteCallback;
    constructor(type, payload, onCompleteCallback) {
        this.id = uuidv4();
        this.type = type;
        this.payload = payload;
        this.status = TaskStatus.PENDING;
        this.progress = 0;
        this.error = null;
        this.result = null;
        this.createdAt = new Date();
        this.updatedAt = new Date();
        this.onCompleteCallback = onCompleteCallback;
    }
    toObject() {
        return {
            id: this.id,
            type: this.type,
            status: this.status,
            progress: this.progress,
            payload: this.payload,
            error: this.error,
            result: this.result,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            details: this.details
        };
    }
}
//# sourceMappingURL=Task.js.map