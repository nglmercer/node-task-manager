// example.ts
import { TaskManager } from './TaskManager.js';
import type { ITask } from './Types.js';

const taskManager = new TaskManager({
    downloadPath: './temp/downloads',
    unpackPath: './temp/servers',
    backupPath: './temp/backups',
});

// Escuchar todos los eventos para ver el ciclo de vida de una tarea
taskManager.on('task:created', (task: ITask) => console.log(`[CREATED] Task ${task.id} (${task.type})`));
taskManager.on('task:started', (task: ITask) => console.log(`[STARTED] Task ${task.id} started.`));
taskManager.on('task:failed', (task: ITask) => console.error(`[FAILED] Task ${task.id}: ${task.error}`));
taskManager.on('task:completed', (task: ITask) => {
    console.log(`[COMPLETED] Task ${task.id} finished successfully!`);
    console.log('Result:', task.result);
});

// El evento más importante para la UI
taskManager.on('task:progress', (task: ITask) => {
    console.log(
        `[PROGRESS] Task ${task.id} (${task.type}): ${task.progress.toFixed(2)}%` +
        (task.details.currentFile ? ` - File: ${task.details.currentFile}` : '')
    );
});


async function main() {
    // --- Ejemplo de Creación de Backup ---
    console.log('\n--- CREATING BACKUP ---');
    // Asegúrate de que la carpeta './temp/servers/my-server' exista y tenga archivos
    const backupTaskId = await taskManager.createBackup('./temp/servers/my-server', { useZip: false });
    console.log(`Backup task started with ID: ${backupTaskId}`);
    
    // Esperar a que la tarea termine (en una app real, te basarías en los eventos)
    await new Promise(resolve => setTimeout(resolve, 10000)); 

    // --- Ejemplo de Restauración de Backup ---
    console.log('\n--- RESTORING BACKUP ---');
    // Usamos el backup que acabamos de crear
    const backupTask = taskManager.getTask(backupTaskId);
    console.log("backupTask result",backupTask?.result);
    if (backupTask && backupTask.result && 'backupPath' in backupTask.result) {
        const restoreTaskId = await taskManager.restoreBackup(backupTask.result.backupPath, {
            destinationFolderName: 'my-restored-server'
        });
        console.log(`Restore task started with ID: ${restoreTaskId}`);
    }
}

// Para probar, crea una carpeta: ./temp/servers/my-server con algunos archivos dentro.
// mkdir -p ./temp/servers/my-server && touch ./temp/servers/my-server/file{1..5}.txt

main().catch(console.error);