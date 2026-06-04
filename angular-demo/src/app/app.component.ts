import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ShowMeWidgetComponent } from './components/show-me-widget/show-me-widget.component';
import { ShowMeService } from './services/show-me.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, ShowMeWidgetComponent],
  template: `
    <app-navbar></app-navbar>
    <div class="main-content">
      <router-outlet></router-outlet>
    </div>
    <app-show-me-widget></app-show-me-widget>

    <!-- Brief toast feedback for hotkeys -->
    <div class="smt-toast" *ngIf="toast">{{ toast }}</div>
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

    .smt-toast {
      position: fixed;
      bottom: 92px;
      right: 24px;
      z-index: 100001;
      background: rgba(26, 31, 46, 0.92);
      color: #fff;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      animation: smt-toast-in 0.15s ease;
    }
    @keyframes smt-toast-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class AppComponent {
  toast = '';
  private toastTimer: any = null;

  constructor(private showMe: ShowMeService) {}

  /**
   * Global hotkeys:
   *   Alt+S → toggle the ShowMe assistant cursor
   *   Alt+V → ask by voice (open widget + start listening)
   * Alt+<letter> is safe to handle even while a text field is focused.
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;

    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      this.showMe.toggleCursor().then((active) => {
        this.showToast(active ? '🎯 助手光标：已开启' : '🎯 助手光标：已关闭');
      });
    } else if (key === 'v') {
      event.preventDefault();
      if (!this.showMe.isVoiceSupported) {
        this.showToast('当前浏览器不支持语音输入，请使用 Chrome');
        return;
      }
      this.showMe.requestVoice();
      this.showToast('🎤 正在聆听…');
    }
  }

  private showToast(msg: string): void {
    this.toast = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 1800);
  }
}
