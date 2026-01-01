from typing import Dict, List, Optional
from datetime import datetime
import uuid
from services.database import execute_query, execute_one, execute_modify, get_pool


class ProjectService:
    """Service for managing projects and their data"""
    
    # ==================== PROJECT CRUD ====================
    
    async def create_project(self, name: str, description: str = "") -> dict:
        """Create a new project"""
        project_id = uuid.uuid4()
        now = datetime.utcnow()
        result = await execute_one(
            """
            INSERT INTO projects (id, name, description, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, description, created_at, updated_at
            """,
            project_id, name, description, now, now
        )
        
        return {
            "id": str(result["id"]),
            "name": result["name"],
            "description": result["description"],
            "created_at": result["created_at"].isoformat(),
            "updated_at": result["updated_at"].isoformat()
        }
    
    async def list_projects(self) -> List[dict]:
        """List all projects"""
        results = await execute_query(
            """
            SELECT id, name, description, created_at, updated_at
            FROM projects
            ORDER BY updated_at DESC
            """
        )
        
        return [
            {
                "id": str(row["id"]),
                "name": row["name"],
                "description": row["description"],
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat()
            }
            for row in results
        ]
    
    async def get_project(self, project_id: str) -> Optional[dict]:
        """Get a project by ID"""
        result = await execute_one(
            """
            SELECT id, name, description, created_at, updated_at
            FROM projects
            WHERE id = $1
            """,
            uuid.UUID(project_id)
        )
        
        if not result:
            return None
        
        return {
            "id": str(result["id"]),
            "name": result["name"],
            "description": result["description"],
            "created_at": result["created_at"].isoformat(),
            "updated_at": result["updated_at"].isoformat()
        }
    
    async def update_project(self, project_id: str, name: str = None, description: str = None) -> Optional[dict]:
        """Update a project"""
        updates = []
        params = []
        param_idx = 1
        
        if name is not None:
            updates.append(f"name = ${param_idx}")
            params.append(name)
            param_idx += 1
        
        if description is not None:
            updates.append(f"description = ${param_idx}")
            params.append(description)
            param_idx += 1
        
        if not updates:
            return await self.get_project(project_id)
        
        updates.append("updated_at = NOW()")
        params.append(uuid.UUID(project_id))
        
        query = f"""
            UPDATE projects
            SET {', '.join(updates)}
            WHERE id = ${param_idx}
            RETURNING id, name, description, created_at, updated_at
        """
        
        result = await execute_one(query, *params)
        
        if not result:
            return None
        
        return {
            "id": str(result["id"]),
            "name": result["name"],
            "description": result["description"],
            "created_at": result["created_at"].isoformat(),
            "updated_at": result["updated_at"].isoformat()
        }
    
    async def delete_project(self, project_id: str) -> bool:
        """Delete a project and all its data"""
        result = await execute_modify(
            "DELETE FROM projects WHERE id = $1",
            uuid.UUID(project_id)
        )
        return "DELETE 1" in result
    
    # ==================== FILES ====================
    
    async def save_files(self, project_id: str, files: Dict[str, str]) -> int:
        """Save or update project files"""
        pool = await get_pool()
        pid = uuid.UUID(project_id)
        count = 0
        now = datetime.utcnow()
        
        async with pool.acquire() as conn:
            for file_path, content in files.items():
                # Upsert file
                file_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO project_files (id, project_id, file_path, content, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (project_id, file_path)
                    DO UPDATE SET content = $4, updated_at = $6
                    """,
                    file_id, pid, file_path, content, now, now
                )
                count += 1
            
            # Update project timestamp
            await conn.execute(
                "UPDATE projects SET updated_at = $1 WHERE id = $2",
                now, pid
            )
        
        return count
    
    async def load_files(self, project_id: str) -> Dict[str, str]:
        """Load all files for a project"""
        results = await execute_query(
            """
            SELECT file_path, content
            FROM project_files
            WHERE project_id = $1
            """,
            uuid.UUID(project_id)
        )
        
        return {
            row["file_path"]: row["content"]
            for row in results
        }
    
    async def delete_file(self, project_id: str, file_path: str) -> bool:
        """Delete a file from a project"""
        result = await execute_modify(
            """
            DELETE FROM project_files
            WHERE project_id = $1 AND file_path = $2
            """,
            uuid.UUID(project_id), file_path
        )
        return "DELETE 1" in result
    
    # ==================== CHAT ====================
    
    async def save_chat_message(self, project_id: str, role: str, content: str) -> dict:
        """Save a single chat message"""
        msg_id = uuid.uuid4()
        now = datetime.utcnow()
        result = await execute_one(
            """
            INSERT INTO chat_messages (id, project_id, role, content, created_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, role, content, created_at
            """,
            msg_id, uuid.UUID(project_id), role, content, now
        )
        
        # Update project timestamp
        await execute_modify(
            "UPDATE projects SET updated_at = $1 WHERE id = $2",
            now, uuid.UUID(project_id)
        )
        
        return {
            "id": str(result["id"]),
            "role": result["role"],
            "content": result["content"],
            "created_at": result["created_at"].isoformat()
        }
    
    async def save_chat_messages(self, project_id: str, messages: List[dict]) -> int:
        """Save multiple chat messages (replaces existing)"""
        pool = await get_pool()
        pid = uuid.UUID(project_id)
        now = datetime.utcnow()
        
        async with pool.acquire() as conn:
            # Clear existing messages
            await conn.execute(
                "DELETE FROM chat_messages WHERE project_id = $1",
                pid
            )
            
            # Insert new messages
            for msg in messages:
                msg_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO chat_messages (id, project_id, role, content, created_at)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    msg_id, pid, msg.get("role"), msg.get("content"), now
                )
            
            # Update project timestamp
            await conn.execute(
                "UPDATE projects SET updated_at = $1 WHERE id = $2",
                now, pid
            )
        
        return len(messages)
    
    async def load_chat_messages(self, project_id: str) -> List[dict]:
        """Load all chat messages for a project"""
        results = await execute_query(
            """
            SELECT id, role, content, created_at
            FROM chat_messages
            WHERE project_id = $1
            ORDER BY created_at ASC
            """,
            uuid.UUID(project_id)
        )
        
        return [
            {
                "id": str(row["id"]),
                "role": row["role"],
                "content": row["content"],
                "created_at": row["created_at"].isoformat()
            }
            for row in results
        ]
    
    async def clear_chat(self, project_id: str) -> bool:
        """Clear all chat messages for a project"""
        result = await execute_modify(
            "DELETE FROM chat_messages WHERE project_id = $1",
            uuid.UUID(project_id)
        )
        return True
    
    # ==================== AGENT CONTEXT ====================
    
    async def save_context(self, project_id: str, context: List[dict]) -> int:
        """Save agent context (replaces existing)"""
        pool = await get_pool()
        pid = uuid.UUID(project_id)
        now = datetime.utcnow()
        
        async with pool.acquire() as conn:
            # Clear existing context
            await conn.execute(
                "DELETE FROM agent_context WHERE project_id = $1",
                pid
            )
            
            # Insert new context
            for ctx in context:
                ctx_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO agent_context (id, project_id, file_path, summary, created_at)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    ctx_id, pid, ctx.get("file"), ctx.get("summary"), now
                )
        
        return len(context)
    
    async def load_context(self, project_id: str) -> List[dict]:
        """Load agent context for a project"""
        results = await execute_query(
            """
            SELECT file_path, summary, created_at
            FROM agent_context
            WHERE project_id = $1
            ORDER BY created_at ASC
            """,
            uuid.UUID(project_id)
        )
        
        return [
            {
                "file": row["file_path"],
                "summary": row["summary"]
            }
            for row in results
        ]
    
    # ==================== FULL PROJECT LOAD/SAVE ====================
    
    async def load_full_project(self, project_id: str) -> Optional[dict]:
        """Load a project with all its data"""
        project = await self.get_project(project_id)
        if not project:
            return None
        
        files = await self.load_files(project_id)
        messages = await self.load_chat_messages(project_id)
        context = await self.load_context(project_id)
        
        return {
            "project": project,
            "files": files,
            "messages": messages,
            "context": context
        }
    
    async def save_full_project(self, project_id: str, files: Dict[str, str], 
                                messages: List[dict], context: List[dict]) -> dict:
        """Save all project data"""
        files_count = await self.save_files(project_id, files)
        messages_count = await self.save_chat_messages(project_id, messages)
        context_count = await self.save_context(project_id, context)
        
        return {
            "files_saved": files_count,
            "messages_saved": messages_count,
            "context_saved": context_count
        }


# Singleton instance
_project_service = None

def get_project_service() -> ProjectService:
    global _project_service
    if _project_service is None:
        _project_service = ProjectService()
    return _project_service
