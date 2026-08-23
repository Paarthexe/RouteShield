# RouteShield

> **Physical-World Evacuation Corridor Intelligence & Multi-Hazard Resilience Platform**

Standard GPS navigation routes optimize purely for travel time. During a disaster (wildfire, hurricane storm surge, flood, or earthquake), the fastest road is often the first to fail: an aging bridge in poor condition, a canyon corridor that traps vehicles, or a low causeway under storm surge.

**RouteShield** evaluates the physical vulnerability of candidate evacuation corridors and scores them using structural bridge condition ratings, digital elevation models, and environmental hazard data calibrated to active disaster protocols.

---

## Key Capabilities

* **Multi-Hazard Disaster Protocols:** Tailored evaluation modes for **Wildfire**, **Flood / Hurricane**, **Earthquake**, **Landslide**, and **All Hazards (Composite)**.
* **FHWA National Bridge Inventory (NBI 2025):** Evaluates 740,000+ US bridges across 5 condition components (Deck, Superstructure, Substructure, Channel Scour, Culverts), age penalties ($>45$ / $>60$ years), and sufficiency ratings.
* **Mireye Multi-Preset Ground Truth:** Probes critical corridor chokepoints using verified environmental data (USGS seismic PGA, CAL FIRE FHSZ, FEMA flood zones, USACE dam inundation, landslide susceptibility).
* **⚡ Async Parallel Route Sampling:** Concurrently samples and enriches all candidate corridors via `asyncio.gather` for ultra-fast response times.
* **Corridor Independence Verification:** Certifies that backup routes provide true physical redundancy (evaluating shared bridge structures and spatial corridor overlap within $350\text{m}$).
* **Tactical Geospatial HUD:** Interactive map with always-visible bottleneck danger pins, distinct 5-corridor color schemes, terrain elevation profiles, and granular sample point inspector.
* **Evidence Transparency & Auditing:** Every decision includes cited evidence sources, collection policies, and structured trade-off reasoning.

---

## Disaster-Aware Evacuation Protocols

RouteShield dynamically adapts its spatial sampling heuristics, Mireye probe allocation, and Bottleneck Severity Index weights based on the active disaster scenario:

* **All Hazards (Composite):** Balanced multi-hazard assessment across seismic, flood, fire, and structural factors.
* **Wildfire:** Prioritizes CAL FIRE Very High severity zones, historical burn perimeters, high wind corridors, and single-road canyon egress chokepoints ($2.0\times$ weight on fire factors).
* **Flood / Surge:** Prioritizes FEMA V/A floodplains, low coastal elevations ($<12\text{m}$), river channels, dam failure paths, and bridge scour risks ($2.0\times$ weight on inundation factors).
* **Earthquake:** Prioritizes high seismic Peak Ground Acceleration (PGA), ASCE 7 seismic design categories, and bridges with poor structural ratings ($2.0\times$ weight on seismic and structural factors).
* **Landslide:** Prioritizes steep slope gradients ($>10\%$) and USGS landslide susceptibility indexes ($2.0\times$ weight on slope and landslide factors).

---

## System Architecture & Pipeline

```
Origin + Destination + Disaster Protocol
       │
       ▼
1. Corridor Discovery & Lateral Synthesis
   ├── OSRM routing + lateral anchor bypass synthesis (generates up to 5 distinct corridors)
   └── Mathematical anti-backtracking and ellipse detour quality gates
       │
       ▼
2. Async Parallel Sampling & Disaster-Targeted Probing
   ├── Concurrent execution via asyncio.gather() across all corridors
   ├── Configurable spatial density (250m high-res / 500m standard / 1000m fast)
   ├── Open-Meteo DEM bulk elevation & slope gradient calculation
   ├── FHWA National Bridge Inventory spatial lookup (740,000+ US bridges, 300m radius)
   └── Disaster-targeted Mireye API probes (natural_hazard + flood_risk presets)
       │
       ▼
3. Disaster-Calibrated Risk & Viability Scoring
   ├── Bottleneck Severity Index (BSI) computed per sample point
   ├── Corridor Viability Score (0-100) prioritizing life-safety over speed
   └── Hard Catastrophic Safety Gates (auto-rejects corridors with catastrophic bottlenecks)
       │
       ▼
4. Redundancy & Independence Verification
   ├── Spatial overlap analysis (≤ 350m buffer)
   └── Shared bridge ID filtering to certify independent backup corridors
       │
       ▼
5. Agentic Decision & Grounded Synthesis
   ├── Ranks corridors into PRIMARY, BACKUP, or REJECTED
   ├── Grounded AI analysis via Mireye /v1/ask on the worst chokepoint
   └── Full evidence coverage, collection policy, and trade-off readout
```

---

## Scoring Formulations & Derived Signals

### 1. Bottleneck Severity Index (BSI)

