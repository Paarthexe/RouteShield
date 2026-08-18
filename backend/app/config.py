import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "RouteShield - Evacuation Route Intelligence"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # External Geocoding Credentials
    MIREYE_API_KEY: str = ""
    MIREYE_BASE_URL: str = "https://api.mireye.com/v1"
    
    # OSRM Routing Engine URL
    OSRM_BASE_URL: str = "http://router.project-osrm.org"
    
    # Physical Distance Route Sampling Interval (meters)
    ROUTE_SAMPLE_INTERVAL_M: float = 500.0
    
    # Cache settings
    CACHE_DB_PATH: str = "./data/routeshield_cache.db"
    ENABLE_CACHE: bool = True
    
    # Request timeouts in seconds
    HTTP_TIMEOUT_S: float = 10.0
    
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
