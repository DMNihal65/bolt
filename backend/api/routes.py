from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from fastapi.responses import JSONResponse
from services.agent import get_agent
from services.project_service import get_project_service
import json
import traceback

router = APIRouter()

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    currentFiles: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"

class PlanRequest(BaseModel):
    request: str
    currentFiles: Optional[Dict[str, Any]] = None

class ExecuteTaskRequest(BaseModel):
    task: Dict[str, Any]
    currentContent: Optional[str] = ""

class ClarifyRequest(BaseModel):
    response: str

# Project management models
class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = ""

class SaveProjectRequest(BaseModel):
    files: Dict[str, str]
    messages: List[Dict[str, Any]]
    context: Optional[List[Dict[str, Any]]] = []

class SaveFilesRequest(BaseModel):
    files: Dict[str, str]

class SaveChatRequest(BaseModel):
    messages: List[Dict[str, Any]]



def normalize_files(files: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """Convert file data to simple string content"""
    if not files:
        return {}
    result = {}
    for path, data in files.items():
        if isinstance(data, dict) and 'content' in data:
            result[path] = data['content']
        elif isinstance(data, str):
            result[path] = data
        else:
            result[path] = str(data)
    return result


@router.post("/plan")
async def create_plan(request: PlanRequest):
    """Create an execution plan for a user request"""
    try:
        agent = get_agent()
        files = normalize_files(request.currentFiles)
        
        plan = await agent.plan(request.request, files)
        
        return JSONResponse(content=plan)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            content={"error": str(e)},
            status_code=200
        )


@router.post("/execute-task")
async def execute_task(request: ExecuteTaskRequest):
    """Execute a single task from the plan"""
    try:
        agent = get_agent()
        
        result = await agent.execute_task(request.task, request.currentContent)
        
        return JSONResponse(content=result)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            content={"success": False, "error": str(e)},
            status_code=200
        )


@router.post("/clarify")
async def handle_clarification(request: ClarifyRequest):
    """Handle user's response to a clarification question"""
    try:
        agent = get_agent()
        
        result = await agent.handle_clarification(request.response)
        
        return JSONResponse(content=result)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            content={"error": str(e)},
            status_code=200
        )


@router.post("/reset")
async def reset_agent():
    """Reset the agent state"""
    try:
        agent = get_agent()
        agent.reset()
        return JSONResponse(content={"status": "ok"})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=200)


@router.get("/rate-limit-status")
async def get_rate_limit_status():
    """Get current rate limiter status"""
    try:
        agent = get_agent()
        status = agent.get_rate_limit_status()
        return JSONResponse(content=status)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=200)


# Legacy endpoint - now uses the agent
@router.post("/generate")
async def generate_code(request: ChatRequest):
    """Generate code changes from AI - uses agent planning"""
    try:
        if not request.messages:
            return JSONResponse(content={"error": "No messages provided"})
        
        # Get the last user message
        last_message = request.messages[-1].content
        files = normalize_files(request.currentFiles)
        
        agent = get_agent()
        
        # First, create a plan
        plan = await agent.plan(last_message, files)
        
        # If clarification needed, return immediately
        if plan.get('needs_clarification'):
            return JSONResponse(content={
                "type": "clarification",
                "question": plan.get('clarification_question', 'Could you please clarify?'),
                "understanding": plan.get('understanding', '')
            })
        
        # Execute tasks one by one
        results = []
        for task in plan.get('tasks', []):
            current_content = files.get(task.get('file'), '')
            result = await agent.execute_task(task, current_content)
            results.append(result)
            
            # Update files dict for next task
            if result.get('success') and result.get('content'):
                files[result['file']] = result['content']
        
        return JSONResponse(content={
            "type": "execution",
            "plan": plan,
            "results": results
        })
        
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            content={"error": str(e)},
            status_code=200
        )


@router.post("/chat")
async def chat(request: ChatRequest):
    """Simple chat endpoint - redirects to generate"""
    return await generate_code(request)


# ==================== PROJECT MANAGEMENT ENDPOINTS ====================

@router.post("/projects")
async def create_project(request: CreateProjectRequest):
    """Create a new project"""
    try:
        service = get_project_service()
        project = await service.create_project(request.name, request.description)
        return JSONResponse(content=project)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=200)


@router.get("/projects")
async def list_projects():
    """List all projects"""
    try:
        service = get_project_service()
        projects = await service.list_projects()
        return JSONResponse(content={"projects": projects})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=200)


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    """Get a project with all its data"""
    try:
        service = get_project_service()
        data = await service.load_full_project(project_id)
        if not data:
            return JSONResponse(content={"error": "Project not found"}, status_code=404)
        return JSONResponse(content=data)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=200)


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project"""
    try:
        service = get_project_service()
        success = await service.delete_project(project_id)
        return JSONResponse(content={"success": success})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=200)


@router.post("/projects/{project_id}/save")
async def save_project(project_id: str, request: SaveProjectRequest):
    """Save full project state (files, chat, context)"""
    try:
        service = get_project_service()
        result = await service.save_full_project(
            project_id,
            request.files,
            request.messages,
            request.context or []
        )
        return JSONResponse(content={"success": True, **result})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=200)


@router.post("/projects/{project_id}/files")
async def save_files(project_id: str, request: SaveFilesRequest):
    """Save project files"""
    try:
        service = get_project_service()
        count = await service.save_files(project_id, request.files)
        return JSONResponse(content={"success": True, "files_saved": count})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=200)


@router.get("/projects/{project_id}/files")
async def load_files(project_id: str):
    """Load project files"""
    try:
        service = get_project_service()
        files = await service.load_files(project_id)
        return JSONResponse(content={"files": files})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=200)


@router.post("/projects/{project_id}/chat")
async def save_chat(project_id: str, request: SaveChatRequest):
    """Save chat messages"""
    try:
        service = get_project_service()
        count = await service.save_chat_messages(project_id, request.messages)
        return JSONResponse(content={"success": True, "messages_saved": count})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=200)


@router.get("/projects/{project_id}/chat")
async def load_chat(project_id: str):
    """Load chat messages"""
    try:
        service = get_project_service()
        messages = await service.load_chat_messages(project_id)
        return JSONResponse(content={"messages": messages})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=200)
