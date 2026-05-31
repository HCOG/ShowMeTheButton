import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-workflow',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workflow.component.html',
  styleUrls: ['./workflow.component.scss']
})
export class WorkflowComponent {
  activeTab = 'design';
  selectedNode: any = null;
  
  nodes = [
    { id: 1, type: 'start', label: '开始', x: 100, y: 200 },
    { id: 2, type: 'task', label: '审批', x: 300, y: 200 },
    { id: 3, type: 'decision', label: '是否通过?', x: 500, y: 200 },
    { id: 4, type: 'task', label: '通过', x: 700, y: 150 },
    { id: 5, type: 'task', label: '驳回', x: 700, y: 250 },
    { id: 6, type: 'end', label: '结束', x: 900, y: 200 }
  ];
  
  connections = [
    { from: 1, to: 2, label: '' },
    { from: 2, to: 3, label: '' },
    { from: 3, to: 4, label: '是' },
    { from: 3, to: 5, label: '否' },
    { from: 4, to: 6, label: '' },
    { from: 5, to: 6, label: '' }
  ];
  
  addNode(): void {
    console.log('添加节点');
  }
  
  deleteNode(nodeId: number): void {
    console.log('删除节点:', nodeId);
  }
  
  saveWorkflow(): void {
    console.log('保存工作流');
    alert('工作流已保存');
  }
  
  publishWorkflow(): void {
    console.log('发布工作流');
    alert('工作流已发布');
  }
  
  validateWorkflow(): void {
    console.log('验证工作流');
    alert('工作流验证通过');
  }
  
  exportWorkflow(): void {
    console.log('导出工作流');
    alert('工作流导出功能（需要后端支持）');
  }
  
  importWorkflow(): void {
    console.log('导入工作流');
    alert('工作流导入功能');
  }
  
  undo(): void {
    console.log('撤销');
  }
  
  redo(): void {
    console.log('重做');
  }
  
  zoomIn(): void {
    console.log('放大');
  }
  
  zoomOut(): void {
    console.log('缩小');
  }
  
  fitToScreen(): void {
    console.log('适应屏幕');
  }
  
  selectNode(node: any): void {
    this.selectedNode = node;
    console.log('选择节点:', node);
  }
  
  editNode(nodeId: number): void {
    console.log('编辑节点:', nodeId);
    alert(`编辑节点 ${nodeId}`);
  }
  
  copyNode(nodeId: number): void {
    console.log('复制节点:', nodeId);
  }
  
  pasteNode(): void {
    console.log('粘贴节点');
  }
  
  deleteSelected(): void {
    if (this.selectedNode) {
      this.deleteNode(this.selectedNode.id);
      this.selectedNode = null;
    }
  }
}
