import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { TaskManager } from '../src/index.js';
import type { BackupResult } from '../src/index.js';
import fs from 'fs';
import path from 'path';
import type { TaskStatus } from '../src/index.js';

const TEST_DIR = './test-temp';
const SOURCE_DIR = path.join(TEST_DIR, 'source');
const DOWNLOADS_DIR = path.join(TEST_DIR, 'downloads');
const UNPACK_DIR = path.join(TEST_DIR, 'unpack');
const BACKUPS_DIR = path.join(TEST_DIR, 'backups');

describe('TaskManager with Promises', () => {
  let taskManager: TaskManager;

  beforeAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
    
    fs.writeFileSync(path.join(SOURCE_DIR, 'test.txt'), 'Hello World!');
    fs.writeFileSync(path.join(SOURCE_DIR, 'config.json'), JSON.stringify({ port: 3000 }));
    
    const subDir = path.join(SOURCE_DIR, 'subdir');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'nested.txt'), 'Nested file content');
  });

  beforeEach(() => {
    taskManager = new TaskManager({
      downloadPath: DOWNLOADS_DIR,
      unpackPath: UNPACK_DIR,
      backupPath: BACKUPS_DIR,
    });
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Promise-based API', () => {
    test('should resolve promise when backup completes', async () => {
      const { taskId, promise } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'promise-backup.zip',
        useZip: true,
      });

      const result = await promise;

      expect(result).toBeDefined();
      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath)).toBe(true);

      const task = taskManager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.status).toBe('completed' as TaskStatus);
    });

    test('should reject promise when backup fails', async () => {
      const { promise } = taskManager.createBackup('/nonexistent/path', {
        outputFilename: 'fail.zip',
        useZip: true,
      });

      try {
        await promise;
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('should handle restore with promises', async () => {
      const { promise: backupPromise } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'restore-promise.zip',
        useZip: true,
      });

      const backupResult = await backupPromise;

      const { promise: restorePromise } = taskManager.restoreBackup(backupResult.backupPath, {
        destinationFolderName: 'restored-promise',
      });

      const restoreResult = await restorePromise;

      expect(restoreResult.destinationPath).toBeDefined();
      expect(fs.existsSync(restoreResult.destinationPath)).toBe(true);
      expect(fs.existsSync(path.join(restoreResult.destinationPath, 'test.txt'))).toBe(true);
    });

    test('should handle download with promises', async () => {
      const testUrl = 'https://raw.githubusercontent.com/nglmercer/node-task-manager/main/README.md';
      
      const { promise } = taskManager.download(testUrl);
      const result = await promise;

      expect(result.filePath).toBeDefined();
      expect(fs.existsSync(result.filePath)).toBe(true);
      expect(result.size).toBeGreaterThan(0);
    }, 15000);

    test('should handle unpack with promises', async () => {
      const { promise: backupPromise } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'unpack-promise.zip',
        useZip: true,
      });

      const backupResult = await backupPromise;

      const { promise: unpackPromise } = taskManager.unpack(backupResult.backupPath, {
        destination: 'unpacked-promise',
      });

      const unpackResult = await unpackPromise;

      expect(unpackResult.unpackDir).toBeDefined();
      expect(fs.existsSync(unpackResult.unpackDir)).toBe(true);
    });
  });

  describe('Mixed API (Events + Promises)', () => {
    test('should emit events while using promises', async () => {
      const events: string[] = [];

      taskManager.on('task:created', () => events.push('created'));
      taskManager.on('task:started', () => events.push('started'));
      taskManager.on('task:progress', () => {
        if (!events.includes('progress')) events.push('progress');
      });
      taskManager.on('task:completed', () => events.push('completed'));

      const { promise } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'mixed-api.zip',
        useZip: true,
      });

      await promise;

      expect(events).toContain('created');
      expect(events).toContain('started');
      expect(events).toContain('progress');
      expect(events).toContain('completed');
    });

    test('should use callback and promise together', async () => {
      let callbackCalled = false;
      let callbackResult: BackupResult | null = null;

      const { promise } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'callback-promise.zip',
        useZip: true,
        onComplete: (result) => {
          callbackCalled = true;
          callbackResult = result;
        }
      });

      const promiseResult = await promise;

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callbackCalled).toBe(true);
      // @ts-ignore
      expect(callbackResult).toEqual(promiseResult);
    });
  });

  describe('waitForTask utility', () => {
    test('should wait for task completion', async () => {
      const { taskId } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'wait-test.zip',
        useZip: true,
      });

      const result = await taskManager.waitForTask<BackupResult>(taskId);

      expect(result).toBeDefined();
      expect(result.backupPath).toBeDefined();
    });

    test('should reject when task fails', async () => {
      const { taskId } = taskManager.createBackup('/nonexistent', {
        outputFilename: 'wait-fail.zip',
        useZip: true,
      });

      try {
        await taskManager.waitForTask(taskId);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBeDefined();
      }
    });

    test('should resolve immediately for completed tasks', async () => {
      const { taskId, promise } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'wait-immediate.zip',
        useZip: true,
      });

      await promise;

      const result = await taskManager.waitForTask<BackupResult>(taskId);
      expect(result).toBeDefined();
    });
  });

  describe('Parallel operations with promises', () => {
    test('should handle multiple parallel backups', async () => {
      const operations = [
        taskManager.createBackup(SOURCE_DIR, { outputFilename: 'parallel-1.zip', useZip: true }),
        taskManager.createBackup(SOURCE_DIR, { outputFilename: 'parallel-2.zip', useZip: true }),
        taskManager.createBackup(SOURCE_DIR, { outputFilename: 'parallel-3.zip', useZip: true }),
      ];

      const results = await Promise.all(operations.map(op => op.promise));

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.backupPath).toBeDefined();
        expect(fs.existsSync(result.backupPath)).toBe(true);
      });
    });

    test('should handle Promise.allSettled for partial failures', async () => {
      const operations = [
        taskManager.createBackup(SOURCE_DIR, { outputFilename: 'success-1.zip', useZip: true }),
        taskManager.createBackup('/nonexistent_directory_that_does_not_exist_12345', { outputFilename: 'fail-1.zip', useZip: true }),
        taskManager.createBackup(SOURCE_DIR, { outputFilename: 'success-2.zip', useZip: true }),
      ];

      const results = await Promise.allSettled(operations.map(op => op.promise));

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });

    test('should handle sequential async operations', async () => {
      const { promise: backupPromise } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'sequential.zip',
        useZip: true,
      });
      const backupResult = await backupPromise;

      const { promise: restorePromise } = taskManager.restoreBackup(backupResult.backupPath, {
        destinationFolderName: 'sequential-restored',
      });
      const restoreResult = await restorePromise;

      expect(fs.existsSync(backupResult.backupPath)).toBe(true);
      expect(fs.existsSync(restoreResult.destinationPath)).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('should provide detailed error in promise rejection', async () => {
      const { promise } = taskManager.createBackup('/path/that/does/not/exist', {
        outputFilename: 'error-test.zip',
        useZip: true,
      });

      try {
        await promise;
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBeDefined();
      }
    });

    test('should handle task not found in waitForTask', async () => {
      try {
        await taskManager.waitForTask('non-existent-task-id');
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('not found');
      }
    });
  });

  describe('Complex workflows', () => {
    test('should handle backup -> restore -> verify workflow', async () => {
      const { promise: backupPromise } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'workflow.zip',
        useZip: true,
      });
      const backup = await backupPromise;

      const { promise: restorePromise } = taskManager.restoreBackup(backup.backupPath, {
        destinationFolderName: 'workflow-restored',
      });
      const restore = await restorePromise;

      const originalContent = fs.readFileSync(path.join(SOURCE_DIR, 'test.txt'), 'utf-8');
      const restoredContent = fs.readFileSync(
        path.join(restore.destinationPath, 'test.txt'),
        'utf-8'
      );

      expect(originalContent).toBe(restoredContent);
    });

    test('should handle download -> unpack workflow', async () => {
      const { promise: backupPromise } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'download-unpack.zip',
        useZip: true,
      });
      const backup = await backupPromise;

      const { promise: unpackPromise } = taskManager.unpack(backup.backupPath, {
        destination: 'download-unpacked',
      });
      const unpack = await unpackPromise;

      expect(fs.existsSync(unpack.unpackDir)).toBe(true);
    });
  });

  describe('TAR.GZ with promises', () => {
    test('should create and restore TAR.GZ backup', async () => {
      const { promise: backupPromise } = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'tar-test.tar.gz',
        useZip: false,
      });
      const backup = await backupPromise;

      expect(backup.backupPath.endsWith('.tar.gz')).toBe(true);

      const { promise: restorePromise } = taskManager.restoreBackup(backup.backupPath, {
        destinationFolderName: 'tar-restored',
      });
      const restore = await restorePromise;

      expect(fs.existsSync(restore.destinationPath)).toBe(true);
      expect(fs.existsSync(path.join(restore.destinationPath, 'test.txt'))).toBe(true);
    }, 10000);
  });
});