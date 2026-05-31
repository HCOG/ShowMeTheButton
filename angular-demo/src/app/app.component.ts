import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <app-navbar></app-navbar>
    <div class="main-content">
      <router-outlet></router-outlet>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #f5f5f5;
    }
    
    .main-content {
      padding: 0;
    }
  `]
})
export class AppComponent {}
