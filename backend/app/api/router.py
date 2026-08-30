from fastapi import APIRouter
from app.api.health import router as health_router
from app.api.location import router as location_router
from app.api.routes import router as routes_router
from app.api.zone import router as zone_router

api_router = APIRouter(prefix="/api")

api_router.include_router(health_router)
api_router.include_router(location_router)
api_router.include_router(routes_router)
api_router.include_router(zone_router)
