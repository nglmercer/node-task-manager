import { TaskStatus, TaskType } from '../Types.js';
import type { ITask, ResultsTypes } from '../Types.js';
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
    constructor(type: TaskType, payload: {
        [key: string]: any;
    });
    toObject(): ITask;
}
//# sourceMappingURL=Task.d.ts.map