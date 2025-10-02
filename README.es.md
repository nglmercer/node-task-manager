# Node Task Manager

[![NPM version](https://img.shields.io/npm/v/node-task-manager.svg?style=flat)](https://www.npmjs.com/package/node-task-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Un gestor de tareas robusto, basado en eventos y asíncrono para Node.js, diseñado para manejar fácilmente operaciones de larga duración como descargas, compresión de archivos (backups) y descompresión (restauración) con reporte de progreso y soporte de Promesas.

### Documentación en inglés: [README.md](https://github.com/nglmercer/node-task-manager/blob/main/README.md)

## Características

- **API Basada en Promesas**: Todas las operaciones retornan promesas para flujos modernos con async/await
- **Gestión Asíncrona de Tareas**: Ejecuta y olvida o espera resultados - tú decides
- **Basado en Eventos**: Suscríbete a eventos (`task:created`, `task:progress`, `task:completed`, `task:failed`) para monitorear el ciclo de vida de las tareas
- **Descargas de Archivos**: Descarga archivos desde URLs con reporte de progreso
- **Backups (Compresión)**: Comprime directorios en formato `.zip` o `.tar.gz`
- **Restauración (Descompresión)**: Descomprime archivos `.zip` y `.tar.gz`
- **Reporte Detallado de Progreso**: Obtén porcentajes, bytes procesados y archivo actual en proceso
- **Optimizado para Archivos Grandes**: Streaming eficiente en memoria para archivos de múltiples GB
- **Escrito en TypeScript**: Completamente tipado para mejor experiencia de desarrollo

## Instalación

```bash
npm install node-task-manager
```

El paquete incluye todas las dependencias necesarias para operaciones de compresión y descompresión.

## Uso Básico (Basado en Promesas)

```typescript
import { TaskManager } from 'node-task-manager';
import type { BackupResult, RestoreResult } from 'node-task-manager';
import fs from 'fs';
import path from 'path';

async function main() {
    // 1. Crear instancia de TaskManager
    const taskManager = new TaskManager({
        downloadPath: './descargas',
        unpackPath: './servidores',
        backupPath: './backups',
    });

    // 2. Configurar listeners de eventos (opcional)
    taskManager.on('task:progress', (task) => {
        console.log(`Progreso: ${task.progress}% - ${task.details.currentFile || ''}`);
    });

    // 3. Crear backup (basado en promesas)
    const { taskId, promise } = taskManager.createBackup('./datos_servidor', {
        outputFilename: 'backup-servidor.zip',
        useZip: true,
    });

    console.log('Backup iniciado con ID:', taskId);
    
    // Esperar a que se complete
    const backupResult = await promise;
    console.log('Backup completado:', backupResult.backupPath);

    // 4. Restaurar backup
    const { promise: restorePromise } = taskManager.restoreBackup(
        backupResult.backupPath,
        { destinationFolderName: 'servidor-restaurado' }
    );

    const restoreResult = await restorePromise;
    console.log('Restaurado en:', restoreResult.destinationPath);

    // 5. Descargar un archivo
    const { promise: downloadPromise } = taskManager.download(
        'https://ejemplo.com/archivo.zip'
    );

    const downloadResult = await downloadPromise;
    console.log('Descargado en:', downloadResult.filePath);
}

main().catch(console.error);
```

## Uso Avanzado

### Múltiples Operaciones en Paralelo

```typescript
// Ejecutar múltiples backups simultáneamente
const operaciones = [
    taskManager.createBackup('./datos1', { outputFilename: 'backup1.zip' }),
    taskManager.createBackup('./datos2', { outputFilename: 'backup2.zip' }),
    taskManager.createBackup('./datos3', { outputFilename: 'backup3.zip' }),
];

// Esperar a que todos se completen
const resultados = await Promise.all(operaciones.map(op => op.promise));
console.log('Todos los backups completados:', resultados);
```

### Manejar Fallos Parciales

```typescript
const operaciones = [
    taskManager.createBackup('./ruta-valida', { outputFilename: 'exito.zip' }),
    taskManager.createBackup('/ruta/invalida', { outputFilename: 'fallo.zip' }),
];

const resultados = await Promise.allSettled(operaciones.map(op => op.promise));

resultados.forEach((resultado, indice) => {
    if (resultado.status === 'fulfilled') {
        console.log(`Operación ${indice} exitosa:`, resultado.value);
    } else {
        console.error(`Operación ${indice} falló:`, resultado.reason);
    }
});
```

### Operaciones Secuenciales

```typescript
// Flujo Backup -> Restaurar -> Verificar
const backup = await taskManager.createBackup('./origen').promise;
const restauracion = await taskManager.restoreBackup(backup.backupPath).promise;
console.log('¡Flujo completado!');
```

### Usando Callbacks (Soporte Legacy)

```typescript
taskManager.createBackup('./datos', {
    outputFilename: 'backup.zip',
    onComplete: (resultado, tarea) => {
        console.log('Backup completado vía callback:', resultado);
    }
});
```

### Esperar una Tarea por ID

```typescript
const { taskId } = taskManager.createBackup('./datos');

// Más tarde, esperar esta tarea específica
const resultado = await taskManager.waitForTask<BackupResult>(taskId);
console.log('Tarea completada:', resultado);
```

## Referencia de API

### Constructor

```typescript
new TaskManager(options?: AssetManagerOptions)
```

**Opciones:**
- `downloadPath` (string): Directorio para archivos descargados (por defecto: `./downloads`)
- `unpackPath` (string): Directorio para archivos descomprimidos (por defecto: `./unpacked`)
- `backupPath` (string): Directorio para archivos de backup (por defecto: `./backups`)

### Métodos

Todos los métodos retornan `TaskOperation<T>` con la estructura:
```typescript
{
    taskId: string;      // Identificador único de la tarea
    promise: Promise<T>; // Promesa que resuelve con el resultado
}
```

#### `createBackup(sourcePath, options?)`

Crea un backup comprimido de un directorio.

**Parámetros:**
- `sourcePath` (string): Ruta al directorio para respaldar
- `options` (BackupOptions):
  - `outputFilename?` (string): Nombre personalizado para el backup
  - `useZip?` (boolean): Usar formato ZIP (por defecto: `false`, usa TAR.GZ)
  - `compressionLevel?` (number): 1-9, mayor = mejor compresión (por defecto: 6)
  - `onComplete?` (callback): Callback legacy al completar

**Retorna:** `TaskOperation<BackupResult>`
- `backupPath` (string): Ruta al archivo de backup creado
- `size` (number): Tamaño en bytes

#### `restoreBackup(archivePath, options?)`

Restaura un archivo de backup al destino.

**Parámetros:**
- `archivePath` (string): Ruta al archivo de backup
- `options` (RestoreOptions):
  - `destinationFolderName?` (string): Nombre personalizado de carpeta
  - `onComplete?` (callback): Callback legacy al completar

**Retorna:** `TaskOperation<RestoreResult>`
- `destinationPath` (string): Ruta donde se restauraron los archivos

#### `download(url, options?)`

Descarga un archivo desde una URL.

**Parámetros:**
- `url` (string): URL del archivo a descargar
- `options` (DownloadOptions):
  - `fileName?` (string): Nombre personalizado (por defecto: desde URL)
  - `onComplete?` (callback): Callback legacy al completar

**Retorna:** `TaskOperation<DownloadResult>`
- `filePath` (string): Ruta al archivo descargado
- `size` (number): Tamaño en bytes

#### `unpack(archivePath, options?)`

Descomprime un archivo (alias de `restoreBackup`).

**Parámetros:**
- `archivePath` (string): Ruta al archivo comprimido
- `options` (UnpackOptions):
  - `destination?` (string): Carpeta de destino personalizada
  - `deleteAfterUnpack?` (boolean): Eliminar archivo después de extraer
  - `onComplete?` (callback): Callback legacy al completar

**Retorna:** `TaskOperation<UnpackResult>`
- `unpackDir` (string): Ruta donde se extrajeron los archivos
- `files?` (string[]): Lista de archivos extraídos (solo ZIP)

#### `waitForTask<T>(taskId)`

Espera a que una tarea se complete y retorna su resultado.

**Parámetros:**
- `taskId` (string): Identificador de la tarea

**Retorna:** `Promise<T>` - Resuelve con el resultado de la tarea o rechaza en caso de fallo

#### `getTask(taskId)`

Obtiene información de una tarea por su ID.

**Retorna:** `ITask | null`

#### `getAllTasks()`

Obtiene todas las tareas gestionadas.

**Retorna:** `ITask[]`

### Eventos

Suscríbete a eventos usando `taskManager.on(evento, callback)`:

- `task:created`: Nueva tarea creada
- `task:started`: Ejecución de tarea iniciada
- `task:progress`: Actualización de progreso (limitado a ~100ms)
- `task:completed`: Tarea finalizada exitosamente
- `task:failed`: Tarea falló con error

**Payload del Evento:** Todos los eventos reciben un objeto `ITask` conteniendo:
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
    result: any;            // Se llena al completar
    error: string | null;   // Se llena en caso de fallo
    createdAt: Date;
    updatedAt: Date;
}
```

## Consideraciones de Rendimiento

Para archivos grandes (múltiples GB):

1. **Optimización de Memoria**: El paquete usa streaming con buffers configurables
2. **Nivel de Compresión**: Usa nivel 6 para mejor balance velocidad/ratio
3. **Memoria de Node**: Para operaciones muy grandes (10GB+), aumenta la memoria de Node:
   ```bash
   node --max-old-space-size=4096 tu-script.js
   ```

## Soporte TypeScript

Definiciones TypeScript completas incluidas:

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

## Ejemplos Prácticos

### Backup Automático con Verificación

```typescript
async function backupConVerificacion(origen: string) {
    const { promise } = taskManager.createBackup(origen, {
        outputFilename: `backup-${Date.now()}.tar.gz`,
        useZip: false,
        compressionLevel: 6
    });

    try {
        const resultado = await promise;
        console.log(`✅ Backup exitoso: ${resultado.backupPath}`);
        console.log(`📦 Tamaño: ${(resultado.size / 1024 / 1024).toFixed(2)} MB`);
        return resultado;
    } catch (error) {
        console.error('❌ Backup falló:', error);
        throw error;
    }
}
```

### Sistema de Rotación de Backups

```typescript
async function rotacionBackups(origen: string, maxBackups: number = 5) {
    // Crear nuevo backup
    const { promise } = taskManager.createBackup(origen);
    const nuevoBackup = await promise;

    // Listar backups existentes
    const backups = fs.readdirSync(taskManager.options.backupPath)
        .filter(f => f.endsWith('.tar.gz') || f.endsWith('.zip'))
        .map(f => ({
            nombre: f,
            ruta: path.join(taskManager.options.backupPath, f),
            fecha: fs.statSync(path.join(taskManager.options.backupPath, f)).mtime
        }))
        .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

    // Eliminar backups antiguos
    if (backups.length > maxBackups) {
        const aEliminar = backups.slice(maxBackups);
        for (const backup of aEliminar) {
            fs.unlinkSync(backup.ruta);
            console.log(`🗑️ Eliminado backup antiguo: ${backup.nombre}`);
        }
    }
}
```

### Monitoreo de Progreso con Barra

```typescript
function crearBarraProgreso(longitud: number = 40) {
    return (porcentaje: number) => {
        const lleno = Math.round((porcentaje / 100) * longitud);
        const vacio = longitud - lleno;
        const barra = '█'.repeat(lleno) + '░'.repeat(vacio);
        process.stdout.write(`\r[${barra}] ${porcentaje.toFixed(1)}%`);
        if (porcentaje >= 100) console.log();
    };
}

// Uso
const mostrarProgreso = crearBarraProgreso();
taskManager.on('task:progress', (task) => {
    mostrarProgreso(task.progress);
});
```

### Migración de Datos entre Servidores

```typescript
async function migrarDatos(origenRemoto: string, destinoLocal: string) {
    console.log('📥 Descargando backup...');
    const { promise: descarga } = taskManager.download(origenRemoto);
    const archivoDescargado = await descarga;

    console.log('📂 Extrayendo archivos...');
    const { promise: extraccion } = taskManager.unpack(archivoDescargado.filePath, {
        destination: destinoLocal,
        deleteAfterUnpack: true
    });
    const resultado = await extraccion;

    console.log(`✅ Migración completada: ${resultado.unpackDir}`);
    return resultado;
}
```

## Solución de Problemas

### Error: "EMFILE: too many open files"

Reduce la concurrencia o aumenta el límite de archivos abiertos del sistema:

```bash
# Linux/Mac
ulimit -n 4096
```

### Backups muy lentos

Ajusta el nivel de compresión:

```typescript
// Más rápido, menor compresión
{ compressionLevel: 1 }

// Balance (recomendado)
{ compressionLevel: 6 }

// Más lento, mayor compresión
{ compressionLevel: 9 }
```

### Crashes con archivos grandes

Aumenta la memoria disponible para Node.js:

```bash
NODE_OPTIONS="--max-old-space-size=4096" node tu-script.js
```

## Licencia

[MIT](LICENSE)