from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict
from datetime import date, datetime

router = APIRouter()

class PersonalInfo(BaseModel):
    firstName: str
    lastName: str
    email: EmailStr
    phone: str
    dateOfBirth: Optional[str] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    idNumber: Optional[str] = None
    maritalStatus: Optional[str] = None

class AddressInfo(BaseModel):
    street: str
    city: str
    state: Optional[str] = None
    zipCode: str
    country: str
    apartment: Optional[str] = None
    floor: Optional[str] = None
    building: Optional[str] = None

class EmploymentInfo(BaseModel):
    companyName: str
    jobTitle: str
    department: str
    employeeId: Optional[str] = None
    startDate: Optional[str] = None
    employmentType: str
    salary: Optional[float] = None
    manager: Optional[str] = None
    workEmail: Optional[EmailStr] = None
    workPhone: Optional[str] = None

class DocumentInfo(BaseModel):
    hasPassport: bool = False
    passportNumber: Optional[str] = None
    passportExpiry: Optional[str] = None
    hasDriverLicense: bool = False
    driverLicenseNumber: Optional[str] = None
    driverLicenseExpiry: Optional[str] = None

class NotificationPreferences(BaseModel):
    email: bool = True
    sms: bool = False
    push: bool = True

class Preferences(BaseModel):
    notifications: NotificationPreferences
    language: str
    timezone: str
    newsletter: bool = False
    termsAccepted: bool

class EmployeeFormData(BaseModel):
    personalInfo: PersonalInfo
    address: AddressInfo
    employment: EmploymentInfo
    documents: DocumentInfo
    preferences: Preferences

class FormSubmissionResponse(BaseModel):
    success: bool
    message: str
    employeeId: Optional[str] = None
    submissionDate: Optional[str] = None

@router.post("/submit")
async def submit_employee_form(data: EmployeeFormData):
    try:
        employee_id = f"EMP-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        return {
            "success": True,
            "message": "员工信息提交成功",
            "employeeId": employee_id,
            "submissionDate": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/validate")
async def validate_form(data: EmployeeFormData):
    errors = []
    
    if not data.personalInfo.firstName:
        errors.append("名为必填项")
    if not data.personalInfo.lastName:
        errors.append("姓为必填项")
    if not data.personalInfo.email:
        errors.append("邮箱为必填项")
    if not data.address.street:
        errors.append("街道地址为必填项")
    if not data.address.city:
        errors.append("城市为必填项")
    if not data.address.zipCode:
        errors.append("邮政编码为必填项")
    if not data.address.country:
        errors.append("国家为必填项")
    if not data.employment.companyName:
        errors.append("公司名称为必填项")
    if not data.employment.jobTitle:
        errors.append("职位为必填项")
    if not data.employment.department:
        errors.append("部门为必填项")
    if not data.employment.employmentType:
        errors.append("雇佣类型为必填项")
    if not data.employment.startDate:
        errors.append("入职日期为必填项")
    if not data.preferences.termsAccepted:
        errors.append("必须同意服务条款")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors
    }

@router.get("/departments")
async def get_departments():
    return {
        "departments": [
            "技术部",
            "市场部",
            "销售部",
            "人力资源部",
            "财务部",
            "运营部",
            "产品部",
            "设计部",
            "客服部",
            "物流部"
        ]
    }

@router.get("/employment-types")
async def get_employment_types():
    return {
        "types": [
            "全职",
            "兼职",
            "合同工",
            "实习生",
            "临时工"
        ]
    }

@router.get("/countries")
async def get_countries():
    return {
        "countries": [
            "中国",
            "美国",
            "英国",
            "日本",
            "韩国",
            "德国",
            "法国",
            "澳大利亚",
            "加拿大",
            "新加坡"
        ]
    }

@router.post("/upload-document")
async def upload_document(
    document_type: str,
    filename: str
):
    return {
        "success": True,
        "message": f"{document_type}文件上传成功",
        "filename": filename,
        "uploaded_at": datetime.now().isoformat()
    }

@router.post("/save-draft")
async def save_draft(data: EmployeeFormData):
    try:
        draft_id = f"DRAFT-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        return {
            "success": True,
            "message": "草稿保存成功",
            "draftId": draft_id,
            "savedAt": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/drafts")
async def get_drafts():
    return {
        "drafts": []
    }

@router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str):
    return {
        "success": True,
        "message": f"草稿{draft_id}已删除"
    }
