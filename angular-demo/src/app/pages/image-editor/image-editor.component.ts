import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-editor.component.html',
  styleUrls: ['./image-editor.component.scss']
})
export class ImageEditorComponent {
  activeTool = 'select';
  canvasWidth = 800;
  canvasHeight = 600;
  
  tools = [
    { id: 'select', label: '选择', icon: '↖️' },
    { id: 'crop', label: '裁剪', icon: '✂️' },
    { id: 'filter', label: '滤镜', icon: '🎨' },
    { id: 'text', label: '文字', icon: '📝' },
    { id: 'brush', label: '画笔', icon: '🖌️' },
    { id: 'eraser', label: '橡皮擦', icon: '🧹' },
    { id: 'shapes', label: '形状', icon: '⬜' },
    { id: 'zoom', label: '缩放', icon: '🔍' }
  ];
  
  layers = [
    { id: 1, name: '背景图层', visible: true, locked: true },
    { id: 2, name: '文字层', visible: true, locked: false },
    { id: 3, name: '效果层', visible: false, locked: false }
  ];
  
  setTool(toolId: string): void {
    this.activeTool = toolId;
    console.log('选择工具:', toolId);
  }
  
  zoomIn(): void {
    console.log('放大');
  }
  
  zoomOut(): void {
    console.log('缩小');
  }
  
  undo(): void {
    console.log('撤销');
  }
  
  redo(): void {
    console.log('重做');
  }
  
  save(): void {
    console.log('保存');
    alert('图片保存功能（需要后端支持）');
  }
  
  export(): void {
    console.log('导出');
    alert('导出功能（需要后端支持）');
  }
  
  toggleLayerVisibility(layerId: number): void {
    const layer = this.layers.find(l => l.id === layerId);
    if (layer) {
      layer.visible = !layer.visible;
    }
  }
  
  addLayer(): void {
    console.log('添加图层');
  }
  
  deleteLayer(layerId: number): void {
    this.layers = this.layers.filter(l => l.id !== layerId);
  }
  
  resetCanvas(): void {
    console.log('重置画布');
  }
  
  loadImage(): void {
    console.log('加载图片');
    alert('加载图片功能');
  }
  
  applyFilter(filterName: string): void {
    console.log('应用滤镜:', filterName);
  }
  
  adjustBrightness(delta: number): void {
    console.log('调整亮度:', delta);
  }
  
  adjustContrast(delta: number): void {
    console.log('调整对比度:', delta);
  }
}
