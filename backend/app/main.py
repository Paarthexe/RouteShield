import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.api.router import api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

# Optional rate-limiting with slowapi if available
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded

    limiter = Limiter(key_func=get_remote_address, default_limits=[settings.RATE_LIMIT_DEFAULT])
    HAS_SLOWAPI = True
except Exception:
    HAS_SLOWAPI = False
    limiter = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info(f"Starting {settings.APP_NAME}...")
    if settings.MIREYE_API_KEY:
        logging.info("Mireye API key configured")
    else:
        logging.warning("Mireye API Key not detected in environment. Using fallback geocoding & hazard simulation.")
    logging.info(f"CORS origins configured: {settings.CORS_ORIGINS}")
    yield
    logging.info(f"Shutting down {settings.APP_NAME}...")

app = FastAPI(title=settings.APP_NAME, version="1.0.0", lifespan=lifespan)

if HAS_SLOWAPI:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
if not origins or "*" in origins:
    cors_origins = ["*"]
else:
    cors_origins = origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True if cors_origins != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.get("/")
async def root():
    return {
        "service": settings.APP_NAME,
        "docs": "/docs",
        "health": "/api/health",
        "api_prefix": "/api"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
