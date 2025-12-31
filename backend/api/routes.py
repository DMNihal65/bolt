from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from fastapi.responses import JSONResponse
from services.gemini import GeminiService
import json
import traceback

router = APIRouter()
gemini_service = GeminiService()

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    currentFiles: Optional[Dict[str, Any]] = None  # Accept any type for file data

    class Config:
        extra = "allow"  # Allow extra fields

@router.post("/generate")
async def generate_code(request: ChatRequest):
    """Generate code changes from AI"""
    try:
        print(f"Received request with {len(request.messages)} messages")
        
        # Convert messages to dict format
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        
        # Convert currentFiles if provided
        current_files = None
        if request.currentFiles:
            current_files = {}
            for path, data in request.currentFiles.items():
                if isinstance(data, dict) and 'content' in data:
                    current_files[path] = data['content']
                elif isinstance(data, str):
                    current_files[path] = data
                else:
                    current_files[path] = str(data)
        
        print(f"Current files: {list(current_files.keys()) if current_files else 'None'}")
        
        # Get structured response
        result = await gemini_service.generate_code(messages, current_files)
        
        print(f"AI Response: {json.dumps(result, indent=2)[:500]}")
        
        return JSONResponse(content=result)
    except Exception as e:
        print(f"Error in generate_code: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            content={
                "thinking": "Error occurred",
                "files": [],
                "commands": [],
                "message": f"Error: {str(e)}"
            },
            status_code=200
        )

@router.post("/chat")
async def chat(request: ChatRequest):
    """Simple chat endpoint - redirects to generate"""
    return await generate_code(request)
