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

    # Detect active capabilities
    capabilities = [
        "route_generation",
        "physical_sampling",
        "bottleneck_analysis",
        "viability_scoring",
        "agent_decision_engine",
        "segment_repair",
        "live_monitoring",
    ]
    if bool(settings.MIREYE_API_KEY):
        capabilities.extend(["mireye_hazard_probing", "mireye_geocoding", "mireye_ask"])
    if nbi_db_ready:
        capabilities.append("nbi_bridge_inventory")

    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "capabilities": capabilities,
        "subsystems": {
            "nbi_bridge_db": "ready" if nbi_db_ready else ("raw_text_available" if nbi_txt_exists else "uninitialized"),
            "mireye_api": "configured" if bool(settings.MIREYE_API_KEY) else "unconfigured",
            "mireye_max_probes": settings.MIREYE_MAX_PROBES,
            "osrm_endpoint": settings.OSRM_BASE_URL,
            "cache": "active" if (settings.ENABLE_CACHE and cache_ready) else "ready",
            "cache_ttl_s": settings.CACHE_TTL_S,
        }
    }
