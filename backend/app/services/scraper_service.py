import logging
import re
import time
import hashlib
import httpx
from html.parser import HTMLParser
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from app.config import settings
from app.models.route_models import ScrapedEmergencyNotice
from app.services.cache import cache_service
from app.utils.geo import haversine_distance

logger = logging.getLogger(__name__)


class SimpleHTMLTextExtractor(HTMLParser):
    """Clean HTML parser that extracts text blocks, headings, and alert snippets from emergency web pages."""
    def __init__(self):
        super().__init__()
        self.reset()
        self.strict = False
        self.convert_charrefs = True
        self.text_chunks = []
        self.headings = []
        self.in_script = False
        self.in_style = False
        self.current_tag = None

    def handle_starttag(self, tag, attrs):
        self.current_tag = tag.lower()
        if self.current_tag in ("script", "style", "noscript"):
            self.in_script = True

    def handle_endtag(self, tag):
        if tag.lower() in ("script", "style", "noscript"):
            self.in_script = False
        self.current_tag = None

    def handle_data(self, data):
        if not self.in_script:
            clean = data.strip()
            if clean:
                if self.current_tag in ("h1", "h2", "h3", "h4", "strong", "title"):
                    self.headings.append(clean)
                self.text_chunks.append(clean)

    def get_extracted_text(self) -> str:
        return " ".join(self.text_chunks)


