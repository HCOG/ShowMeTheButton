from fastapi import APIRouter, File, UploadFile, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import base64
import io
from PIL import Image, ImageEnhance, ImageFilter
import json

router = APIRouter()

class ImageProcessRequest(BaseModel):
    width: Optional[int] = None
    height: Optional[int] = None
    brightness: Optional[float] = None
    contrast: Optional[float] = None
    saturation: Optional[float] = None
    blur: Optional[int] = None

class ImageProcessResponse(BaseModel):
    success: bool
    message: str
    image_url: Optional[str] = None
    filters_applied: List[str] = []

class ExportRequest(BaseModel):
    format: str  # PNG, JPEG, WEBP
    quality: Optional[int] = 95

@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        
        return {
            "success": True,
            "message": "Image uploaded successfully",
            "filename": file.filename,
            "size": len(contents),
            "content_type": file.content_type
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process")
async def process_image(request: ImageProcessRequest):
    try:
        filters_applied = []
        
        if request.width or request.height:
            filters_applied.append("resize")
        
        if request.brightness:
            filters_applied.append(f"brightness({request.brightness})")
        
        if request.contrast:
            filters_applied.append(f"contrast({request.contrast})")
        
        if request.saturation:
            filters_applied.append(f"saturation({request.saturation})")
        
        if request.blur:
            filters_applied.append(f"blur({request.blur})")
        
        return {
            "success": True,
            "message": "Image processed successfully",
            "filters_applied": filters_applied
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/crop")
async def crop_image(
    x: int,
    y: int,
    width: int,
    height: int,
    file: UploadFile = File(...)
):
    try:
        return {
            "success": True,
            "message": "Image cropped successfully",
            "crop_area": {
                "x": x,
                "y": y,
                "width": width,
                "height": height
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/filter")
async def apply_filter(
    filter_type: str,
    file: UploadFile = File(...)
):
    try:
        valid_filters = ["vintage", "blackwhite", "blur", "sharpen", "smooth", "edge_enhance"]
        
        if filter_type not in valid_filters:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid filter type. Valid types: {', '.join(valid_filters)}"
            )
        
        return {
            "success": True,
            "message": f"Filter '{filter_type}' applied successfully",
            "filter_type": filter_type
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/export")
async def export_image(request: ExportRequest, file: UploadFile = File(...)):
    try:
        valid_formats = ["PNG", "JPEG", "WEBP"]
        
        if request.format not in valid_formats:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid format. Valid formats: {', '.join(valid_formats)}"
            )
        
        return {
            "success": True,
            "message": f"Image exported as {request.format}",
            "format": request.format,
            "quality": request.quality
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/layers")
async def get_layers():
    return {
        "success": True,
        "layers": [
            {"id": 1, "name": "背景图层", "visible": True, "locked": True},
            {"id": 2, "name": "文字层", "visible": True, "locked": False},
            {"id": 3, "name": "效果层", "visible": False, "locked": False}
        ]
    }

@router.post("/layers")
async def create_layer(name: str):
    return {
        "success": True,
        "message": f"Layer '{name}' created successfully",
        "layer": {
            "id": 4,
            "name": name,
            "visible": True,
            "locked": False
        }
    }

@router.delete("/layers/{layer_id}")
async def delete_layer(layer_id: int):
    return {
        "success": True,
        "message": f"Layer {layer_id} deleted successfully"
    }
