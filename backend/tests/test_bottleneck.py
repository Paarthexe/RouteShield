import pytest
from app.models.route_models import RouteSample
from app.services.bottleneck_service import _hazard_risk, _bridge_vulnerability, _terrain_penalty


def test_wildfire_disaster_weighting():
    sample = RouteSample(
        sample_id="test_wf_1",
        route_id="route_1",
        latitude=39.75,
        longitude=-121.62,
        distance_from_origin_m=1000.0,
        mireye_data={
            "fire_hazard_zone": "Very High",
            "nearest_fire_perimeter_m": 50.0,
            "most_recent_burn_year": 2018
        }
    )

    risk_all = _hazard_risk(sample, disaster_type="ALL_HAZARDS")
    risk_wf = _hazard_risk(sample, disaster_type="WILDFIRE")
    risk_flood = _hazard_risk(sample, disaster_type="FLOOD_HURRICANE")

    assert risk_wf > risk_all
    assert risk_wf > risk_flood
    assert risk_wf >= 0.70


def test_flood_disaster_weighting():
    sample = RouteSample(
        sample_id="test_flood_1",
        route_id="route_1",
        latitude=35.59,
        longitude=-82.55,
        distance_from_origin_m=2000.0,
        mireye_data={
            "within_floodplain": True,
            "fema_flood_zone": "AE",
            "intersects_nhd_area": True
        }
    )

    risk_all = _hazard_risk(sample, disaster_type="ALL_HAZARDS")
    risk_flood = _hazard_risk(sample, disaster_type="FLOOD_HURRICANE")
    risk_wf = _hazard_risk(sample, disaster_type="WILDFIRE")

    assert risk_flood > risk_all
    assert risk_flood > risk_wf
    assert risk_flood >= 0.50


def test_earthquake_disaster_weighting():
    sample = RouteSample(
        sample_id="test_eq_1",
        route_id="route_1",
        latitude=37.0,
        longitude=-122.0,
        distance_from_origin_m=3000.0,
        mireye_data={
            "seismic_pga_g": 0.55
        },
        nbi_bridges=[
            {
                "structure_id": "NBI-999",
                "deck_condition": "4",
                "super_condition": "4",
                "sub_condition": "4",
                "structurally_deficient": True
            }
        ]
    )

    risk_eq = _hazard_risk(sample, disaster_type="EARTHQUAKE")
    risk_flood = _hazard_risk(sample, disaster_type="FLOOD_HURRICANE")
    vuln_eq = _bridge_vulnerability(sample, disaster_type="EARTHQUAKE")
    vuln_all = _bridge_vulnerability(sample, disaster_type="ALL_HAZARDS")

    assert risk_eq > risk_flood
    assert vuln_eq > vuln_all


def test_landslide_disaster_weighting():
    sample = RouteSample(
        sample_id="test_ls_1",
        route_id="route_1",
        latitude=35.5,
        longitude=-82.5,
        distance_from_origin_m=4000.0,
        slope_pct=15.0,
        mireye_data={
            "landslide_susceptibility": 75
        }
    )

    risk_ls = _hazard_risk(sample, disaster_type="LANDSLIDE")
    risk_all = _hazard_risk(sample, disaster_type="ALL_HAZARDS")

    assert risk_ls > risk_all


def test_weather_amplifies_landslide_risk():
    dry = RouteSample(
        sample_id="dry_ls",
        route_id="route_1",
        latitude=35.5,
        longitude=-82.5,
        distance_from_origin_m=4000.0,
        slope_pct=14.0,
        mireye_data={"landslide_susceptibility": 55},
        weather={"precipitation_probability_pct": 20},
    )
    wet = RouteSample(
        sample_id="wet_ls",
        route_id="route_1",
        latitude=35.5,
        longitude=-82.5,
        distance_from_origin_m=4000.0,
        slope_pct=14.0,
        mireye_data={"landslide_susceptibility": 55},
        weather={"precipitation_probability_pct": 85},
    )

    assert _hazard_risk(wet, disaster_type="LANDSLIDE") > _hazard_risk(dry, disaster_type="LANDSLIDE")


def test_weather_amplifies_wildfire_risk():
    calm = RouteSample(
        sample_id="calm_wf",
        route_id="route_1",
        latitude=39.75,
        longitude=-121.62,
        distance_from_origin_m=1000.0,
        mireye_data={"fire_hazard_zone": "High", "nearest_fire_perimeter_m": 500.0},
        weather={"wind_speed_kmh": 12, "wind_gust_kmh": 18, "relative_humidity_pct": 40},
    )
    windy = RouteSample(
        sample_id="windy_wf",
        route_id="route_1",
        latitude=39.75,
        longitude=-121.62,
        distance_from_origin_m=1000.0,
        mireye_data={"fire_hazard_zone": "High", "nearest_fire_perimeter_m": 500.0},
        weather={"wind_speed_kmh": 34, "wind_gust_kmh": 52, "relative_humidity_pct": 18},
    )

    assert _hazard_risk(windy, disaster_type="WILDFIRE") > _hazard_risk(calm, disaster_type="WILDFIRE")
