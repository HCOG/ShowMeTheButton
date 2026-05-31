import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  dateRange = 'last7days';
  selectedChart = 'line';
  
  metrics = [
    { label: '总销售额', value: '¥1,234,567', change: 12.5, trend: 'up' },
    { label: '新用户', value: '3,456', change: 8.2, trend: 'up' },
    { label: '活跃用户', value: '12,345', change: -2.1, trend: 'down' },
    { label: '转化率', value: '4.56%', change: 0.5, trend: 'up' }
  ];
  
  charts = ['line', 'bar', 'pie', 'area'];
  
  chartData = [
    { label: '1月', value: 12000 },
    { label: '2月', value: 15000 },
    { label: '3月', value: 18000 },
    { label: '4月', value: 16000 },
    { label: '5月', value: 22000 },
    { label: '6月', value: 25000 }
  ];
  
  topProducts = [
    { name: '产品A', sales: 12345, revenue: '¥123,456' },
    { name: '产品B', sales: 9876, revenue: '¥98,765' },
    { name: '产品C', sales: 7654, revenue: '¥76,543' },
    { name: '产品D', sales: 5432, revenue: '¥54,321' }
  ];
  
  recentOrders = [
    { id: 'ORD-001', customer: '张三', amount: '¥1,234', status: '已完成' },
    { id: 'ORD-002', customer: '李四', amount: '¥2,345', status: '处理中' },
    { id: 'ORD-003', customer: '王五', amount: '¥3,456', status: '待发货' }
  ];
  
  setDateRange(range: string): void {
    this.dateRange = range;
    console.log('日期范围:', range);
  }
  
  setChartType(type: string): void {
    this.selectedChart = type;
    console.log('图表类型:', type);
  }
  
  exportReport(): void {
    console.log('导出报表');
    alert('报表导出功能（需要后端支持）');
  }
  
  refreshData(): void {
    console.log('刷新数据');
    alert('数据已刷新');
  }
  
  viewDetails(item: any): void {
    console.log('查看详情:', item);
    alert(`查看 ${item.name || item.id} 的详细信息`);
  }
}