class WebScraperService:
    def __init__(self):
        self.timeout = settings.HTTP_TIMEOUT_S
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 RouteShield-EmergencyScraper/2.0",
            "Accept": "application/json,text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

    async def scrape_live_corridor_alerts(
        self,
        lat: float,
        lon: float,
        disaster_type: str = "ALL_HAZARDS",
        radius_km: float = 50.0
    ) -> List[ScrapedEmergencyNotice]:
        """
        Scrapes real-time official emergency web feeds (NWS Active Alerts, USGS Hazard Events)
        intersecting the evacuation corridor. Returns empty list if no active hazards are declared.
        """
        cache_key = f"scraper:live_updates:{round(lat, 2)},{round(lon, 2)}:{disaster_type}"
        cached = cache_service.get(cache_key)
        if cached and isinstance(cached, list):
            try:
                return [ScrapedEmergencyNotice(**item) for item in cached]
            except Exception:
                pass

        results: List[ScrapedEmergencyNotice] = []

        # 1. Scrape real live NWS / NOAA emergency weather advisories
        try:
            nws_notices = await self._scrape_nws_web_bulletins(lat, lon, disaster_type)
            results.extend(nws_notices)
        except Exception as e:
            logger.debug(f"Web scraper NWS notice error: {e}")

        # 2. Scrape real live USGS seismic and geological event feed
        try:
            usgs_notices = await self._scrape_usgs_live_events(lat, lon, radius_km)
            results.extend(usgs_notices)
        except Exception as e:
            logger.debug(f"Web scraper USGS notice error: {e}")

        # Sort by urgency (CRITICAL first, then WARNING, then ADVISORY)
        urgency_order = {"CRITICAL": 0, "WARNING": 1, "ADVISORY": 2, "WATCH": 3}
        results.sort(key=lambda x: urgency_order.get(x.urgency, 4))

        # Cache results for 3 minutes (180s)
        cache_service.set(cache_key, [r.model_dump() for r in results], ttl_seconds=180)
        return results

    async def _scrape_nws_web_bulletins(
        self,
        lat: float,
        lon: float,
        disaster_type: str
    ) -> List[ScrapedEmergencyNotice]:
        """Scrape active NWS hazard bulletins from official National Weather Service endpoint."""
        notices: List[ScrapedEmergencyNotice] = []
        target_url = f"https://api.weather.gov/alerts/active?point={round(lat, 4)},{round(lon, 4)}"

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            resp = await client.get(target_url, headers=self.headers)
            if resp.status_code == 200:
                data = resp.json()
                features = data.get("features", [])
                for f in features[:4]:
                    props = f.get("properties", {})
                    event = props.get("event", "Severe Weather Advisory")
                    headline = props.get("headline") or props.get("description") or "Active meteorological hazard alert."
                    instruction = props.get("instruction") or "Monitor official evacuation channels."
                    severity = props.get("severity", "Moderate")

                    urgency = "CRITICAL" if severity in ("Extreme", "Severe") else "WARNING"
                    hazard_cat = (
                        "Wildfire" if "Fire" in event or "Red Flag" in event else
                        "Flood" if "Flood" in event or "Surge" in event else
                        "Severe Storm" if "Wind" in event or "Thunderstorm" in event or "Tornado" in event else
                        "Hazard"
                    )

                    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                    sent_id = props.get("sent") or str(time.time())
                    notice_id = f"nws_web_{hashlib.md5(f'{event}_{sent_id}'.encode()).hexdigest()[:8]}"

                    clean_headline = headline.replace("\n", " ").strip()
                    clean_instruction = instruction.replace("\n", " ").strip()

                    notices.append(ScrapedEmergencyNotice(
                        notice_id=notice_id,
                        source_name="NOAA / National Weather Service Live Alert",
                        source_url=props.get("@id") or "https://alerts.weather.gov",
                        title=f"LIVE ADVISORY: {event}",
                        snippet=f"{clean_headline[:150]}. Directive: {clean_instruction[:130]}",
                        hazard_category=hazard_cat,
                        urgency=urgency,
                        scraped_at=now_str,
                        timestamp_epoch=time.time(),
                        distance_km=0.0
                    ))
        return notices

    async def _scrape_usgs_live_events(
        self,
        lat: float,
        lon: float,
        radius_km: float = 80.0
    ) -> List[ScrapedEmergencyNotice]:
        """Scrape live USGS seismic and ground displacement events within the corridor sector."""
        notices: List[ScrapedEmergencyNotice] = []
        target_url = (
            f"https://earthquake.usgs.gov/fdsnws/event/1/query?"
            f"format=geojson&latitude={round(lat, 4)}&longitude={round(lon, 4)}&"
            f"maxradiuskm={round(radius_km, 1)}&minmagnitude=2.5&limit=2"
        )

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            resp = await client.get(target_url, headers=self.headers)
            if resp.status_code == 200:
                data = resp.json()
                features = data.get("features", [])
                for f in features:
                    props = f.get("properties", {})
                    geom = f.get("geometry", {})
                    coords = geom.get("coordinates", [])
                    mag = props.get("mag", 0.0)
                    place = props.get("place", "Regional Sector")
                    event_time = props.get("time", 0) / 1000.0

                    # Only show if recent (within past 48h)
                    if time.time() - event_time > 172800:
                        continue

                    dist_km = 0.0
                    if len(coords) >= 2:
                        dist_km = round(haversine_distance(lat, lon, coords[1], coords[0]) / 1000.0, 1)

                    urgency = "CRITICAL" if mag >= 4.5 else "WARNING" if mag >= 3.5 else "ADVISORY"
                    now_str = datetime.fromtimestamp(event_time, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

                    notices.append(ScrapedEmergencyNotice(
                        notice_id=f"usgs_live_{props.get('code', int(time.time()))}",
                        source_name="USGS Earthquake Hazards Live Feed",
                        source_url=props.get("url") or "https://earthquake.usgs.gov",
                        title=f"M{mag:.1f} Seismic Incident — {place}",
                        snippet=f"Recorded magnitude {mag:.1f} seismic event at depth {coords[2] if len(coords)>2 else 0} km. Check bridges and rockfall zones along route.",
                        hazard_category="Earthquake / Rockfall",
                        urgency=urgency,
                        scraped_at=now_str,
                        timestamp_epoch=event_time,
                        distance_km=dist_km
                    ))
        return notices


scraper_service = WebScraperService()
