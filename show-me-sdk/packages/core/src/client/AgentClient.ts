import { QueryRequest, QueryResponse } from '../types';

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
}

export class AgentClient {
  private endpoint: string;
  private timeout: number;
  private pollingInterval: number = 1000;

  constructor(endpoint: string, timeout = 10000) {
    this.endpoint = endpoint;
    this.timeout = timeout;
  }

  async query(request: QueryRequest): Promise<QueryResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.endpoint}/api/v1/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        'mode': 'cors',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
  }

  async pollTaskStatus(taskId: string, callback: (status: TaskStatus) => void): Promise<void> {
    while (true) {
      const response = await fetch(`${this.endpoint}/api/tasks/${taskId}`);
      const status: TaskStatus = await response.json();
      
      callback(status);

      if (status.status === 'completed' || status.status === 'failed') {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
    }
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const response = await fetch(`${this.endpoint}/api/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
    
    return response.ok;
  }
}
