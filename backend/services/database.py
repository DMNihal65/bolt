import asyncpg
import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# Database connection pool
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Get or create the database connection pool"""
    global _pool
    if _pool is None:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise ValueError("DATABASE_URL environment variable not set")
        
        _pool = await asyncpg.create_pool(
            database_url,
            min_size=2,
            max_size=10,
            ssl="require"
        )
        
        # Initialize tables on first connection
        await initialize_tables()
    
    return _pool


async def close_pool():
    """Close the database connection pool"""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def initialize_tables():
    """Create database tables - drops and recreates if schema changed"""
    global _pool
    if not _pool:
        return
    
    async with _pool.acquire() as conn:
        # Drop existing tables to fix schema issues
        print("⚡ Resetting database tables...")
        await conn.execute("DROP TABLE IF EXISTS agent_context CASCADE")
        await conn.execute("DROP TABLE IF EXISTS chat_messages CASCADE")
        await conn.execute("DROP TABLE IF EXISTS project_files CASCADE")
        await conn.execute("DROP TABLE IF EXISTS projects CASCADE")
        
        # Create projects table
        await conn.execute("""
            CREATE TABLE projects (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            )
        """)
        
        # Create project_files table
        await conn.execute("""
            CREATE TABLE project_files (
                id UUID PRIMARY KEY,
                project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                file_path VARCHAR(500) NOT NULL,
                content TEXT,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                UNIQUE(project_id, file_path)
            )
        """)
        
        # Create chat_messages table
        await conn.execute("""
            CREATE TABLE chat_messages (
                id UUID PRIMARY KEY,
                project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL
            )
        """)
        
        # Create agent_context table
        await conn.execute("""
            CREATE TABLE agent_context (
                id UUID PRIMARY KEY,
                project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                file_path VARCHAR(500),
                summary TEXT,
                created_at TIMESTAMP NOT NULL
            )
        """)
        
        print("✓ Database tables initialized")


async def execute_query(query: str, *args):
    """Execute a query and return results"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def execute_one(query: str, *args):
    """Execute a query and return one result"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def execute_modify(query: str, *args):
    """Execute an insert/update/delete query"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)
