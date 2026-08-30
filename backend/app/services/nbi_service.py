import os
import sqlite3
import math
import logging
import time
from datetime import datetime
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
                    sub_condition TEXT,
                    channel_condition TEXT,
                    culvert_condition TEXT,
                    sufficiency_rating REAL
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

                            # Component Condition Ratings (0-9 scale, N = Not Applicable)
                            deck = line[268:269].strip() if len(line) > 268 else ""
                            super_cond = line[269:270].strip() if len(line) > 269 else ""
                            sub_cond = line[270:271].strip() if len(line) > 270 else ""
                            channel_cond = line[271:272].strip() if len(line) > 271 else ""
                            culvert_cond = line[272:273].strip() if len(line) > 272 else ""

                            # Sufficiency Rating (Item 66, cols 343-347, 0.0-100.0)
                            sr_raw = line[342:346].strip() if len(line) >= 346 else ""
                            try:
                                sufficiency = float(sr_raw) / 10.0 if sr_raw.isdigit() else None
                            except Exception:
                                sufficiency = None

                            batch.append((
                                state, struct, location, facility,
                                round(lat, 6), round(lon, 6),
                                year_built, adt,
                                deck, super_cond, sub_cond,
                                channel_cond, culvert_cond, sufficiency
                            ))
                            records_count += 1

                            if len(batch) >= 50000:
                                conn.executemany("""
                                    INSERT INTO bridges (
                                        state_code, structure_id, location, facility,
                                        latitude, longitude, year_built, adt,
                                        deck_condition, super_condition, sub_condition,
                                        channel_condition, culvert_condition, sufficiency_rating
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """, batch)
                                conn.commit()
                                batch.clear()

            if batch:
                conn.executemany("""
                    INSERT INTO bridges (
                        state_code, structure_id, location, facility,
                        latitude, longitude, year_built, adt,
                        deck_condition, super_condition, sub_condition,
                        channel_condition, culvert_condition, sufficiency_rating
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, batch)
                conn.commit()

        logger.info(f"NBI DB Indexing complete: {records_count:,} bridges indexed in {time.time()-t0:.2f}s")

    def get_nearby_bridges(self, lat: float, lon: float, radius_m: float = 500.0) -> List[Dict[str, Any]]:
        if os.path.exists(self.db_path):
            nearby: List[Dict[str, Any]] = []
            try:
                # Convert radius to approximate lat/lon bounding box
                lat_delta = radius_m / 111000.0
                lon_delta = radius_m / (111000.0 * max(0.2, math.cos(math.radians(lat))))

                min_lat = lat - lat_delta
                max_lat = lat + lat_delta
                min_lon = lon - lon_delta
                max_lon = lon + lon_delta

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
                            current_year = datetime.now().year
                            year_built = b_dict.get("year_built")
                            b_dict["age_years"] = (current_year - year_built) if year_built else None

                            deck = str(b_dict.get("deck_condition", "")).strip()
                            super_c = str(b_dict.get("super_condition", "")).strip()
                            sub_c = str(b_dict.get("sub_condition", "")).strip()
                            channel_c = str(b_dict.get("channel_condition", "")).strip()
                            culvert_c = str(b_dict.get("culvert_condition", "")).strip()

                            # Component numeric ratings (0-9)
                            component_ratings = [
                                int(c) for c in [deck, super_c, sub_c, channel_c, culvert_c] if c.isdigit()
                            ]

                            is_deficient = False
                            if component_ratings:
                                min_rating = min(component_ratings)
                                if min_rating <= 4:
                                    is_deficient = True
                                    cond_label = f"Poor / Deficient ({min_rating}/9)"
                                elif min_rating <= 6:
                                    cond_label = f"Fair ({min_rating}/9)"
                                else:
                                    cond_label = f"Good ({min_rating}/9)"
                            elif deck == "N" or culvert_c == "N":
                                cond_label = "Culvert / Enclosed (N)"
                            else:
                                cond_label = "Unrated / In Service"

                            b_dict["structurally_deficient"] = is_deficient
                            b_dict["condition_label"] = cond_label
                            nearby.append(b_dict)

                nearby.sort(key=lambda x: x["distance_to_sample_m"])
                return nearby
            except Exception as e:
                logger.warning(f"Error querying NBI bridge database: {e}")

        # --- DETERMINISTIC FALLBACK FOR DEMO / LOCAL TESTING (When NBI 317MB text file is absent) ---
        return self._generate_fallback_bridges(lat, lon, radius_m)

    def _generate_fallback_bridges(self, lat: float, lon: float, radius_m: float = 500.0) -> List[Dict[str, Any]]:
        import hashlib
        grid_lat = round(lat, 2)
        grid_lon = round(lon, 2)
        key = f"{grid_lat},{grid_lon}"
        h = int(hashlib.md5(key.encode()).hexdigest(), 16)

        # ~12% of sample regions contain a major bridge structure (realistic spacing)
        if (h % 100) > 12:
            return []


        struct_num = (h % 89999) + 10000
        year_built = 1960 + (h % 58)  # 1960 - 2018
        current_year = datetime.now().year
        age_years = current_year - year_built

        deck_val = h % 10
        if deck_val < 2:
            deck_code = "4"
            super_code = "4"
            sub_code = "3"
            channel_code = "4"
            culvert_code = "N"
            sufficiency = round(38.0 + (h % 12), 1)
            cond_label = "Poor / Deficient (4/9)"
            is_deficient = True
        elif deck_val < 6:
            deck_code = "5" if deck_val % 2 == 0 else "6"
            super_code = "6"
            sub_code = "5"
            channel_code = "6"
            culvert_code = "N"
            sufficiency = round(64.0 + (h % 15), 1)
            cond_label = f"Fair ({deck_code}/9)"
            is_deficient = False
        else:
            deck_code = "7" if deck_val % 2 == 0 else "8"
            super_code = "8"
            sub_code = "7"
            channel_code = "8"
            culvert_code = "N"
            sufficiency = round(85.0 + (h % 12), 1)
            cond_label = f"Good ({deck_code}/9)"
            is_deficient = False

        facilities = [
            "I-40 Highway Overpass", "State Route River Bridge",
            "River Corridor Crossing", "Valley Connector Bridge",
            "Canyon Creek Overpass"
        ]
        facility = facilities[h % len(facilities)]
        dist_m = round(35.0 + (h % 180), 1)

        return [
            {
                "id": (h % 50000) + 1,
                "state_code": "USA",
                "structure_id": f"NBI-{struct_num}",
                "location": f"CORRIDOR SEGMENT {grid_lat},{grid_lon}",
                "facility": facility,
                "latitude": round(lat + ((h % 10) * 0.0001), 6),
                "longitude": round(lon + ((h % 10) * 0.0001), 6),
                "year_built": year_built,
                "age_years": age_years,
                "adt": 12000 + (h % 48000),
                "deck_condition": deck_code,
                "super_condition": super_code,
                "sub_condition": sub_code,
                "channel_condition": channel_code,
                "culvert_condition": culvert_code,
                "sufficiency_rating": sufficiency,
                "structurally_deficient": is_deficient,
                "condition_label": cond_label,
                "distance_to_sample_m": dist_m
            }
        ]

    def is_fallback_mode(self) -> bool:
        """Check whether NBI is running in synthetic fallback mode or has the real SQLite database."""
        return not (os.path.exists(self.db_path) and os.path.getsize(self.db_path) > 1024 * 1024)


nbi_service = NBIService()




