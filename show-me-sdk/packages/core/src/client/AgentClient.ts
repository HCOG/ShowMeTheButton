import { QueryRequest, QueryResponse } from '../types';
import { JourneyStep } from '../journey/JourneyRunner';

export type GuideType = 'single' | 'journey';

export interface GuideResponse {
  success: boolean;
  type?: GuideType;
  /** Populated when type === 'single' */
  result?: { target_id: string; confidence: number; reasoning: string };
  /** Populated when type === 'journey' */
  steps?: JourneyStep[];
  error?: string;
  latency_ms?: number;
}

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

  /**
   * Unified guide call — the backend decides single vs journey.
   * Throws on network/HTTP error; returns the raw response otherwise.
   */
  async guide(request: QueryRequest): Promise<GuideResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${this.endpoint}/api/v1/guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data: GuideResponse = await response.json();
      // Normalise journey step numbers
      if (data.steps) {
        data.steps = data.steps.map((s, i) => ({ ...s, step: i + 1 }));
      }
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /**
   * Ask the backend agent to plan a multi-step journey for the given goal.
   * Returns an ordered list of JourneyStep objects. Throws on failure.
   */
  async planJourney(
    goal: string,
    elements: Array<{ id: string; label: string; type: string; text?: string }>,
  ): Promise<JourneyStep[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // planning may be slow

    try {
      const response = await fetch(`${this.endpoint}/api/v1/journey/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', mode: 'cors' },
        body: JSON.stringify({ goal, elements }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.steps)) {
        throw new Error(data.error ?? 'Invalid plan response');
      }

      // Normalise: ensure each step has a sequential `step` number
      return (data.steps as any[]).map((s, i) => ({
        step: i + 1,
        title: s.title ?? `步骤 ${i + 1}`,
        description: s.description ?? '',
        query: s.query ?? '',
        hint: s.hint,
      }));
    } catch (error) {
      clearTimeout(timeoutId);
      throw error instanceof Error ? error : new Error('planJourney: network error');
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
