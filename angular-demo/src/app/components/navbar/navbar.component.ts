import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  currentRoute = '';
  
  navItems = [
    { path: '/demo', label: 'SDK演示', icon: '🎯' },
    { path: '/button-hell', label: '按钮地狱', icon: '🎛️' },
    { path: '/complex-form', label: '复杂表单', icon: '📝' },
    { path: '/image-editor', label: '图片编辑', icon: '🎨' },
    { path: '/dashboard', label: '数据仪表盘', icon: '📊' },
    { path: '/workflow', label: '工作流', icon: '🔀' },
    { path: '/wiki', label: '用户手册', icon: '📚' }
  ];
}
