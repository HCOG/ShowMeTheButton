import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

declare const ShowMeSDK: any;

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './demo.component.html',
  styleUrls: ['./demo.component.scss']
})
export class DemoComponent implements OnInit, OnDestroy {
  sdk: any = null;
  isInitialized = false;
  isActive = false;
  queryText = '';
  queryResult: any = null;
  statusMessage = '';
  
  ngOnInit(): void {
    this.loadSDK();
  }
  
  ngOnDestroy(): void {
    if (this.sdk) {
      this.sdk.deactivate();
    }
  }
  
  async loadSDK(): Promise<void> {
    this.statusMessage = '加载SDK中...';
    
    try {
      // 动态加载SDK脚本
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'http://localhost:5173/dist/show-me-core.iife.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('SDK加载失败'));
        document.head.appendChild(script);
      });
      
      this.sdk = new ShowMeSDK({
        agentEndpoint: 'http://localhost:8001'
      });
      
      await this.sdk.init();
      this.isInitialized = true;
      this.statusMessage = 'SDK加载成功！点击"激活光标"开始使用';
      
    } catch (error) {
      this.statusMessage = 'SDK加载失败: ' + error;
      console.error('SDK加载失败:', error);
    }
  }
  
  activateCursor(): void {
    if (!this.sdk) return;
    
    this.sdk.activate();
    this.isActive = true;
    this.statusMessage = '光标已激活！现在有一个小光标会跟随你的鼠标';
  }
  
  deactivateCursor(): void {
    if (!this.sdk) return;
    
    this.sdk.deactivate();
    this.isActive = false;
    this.statusMessage = '光标已停用';
  }
  
  async testFlyTo(): Promise<void> {
    if (!this.sdk) return;
    
    this.statusMessage = '测试飞向"导出"按钮...';
    
    // 模拟查询
    const btn = document.querySelector('#btn-export') as HTMLElement;
    if (btn) {
      await this.sdk.cursorEngine.flyTo(btn);
      await this.sdk.cursorEngine.hover(btn, '这就是导出按钮！点击可以导出数据');
      this.statusMessage = '测试完成！';
    } else {
      this.statusMessage = '未找到导出按钮，请先进入按钮地狱页面';
    }
  }
  
  async testScan(): Promise<void> {
    if (!this.sdk) return;
    
    this.statusMessage = '扫描页面元素...';
    
    const elements = this.sdk.domScanner.getElements();
    this.statusMessage = `扫描完成！发现 ${elements.length} 个可交互元素`;
    
    console.log('扫描到的元素:', elements);
  }
}
