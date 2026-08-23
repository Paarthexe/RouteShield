import os
from fastapi import APIRouter
from app.config import settings
from app.services.nbi_service import NBIService, NBI_DB_PATH, NBI_TXT_PATH

router = APIRouter(tags=["Health"])

@router.get("/health")
async def health_check():
    nbi_db_ready = os.path.exists(NBI_DB_PATH) and os.path.getsize(NBI_DB_PATH) > 1024 * 1024
    nbi_txt_exists = os.path.exists(NBI_TXT_PATH)
    cache_ready = os.path.exists(settings.CACHE_DB_PATH)

    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "stage": "Stage 1A: Routing Foundation",
        "subsystems": {
            "nbi_bridge_db": "ready" if nbi_db_ready else ("raw_text_available" if nbi_txt_exists else "uninitialized"),
            "mireye_api": "configured" if bool(settings.MIREYE_API_KEY) else "unconfigured",
            "mireye_max_probes": settings.MIREYE_MAX_PROBES,
            "osrm_endpoint": settings.OSRM_BASE_URL,
            "cache": "active" if (settings.ENABLE_CACHE and cache_ready) else "ready",
        }
    }
