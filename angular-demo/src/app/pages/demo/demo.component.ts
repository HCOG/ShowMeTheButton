import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShowMeService } from '../../services/show-me.service';

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './demo.component.html',
  styleUrls: ['./demo.component.scss'],
})
export class DemoComponent implements OnInit, OnDestroy {
  isInitialized = false;
  isActive = false;
  queryText = '';
  statusMessage = '点击"初始化 SDK"开始';
  lastResult: { targetId: string; confidence: number; reasoning: string } | null = null;
  scannedCount = 0;
  isQuerying = false;

  constructor(public showMe: ShowMeService) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  async initSDK(): Promise<void> {
    this.statusMessage = '正在初始化 SDK…';
    try {
      await this.showMe.init();
      this.isInitialized = true;
      this.isActive = true;
      this.statusMessage = 'SDK 初始化成功！光标已激活，试试下方的查询框';
    } catch (err: any) {
      this.statusMessage = '初始化失败: ' + err.message;
    }
  }

  activateCursor(): void {
    this.showMe.activate();
    this.isActive = true;
    this.statusMessage = '光标已激活，移动鼠标可以看到跟随光标';
  }

  deactivateCursor(): void {
    this.showMe.deactivate();
    this.isActive = false;
    this.statusMessage = '光标已停用';
  }

  async scanPage(): Promise<void> {
    if (!this.isInitialized) {
      this.statusMessage = '请先初始化 SDK';
      return;
    }
    this.statusMessage = '扫描中…';
    const count = await this.showMe.rescan();
    this.scannedCount = count;
    this.statusMessage = `扫描完成！发现 ${count} 个可交互元素`;
  }

  async submitQuery(): Promise<void> {
    if (!this.queryText.trim() || this.isQuerying) return;
    if (!this.isInitialized) {
      this.statusMessage = '请先初始化 SDK';
      return;
    }

    this.isQuerying = true;
    this.lastResult = null;
    this.statusMessage = '正在查询 Agent…';

    try {
      const result = await this.showMe.query(this.queryText);
      this.lastResult = result;
      this.statusMessage = '✅ 找到目标，光标正在飞过去！';
    } catch (err: any) {
      this.statusMessage = '❌ 查询失败: ' + err.message;
    } finally {
      this.isQuerying = false;
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.submitQuery();
  }
}