Every sample point along a corridor is evaluated for compound risk where physical infrastructure vulnerabilities meet environmental hazards:

$$\mathbf{BSI} = \text{Hazard Risk} \times (1.0 + \text{Bridge Vulnerability}) \times \text{Terrain Penalty}$$

#### **A. Hazard Risk ($H \in [0.0, 1.0]$)**
Weighted sum of verified environmental signals from Mireye and USGS/NOAA datasets:

| Signal | Source | Condition | Base Weight |
|---|---|---|---|
| **Seismic PGA** | USGS NSHM 2023 | $\ge 0.6g$ / $\ge 0.4g$ / $\ge 0.2g$ | $+0.40$ / $+0.30$ / $+0.15$ |
| **Wildfire Severity** | CAL FIRE FHSZ / FEMA NRI | Very High / High / Historical Burn Area | $+0.25$ / $+0.15$ / $+0.15$ |
| **FEMA Flood Zone** | FEMA NFHL | Coastal V-Zone (Wave Action) / 100-Yr A-Zone / 500-Yr | $+0.25$ / $+0.18$ / $+0.06$ |
| **River / Hydrography** | USGS NHDPlus HR | Sample intersects river or canal channel | $+0.10$ |
| **Surface Water** | JRC Global Surface Water | $\ge 75\%$ permanence (permanent channel) | $+0.10$ |
| **Landslide Risk** | USGS Landslide Index | Index $\ge 70$ / $\ge 40$ / $\ge 20$ (out of 100) | $+0.25$ / $+0.15$ / $+0.07$ |
| **Dam Proximity** | USACE NID | High-hazard dam $<1\text{km}$ / $<5\text{km}$ | $+0.20$ / $+0.12$ |
| **Coastal Elevation** | USGS 3DEP / DEM | $<4\text{m}$ (tidal surge) / $<12\text{m}$ near coast | $+0.25$ / $+0.15$ |
| **Terrain Grade** | Open-Meteo DEM | Slope $>18\%$ / $>12\%$ / $>7\%$ | $+0.25$ / $+0.15$ / $+0.08$ |
| **Bridge Scour** | Compound | Bridge located inside active FEMA Floodplain | $+0.15$ |

*Base weights are dynamically scaled by active disaster protocol multipliers ($2.0\times$ for matching disaster domains).*

#### **B. Bridge Vulnerability ($V \in [0.0, 2.2]$)**
Evaluated across all 5 FHWA NBI component condition ratings (0–9 scale):
* Item 58: Deck Condition
* Item 59: Superstructure Condition
* Item 60: Substructure Condition
* Item 61: Channel & Channel Protection (Scour)
* Item 62: Culvert Condition

$$V = V_{\text{base}} + \text{Age Penalty} + \text{Sufficiency Penalty} + \text{Disaster Boost}$$

* **Condition Base ($V_{\text{base}}$):**
  * $\min(\text{components}) \le 4$ (**Structurally Deficient**): $1.8$
  * $\min(\text{components}) \in [5, 6]$ (Fair): $0.7$
  * $\min(\text{components}) \in [7, 9]$ (Good): $0.1$
* **Age Penalty:** $+0.30$ if built $>60$ years ago; $+0.15$ if $>45$ years.
* **Sufficiency Penalty (Item 66):** $+0.30$ if Sufficiency Rating $<50/100$; $+0.15$ if $<75/100$.

#### **C. Terrain Penalty ($T \in [1.0, 1.7]$)**
* Grade $\le 6\%$: $1.0\times$ (normal highway)
* Grade $6-10\%$: $1.15\times$
* Grade $10-18\%$: $1.40\times$
* Grade $>18\%$: $1.70\times$ (steep mountain pass)

#### **D. BSI Action Thresholds**
* $\text{BSI} \ge 0.70$: **Critical Bottleneck** (flagged chokepoint on HUD)
* $\text{BSI} \ge 0.40$: **Moderate Bottleneck** (advisory warning)
* $\text{BSI} \ge 4.00$: **Catastrophic Failure Trigger** (automatic route rejection)

---

### 2. Corridor Viability Score ($0 - 100$)

Each candidate route receives an overall resilience score prioritizing **life safety over speed**:

$$\text{Viability} = 100 - (40 \times P_{\text{hazard}}) - (25 \times P_{\text{bottleneck}}) - (10 \times P_{\text{time}})$$

Where:
* **Hazard Exposure Ratio ($P_{\text{hazard}}$):** $\frac{\text{Count of samples with } H > 0.35}{N_{\text{total samples}}}$
* **Bottleneck Penalty ($P_{\text{bottleneck}}$):** $\min\left(1.0, \frac{\sum \text{BSI}}{N_{\text{total samples}} \times 0.4}\right)$
* **Travel Time Delta Penalty ($P_{\text{time}}$):** $\min\left(1.0, \frac{T_{\text{route}} - T_{\text{fastest}}}{1800\text{ seconds}}\right)$

