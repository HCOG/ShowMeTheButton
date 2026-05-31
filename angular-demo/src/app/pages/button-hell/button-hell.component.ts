import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-button-hell',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './button-hell.component.html',
  styleUrls: ['./button-hell.component.scss']
})
export class ButtonHellComponent {
  activeTab = 'data';
  showExportModal = false;
  showDeleteModal = false;
  showSettingsModal = false;
  showHelpModal = false;
  
  isDropdownOpen = false;
  isUserMenuOpen = false;
  isActionMenuOpen = false;
  
  selectedItems: Set<number> = new Set();
  selectAllChecked = false;
  
  tableData = [
    { id: 1, name: '销售报表2024', status: '已完成', date: '2024-01-15', author: '张三' },
    { id: 2, name: '财务对账单', status: '处理中', date: '2024-01-14', author: '李四' },
    { id: 3, name: '用户活跃度分析', status: '待处理', date: '2024-01-13', author: '王五' },
    { id: 4, name: '库存盘点记录', status: '已完成', date: '2024-01-12', author: '赵六' },
    { id: 5, name: '营销活动效果', status: '已取消', date: '2024-01-11', author: '孙七' },
  ];
  
  exportFormats = ['Excel', 'PDF', 'CSV', 'JSON', 'XML'];
  selectedFormat = 'Excel';
  
  notifications: string[] = [
    '您有3条新消息',
    '系统将在明天维护',
    '新的报表已生成'
  ];
  
  tabs = [
    { id: 'data', label: '数据管理', icon: '📊' },
    { id: 'report', label: '报表中心', icon: '📈' },
    { id: 'settings', label: '系统设置', icon: '⚙️' },
    { id: 'users', label: '用户管理', icon: '👥' }
  ];
  
  setActiveTab(tabId: string): void {
    this.activeTab = tabId;
  }
  
  toggleExportModal(): void {
    this.showExportModal = !this.showExportModal;
  }
  
  toggleDeleteModal(): void {
    this.showDeleteModal = !this.showDeleteModal;
  }
  
  toggleSettingsModal(): void {
    this.showSettingsModal = !this.showSettingsModal;
  }
  
  toggleHelpModal(): void {
    this.showHelpModal = !this.showHelpModal;
  }
  
  toggleDropdown(menu: string): void {
    if (menu === 'dropdown') this.isDropdownOpen = !this.isDropdownOpen;
    if (menu === 'user') this.isUserMenuOpen = !this.isUserMenuOpen;
    if (menu === 'action') this.isActionMenuOpen = !this.isActionMenuOpen;
  }
  
  exportReport(): void {
    console.log(`正在导出 ${this.selectedFormat} 格式的报表...`);
    this.toggleExportModal();
    alert(`报表已导出为 ${this.selectedFormat} 格式`);
  }
  
  deleteSelected(): void {
    console.log(`正在删除 ${this.selectedItems.size} 条记录...`);
    this.toggleDeleteModal();
    alert(`已删除 ${this.selectedItems.size} 条记录`);
    this.selectedItems.clear();
    this.selectAllChecked = false;
  }
  
  saveSettings(): void {
    console.log('正在保存设置...');
    this.toggleSettingsModal();
    alert('设置已保存');
  }
  
  toggleSelectAll(): void {
    if (this.selectAllChecked) {
      this.tableData.forEach(item => this.selectedItems.add(item.id));
    } else {
      this.selectedItems.clear();
    }
  }
  
  toggleSelectItem(id: number): void {
    if (this.selectedItems.has(id)) {
      this.selectedItems.delete(id);
    } else {
      this.selectedItems.add(id);
    }
    this.selectAllChecked = this.selectedItems.size === this.tableData.length;
  }
  
  refreshData(): void {
    console.log('正在刷新数据...');
    alert('数据已刷新');
  }
  
  importData(): void {
    console.log('正在导入数据...');
    alert('数据导入功能（需要后端支持）');
  }
  
  generateReport(): void {
    console.log('正在生成报表...');
    alert('报表生成中，请稍候...');
  }
  
  archiveData(): void {
    console.log('正在归档数据...');
    alert('数据归档功能');
  }
  
  backupSystem(): void {
    console.log('正在备份系统...');
    alert('系统备份中...');
  }
  
  restoreSystem(): void {
    console.log('正在恢复系统...');
    alert('系统恢复功能');
  }
  
  addNewItem(): void {
    console.log('正在添加新项目...');
    alert('新增项目功能');
  }
  
  editItem(id: number): void {
    console.log(`正在编辑项目 ${id}...`);
    alert(`编辑项目 ${id}`);
  }
  
  duplicateItem(id: number): void {
    console.log(`正在复制项目 ${id}...`);
    alert(`已复制项目 ${id}`);
  }
  
  shareItem(id: number): void {
    console.log(`正在分享项目 ${id}...`);
    alert(`分享项目 ${id}`);
  }
  
  downloadItem(id: number): void {
    console.log(`正在下载项目 ${id}...`);
    alert(`下载项目 ${id}`);
  }
  
  viewHistory(id: number): void {
    console.log(`正在查看项目 ${id} 的历史记录...`);
    alert(`项目 ${id} 的历史记录`);
  }
  
  sendNotification(notification: string): void {
    console.log(`发送通知: ${notification}`);
    alert(`已发送: ${notification}`);
  }
  
  clearNotifications(): void {
    console.log('清除所有通知');
    this.notifications = [];
    alert('所有通知已清除');
  }
  
  exportSettings(): void {
    console.log('导出系统设置...');
    alert('设置已导出');
  }
  
  importSettings(): void {
    console.log('导入系统设置...');
    alert('设置已导入');
  }
  
  resetSettings(): void {
    console.log('重置系统设置为默认值...');
    alert('设置已重置为默认值');
  }
  
  testConnection(): void {
    console.log('测试数据库连接...');
    alert('连接测试成功');
  }
  
  optimizeDatabase(): void {
    console.log('优化数据库...');
    alert('数据库优化完成');
  }
  
  clearCache(): void {
    console.log('清除缓存...');
    alert('缓存已清除');
  }
}
