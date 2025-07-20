// example.ts
import { TaskManager } from './core/TaskManager.js'; // Asegúrate de apuntar a los archivos compilados en /dist
import type { ITask } from './core/Types.js';
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
    console.log('\n[Paso 0] Limpiando y preparando directorios...');
    fs.rmSync('./temp', { recursive: true, force: true });
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(SOURCE_DIR, 'config.json'), '{ "port": 8080 }');
    fs.writeFileSync(path.join(SOURCE_DIR, 'README.md'), 'This is my server data.');
    console.log('Directorio de prueba creado en:', SOURCE_DIR);

    // 2. Instanciar el TaskManager
    const taskManager = new TaskManager({
        downloadPath: DOWNLOADS_DIR,
        unpackPath: UNPACK_DIR,
        backupPath: BACKUPS_DIR,
    });

    // 3. Configurar los listeners de eventos (como ya tenías)
    console.log('\n[Paso 1] Configurando listeners de eventos...');
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
        useZip: true, // Vamos a usar .zip para este ejemplo
    });
    await sleep(2000); // Esperar a que la tarea termine (en una app real, se manejaría con los eventos)

    // 5. Ejecutar Tarea: Restaurar el Backup
    console.log('\n[Paso 3] Restaurando el backup en una nueva ubicación...');
    const backupResult = taskManager.getTask(backupTaskId)?.result as any;
    if (backupResult?.backupPath) {
        const restoreTaskId = await taskManager.restoreBackup(backupResult.backupPath, {
            destinationFolderName: 'my-restored-server',
        });
        await sleep(2000); // Esperar
    } else {
        console.error('No se pudo encontrar la ruta del backup para restaurar.');
    }

    // 6. Ejecutar Tarea: Descargar un archivo
    console.log('\n[Paso 4] Descargando un archivo de prueba...');
    // Usaremos un archivo ZIP de ejemplo de FileFormat.info
    const downloadUrl = 'https://file-examples.com/storage/fe52cb0bf1943583f3a562d/2017/02/zip_2MB.zip';
    const downloadTaskId = await taskManager.download(downloadUrl);
    await sleep(5000); // Esperar a que la descarga termine

    console.log('\n--- Demo Finalizada ---');
    console.log('\nRevisa los directorios en la carpeta "temp" para ver los resultados.');
    console.log('\nListado de todas las tareas ejecutadas:');
    console.table(taskManager.getAllTasks());
}

main().catch(console.error);