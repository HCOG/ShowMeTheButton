import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

const AGENT_BASE = 'http://localhost:8001/api/v1';

export interface DocMeta {
  path: string;
  title: string;
  description: string;
}

export interface Category {
  label: string;
  icon: string;
  page: string;
  docs: DocMeta[];
}

export interface DocContent {
  path: string;
  content: string;
  title: string;
  category: string;
  categoryLabel: string;
  page: string;
}

export interface WorkflowSummary {
  id: string;
  title: string;
  description: string;
  page: string;
  estimatedTime: string;
  stepCount: number;
}

export interface WorkflowStep {
  step: number;
  title: string;
  description: string;
  query: string;
  hint?: string;
}

export interface WorkflowDetail extends WorkflowSummary {
  steps: WorkflowStep[];
  markdownContent?: string;
}

@Injectable({ providedIn: 'root' })
export class WikiService {
  constructor(private http: HttpClient) {}

  getDocs(): Observable<{ categories: Record<string, Category> }> {
    return this.http.get<any>(`${AGENT_BASE}/docs`).pipe(catchError(() => of({ categories: {} })));
  }

  getDocContent(path: string): Observable<DocContent> {
    return this.http.get<DocContent>(`${AGENT_BASE}/docs/content?path=${encodeURIComponent(path)}`);
  }

  getWorkflows(): Observable<{ workflows: WorkflowSummary[] }> {
    return this.http.get<any>(`${AGENT_BASE}/workflows`).pipe(catchError(() => of({ workflows: [] })));
  }

  getWorkflow(id: string): Observable<WorkflowDetail> {
    return this.http.get<WorkflowDetail>(`${AGENT_BASE}/workflows/${id}`);
  }
}
