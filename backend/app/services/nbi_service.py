import os
import sqlite3
import math
import logging
import time
from typing import List, Dict, Optional, Any
from app.utils.geo import haversine_distance

logger = logging.getLogger(__name__)

NBI_TXT_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../2025AllStatesNoDelimiterAllRecords.txt")
)
NBI_DB_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../data/nbi_bridges.db")
)

class NBIService:
    def __init__(self, db_path: str = NBI_DB_PATH, txt_path: str = NBI_TXT_PATH):
        self.db_path = db_path
        self.txt_path = txt_path
        self._ensure_database()

    def _ensure_database(self):
        if os.path.exists(self.db_path) and os.path.getsize(self.db_path) > 1024 * 1024:
            logger.info(f"NBI Database already initialized at {self.db_path}")
            return

        if not os.path.exists(self.txt_path):
            logger.warning(f"NBI raw text dataset not found at {self.txt_path}. NBI enrichment will be skipped.")
            return

        logger.info(f"Initializing FHWA NBI Bridge Database from {self.txt_path}...")
        t0 = time.time()

        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS bridges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    state_code TEXT,
                    structure_id TEXT,
                    location TEXT,
                    facility TEXT,
                    latitude REAL,
                    longitude REAL,
                    year_built INT,
                    adt INT,
                    deck_condition TEXT,
                    super_condition TEXT,
                    sub_condition TEXT
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_lat_lon ON bridges(latitude, longitude)")
            conn.commit()

            # Fast bulk insert
            batch = []
            records_count = 0
            with open(self.txt_path, "r", encoding="latin1") as f:
                for line in f:
                    if len(line) < 146:
                        continue
                    lat_s = line[129:137]
                    lon_s = line[137:146]

                    if (
                        len(lat_s) == 8 and len(lon_s) == 9 and 
                        lat_s.isdigit() and lon_s.isdigit()
                    ):
                        lat_d = int(lat_s[0:2])
                        lat_m = int(lat_s[2:4])
                        lat_s_val = int(lat_s[4:8]) / 100.0

                        lon_d = int(lon_s[0:3])
                        lon_m = int(lon_s[3:5])
                        lon_s_val = int(lon_s[5:9]) / 100.0

                        if 18 <= lat_d <= 72 and lat_m < 60 and 65 <= lon_d <= 175 and lon_m < 60:
                            lat = lat_d + lat_m / 60.0 + lat_s_val / 3600.0
                            lon = -(lon_d + lon_m / 60.0 + lon_s_val / 3600.0)

                            state = line[0:3].strip()
                            struct = line[3:18].strip()
                            facility = line[18:36].strip()
                            location = line[67:92].strip()

                            yb_raw = line[156:160].strip()
                            year_built = int(yb_raw) if yb_raw.isdigit() else None

                            adt_raw = line[164:170].strip()
                            adt = int(adt_raw) if adt_raw.isdigit() else 0

                            deck = line[268:269] if len(line) > 268 else ""
                            super_cond = line[269:270] if len(line) > 269 else ""
                            sub_cond = line[270:271] if len(line) > 270 else ""

                            batch.append((
                                state, struct, location, facility,
                                round(lat, 6), round(lon, 6),
                                year_built, adt,
                                deck, super_cond, sub_cond
                            ))
                            records_count += 1

                            if len(batch) >= 50000:
                                conn.executemany("""
                                    INSERT INTO bridges (
                                        state_code, structure_id, location, facility,
                                        latitude, longitude, year_built, adt,
                                        deck_condition, super_condition, sub_condition
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """, batch)
                                conn.commit()
                                batch.clear()

            if batch:
                conn.executemany("""
                    INSERT INTO bridges (
                        state_code, structure_id, location, facility,
                        latitude, longitude, year_built, adt,
                        deck_condition, super_condition, sub_condition
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, batch)
                conn.commit()

        logger.info(f"NBI DB Indexing complete: {records_count:,} bridges indexed in {time.time()-t0:.2f}s")

    def get_nearby_bridges(self, lat: float, lon: float, radius_m: float = 500.0) -> List[Dict[str, Any]]:
        if not os.path.exists(self.db_path):
            return []

        # Convert radius to approximate lat/lon bounding box
        lat_delta = radius_m / 111000.0
        lon_delta = radius_m / (111000.0 * max(0.2, math.cos(math.radians(lat))))

        min_lat = lat - lat_delta
        max_lat = lat + lat_delta
        min_lon = lon - lon_delta
        max_lon = lon + lon_delta

        nearby: List[Dict[str, Any]] = []

        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                query = """
                    SELECT * FROM bridges 
                    WHERE latitude BETWEEN ? AND ? 
                    AND longitude BETWEEN ? AND ?
                """
                cursor = conn.execute(query, (min_lat, max_lat, min_lon, max_lon))

                rows = cursor.fetchall()
                for r in rows:
                    dist = haversine_distance(lat, lon, r["latitude"], r["longitude"])
                    if dist <= radius_m:
                        b_dict = dict(r)
                        b_dict["distance_to_sample_m"] = round(dist, 1)
                        current_year = 2026
                        year_built = b_dict.get("year_built")
                        b_dict["age_years"] = (current_year - year_built) if year_built else None
                        
                        deck = b_dict.get("deck_condition", "")
                        b_dict["condition_label"] = (
                            "Poor (<5)" if deck in ["1", "2", "3", "4"] 
                            else "Fair (5-6)" if deck in ["5", "6"] 
                            else "Good (7+)" if deck in ["7", "8", "9"]
                            else "Unknown"
                        )
                        nearby.append(b_dict)

            # Sort by distance
            nearby.sort(key=lambda x: x["distance_to_sample_m"])
        except Exception as e:
            logger.warning(f"Error querying NBI bridge database: {e}")

        return nearby

nbi_service = NBIService()
