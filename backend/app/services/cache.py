import os
import sqlite3
import json
import time
import logging
from typing import Optional, Any
from app.config import settings

logger = logging.getLogger(__name__)


class CacheService:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or settings.CACHE_DB_PATH
        self.enabled = settings.ENABLE_CACHE
        self.ttl_s = getattr(settings, "CACHE_TTL_S", 3600)
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
                        created_at REAL NOT NULL
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
                cursor = conn.execute("SELECT value, created_at FROM cache WHERE key = ?", (key,))
                row = cursor.fetchone()
                if row:
                    value_str, created_at = row
                    # TTL check: return None if entry is stale
                    if self.ttl_s > 0 and (time.time() - created_at) > self.ttl_s:
                        logger.debug(f"Cache EXPIRED for key: {key} (age {time.time() - created_at:.0f}s > TTL {self.ttl_s}s)")
                        conn.execute("DELETE FROM cache WHERE key = ?", (key,))
                        conn.commit()
                        return None
                    logger.debug(f"Cache HIT for key: {key}")
                    return json.loads(value_str)
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
                    "INSERT OR REPLACE INTO cache (key, value, created_at) VALUES (?, ?, ?)",
                    (key, serialized, time.time())
                )
                conn.commit()
                logger.debug(f"Cache SET for key: {key}")
        except Exception as e:
            logger.warning(f"Cache set error for key '{key}': {e}")

    def clear_expired(self):
        """Remove all entries older than TTL."""
        if not self.enabled or self.ttl_s <= 0:
            return
        try:
            cutoff = time.time() - self.ttl_s
            with sqlite3.connect(self.db_path) as conn:
                result = conn.execute("DELETE FROM cache WHERE created_at < ?", (cutoff,))
                conn.commit()
                logger.info(f"Cache cleanup: removed {result.rowcount} expired entries")
        except Exception as e:
            logger.warning(f"Cache cleanup error: {e}")


cache_service = CacheService()
