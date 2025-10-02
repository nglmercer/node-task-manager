import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { TaskManager } from '../src/index';
import fs from 'fs';
import path from 'path';

const TEST_DIR = './test-integration';
const SOURCE_DIR = path.join(TEST_DIR, 'source');
const DOWNLOADS_DIR = path.join(TEST_DIR, 'downloads');
const UNPACK_DIR = path.join(TEST_DIR, 'unpack');
const BACKUPS_DIR = path.join(TEST_DIR, 'backups');

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('TaskManager Integration Tests', () => {
  let taskManager: TaskManager;

  beforeAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SOURCE_DIR, { recursive: true });

    // Create more complex file structure
    fs.writeFileSync(path.join(SOURCE_DIR, 'file1.txt'), 'Content 1');
    fs.writeFileSync(path.join(SOURCE_DIR, 'file2.json'), JSON.stringify({ data: 'test' }));
    
    const subDir1 = path.join(SOURCE_DIR, 'subdir1');
    const subDir2 = path.join(SOURCE_DIR, 'subdir2');
    fs.mkdirSync(subDir1);
    fs.mkdirSync(subDir2);
    
    fs.writeFileSync(path.join(subDir1, 'nested1.txt'), 'Nested 1');
    fs.writeFileSync(path.join(subDir2, 'nested2.txt'), 'Nested 2');

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

  test('Full workflow: backup -> restore -> verify', async () => {
    // Step 1: Create backup
    const backupTaskId = await taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'full-workflow.zip',
      useZip: true,
    });

    await sleep(1500);

    const backupTask = taskManager.getTask(backupTaskId);
    expect(backupTask?.status).toBe('completed');

    const backupPath = (backupTask?.result as any)?.backupPath;
    expect(fs.existsSync(backupPath)).toBe(true);

    // Step 2: Restore backup
    const restoreTaskId = await taskManager.restoreBackup(backupPath, {
      destinationFolderName: 'full-restore',
    });

    await sleep(1500);

    const restoreTask = taskManager.getTask(restoreTaskId);
    expect(restoreTask?.status).toBe('completed');

    // Step 3: Verify all files exist
    const restoredPath = path.join(UNPACK_DIR, 'full-restore');
    expect(fs.existsSync(path.join(restoredPath, 'file1.txt'))).toBe(true);
    expect(fs.existsSync(path.join(restoredPath, 'file2.json'))).toBe(true);
    expect(fs.existsSync(path.join(restoredPath, 'subdir1', 'nested1.txt'))).toBe(true);
    expect(fs.existsSync(path.join(restoredPath, 'subdir2', 'nested2.txt'))).toBe(true);

    // Step 4: Verify file contents
    const file1Content = fs.readFileSync(path.join(restoredPath, 'file1.txt'), 'utf-8');
    expect(file1Content).toBe('Content 1');

    const file2Content = JSON.parse(fs.readFileSync(path.join(restoredPath, 'file2.json'), 'utf-8'));
    expect(file2Content.data).toBe('test');
  });

  test('Multiple backups in sequence', async () => {
    const backupIds = [];

    for (let i = 0; i < 3; i++) {
      const taskId = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: `sequential-${i}.zip`,
        useZip: true,
      });
      backupIds.push(taskId);
    }

    await sleep(3000);

    for (const taskId of backupIds) {
      const task = taskManager.getTask(taskId);
      expect(task?.status).toBe('completed');
    }

    const allTasks = taskManager.getAllTasks();
    const completedBackups = allTasks.filter(t => t.type === 'backup_compress' && t.status === 'completed');
    expect(completedBackups.length).toBeGreaterThanOrEqual(3);
  });

  test('Compare ZIP vs TAR.GZ backup results', async () => {
    // Create ZIP backup
    const zipTaskId = await taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'compare.zip',
      useZip: true,
    });

    // Create TAR.GZ backup
    const tarTaskId = await taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'compare.tar.gz',
      useZip: false,
    });

    await sleep(2000);

    const zipTask = taskManager.getTask(zipTaskId);
    const tarTask = taskManager.getTask(tarTaskId);

    expect(zipTask?.status).toBe('completed');
    expect(tarTask?.status).toBe('completed');

    const zipPath = (zipTask?.result as any)?.backupPath;
    const tarPath = (tarTask?.result as any)?.backupPath;

    // Both files should exist
    expect(fs.existsSync(zipPath)).toBe(true);
    expect(fs.existsSync(tarPath)).toBe(true);

    // Both should have reasonable sizes
    const zipStats = fs.statSync(zipPath);
    const tarStats = fs.statSync(tarPath);
    expect(zipStats.size).toBeGreaterThan(0);
    expect(tarStats.size).toBeGreaterThan(0);
  });

  test('Restore multiple backups to different locations', async () => {
    // Create a backup first
    const backupTaskId = await taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'multi-restore.zip',
      useZip: true,
    });

    await sleep(1000);

    const backupTask = taskManager.getTask(backupTaskId);
    const backupPath = (backupTask?.result as any)?.backupPath;

    // Restore to multiple locations
    const restore1 = await taskManager.restoreBackup(backupPath, {
      destinationFolderName: 'restore-location-1',
    });

    const restore2 = await taskManager.restoreBackup(backupPath, {
      destinationFolderName: 'restore-location-2',
    });

    await sleep(2000);

    const restore1Task = taskManager.getTask(restore1);
    const restore2Task = taskManager.getTask(restore2);

    expect(restore1Task?.status).toBe('completed');
    expect(restore2Task?.status).toBe('completed');

    // Both locations should exist
    expect(fs.existsSync(path.join(UNPACK_DIR, 'restore-location-1'))).toBe(true);
    expect(fs.existsSync(path.join(UNPACK_DIR, 'restore-location-2'))).toBe(true);
  });

  test('Event sequence validation', async () => {
    const events: string[] = [];

    taskManager.on('task:created', () => events.push('created'));
    taskManager.on('task:started', () => events.push('started'));
    taskManager.on('task:progress', () => {
      if (!events.includes('progress')) {
        events.push('progress');
      }
    });
    taskManager.on('task:completed', () => events.push('completed'));

    await taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'event-sequence.zip',
      useZip: true,
    });

    await sleep(1500);

    // Verify event order
    expect(events[0]).toBe('created');
    expect(events[1]).toBe('started');
    expect(events).toContain('progress');
    expect(events[events.length - 1]).toBe('completed');
  });

  test('Large file structure backup', async () => {
    // Create a larger file structure
    const largeDir = path.join(TEST_DIR, 'large-source');
    fs.mkdirSync(largeDir, { recursive: true });

    // Create multiple files and directories
    for (let i = 0; i < 10; i++) {
      const dir = path.join(largeDir, `dir-${i}`);
      fs.mkdirSync(dir);
      for (let j = 0; j < 5; j++) {
        fs.writeFileSync(
          path.join(dir, `file-${j}.txt`),
          `Content for file ${j} in dir ${i}\n`.repeat(100)
        );
      }
    }

    const taskId = await taskManager.createBackup(largeDir, {
      outputFilename: 'large-backup.zip',
      useZip: true,
    });

    await sleep(3000);

    const task = taskManager.getTask(taskId);
    expect(task?.status).toBe('completed');
    expect(task?.progress).toBe(100);
  }, 15000);
});