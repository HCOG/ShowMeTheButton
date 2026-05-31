export type EventCallback<T = unknown> = (data?: T) => void;

export class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on<T = unknown>(event: string, callback: EventCallback<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);
  }

  off<T = unknown>(event: string, callback: EventCallback<T>): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback as EventCallback);
    }
  }

  emit<T = unknown>(event: string, data?: T): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          (callback as EventCallback<T>)(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  once<T = unknown>(event: string, callback: EventCallback<T>): void {
    const onceCallback: EventCallback<T> = (data) => {
      callback(data);
      this.off(event, onceCallback);
    };
    this.on(event, onceCallback);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const SDK_EVENTS = {
  INITIALIZED: 'sdk:initialized',
  ACTIVATED: 'sdk:activated',
  DEACTIVATED: 'sdk:deactivated',
  SCANNER_COMPLETE: 'scanner:complete',
  ANIMATION_COMPLETE: 'animation:complete',
  CURSOR_HOVER: 'cursor:hover',
  QUERY_START: 'query:start',
  QUERY_COMPLETE: 'query:complete',
  QUERY_ERROR: 'query:error',
  VOICE_START: 'voice:start',
  VOICE_END: 'voice:end',
  VOICE_RESULT: 'voice:result',
} as const;
