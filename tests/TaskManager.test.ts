import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { TaskManager } from '../src/index';
import type { ITask } from '../src/index';
import fs from 'fs';
import path from 'path';

// Test directories
const TEST_DIR = './test-temp';
const SOURCE_DIR = path.join(TEST_DIR, 'source');
const DOWNLOADS_DIR = path.join(TEST_DIR, 'downloads');
const UNPACK_DIR = path.join(TEST_DIR, 'unpack');
const BACKUPS_DIR = path.join(TEST_DIR, 'backups');

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('TaskManager', () => {
  let taskManager: TaskManager;

  beforeAll(() => {
    // Clean and create test directories
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
    
    // Create test files
    fs.writeFileSync(path.join(SOURCE_DIR, 'test.txt'), 'Hello World!');
    fs.writeFileSync(path.join(SOURCE_DIR, 'config.json'), JSON.stringify({ port: 3000 }));
    
    // Create subdirectory
    const subDir = path.join(SOURCE_DIR, 'subdir');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'nested.txt'), 'Nested file content');
  });

  beforeEach(() => {
    // Create a new TaskManager instance for each test
    taskManager = new TaskManager({
      downloadPath: DOWNLOADS_DIR,
      unpackPath: UNPACK_DIR,
      backupPath: BACKUPS_DIR,
    });
  });

  afterAll(() => {
    // Cleanup after all tests
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    test('should create TaskManager instance', () => {
      expect(taskManager).toBeDefined();
      expect(taskManager.getAllTasks()).toEqual([]);
    });

    test('should create required directories', () => {
      expect(fs.existsSync(DOWNLOADS_DIR)).toBe(true);
      expect(fs.existsSync(UNPACK_DIR)).toBe(true);
      expect(fs.existsSync(BACKUPS_DIR)).toBe(true);
    });
  });

  describe('Event System', () => {
    test('should emit task:created event', async () => {
      let eventFired = false;
      let capturedTask: ITask | null = null;

      taskManager.on('task:created', (task: ITask) => {
        eventFired = true;
        capturedTask = task;
      });

      const taskId = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'test-backup.zip',
        useZip: true,
      });

      expect(eventFired).toBe(true);
      expect(capturedTask).toBeDefined();
      expect(capturedTask?.id).toBe(taskId);
    });

    test('should emit task:started event', async () => {
      let eventFired = false;

      taskManager.on('task:started', () => {
        eventFired = true;
      });

      await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'test-backup-started.zip',
        useZip: true,
      });

      await sleep(100);
      expect(eventFired).toBe(true);
    });

    test('should emit task:completed event', async () => {
      let completedTask: ITask | null = null;

      taskManager.on('task:completed', (task: ITask) => {
        completedTask = task;
      });

      await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'test-backup-completed.zip',
        useZip: true,
      });

      await sleep(1000);
      expect(completedTask).toBeDefined();
      expect(completedTask?.status).toBe('completed');
    });
  });

  describe('Backup Operations', () => {
    test('should create a ZIP backup', async () => {
      const taskId = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'backup.zip',
        useZip: true,
      });

      await sleep(1000);

      const task = taskManager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.status).toBe('completed');
      expect(task?.type).toBe('backup_compress');
      
      const backupPath = (task?.result as any)?.backupPath;
      expect(fs.existsSync(backupPath)).toBe(true);
    });

    test('should create a TAR.GZ backup', async () => {
      const taskId = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'backup.tar.gz',
        useZip: false,
      });

      await sleep(1000);

      const task = taskManager.getTask(taskId);
      expect(task?.status).toBe('completed');
      
      const backupPath = (task?.result as any)?.backupPath;
      expect(backupPath.endsWith('.tar.gz')).toBe(true);
      expect(fs.existsSync(backupPath)).toBe(true);
    });

    test('should report progress during backup', async () => {
      let progressReported = false;
      let maxProgress = 0;

      taskManager.on('task:progress', (task: ITask) => {
        progressReported = true;
        if (task.progress > maxProgress) {
          maxProgress = task.progress;
        }
      });

      await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'backup-progress.zip',
        useZip: true,
      });

      await sleep(1000);
      expect(progressReported).toBe(true);
      expect(maxProgress).toBeGreaterThan(0);
    });

    test('should fail with invalid source path', async () => {
      let failedTask: ITask | null = null;

      taskManager.on('task:failed', (task: ITask) => {
        failedTask = task;
      });

      const taskId = await taskManager.createBackup('/nonexistent/path', {
        outputFilename: 'fail.zip',
        useZip: true,
      });

      await sleep(500);

      const task = taskManager.getTask(taskId);
      expect(task?.status).toBe('failed');
      expect(task?.error).toBeDefined();
      expect(failedTask).toBeDefined();
    });
  });

  describe('Restore Operations', () => {
    test('should restore a ZIP backup', async () => {
      // First create a backup
      const backupTaskId = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'restore-test.zip',
        useZip: true,
      });

      await sleep(1000);

      const backupTask = taskManager.getTask(backupTaskId);
      const backupPath = (backupTask?.result as any)?.backupPath;

      // Then restore it
      const restoreTaskId = await taskManager.restoreBackup(backupPath, {
        destinationFolderName: 'restored',
      });

      await sleep(1000);

      const restoreTask = taskManager.getTask(restoreTaskId);
      expect(restoreTask?.status).toBe('completed');
      
      const restoredPath = path.join(UNPACK_DIR, 'restored');
      expect(fs.existsSync(restoredPath)).toBe(true);
      expect(fs.existsSync(path.join(restoredPath, 'test.txt'))).toBe(true);
    });

    test('should restore a TAR.GZ backup', async () => {
      // Create tar.gz backup
      const backupTaskId = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'restore-tar.tar.gz',
        useZip: false,
      });

      await sleep(1000);

      const backupTask = taskManager.getTask(backupTaskId);
      const backupPath = (backupTask?.result as any)?.backupPath;

      // Restore it
      const restoreTaskId = await taskManager.restoreBackup(backupPath, {
        destinationFolderName: 'restored-tar',
      });

      await sleep(1000);

      const restoreTask = taskManager.getTask(restoreTaskId);
      expect(restoreTask?.status).toBe('completed');
      
      const restoredPath = path.join(UNPACK_DIR, 'restored-tar');
      expect(fs.existsSync(restoredPath)).toBe(true);
    });

    test('should use unpack as alias for restoreBackup', async () => {
      const backupTaskId = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'unpack-test.zip',
        useZip: true,
      });

      await sleep(1000);

      const backupTask = taskManager.getTask(backupTaskId);
      const backupPath = (backupTask?.result as any)?.backupPath;

      const unpackTaskId = await taskManager.unpack(backupPath, {
        destinationFolderName: 'unpacked',
      });

      await sleep(1000);

      const unpackTask = taskManager.getTask(unpackTaskId);
      expect(unpackTask?.status).toBe('completed');
    });
  });

  describe('Download Operations', () => {
    test('should download a file', async () => {
      const testUrl = 'https://raw.githubusercontent.com/nglmercer/node-task-manager/main/README.md';
      
      const taskId = await taskManager.download(testUrl);
      
      await sleep(3000);

      const task = taskManager.getTask(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.type).toBe('downloading');
      
      const downloadedPath = (task?.result as any)?.filePath;
      expect(fs.existsSync(downloadedPath)).toBe(true);
    }, 10000); // Timeout extendido para downloads

    test('should fail with invalid URL', async () => {
      let failedTask: ITask | null = null;

      taskManager.on('task:failed', (task: ITask) => {
        failedTask = task;
      });

      const taskId = await taskManager.download('https://invalid-url-that-does-not-exist.com/file.zip');
      
      await sleep(2000);

      const task = taskManager.getTask(taskId);
      expect(task?.status).toBe('failed');
      expect(failedTask).toBeDefined();
    }, 10000);
  });

  describe('Task Management', () => {
    test('should get task by ID', async () => {
      const taskId = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'get-task.zip',
        useZip: true,
      });

      const task = taskManager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.id).toBe(taskId);
    });

    test('should return null for non-existent task', () => {
      const task = taskManager.getTask('non-existent-id');
      expect(task).toBeNull();
    });

    test('should get all tasks', async () => {
      await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'task1.zip',
        useZip: true,
      });

      await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'task2.zip',
        useZip: true,
      });

      const allTasks = taskManager.getAllTasks();
      expect(allTasks.length).toBeGreaterThanOrEqual(2);
    });

    test('should track multiple concurrent tasks', async () => {
      const taskId1 = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'concurrent1.zip',
        useZip: true,
      });

      const taskId2 = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'concurrent2.zip',
        useZip: true,
      });

      const task1 = taskManager.getTask(taskId1);
      const task2 = taskManager.getTask(taskId2);

      expect(task1).toBeDefined();
      expect(task2).toBeDefined();
      expect(task1?.id).not.toBe(task2?.id);
    });
  });

  describe('Task Details', () => {
    test('should include file details in progress', async () => {
      let currentFile: string | undefined;

      taskManager.on('task:progress', (task: ITask) => {
        if (task.details.currentFile) {
          currentFile = task.details.currentFile as string;
        }
      });

      await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'details-test.zip',
        useZip: true,
      });

      await sleep(1000);
      expect(currentFile).toBeDefined();
    });

    test('should track processed bytes', async () => {
      let processedBytes = 0;

      taskManager.on('task:progress', (task: ITask) => {
        if (task.details.processedBytes) {
          processedBytes = task.details.processedBytes as number;
        }
      });

      await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'bytes-test.zip',
        useZip: true,
      });

      await sleep(1000);
      expect(processedBytes).toBeGreaterThan(0);
    });
  });
});