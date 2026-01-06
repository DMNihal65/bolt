from typing import Dict, List, Any
from .planning_agent import PlanningAgent
from .design_agent import DesignAgent
from .code_agent import CodeAgent
from .edit_agent import EditAgent
from .error_agent import ErrorAgent

class Orchestrator:
    def __init__(self):
        self.planning_agent = PlanningAgent()
        self.design_agent = DesignAgent()
        self.code_agent = CodeAgent()
        self.edit_agent = EditAgent()
        self.error_agent = ErrorAgent()
        
        self.context = []  # Store task summaries
        self.recent_files = {}  # Store recently modified file contents
        self.current_plan = None

    async def plan(self, user_request: str, current_files: Dict[str, str] = None) -> dict:
        """Create a plan for the user's request."""
        plan = await self.planning_agent.plan(user_request, current_files, self.context)
        self.current_plan = plan
        return plan

    async def execute_task(self, task: dict, current_content: str = "") -> dict:
        """Execute a single task using the appropriate agent."""
        
        # 1. Design Phase (Optional but recommended for UI tasks)
        design_guidelines = None
        if task.get('type') == 'file' and (task.get('file', '').endswith('.jsx') or task.get('file', '').endswith('.tsx')):
            design_guidelines = await self.design_agent.enhance_design(task)
        
        # 2. Execution Phase
        action = task.get('action', 'update')
        file_path = task.get('file', '')
        
        # Build compact context
        context_str = "\n".join([
            f"- {c['file']}: {c['summary']}" 
            for c in self.context[-5:]
        ]) or "No previous tasks"
        
        result = {}
        if action == 'create' or not current_content:
            result = await self.code_agent.create_file(task, context_str, design_guidelines)
        else:
            result = await self.edit_agent.update_file(task, current_content, context_str, design_guidelines)
            
        # 3. Update State
        if result.get('success'):
            if 'summary' in result:
                self.context.append({
                    "file": file_path,
                    "summary": result.get('summary')
                })
            
            if 'content' in result:
                self.recent_files[file_path] = result['content']
                
        return result

    async def handle_error(self, error_message: str, file_path: str, current_content: str) -> dict:
        """Handle an error by asking the ErrorAgent for a fix."""
        analysis = await self.error_agent.analyze_error(error_message, file_path, current_content)
        
        if analysis.get('fix_type') == 'diff':
            # Apply the fix using EditAgent logic (reusing apply_diff)
            changes = analysis.get('changes', [])
            new_content, failed = self.edit_agent._apply_multiple_diffs(current_content, changes)
            
            return {
                "success": True,
                "file": file_path,
                "action": "fix",
                "content": new_content,
                "analysis": analysis.get('analysis'),
                "changes_applied": len(changes) - len(failed)
            }
            
        return {"success": False, "error": "Could not generate fix"}

    async def handle_clarification(self, user_response: str) -> dict:
        """Process user's response to clarification question"""
        if not self.current_plan:
            return {"error": "No active plan"}
        
        original_request = self.current_plan.get('understanding', '')
        new_request = f"{original_request}\n\nUser clarification: {user_response}"
        
        return await self.plan(new_request)

    def reset(self):
        """Reset the orchestrator state"""
        self.context = []
        self.recent_files = {}
        self.current_plan = None

    def get_rate_limit_status(self) -> dict:
        """Get current rate limiter status"""
        return self.planning_agent.rate_limiter.get_status()

# Singleton instance
_orchestrator_instance = None

def get_orchestrator() -> Orchestrator:
    global _orchestrator_instance
    if _orchestrator_instance is None:
        _orchestrator_instance = Orchestrator()
    return _orchestrator_instance