#### **Hard Rejection Safety Gates**
A corridor is automatically marked **`REJECTED`** if:
1. Max BSI exceeds $4.00$ (catastrophic structural/hazard failure risk).
2. More than $60\%$ of the corridor length is under severe hazard exposure ($H > 0.50$).

---

### 3. Backup Independence & Redundancy

A secondary route is only designated as **`BACKUP`** if it provides genuine physical redundancy:
* **Shared Bridge Check:** Must not share vulnerable bridge structures with the primary corridor.
* **Corridor Overlap Buffer:** Measures spatial overlap within a $350\text{m}$ proximity threshold.
* **Independence Score:** Requires $\ge 60/100$ independence score to certify a distinct alternate corridor.

---

## Data Sources & Provenance

| Layer | Source | Details |
|---|---|---|
| **Corridor Routing** | OSRM + Lateral Bypass Synthesizer | Drivable highway routing with anti-backtracking |
| **Bridge Inventory** | FHWA National Bridge Inventory (NBI 2025) | 740,000+ US bridges indexed in SQLite |
| **Elevation & Slopes** | Open-Meteo Weather & DEM + USGS 3DEP | Bulk elevation and grade slope profiles |
| **Seismic Hazard** | USGS NSHM 2023 via Mireye | Peak Ground Acceleration (PGA) 2% in 50yr |
| **Floodplains & Zones** | FEMA NFHL via Mireye | 100-yr floodplains, coastal V-zones, floodways |
| **Wildfire Risk** | CAL FIRE FHSZ + FEMA NRI via Mireye | Severity zones, burn perimeters, fire history |
| **Landslide Susceptibility** | USGS Landslide Index via Mireye | Susceptibility rating 0–100 |
| **Dams & Inundation** | USACE National Inventory of Dams via Mireye | Proximity to high-hazard potential dams |
| **Geocoding** | Mireye `/v1/geocode` + OSM Fallback | Real-time geocoding and reverse lookups |

---

## Getting Started

### Prerequisites
* **Python 3.10+**
* **Node.js 18+**
* *(Optional)* Docker & Docker Compose

### 1. Environment Configuration
Create a `.env` file in the root directory (based on `.env.example`):
```env
MIREYE_API_KEY=your_mireye_api_key
MIREYE_BASE_URL=https://api.mireye.com/v1
OSRM_BASE_URL=http://router.project-osrm.org
ROUTE_SAMPLE_INTERVAL_M=500
ENABLE_CACHE=true
```

### 2. Run Locally

#### **Backend (FastAPI)**
```bash
cd backend
python -m venv .venv
# On Windows: .venv\Scripts\activate | On macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### **Frontend (React / Vite)**
```bash
cd frontend
npm install
npm run dev
```

* **Web UI:** [http://localhost:3000/](http://localhost:3000/)
* **Backend API:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
* **API Documentation (Swagger):** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* **Subsystem Health & Diagnostics:** [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

---

### 3. Run with Docker Compose

To launch the full stack in containerized mode:
```bash
docker compose up --build
```
* **Frontend:** [http://localhost:3000](http://localhost:3000)
* **Backend API:** [http://localhost:8000](http://localhost:8000)

---

## Benchmark Test Corridors

| Scenario | Origin | Destination | Disaster Mode | Key Dynamics Evaluated |
|---|---|---|---|---|
| **Wildfire Canyon** | `Paradise, CA` | `Chico, CA` | `WILDFIRE` | Evaluates CAL FIRE Very High severity zones, 2018 Camp Fire burn perimeter, and single-road egress failure points. |
| **Mountain Flooding** | `Asheville, NC` | `Charlotte, NC` | `FLOOD_HURRICANE` | Identifies French Broad river gorge bridges, elevation drops, and evaluates safer southern bypass highways. |
| **Seismic Faultline** | `Santa Cruz, CA` | `San Jose, CA` | `EARTHQUAKE` | Flags ~0.8g seismic PGA and landslide susceptibility across Highway 17 vs. valley alternatives. |
| **Coastal Storm Surge** | `Key West, FL` | `Miami, FL` | `FLOOD_HURRICANE` | Flags low-elevation causeways ($<3\text{m}$) and FEMA V-zones along US-1 Overseas Highway. |

---

## Testing

Run the full backend test suite:
```bash
cd backend
python -m pytest tests/ -v
```

All 19 unit & integration tests validate:
- REST API routing endpoints (`/api/routes/analyze`, `/api/health`)
- BSI bottleneck calculation and disaster-type weighting
- Viability score calculation & catastrophic safety gate rejection
- Backup corridor independence and spatial overlap computation
- Geocoding and route sampling routines