import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-complex-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './complex-form.component.html',
  styleUrls: ['./complex-form.component.scss']
})
export class ComplexFormComponent {
  currentStep = 1;
  totalSteps = 4;
  isSubmitting = false;
  
  formData = {
    personalInfo: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      gender: '',
      nationality: '',
      idNumber: '',
      maritalStatus: ''
    },
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      apartment: '',
      floor: '',
      building: ''
    },
    employment: {
      companyName: '',
      jobTitle: '',
      department: '',
      employeeId: '',
      startDate: '',
      employmentType: '',
      salary: '',
      manager: '',
      workEmail: '',
      workPhone: ''
    },
    documents: {
      hasPassport: false,
      passportNumber: '',
      passportExpiry: '',
      hasDriverLicense: false,
      driverLicenseNumber: '',
      driverLicenseExpiry: ''
    },
    preferences: {
      notifications: {
        email: true,
        sms: false,
        push: true
      },
      language: 'zh-CN',
      timezone: 'Asia/Shanghai',
      newsletter: false,
      termsAccepted: false
    }
  };
  
  showAdvancedAddress = false;
  showAdvancedEmployment = false;
  
  employmentTypes = ['全职', '兼职', '合同工', '实习生', '临时工'];
  departments = ['技术部', '市场部', '销售部', '人力资源部', '财务部', '运营部'];
  countries = ['中国', '美国', '英国', '日本', '韩国', '德国'];
  languages = [
    { code: 'zh-CN', name: '简体中文' },
    { code: 'zh-TW', name: '繁體中文' },
    { code: 'en-US', name: 'English' },
    { code: 'ja-JP', name: '日本語' }
  ];
  timezones = [
    { value: 'Asia/Shanghai', label: '北京时间 (UTC+8)' },
    { value: 'America/New_York', label: '美国东部时间 (UTC-5)' },
    { value: 'Europe/London', label: '伦敦时间 (UTC+0)' },
    { value: 'Asia/Tokyo', label: '东京时间 (UTC+9)' }
  ];
  
  dynamicFields: any[] = [];
  fieldCounter = 0;
  
  addDynamicField(): void {
    this.fieldCounter++;
    this.dynamicFields.push({
      id: this.fieldCounter,
      label: `动态字段 ${this.fieldCounter}`,
      value: '',
      type: 'text'
    });
  }
  
  removeDynamicField(id: number): void {
    this.dynamicFields = this.dynamicFields.filter(f => f.id !== id);
  }
  
  nextStep(): void {
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
    }
  }
  
  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }
  
  saveDraft(): void {
    console.log('保存草稿:', this.formData);
    alert('草稿已保存');
  }
  
  resetForm(): void {
    if (confirm('确定要重置表单吗？所有填写的数据都将丢失。')) {
      window.location.reload();
    }
  }
  
  previewForm(): void {
    console.log('预览表单:', this.formData);
    alert('表单预览功能（需要后端支持）');
  }
  
  validateStep(step: number): boolean {
    return true;
  }
  
  submitForm(): void {
    console.log('提交表单:', this.formData);
    this.isSubmitting = true;
    
    setTimeout(() => {
      this.isSubmitting = false;
      alert('表单提交成功！');
      this.resetForm();
    }, 2000);
  }
  
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  validatePhone(phone: string): boolean {
    const phoneRegex = /^1[3-9]\d{9}$/;
    return phoneRegex.test(phone);
  }
  
  getStepTitle(step: number): string {
    const titles: Record<number, string> = {
      1: '个人信息',
      2: '地址信息',
      3: '就业信息',
      4: '文档与偏好'
    };
    return titles[step] || '';
  }
  
  uploadFile(type: string): void {
    console.log(`上传${type}文件`);
    alert(`${type}文件上传功能（需要后端支持）`);
  }
  
  downloadTemplate(): void {
    console.log('下载模板');
    alert('模板下载功能');
  }
  
  autoFill(): void {
    console.log('自动填充');
    this.formData.personalInfo = {
      firstName: '小明',
      lastName: '张',
      email: 'zhangxiaoming@example.com',
      phone: '13800138000',
      dateOfBirth: '1990-01-15',
      gender: 'male',
      nationality: '中国',
      idNumber: '110101199001011234',
      maritalStatus: 'single'
    };
    alert('已自动填充示例数据');
  }
  
  calculateProgress(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }
}
