// src/Task.ts
import { randomUUID } from 'crypto';
import { TaskStatus, TaskType  } from '../Types.js';
import type { ITask, ResultsTypes, OnCompleteCallback } from '../Types.js';

export class Task implements ITask {
    public id: string;
    public type: TaskType;
    public status: TaskStatus;
    public progress: number;
    public payload: { [key: string]: any };
    public error: string | null;
    public result: ResultsTypes;
    public createdAt: Date;
    public updatedAt: Date;
    public details: { [key: string]: any } = {};

    public onCompleteCallback?: OnCompleteCallback<any>;

    constructor(
        type: TaskType,
        payload: { [key: string]: any },
        onCompleteCallback?: OnCompleteCallback<any>
    ) {
        this.id = randomUUID();
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

    public toObject(): ITask {
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