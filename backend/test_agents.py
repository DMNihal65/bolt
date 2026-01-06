import asyncio
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.agents.orchestrator import get_orchestrator

async def test_orchestrator():
    print("Testing Orchestrator...")
    orchestrator = get_orchestrator()
    
    # Mock current files
    current_files = {
        "src/App.jsx": "import React from 'react';\n\nfunction App() {\n  return <div>Hello</div>;\n}\n\nexport default App;"
    }
    
    # 1. Test Planning
    print("\n1. Testing Planning...")
    plan = await orchestrator.plan("Create a simple todo list component", current_files)
    print("Plan:", plan)
    
    if not plan.get('tasks'):
        print("❌ Planning failed")
        return
    
    # 2. Test Execution (Create)
    print("\n2. Testing Execution (Create)...")
    task = plan['tasks'][0]
    # Force it to be a create task for testing if plan didn't make it one (it likely did)
    if task['action'] == 'create':
        result = await orchestrator.execute_task(task)
        print("Create Result:", result)
    
    # 3. Test Execution (Update)
    print("\n3. Testing Execution (Update)...")
    update_task = {
        "id": 2,
        "type": "file",
        "description": "Add a title to the App component",
        "file": "src/App.jsx",
        "action": "update"
    }
    result = await orchestrator.execute_task(update_task, current_files["src/App.jsx"])
    print("Update Result:", result)

if __name__ == "__main__":
    asyncio.run(test_orchestrator())
