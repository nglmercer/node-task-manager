export declare class Emitter {
    private listeners;
    private anyListeners;
    private maxListeners;
    constructor();
    on(event: string, callback: (data: any) => void): () => void;
    once(event: string, callback: (data: any) => void): () => void;
    onAny(callback: (event: string, data: any) => void): () => void;
    onceAny(callback: (event: string, data: any) => void): () => void;
    emit(event: string, data?: any): boolean;
    off(event: string, callback: (data: any) => void): void;
    removeAllListeners(event?: string): void;
    listenerCount(event: string): number;
    eventNames(): string[];
    setMaxListeners(n: number): void;
    getMaxListeners(): number;
    getListeners(event: string): ((data: any) => void)[];
    getAnyListeners(): ((event: string, data: any) => void)[];
    prependListener(event: string, callback: (data: any) => void): () => void;
    prependOnceListener(event: string, callback: (data: any) => void): () => void;
    emitAsync(event: string, data: any): Promise<boolean>;
    debug(): {
        totalEvents: number;
        totalListeners: number;
        anyListeners: number;
        events: Record<string, number>;
        memoryInfo: {
            listenersMap: number;
            anyListenersArray: number;
        };
    };
    destroy(): void;
    hasListeners(event: string): boolean;
}
export declare const emitter: Emitter;
export default Emitter;
//# sourceMappingURL=Emitter.d.ts.map