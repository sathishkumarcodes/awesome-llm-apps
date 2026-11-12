"""
FastAPI server using Supabase PostgreSQL
"""
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime
from auth import auth_router
from holdings import holdings_router
from excel_export import export_router
from portfolio import portfolio_router
from robinhood_import import robinhood_router
from coinbase_import import coinbase_router
from binance_import import binance_router
from metamask_import import metamask_router, phantom_router
from fidelity_import import fidelity_router
from insights import insights_router
from db_supabase import close_db_pool

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    from db_supabase import execute_insert
    result = await execute_insert(
        "INSERT INTO status_checks (client_name) VALUES ($1) RETURNING id, client_name, timestamp",
        input.client_name
    )
    return StatusCheck(
        id=str(result['id']),
        client_name=result['client_name'],
        timestamp=result['timestamp']
    )

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    from db_supabase import execute_query
    status_checks = await execute_query(
        "SELECT id, client_name, timestamp FROM status_checks ORDER BY timestamp DESC LIMIT 1000"
    )
    return [
        StatusCheck(
            id=str(sc['id']),
            client_name=sc['client_name'],
            timestamp=sc['timestamp']
        )
        for sc in status_checks
    ]

# Include the routers in the api_router to get /api prefix
api_router.include_router(auth_router)
api_router.include_router(holdings_router)  
api_router.include_router(export_router)
api_router.include_router(portfolio_router)
api_router.include_router(robinhood_router)
api_router.include_router(coinbase_router)
api_router.include_router(binance_router)
api_router.include_router(metamask_router)
api_router.include_router(phantom_router)
api_router.include_router(fidelity_router)
api_router.include_router(insights_router)

# Include the api_router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_pool():
    await close_db_pool()

