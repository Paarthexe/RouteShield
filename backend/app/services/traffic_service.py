import logging
import httpx
from typing import List, Dict, Any, Optional, Tuple
from app.config import settings
from app.services.cache import cache_service

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "(RouteShield Evacuation Planner, contact@routeshield.org)",
    "Accept": "application/geo+json"
}

class TrafficService:
    def __init__(self):
        self.nws_base_url = "https://api.weather.gov/alerts/active"
        self.tomtom_base_url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative-delay/10/json"
        self.timeout = settings.HTTP_TIMEOUT_S

    async def fetch_point_alerts(self, lat: float, lon: float) -> List[Dict[str, Any]]:
        """
        Fetch live active emergency alerts (Flash Flood Warnings, Evacuation Advisories, Wildfire Watches)
        from NWS for a specific lat/lon coordinate.
        """
        cache_key = f"traffic:nws:{round(lat, 3)},{round(lon, 3)}"
        cached = cache_service.get(cache_key)
        if cached is not None:
            return cached

        alerts: List[Dict[str, Any]] = []
        try:
            url = f"{self.nws_base_url}?point={lat:.4f},{lon:.4f}"
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, headers=HEADERS)
                if resp.status_code == 200:
                    data = resp.json()
                    features = data.get("features", [])
                    for feat in features:
                        props = feat.get("properties", {})
                        alerts.append({
                            "event": props.get("event"),
                            "severity": props.get("severity"),
                            "urgency": props.get("urgency"),
                            "headline": props.get("headline"),
                            "area": props.get("areaDesc"),
                            "description": props.get("description", "")[:250],
                            "instruction": props.get("instruction", "")[:250] if props.get("instruction") else None,
                            "effective": props.get("effective"),
                            "expires": props.get("expires")
                        })
                    logger.info(f"✅ NWS Live Alerts for ({lat:.4f}, {lon:.4f}): {len(alerts)} active warning(s)")
                else:
                    logger.warning(f"⚠️ NWS API returned status {resp.status_code}")
        except Exception as e:
            logger.warning(f"❌ NWS API request failed for point ({lat}, {lon}): {e}")

        cache_service.set(cache_key, alerts)
        return alerts

    async def fetch_tomtom_traffic_flow(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """
        Fetch live traffic flow speeds, delay ratios, and congestion levels from TomTom API.
        """
        cache_key = f"traffic:tomtom:{round(lat, 4)},{round(lon, 4)}"
        cached = cache_service.get(cache_key)
        if cached is not None:
            return cached

        if not settings.TOMTOM_API_KEY:
            return None

        try:
            url = f"{self.tomtom_base_url}?point={lat:.5f},{lon:.5f}&key={settings.TOMTOM_API_KEY}"
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    flow_data = data.get("flowSegmentData", {})
                    curr_speed = float(flow_data.get("currentSpeed", 0))
                    free_speed = float(flow_data.get("freeFlowSpeed", 0))
                    curr_time = float(flow_data.get("currentTravelTime", 0))
                    free_time = float(flow_data.get("freeFlowTravelTime", 0))
                    is_closed = bool(flow_data.get("roadClosure", False))

                    ratio = curr_speed / max(1.0, free_speed)
                    if is_closed:
                        cond = "Road Closed"
                    elif ratio < 0.50:
                        cond = "Heavy Congestion"
                    elif ratio < 0.75:
                        cond = "Moderate Traffic"
                    else:
                        cond = "Free Flow"

                    result = {
                        "current_speed_kmh": round(curr_speed, 1),
                        "free_flow_speed_kmh": round(free_speed, 1),
                        "speed_ratio": round(ratio, 2),
                        "current_travel_time_s": curr_time,
                        "free_flow_travel_time_s": free_time,
                        "road_closed": is_closed,
                        "congestion_condition": cond,
                        "source": "TomTom Traffic API"
                    }
                    cache_service.set(cache_key, result)
                    return result
        except Exception as e:
            logger.warning(f"❌ TomTom Traffic API error for ({lat}, {lon}): {e}")

        return None

    async def fetch_corridor_alerts(self, points: List[Tuple[float, float]]) -> List[List[Dict[str, Any]]]:
        """
        Fetch NWS alerts for a list of sample points along a corridor concurrently.
        Uses cached lookups and deduped parallel requests.
        """
        import asyncio
        if not points:
            return []

        # Deduplicate unique coordinate clusters (rounded to ~5km grid)
        unique_keys = list({(round(lat, 2), round(lon, 2)) for (lat, lon) in points})
        
        # Parallel fetch for all unique clusters
        cluster_tasks = [self.fetch_point_alerts(lat, lon) for (lat, lon) in unique_keys]
        results = await asyncio.gather(*cluster_tasks, return_exceptions=True)

        cluster_cache: Dict[Tuple[float, float], List[Dict[str, Any]]] = {}
        for key, res in zip(unique_keys, results):
            if isinstance(res, list):
                cluster_cache[key] = res
            else:
                cluster_cache[key] = []

        point_alerts: List[List[Dict[str, Any]]] = []
        for (lat, lon) in points:
            key = (round(lat, 2), round(lon, 2))
            point_alerts.append(cluster_cache.get(key, []))

        return point_alerts


traffic_service = TrafficService()
