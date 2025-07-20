// --- Clase Principal ---
// Exportamos la clase TaskManager, que es la interfaz principal de la librería.
export { TaskManager } from './core/TaskManager.js';
export { TaskStatus, TaskType } from './Types.js';
// Nota: No exportamos Task, Emitter o CompressionService directamente,
// ya que son detalles de implementación. Los usuarios interactúan a través de TaskManager.
// Esto mantiene la API pública más limpia y fácil de usar.
//# sourceMappingURL=index.js.map