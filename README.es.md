# Node Task Manager

[![NPM version](https://img.shields.io/npm/v/node-task-manager.svg?style=flat)](https://www.npmjs.com/package/node-task-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Un gestor de tareas asíncrono, robusto y basado en eventos para Node.js, diseñado para manejar operaciones de larga duración como descargas, compresión de archivos (backups) y descompresión (restauración) de forma sencilla y con reporte de progreso.

## Características

- **Gestión de Tareas Asíncronas**: Crea y olvídate. El gestor se encarga del resto.
- **Basado en Eventos**: Suscríbete a eventos (`task:created`, `task:progress`, `task:completed`, `task:failed`) para monitorizar el ciclo de vida de cada tarea.
- **Descarga de Archivos**: Descarga archivos desde una URL con reporte de progreso.
- **Backups (Compresión)**: Comprime directorios fácilmente a formato `.zip` o `.tar.gz`.
- **Restauración (Descompresión)**: Descomprime archivos `.zip` y `.tar.gz` en un destino específico.
- **Reporte de Progreso Detallado**: Obtén porcentajes, bytes procesados y el archivo actual en procesamiento.
- **Escrito en TypeScript**: Totalmente tipado para una mejor experiencia de desarrollo.

## Instalación

```bash
npm install node-task-manager axios archiver tar-stream
```

**Nota:** `axios`, `archiver` y `tar-stream` son dependencias de pares (`peerDependencies`) y deben ser instaladas en tu proyecto. Para la descompresión de archivos `.zip`, también necesitarás `decompress`:
```bash
npm install decompress
```


## Uso Básico

Aquí tienes un ejemplo completo de cómo usar el `TaskManager`.

```typescript
// example.ts
import { TaskManager } from 'node-task-manager'; // Así lo importarías en tu proyecto
import type { ITask } from 'node-task-manager';
import fs from 'fs';
import path from 'path';

// --- Directorios de prueba ---
const SOURCE_DIR = './temp/my_server_data';
const DOWNLOADS_DIR = './temp/downloads';
const UNPACK_DIR = './temp/servers';
const BACKUPS_DIR = './temp/backups';

// --- Función de ayuda para esperar un poco ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Función principal asíncrona ---
async function main() {
    console.log('--- Iniciando Demo de TaskManager ---');

    // 1. Limpiar y preparar directorios de prueba
    fs.rmSync('./temp', { recursive: true, force: true });
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(SOURCE_DIR, 'config.json'), '{ "port": 8080 }');
    fs.writeFileSync(path.join(SOURCE_DIR, 'README.md'), 'This is my server data.');

    // 2. Instanciar el TaskManager
    const taskManager = new TaskManager({
        downloadPath: DOWNLOADS_DIR,
        unpackPath: UNPACK_DIR,
        backupPath: BACKUPS_DIR,
    });

    // 3. Configurar los listeners de eventos
    taskManager.on('task:created', (task: ITask) => console.log(`[CREATED] Tarea ${task.id} (${task.type}) creada.`));
    taskManager.on('task:started', (task: ITask) => console.log(`[STARTED] Tarea ${task.id} iniciada.`));
    taskManager.on('task:failed', (task: ITask) => console.error(`[FAILED] Tarea ${task.id}: ${task.error}`));
    taskManager.on('task:completed', (task: ITask) => {
        console.log(`✅ [COMPLETED] Tarea ${task.id} finalizada con éxito!`);
        console.log('   Resultado:', task.result);
    });
    taskManager.on('task:progress', (task: ITask) => {
        const progressDetails = task.details.currentFile ? ` - Archivo: ${path.basename(task.details.currentFile as string)}` : '';
        console.log(`[PROGRESS] Tarea ${task.id} (${task.type}): ${task.progress.toFixed(0)}%${progressDetails}`);
    });

    // 4. Ejecutar Tarea: Crear un Backup
    console.log('\n[Paso 2] Creando un backup del directorio de prueba...');
    const backupTaskId = await taskManager.createBackup(SOURCE_DIR, {
        outputFilename: 'server-backup.zip',
        useZip: true,
    });
    await sleep(2000); // En una app real, manejarías la finalización con el evento 'task:completed'

    // 5. Ejecutar Tarea: Restaurar el Backup
    const backupResult = taskManager.getTask(backupTaskId)?.result as any;
    if (backupResult?.backupPath) {
        await taskManager.restoreBackup(backupResult.backupPath, {
            destinationFolderName: 'my-restored-server',
        });
        await sleep(2000);
    }

    // 6. Ejecutar Tarea: Descargar un archivo
    const downloadUrl = 'https://file-examples.com/storage/fe52cb0bf1943583f3a562d/2017/02/zip_2MB.zip';
    await taskManager.download(downloadUrl);
    await sleep(5000); // Esperar a que la descarga termine

    console.log('\n--- Demo Finalizada ---');
    console.log('\nRevisa los directorios en la carpeta "temp" para ver los resultados.');
    console.log('\nListado de todas las tareas ejecutadas:');
    console.table(taskManager.getAllTasks());
}

main().catch(console.error);
```

## API

### `new TaskManager(options)`
Crea una nueva instancia del gestor.

- `options` `<object>`
  - `downloadPath` `<string>` Directorio para guardar archivos descargados.
  - `unpackPath` `<string>` Directorio para descomprimir archivos.
  - `backupPath` `<string>` Directorio para guardar los backups.

### Eventos
El `taskManager` emite los siguientes eventos. Todos reciben un objeto `ITask` como argumento.

- `task:created`: Se emite cuando una nueva tarea es creada.
- `task:started`: Se emite cuando una tarea comienza su ejecución.
- `task:progress`: Se emite periódicamente durante la ejecución de una tarea.
- `task:completed`: Se emite cuando una tarea finaliza con éxito.
- `task:failed`: Se emite si una tarea falla.

### Métodos

- `async createBackup(sourcePath, options)`: Comprime un directorio. Devuelve el `taskId`.
- `async restoreBackup(archivePath, options)`: Descomprime un archivo. Devuelve el `taskId`.
- `async download(url, options)`: Descarga un archivo. Devuelve el `taskId`.
- `async unpack(archivePath, options)`: Alias para `restoreBackup`. Devuelve el `taskId`.
- `getTask(taskId)`: Devuelve el objeto de una tarea por su ID, o `null` si no existe.
- `getAllTasks()`: Devuelve un array con todas las tareas gestionadas.

## Tipos
El paquete exporta todas las interfaces y enums necesarios para una integración completa con TypeScript, incluyendo `ITask`, `TaskStatus`, `TaskType`, etc.

## Licencia

[MIT](LICENSE)