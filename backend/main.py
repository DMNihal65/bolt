from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from api.routes import router as api_router
from services.database import get_pool, close_pool
import os
from dotenv import load_dotenv

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for the app - handles startup and shutdown"""
    # Startup: Initialize database connection
    try:
        await get_pool()
        print("✓ Database connection established")
    except Exception as e:
        print(f"⚠ Database connection failed: {e}")
        print("  (App will run without persistence)")
    
    yield
    
    # Shutdown: Close database connection
    await close_pool()
    print("✓ Database connection closed")


app = FastAPI(title="Bolt Clone API", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
