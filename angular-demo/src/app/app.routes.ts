import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'demo',
    pathMatch: 'full'
  },
  {
    path: 'demo',
    loadComponent: () => import('./pages/demo/demo.component')
      .then(m => m.DemoComponent)
  },
  {
    path: 'button-hell',
    loadComponent: () => import('./pages/button-hell/button-hell.component')
      .then(m => m.ButtonHellComponent)
  },
  {
    path: 'complex-form',
    loadComponent: () => import('./pages/complex-form/complex-form.component')
      .then(m => m.ComplexFormComponent)
  },
  {
    path: 'image-editor',
    loadComponent: () => import('./pages/image-editor/image-editor.component')
      .then(m => m.ImageEditorComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.component')
      .then(m => m.DashboardComponent)
  },
  {
    path: 'workflow',
    loadComponent: () => import('./pages/workflow/workflow.component')
      .then(m => m.WorkflowComponent)
  },
  {
    path: 'wiki',
    loadComponent: () => import('./pages/wiki/wiki.component')
      .then(m => m.WikiComponent)
  }
];
