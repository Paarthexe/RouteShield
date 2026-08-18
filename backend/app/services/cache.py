import os
import sqlite3
import json
import logging
from typing import Optional, Any
from app.config import settings

logger = logging.getLogger(__name__)

class CacheService:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or settings.CACHE_DB_PATH
        self.enabled = settings.ENABLE_CACHE
        if self.enabled:
            self._init_db()

    def _init_db(self):
        try:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS cache (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.commit()
        except Exception as e:
            logger.warning(f"Failed to initialize SQLite cache at {self.db_path}: {e}. Disabling cache.")
            self.enabled = False

    def get(self, key: str) -> Optional[Any]:
        if not self.enabled:
            return None
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("SELECT value FROM cache WHERE key = ?", (key,))
                row = cursor.fetchone()
                if row:
                    logger.debug(f"Cache HIT for key: {key}")
                    return json.loads(row[0])
        except Exception as e:
            logger.warning(f"Cache get error for key '{key}': {e}")
        return None

    def set(self, key: str, value: Any):
        if not self.enabled:
            return
        try:
            serialized = json.dumps(value)
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO cache (key, value) VALUES (?, ?)",
                    (key, serialized)
                )
                conn.commit()
                logger.debug(f"Cache SET for key: {key}")
        except Exception as e:
            logger.warning(f"Cache set error for key '{key}': {e}")

cache_service = CacheService()
