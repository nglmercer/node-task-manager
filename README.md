# Node Task Manager

[![NPM version](https://img.shields.io/npm/v/node-task-manager.svg?style=flat)](https://www.npmjs.com/package/node-task-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A robust, event-driven, asynchronous task manager for Node.js, designed to easily handle long-running operations like downloads, file compression (backups), and decompression (restoration) with progress reporting.
### Documentation in spanish [README.es.md](https://github.com/nglmercer/node-task-manager/blob/main/README.es.md)
## Features

- **Asynchronous Task Management**: Fire and forget. The manager handles the rest.
- **Event-Driven**: Subscribe to events (`task:created`, `task:progress`, `task:completed`, `task:failed`) to monitor the lifecycle of each task.
- **File Downloads**: Download files from a URL with progress reporting.
- **Backups (Compression)**: Easily compress directories into `.zip` or `.tar.gz` format.
- **Restoration (Decompression)**: Decompress `.zip` and `.tar.gz` files to a specific destination.
- **Detailed Progress Reporting**: Get percentages, processed bytes, and the current file being processed.
- **Written in TypeScript**: Fully typed for a better development experience.

## Installation

```bash
npm install node-task-manager axios archiver tar-stream
```

**Note:** `axios`, `archiver`, and `tar-stream` are peer dependencies and must be installed in your project. For decompressing `.zip` files, you will also need `decompress`:
```bash
npm install decompress
```


## Basic Usage

Here is a complete example of how to use the `TaskManager`.

```typescript
// example.ts
import { TaskManager } from 'node-task-manager'; // How you would import it in your project
import type { ITask } from 'node-task-manager';
import fs from 'fs';
import path from 'path';

// --- Test Directories ---
const SOURCE_DIR = './temp/my_server_data';
const DOWNLOADS_DIR = './temp/downloads';
const UNPACK_DIR = './temp/servers';
const BACKUPS_DIR = './temp/backups';

// --- Helper function to wait a bit ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Main async function ---
async function main() {
    console.log('--- Starting TaskManager Demo ---');

    // 1. Clean up and prepare test directories
    fs.rmSync('./temp', { recursive: true, force: true });
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(SOURCE_DIR, 'config.json'), '{ "port": 8080 }');
    fs.writeFileSync(path.join(SOURCE_DIR, 'README.md'), 'This is my server data.');

    // 2. Instantiate the TaskManager
    const taskManager = new TaskManager({
        downloadPath: DOWNLOADS_DIR,
        unpackPath: UNPACK_DIR,
        backupPath: BACKUPS_DIR,
    });

    // 3. Set up event listeners
    taskManager.on('task:created', (task: ITask) => console.log(`[CREATED] Task ${task.id} (${task.type}) created.`));
    taskManager.on('task:started', (task: ITask) => console.log(`[STARTED] Task ${task.id} started.`));
    taskManager.on('task:failed', (task: ITask) => console.error(`[FAILED] Task ${task.id}: ${task.error}`));
    taskManager.on('task:completed', (task: ITask) => {
        console.log(`✅ [COMPLETED] Task ${task.id} finished successfully!`);
        console.log('   Result:', task.result);
    });
    taskManager.on('task:progress', (task: ITask) => {
        const progressDetails = task.details.currentFile ? ` - File: ${path.basename(task.details.currentFile as string)}` : '';
        console.log(`[PROGRESS] Task ${task.id} (${task.type}): ${task.progress.toFixed(0)}%${progressDetails}`);
    });

    // 4. Execute Task: Create a Backup
    console.log('\n[Step 2] Creating a backup of the test directory...');
    const backupTaskId = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'server-backup.zip',
        useZip: true,
    });
    await sleep(2000); // In a real app, you would handle completion with the 'task:completed' event

    // 5. Execute Task: Restore the Backup
    const backupResult = taskManager.getTask(backupTaskId)?.result as any;
    if (backupResult?.backupPath) {
        await taskManager.restoreBackup(backupResult.backupPath, {
            destinationFolderName: 'my-restored-server',
        });
        await sleep(2000);
    }

    // 6. Execute Task: Download a file
    const downloadUrl = 'https://file-examples.com/storage/fe52cb0bf1943583f3a562d/2017/02/zip_2MB.zip';
    await taskManager.download(downloadUrl);
    await sleep(5000); // Wait for the download to finish

    console.log('\n--- Demo Finished ---');
    console.log('\nCheck the directories in the "temp" folder to see the results.');
    console.log('\nList of all executed tasks:');
    console.table(taskManager.getAllTasks());
}

main().catch(console.error);
```

## API

### `new TaskManager(options)`
Creates a new manager instance.

- `options` `<object>`
  - `downloadPath` `<string>` Directory to save downloaded files.
  - `unpackPath` `<string>` Directory to decompress files.
  - `backupPath` `<string>` Directory to save backups.

### Events
The `taskManager` emits the following events. All of them receive an `ITask` object as an argument.

- `task:created`: Emitted when a new task is created.
- `task:started`: Emitted when a task starts its execution.
- `task:progress`: Emitted periodically during a task's execution.
- `task:completed`: Emitted when a task finishes successfully.
- `task:failed`: Emitted if a task fails.

### Methods

- `async createBackup(sourcePath, options)`: Compresses a directory. Returns the `taskId`.
- `async restoreBackup(archivePath, options)`: Decompresses an archive file. Returns the `taskId`.
- `async download(url, options)`: Downloads a file. Returns the `taskId`.
- `async unpack(archivePath, options)`: Alias for `restoreBackup`. Returns the `taskId`.
- `getTask(taskId)`: Returns the task object by its ID, or `null` if it doesn't exist.
- `getAllTasks()`: Returns an array with all managed tasks.

## Types
The package exports all the necessary interfaces and enums for a full TypeScript integration, including `ITask`, `TaskStatus`, `TaskType`, etc.

## License

[MIT](LICENSE)