"""
Supabase Database Connection and Helpers
"""
import os
import asyncpg
from typing import Optional
import logging
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# Supabase connection pool
_pool: Optional[asyncpg.Pool] = None

async def get_db_pool() -> asyncpg.Pool:
    """Get or create database connection pool"""
    global _pool
    
    if _pool is None:
        db_url = os.environ.get('SUPABASE_DB_URL')
        if not db_url:
            raise ValueError("SUPABASE_DB_URL not set in environment variables")
        
        # Parse and create connection string
        _pool = await asyncpg.create_pool(
            db_url,
            min_size=1,
            max_size=10,
            command_timeout=60
        )
        logger.info("Supabase database pool created")
    
    return _pool

async def close_db_pool():
    """Close database connection pool"""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Supabase database pool closed")

async def execute_query(query: str, *args):
    """Execute a query and return results"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)

async def execute_one(query: str, *args):
    """Execute a query and return one result"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)

async def execute_insert(query: str, *args):
    """Execute an INSERT query and return the inserted row"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)

async def execute_update(query: str, *args):
    """Execute an UPDATE/DELETE query"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)

