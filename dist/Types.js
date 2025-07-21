// src/Types.ts
// --- ENUMS ---
export var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "pending";
    TaskStatus["IN_PROGRESS"] = "in_progress";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["FAILED"] = "failed";
    TaskStatus["CANCELLED"] = "cancelled";
})(TaskStatus || (TaskStatus = {}));
;
export var TaskType;
(function (TaskType) {
    TaskType["DOWNLOADING"] = "downloading";
    TaskType["UNPACKING"] = "unpacking";
    TaskType["BACKUP_COMPRESS"] = "backup_compress";
    TaskType["BACKUP_RESTORE"] = "backup_restore";
})(TaskType || (TaskType = {}));
;
//# sourceMappingURL=Types.js.map