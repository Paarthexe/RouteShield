# RouteShield

Standard GPS navigation routes for travel time. During a disaster (wildfire, hurricane storm surge, flood, or earthquake), the fastest road is often the first to fail: an aging bridge rated poor condition, a canyon corridor that traps vehicles, or a low causeway under storm surge.

RouteShield evaluates the physical vulnerability of candidate evacuation corridors and scores them using structural bridge ratings, digital elevation models, and environmental hazard data calibrated to the active disaster type.

---

## Disaster-Aware Evacuation Protocols

RouteShield dynamically adapts its spatial sampling heuristics, Mireye probe allocation, and Bottleneck Severity Index weights based on the active disaster scenario:

* **All Hazards (Composite):** Balanced multi-hazard assessment across seismic, flood, fire, and structural factors.
* **Wildfire:** Prioritizes CAL FIRE Very High severity zones, historical burn perimeters, high wind corridors, and single-road canyon egress chokepoints ($2.0\times$ weight on fire factors).
* **Flood / Surge:** Prioritizes FEMA V/A floodplains, low coastal elevations ($<12\text{m}$), river channels, dam failure paths, and bridge scour risks ($2.0\times$ weight on inundation factors).
* **Earthquake:** Prioritizes high seismic Peak Ground Acceleration (PGA), ASCE 7 seismic design categories, and bridges with poor structural ratings ($2.0\times$ weight on seismic and structural factors).
* **Landslide:** Prioritizes steep slope gradients ($>10\%$) and USGS landslide susceptibility indexes ($2.0\times$ weight on slope and landslide factors).

---

## How It Works

```
Origin + Destination + Disaster Protocol
       |
       v
1. Corridor Discovery
   +-- OSRM routing + lateral anchor bypass synthesis (generates up to 5 distinct corridors)
       |
       v
2. Spatial Sampling & Disaster-Targeted Probing
   +-- 500m physical distance interpolation
   +-- Open-Meteo DEM bulk elevation & slope gradient calculation
   +-- FHWA National Bridge Inventory lookup (740,000+ US bridges, 300m spatial radius)
   +-- Up to 12 targeted Mireye API probes per corridor (natural_hazard + flood_risk presets)
       |
       v
3. Disaster-Calibrated Risk & Viability Scoring
   +-- Bottleneck Severity Index (BSI) computed per sample point
   +-- Corridor Viability Score (0-100) & Catastrophic Safety Gates
       |
       v
4. Agentic Decision & Ranked HUD
   +-- Classifies corridors into PRIMARY, BACKUP, or HIGH RISK with cited Mireye /v1/ask evidence
```

---

## Scoring Formulations & Derived Signals

### 1. Bottleneck Severity Index (BSI)

Every sample point along a corridor is evaluated for compound risk where physical infrastructure vulnerabilities meet environmental hazards:

$$\text{BSI} = \text{Hazard Risk} \times (1 + \text{Bridge Vulnerability}) \times \text{Terrain Penalty}$$

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

*Note: Base weights are dynamically scaled by active disaster protocol multipliers ($2.0\times$ for matching disaster hazard domains).*

#### **B. Bridge Vulnerability ($V \in [0.0, 2.2]$)**
Evaluated across all 5 FHWA NBI component condition ratings (0-9 scale):
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

Each candidate route receives an overall resilience score penalizing hazard exposure and bottleneck density relative to the fastest corridor:

$$\text{Viability} = 100 - (40 \times P_{\text{hazard}}) - (25 \times P_{\text{bottleneck}}) - (10 \times P_{\text{time}})$$

Where:
* **Hazard Exposure Ratio ($P_{\text{hazard}}$):**
  $$P_{\text{hazard}} = \frac{\text{Count of samples with } H > 0.35}{N_{\text{total samples}}}$$
* **Bottleneck Density Penalty ($P_{\text{bottleneck}}$):**
  $$P_{\text{bottleneck}} = \min\left(1.0, \frac{\sum \text{BSI}}{N_{\text{total samples}} \times 0.4}\right)$$
* **Travel Time Delta Penalty ($P_{\text{time}}$):**
  $$P_{\text{time}} = \min\left(1.0, \frac{T_{\text{route}} - T_{\text{fastest}}}{1800\text{ seconds}}\right)$$

#### **Rejection Rules**
A corridor is automatically marked **`REJECTED`** if:
1. Max BSI exceeds $4.00$ (catastrophic structural/hazard failure risk).
2. More than $60\%$ of the corridor length is under severe hazard exposure ($H > 0.50$).

---

## Data Sources

| Layer | Source |
|---|---|
| **Corridor Routing** | OSRM + Lateral Waypoint Bypass Synthesizer |
| **Bridge Inventory** | FHWA National Bridge Inventory (740k+ US structures in SQLite) |
| **Elevation & Slopes** | Open-Meteo DEM & USGS 3DEP |
| **Seismic Acceleration** | USGS National Seismic Hazard Model (NSHM 2023) via Mireye |
| **Floodplains & Zones** | FEMA National Flood Hazard Layer (NFHL) via Mireye |
| **Wildfire Risk** | CAL FIRE FHSZ + FEMA National Risk Index via Mireye |
| **Landslides** | USGS Landslide Susceptibility Index via Mireye |
| **Dams & Scour** | USACE National Inventory of Dams via Mireye |
| **Geocoding** | Mireye `/v1/geocode` + OpenStreetMap place fallback |

---

## Local Setup

### Requirements
* Python 3.10+
* Node.js 18+

### 1. Configure `.env`
```env
MIREYE_API_KEY=your_mireye_api_key
MIREYE_BASE_URL=https://api.mireye.com/v1
OSRM_BASE_URL=http://router.project-osrm.org
ROUTE_SAMPLE_INTERVAL_M=500
ENABLE_CACHE=true
```

### 2. Start Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Test Corridors

| Scenario | Origin | Destination | Key Dynamics |
|---|---|---|---|
| **Wildfire Canyon** | `Paradise, CA` | `Chico, CA` | Evaluates CAL FIRE Very High severity zone, 2018 Camp Fire burn perimeter, and single-road egress failure points under Wildfire protocol. |
| **Mountain Flooding** | `Asheville, NC` | `Charlotte, NC` | Identifies French Broad river gorge bridges, elevation drops, and evaluates safer southern bypass highways under Flood protocol. |
| **Seismic Faultline** | `Santa Cruz, CA` | `San Jose, CA` | Flags ~0.8g seismic PGA and landslide susceptibility across Highway 17 vs. valley alternatives under Earthquake protocol. |
| **Coastal Storm Surge** | `Key West, FL` | `Miami, FL` | Flags low-elevation causeways ($<3\text{m}$) and FEMA V-zones along US-1 Overseas Highway under Flood/Surge protocol. |

---

## Tests

```bash
cd backend
python3 -m pytest tests/ -v
```