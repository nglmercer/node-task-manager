# Node Task Manager

[![NPM version](https://img.shields.io/npm/v/node-task-manager.svg?style=flat)](https://www.npmjs.com/package/node-task-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A robust, event-driven, asynchronous task manager for Node.js, designed to easily handle long-running operations like downloads, file compression (backups), and decompression (restoration) with progress reporting and Promise support.

### Documentation in Spanish: [README.es.md](https://github.com/nglmercer/node-task-manager/blob/main/README.es.md)

## Features

- **Promise-Based API**: All operations return promises for modern async/await workflows
- **Asynchronous Task Management**: Fire and forget or await results - your choice
- **Event-Driven**: Subscribe to events (`task:created`, `task:progress`, `task:completed`, `task:failed`) to monitor task lifecycle
- **File Downloads**: Download files from URLs with progress reporting
- **Backups (Compression)**: Compress directories into `.zip` or `.tar.gz` format
- **Restoration (Decompression)**: Decompress `.zip` and `.tar.gz` files
- **Adapter Pattern**: Flexible compression/decompression with pluggable adapters
- **Custom Adapters**: Create and inject your own compression implementations
- **Detailed Progress Reporting**: Get percentages, processed bytes, and current file being processed
- **Optimized for Large Files**: Memory-efficient streaming for multi-GB archives
- **Written in TypeScript**: Fully typed for better development experience

## Installation

```bash
npm install node-task-manager
```

The package includes all necessary dependencies for compression and decompression operations.

## Basic Usage (Promise-Based)

```typescript
import { TaskManager } from 'node-task-manager';
import type { BackupResult, RestoreResult } from 'node-task-manager';
import fs from 'fs';
import path from 'path';

async function main() {
    // 1. Create TaskManager instance
    const taskManager = new TaskManager({
        downloadPath: './downloads',
        unpackPath: './servers',
        backupPath: './backups',
    });

    // 2. Set up event listeners (optional)
    taskManager.on('task:progress', (task) => {
        console.log(`Progress: ${task.progress}% - ${task.details.currentFile || ''}`);
    });

    // 3. Create backup (Promise-based)
    const { taskId, promise } = taskManager.createBackup('./my_server_data', {
        outputFilename: 'server-backup.zip',
        useZip: true,
    });

    console.log('Backup started with task ID:', taskId);
    
    // Wait for completion
    const backupResult = await promise;
    console.log('Backup completed:', backupResult.backupPath);

    // 4. Restore backup
    const { promise: restorePromise } = taskManager.restoreBackup(
        backupResult.backupPath,
        { destinationFolderName: 'restored-server' }
    );

    const restoreResult = await restorePromise;
    console.log('Restored to:', restoreResult.destinationPath);

    // 5. Download a file
    const { promise: downloadPromise } = taskManager.download(
        'https://example.com/file.zip'
    );

    const downloadResult = await downloadPromise;
    console.log('Downloaded to:', downloadResult.filePath);
}

main().catch(console.error);
```

## Advanced Usage

### Multiple Operations in Parallel

```typescript
// Run multiple backups simultaneously
const operations = [
    taskManager.createBackup('./data1', { outputFilename: 'backup1.zip' }),
    taskManager.createBackup('./data2', { outputFilename: 'backup2.zip' }),
    taskManager.createBackup('./data3', { outputFilename: 'backup3.zip' }),
];

// Wait for all to complete
const results = await Promise.all(operations.map(op => op.promise));
console.log('All backups completed:', results);
```

### Handle Partial Failures

```typescript
const operations = [
    taskManager.createBackup('./valid-path', { outputFilename: 'success.zip' }),
    taskManager.createBackup('/invalid/path', { outputFilename: 'fail.zip' }),
];

const results = await Promise.allSettled(operations.map(op => op.promise));

results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
        console.log(`Operation ${index} succeeded:`, result.value);
    } else {
        console.error(`Operation ${index} failed:`, result.reason);
    }
});
```

### Sequential Operations

```typescript
// Backup -> Restore -> Verify workflow
const backup = await taskManager.createBackup('./source').promise;
const restore = await taskManager.restoreBackup(backup.backupPath).promise;
console.log('Workflow completed!');
```

### Using Callbacks (Legacy Support)

```typescript
taskManager.createBackup('./data', {
    outputFilename: 'backup.zip',
    onComplete: (result, task) => {
        console.log('Backup completed via callback:', result);
    }
});
```

### Wait for Task by ID

```typescript
const { taskId } = taskManager.createBackup('./data');

// Later, wait for this specific task
const result = await taskManager.waitForTask<BackupResult>(taskId);
console.log('Task completed:', result);
```

## API Reference

### Constructor

```typescript
new TaskManager(options?: AssetManagerOptions)
```

**Options:**
- `downloadPath` (string): Directory for downloaded files (default: `./downloads`)
- `unpackPath` (string): Directory for decompressed files (default: `./unpacked`)
- `backupPath` (string): Directory for backup archives (default: `./backups`)

### Methods

All methods return `TaskOperation<T>` with structure:
```typescript
{
    taskId: string;      // Unique task identifier
    promise: Promise<T>; // Promise that resolves with result
}
```

#### `createBackup(sourcePath, options?)`

Creates a compressed backup of a directory.

**Parameters:**
- `sourcePath` (string): Path to directory to backup
- `options` (BackupOptions):
  - `outputFilename?` (string): Custom filename for backup
  - `useZip?` (boolean): Use ZIP format (default: `false`, uses TAR.GZ)
  - `compressionLevel?` (number): 1-9, higher = better compression (default: 6)
  - `onComplete?` (callback): Legacy callback on completion

**Returns:** `TaskOperation<BackupResult>`
- `backupPath` (string): Path to created backup file
- `size` (number): Size in bytes

#### `restoreBackup(archivePath, options?)`

Restores a backup archive to destination.

**Parameters:**
- `archivePath` (string): Path to backup file
- `options` (RestoreOptions):
  - `destinationFolderName?` (string): Custom folder name
  - `onComplete?` (callback): Legacy callback on completion

**Returns:** `TaskOperation<RestoreResult>`
- `destinationPath` (string): Path where files were restored

#### `download(url, options?)`

Downloads a file from URL.

**Parameters:**
- `url` (string): File URL to download
- `options` (DownloadOptions):
  - `fileName?` (string): Custom filename (default: from URL)
  - `onComplete?` (callback): Legacy callback on completion

**Returns:** `TaskOperation<DownloadResult>`
- `filePath` (string): Path to downloaded file
- `size` (number): Size in bytes

#### `unpack(archivePath, options?)`

Decompresses an archive (alias for `restoreBackup`).

**Parameters:**
- `archivePath` (string): Path to archive file
- `options` (UnpackOptions):
  - `destination?` (string): Custom destination folder
  - `deleteAfterUnpack?` (boolean): Delete archive after extraction
  - `onComplete?` (callback): Legacy callback on completion

**Returns:** `TaskOperation<UnpackResult>`
- `unpackDir` (string): Path where files were extracted
- `files?` (string[]): List of extracted files (ZIP only)

#### `waitForTask<T>(taskId)`

Waits for a task to complete and returns its result.

**Parameters:**
- `taskId` (string): Task identifier

**Returns:** `Promise<T>` - Resolves with task result or rejects on failure

#### `getTask(taskId)`

Retrieves task information by ID.

**Returns:** `ITask | null`

#### `getAllTasks()`

Gets all managed tasks.

**Returns:** `ITask[]`

### Events

Subscribe to events using `taskManager.on(event, callback)`:

- `task:created`: New task created
- `task:started`: Task execution started
- `task:progress`: Progress update (throttled to ~100ms)
- `task:completed`: Task finished successfully
- `task:failed`: Task failed with error

**Event Payload:** All events receive an `ITask` object containing:
```typescript
{
    id: string;
    type: TaskType;
    status: TaskStatus;
    progress: number;        // 0-100
    details: {
        percentage?: number;
        processedBytes?: number;
        totalBytes?: number;
        currentFile?: string;
    };
    result: any;            // Filled on completion
    error: string | null;   // Filled on failure
    createdAt: Date;
    updatedAt: Date;
}
```

## Adapter System (NEW)

The library now supports a flexible adapter pattern for compression/decompression operations. This allows you to:

- Use different compression libraries without modifying the core code
- Create custom adapters for specific formats (RAR, 7z, etc.)
- Mock adapters for testing
- Extend functionality without breaking changes

### Available Adapters

- `FflateZipAdapter`: ZIP compression & decompression using fflate (lightweight, fast, streaming)
- `TarAdapter`: TAR/TAR.GZ compression & decompression using tar (streaming support)

### Using Adapters

```typescript
import { CompressionService, FflateZipAdapter } from 'node-task-manager';

// Use default adapters
const service = new CompressionService();
await service.compressDirectory('./src', './backup.zip');

// Or use specific adapter
const customService = new CompressionService([
  new FflateZipAdapter()
]);
await customService.compressDirectory('./src', './backup.zip');
```

### Creating Custom Adapters

```typescript
import type { ICompressionAdapter } from 'node-task-manager';

class MyCustomAdapter implements ICompressionAdapter {
  async compress(sourcePath: string, outputPath: string, options?: any): Promise<void> {
    // Your compression logic
  }

  async decompress(archivePath: string, destinationPath: string, options?: any): Promise<string[]> {
    // Your decompression logic
    return [];
  }

  async canHandle(filePath: string): Promise<boolean> {
    return filePath.endsWith('.myformat');
  }
}

// Use your custom adapter
const service = new CompressionService([new MyCustomAdapter()]);
```

For detailed documentation on adapters, see [docs/ADAPTERS_GUIDE.md](docs/ADAPTERS_GUIDE.md).

## Performance Considerations

For large files (multiple GB):

1. **Memory Optimization**: The package uses streaming with configurable buffers
2. **Compression Level**: Use level 6 for best speed/ratio balance
3. **Node Memory**: For very large operations (10GB+), increase Node memory:
   ```bash
   node --max-old-space-size=4096 your-script.js
   ```

## TypeScript Support

Full TypeScript definitions included:

```typescript
import type { 
    ITask,
    TaskStatus,
    TaskType,
    BackupResult,
    RestoreResult,
    DownloadResult,
    UnpackResult,
    ProgressData
} from 'node-task-manager';
```

## License

[MIT](LICENSE)