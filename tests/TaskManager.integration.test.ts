// tests/integration.test.ts - Advanced Promise-based integration tests

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { TaskManager } from '../src/index.js';
import type { BackupResult, RestoreResult } from '../src/index.js';
import fs from 'fs';
import path from 'path';
import type { TaskStatus } from '../src/Types.js';

const TEST_DIR = './test-integration-promise';
const SOURCE_DIR = path.join(TEST_DIR, 'source');
const DOWNLOADS_DIR = path.join(TEST_DIR, 'downloads');
const UNPACK_DIR = path.join(TEST_DIR, 'unpack');
const BACKUPS_DIR = path.join(TEST_DIR, 'backups');

describe('TaskManager Integration Tests (Promise-based)', () => {
  let taskManager: TaskManager;

  beforeAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SOURCE_DIR, { recursive: true });

    // Crear estructura compleja
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

  test('Full workflow: backup -> restore -> verify (NO SLEEP!)', async () => {
    // Step 1: Create backup
    const { promise: backupPromise } = taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'full-workflow.zip',
      useZip: true,
    });

    const backupResult = await backupPromise;
    expect(fs.existsSync(backupResult.backupPath)).toBe(true);

    // Step 2: Restore backup
    const { promise: restorePromise } = taskManager.restoreBackup(backupResult.backupPath, {
      destinationFolderName: 'full-restore',
    });

    const restoreResult = await restorePromise;

    // Step 3: Verify all files exist
    const restoredPath = restoreResult.destinationPath;
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

  test('Multiple backups in parallel (Promise.all)', async () => {
    const backupOperations = [
      taskManager.createBackup(SOURCE_DIR, { outputFilename: 'parallel-1.zip', useZip: true }),
      taskManager.createBackup(SOURCE_DIR, { outputFilename: 'parallel-2.zip', useZip: true }),
      taskManager.createBackup(SOURCE_DIR, { outputFilename: 'parallel-3.zip', useZip: true }),
    ];

    const results = await Promise.all(backupOperations.map(op => op.promise));

    expect(results).toHaveLength(3);
    results.forEach(result => {
      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath)).toBe(true);
    });

    const allTasks = taskManager.getAllTasks();
    const completedBackups = allTasks.filter(t => t.type === 'backup_compress' && t.status === 'completed');
    expect(completedBackups.length).toBeGreaterThanOrEqual(3);
  });

  test('Compare ZIP vs TAR.GZ backup results (concurrent)', async () => {
    const [zipResult, tarResult] = await Promise.all([
      taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'compare.zip',
        useZip: true,
      }).promise,
      taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'compare.tar.gz',
        useZip: false,
      }).promise,
    ]);

    expect(fs.existsSync(zipResult.backupPath)).toBe(true);
    expect(fs.existsSync(tarResult.backupPath)).toBe(true);

    const zipStats = fs.statSync(zipResult.backupPath);
    const tarStats = fs.statSync(tarResult.backupPath);
    
    expect(zipStats.size).toBeGreaterThan(0);
    expect(tarStats.size).toBeGreaterThan(0);
  });

  test('Restore multiple backups to different locations (parallel)', async () => {
    // Crear backup primero
    const { promise: backupPromise } = taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'multi-restore.zip',
      useZip: true,
    });

    const backup = await backupPromise;

    // Restaurar a múltiples ubicaciones en paralelo
    const [restore1, restore2] = await Promise.all([
      taskManager.restoreBackup(backup.backupPath, {
        destinationFolderName: 'restore-location-1',
      }).promise,
      taskManager.restoreBackup(backup.backupPath, {
        destinationFolderName: 'restore-location-2',
      }).promise,
    ]);

    expect(fs.existsSync(restore1.destinationPath)).toBe(true);
    expect(fs.existsSync(restore2.destinationPath)).toBe(true);
  });

  test('Event sequence validation with promises', async () => {
    const events: Array<{ type: string; timestamp: number }> = [];

    taskManager.on('task:created', () => events.push({ type: 'created', timestamp: Date.now() }));
    taskManager.on('task:started', () => events.push({ type: 'started', timestamp: Date.now() }));
    taskManager.on('task:progress', () => {
      if (!events.some(e => e.type === 'progress')) {
        events.push({ type: 'progress', timestamp: Date.now() });
      }
    });
    taskManager.on('task:completed', () => events.push({ type: 'completed', timestamp: Date.now() }));

    const { promise } = taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'event-sequence.zip',
      useZip: true,
    });

    await promise;

    // Verificar orden de eventos
    expect(events[0].type).toBe('created');
    expect(events[1].type).toBe('started');
    expect(events.some(e => e.type === 'progress')).toBe(true);
    expect(events[events.length - 1].type).toBe('completed');

    // Verificar que los eventos ocurrieron en orden cronológico
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
    }
  });

  test('Large file structure backup with progress tracking', async () => {
    const largeDir = path.join(TEST_DIR, 'large-source');
    fs.mkdirSync(largeDir, { recursive: true });

    // Crear estructura grande
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

    let progressEvents = 0;
    let maxProgress = 0;

    taskManager.on('task:progress', (task) => {
      progressEvents++;
      if (task.progress > maxProgress) {
        maxProgress = task.progress;
      }
    });

    const { promise } = taskManager.createBackup(largeDir, {
      outputFilename: 'large-backup.zip',
      useZip: true,
    });

    const result = await promise;

    expect(result.backupPath).toBeDefined();
    expect(fs.existsSync(result.backupPath)).toBe(true);
    expect(progressEvents).toBeGreaterThan(0);
    expect(maxProgress).toBe(100);
  }, 15000);

  test('Chain multiple operations sequentially', async () => {
    // 1. Crear backup
    const backup1 = await taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'chain-1.zip',
      useZip: true,
    }).promise;

    // 2. Restaurar
    const restore1 = await taskManager.restoreBackup(backup1.backupPath, {
      destinationFolderName: 'chain-restore-1',
    }).promise;

    // 3. Crear nuevo backup del restaurado
    const backup2 = await taskManager.createBackup(restore1.destinationPath, {
      outputFilename: 'chain-2.zip',
      useZip: true,
    }).promise;

    // 4. Restaurar el segundo backup
    const restore2 = await taskManager.restoreBackup(backup2.backupPath, {
      destinationFolderName: 'chain-restore-2',
    }).promise;

    // Verificar que todos los archivos existen
    expect(fs.existsSync(backup1.backupPath)).toBe(true);
    expect(fs.existsSync(restore1.destinationPath)).toBe(true);
    expect(fs.existsSync(backup2.backupPath)).toBe(true);
    expect(fs.existsSync(restore2.destinationPath)).toBe(true);

    // Verificar integridad de contenido
    const originalContent = fs.readFileSync(path.join(SOURCE_DIR, 'file1.txt'), 'utf-8');
    const finalContent = fs.readFileSync(path.join(restore2.destinationPath, 'file1.txt'), 'utf-8');
    expect(finalContent).toBe(originalContent);
  });

  test('Handle mixed success and failure with Promise.allSettled', async () => {
    const operations = [
      taskManager.createBackup(SOURCE_DIR, { outputFilename: 'success-1.zip', useZip: true }).promise,
      taskManager.createBackup('/invalid/path/1', { outputFilename: 'fail-1.zip', useZip: true }).promise,
      taskManager.createBackup(SOURCE_DIR, { outputFilename: 'success-2.zip', useZip: true }).promise,
      taskManager.createBackup('/invalid/path/2', { outputFilename: 'fail-2.zip', useZip: true }).promise,
    ];

    const results = await Promise.allSettled(operations);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes.length).toBe(2);
    expect(failures.length).toBe(2);

    // Verificar que los exitosos tienen archivos
    successes.forEach(result => {
      if (result.status === 'fulfilled') {
        expect(fs.existsSync(result.value.backupPath)).toBe(true);
      }
    });
  });

  test('Race condition: first backup to complete', async () => {
    const operations = [
      taskManager.createBackup(SOURCE_DIR, { outputFilename: 'race-1.zip', useZip: true }).promise,
      taskManager.createBackup(SOURCE_DIR, { outputFilename: 'race-2.zip', useZip: true }).promise,
      taskManager.createBackup(SOURCE_DIR, { outputFilename: 'race-3.zip', useZip: true }).promise,
    ];

    const firstCompleted = await Promise.race(operations);

    expect(firstCompleted).toBeDefined();
    expect(firstCompleted.backupPath).toBeDefined();
    expect(fs.existsSync(firstCompleted.backupPath)).toBe(true);

    // Esperar a que todos terminen
    await Promise.all(operations);

    // Verificar que todos se completaron
    const allTasks = taskManager.getAllTasks();
    const completedTasks = allTasks.filter(t => t.status === 'completed');
    expect(completedTasks.length).toBeGreaterThanOrEqual(3);
  });

  test('Delete after unpack with promises', async () => {
    // Crear backup
    const backup = await taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'delete-after.zip',
      useZip: true,
    }).promise;

    const backupPath = backup.backupPath;
    expect(fs.existsSync(backupPath)).toBe(true);

    // Desempaquetar con deleteAfterUnpack
    await taskManager.unpack(backupPath, {
      destination: 'deleted-after-unpack',
      deleteAfterUnpack: true,
    }).promise;

    // El archivo de backup no debe existir
    expect(fs.existsSync(backupPath)).toBe(false);
  });

  test('Timeout handling with Promise.race', async () => {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timeout')), 10000)
    );

    const { promise: backupPromise } = taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'timeout-test.zip',
      useZip: true,
    });

    // El backup debería completar antes del timeout
    const result = await Promise.race([backupPromise, timeoutPromise]);
    
    expect(result).toBeDefined();
    expect((result as BackupResult).backupPath).toBeDefined();
  });

  test('Concurrent operations with task tracking', async () => {
    const taskIds: string[] = [];
    
    const operations = Array.from({ length: 5 }, (_, i) => {
      const op = taskManager.createBackup(SOURCE_DIR, {
        outputFilename: `concurrent-${i}.zip`,
        useZip: true,
      });
      taskIds.push(op.taskId);
      return op.promise;
    });

    await Promise.all(operations);

    // Verificar que todas las tareas están registradas
    taskIds.forEach(taskId => {
      const task = taskManager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.status).toBe('completed' as TaskStatus);
      expect(task?.progress).toBe(100);
    });
  });

  test('Error recovery: retry failed operation', async () => {
    // Intentar backup que falla
    const failOp = taskManager.createBackup('/invalid/path', {
      outputFilename: 'retry-fail.zip',
      useZip: true,
    });

    try {
      await failOp.promise;
      expect(true).toBe(false); // No debería llegar aquí
    } catch (error) {
      expect(error).toBeDefined();
    }

    // Reintentar con ruta válida
    const { promise: retryPromise } = taskManager.createBackup(SOURCE_DIR, {
      outputFilename: 'retry-success.zip',
      useZip: true,
    });

    const result = await retryPromise;
    expect(result.backupPath).toBeDefined();
    expect(fs.existsSync(result.backupPath)).toBe(true);
  });
});