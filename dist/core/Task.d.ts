import { TaskStatus, TaskType } from '../Types.js';
import type { ITask, ResultsTypes, OnCompleteCallback } from '../Types.js';
export declare class Task implements ITask {
    id: string;
    type: TaskType;
    status: TaskStatus;
    progress: number;
    payload: {
        [key: string]: any;
    };
    error: string | null;
    result: ResultsTypes;
    createdAt: Date;
    updatedAt: Date;
    details: {
        [key: string]: any;
    };
    onCompleteCallback?: OnCompleteCallback<any>;
    constructor(type: TaskType, payload: {
        [key: string]: any;
    }, onCompleteCallback?: OnCompleteCallback<any>);
    toObject(): ITask;
}
//# sourceMappingURL=Task.d.ts.map