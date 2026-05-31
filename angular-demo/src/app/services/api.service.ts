import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'http://localhost:8000';

  constructor(private http: HttpClient) {}

  checkHealth(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/health`);
  }

  submitForm(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/form/submit`, data);
  }

  validateForm(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/form/validate`, data);
  }

  getDepartments(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/form/departments`);
  }

  createTask(taskType: string, action: string, params?: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/tasks/create?task_type=${taskType}&action=${action}`, params);
  }

  getTaskStatus(taskId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/tasks/${taskId}`);
  }

  listTasks(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/tasks/`);
  }

  uploadImage(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.baseUrl}/api/image/upload`, formData);
  }

  processImage(filters: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/image/process`, filters);
  }

  exportImage(format: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/image/export?format=${format}`, {});
  }

  getLayers(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/image/layers`);
  }
}
