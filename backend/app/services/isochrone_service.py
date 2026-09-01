import logging
import math
import datetime
from typing import List, Dict, Any, Optional, Tuple
from app.models.route_models import (
    Route,
    WeatherSnapshot,
    HazardIsochrone,
    TimeCutoffAssessment
)
from app.utils.geo import haversine_distance

logger = logging.getLogger(__name__)


class IsochroneService:
    def _calculate_rothermel_spread_rate(
        self,
        disaster_type: str,
        wind_speed_mph: float,
        wind_dir_deg: float,
        avg_slope_pct: float
    ) -> Tuple[float, float, float]:
        """
        Calculate Head, Flank, and Backing Rates of Spread (km/h)
        using modified Rothermel wildfire propagation / flood wave velocity.
        """
        if disaster_type == "WILDFIRE":
            # Base spread rate in dry brush / timber (km/h)
            base_ros = 1.4
            # Wind multiplier: phi_w = 0.045 * (wind_mph ^ 1.25)
            phi_w = 0.045 * (max(0.0, wind_speed_mph) ** 1.22)
            # Slope multiplier: uphill slope adds acceleration
            slope_rad = math.atan(max(0.0, avg_slope_pct) / 100.0)
            phi_s = 5.275 * (math.tan(slope_rad) ** 2)
            
            head_ros = base_ros * (1.0 + phi_w + phi_s)
            flank_ros = head_ros * 0.38
            back_ros = head_ros * 0.15
        elif disaster_type == "FLOOD_HURRICANE":
            # Surge / flood inundation advance velocity (km/h)
            base_ros = 2.2 + (max(0.0, wind_speed_mph) * 0.08)
            head_ros = base_ros
            flank_ros = head_ros * 0.70
            back_ros = head_ros * 0.20
        elif disaster_type == "LANDSLIDE":
            head_ros = 0.8 + (max(0.0, avg_slope_pct) * 0.12)
            flank_ros = head_ros * 0.30
            back_ros = 0.05
        else:
            head_ros = 1.0 + (max(0.0, wind_speed_mph) * 0.04)
            flank_ros = head_ros * 0.40
            back_ros = head_ros * 0.20

        return round(head_ros, 2), round(flank_ros, 2), round(back_ros, 2)

    def _generate_ellipse_polygon(
        self,
        origin_lat: float,
        origin_lon: float,
        head_dist_km: float,
        flank_dist_km: float,
        back_dist_km: float,
        wind_dir_deg: float,
        num_points: int = 32
    ) -> List[List[float]]:
        """
        Generate oriented asymmetric ellipse coordinates [[lon, lat], ...]
        representing the advancing fire / flood perimeter front.
        """
        coords: List[List[float]] = []
        # Wind pushes fire in wind_dir_deg + 180 (downwind azimuth)
        downwind_azimuth = (wind_dir_deg + 180) % 360
        theta_rad = math.radians(downwind_azimuth)

        # Approximate degrees per km (at ~38 deg lat)
        lat_deg_per_km = 1.0 / 111.0
        lon_deg_per_km = 1.0 / (111.0 * math.cos(math.radians(origin_lat)))

        for i in range(num_points):
            angle = 2.0 * math.pi * (i / num_points)
            # Asymmetric ellipse: forward along positive y, backing along negative y
            if math.sin(angle) >= 0:
                y_local = head_dist_km * math.sin(angle)
            else:
                y_local = back_dist_km * math.sin(angle)
            x_local = flank_dist_km * math.cos(angle)

            # Rotate by downwind angle (downwind is 0 rad pointing north)
            # x_rot = x*cos(theta) - y*sin(theta), y_rot = x*sin(theta) + y*cos(theta)
            # In navigation azimuth (0=N, 90=E):
            rad = math.radians(90 - downwind_azimuth)
            rot_x = x_local * math.cos(rad) - y_local * math.sin(rad)
            rot_y = x_local * math.sin(rad) + y_local * math.cos(rad)

            pt_lat = origin_lat + (rot_y * lat_deg_per_km)
            pt_lon = origin_lon + (rot_x * lon_deg_per_km)
            coords.append([round(pt_lon, 5), round(pt_lat, 5)])

        # Close polygon
        if coords:
            coords.append(coords[0])

        return coords

    def evaluate_route_time_cutoff(
        self,
        route: Route,
        disaster_type: str = "ALL_HAZARDS",
        weather: Optional[WeatherSnapshot] = None
    ) -> TimeCutoffAssessment:
        """
        Compute dynamic hazard isochrone polygons and Time-to-Cutoff (TTC) for a route.
        """
        route_coords = route.geometry.coordinates if route.geometry else []
        if not route_coords or len(route_coords) < 2:
            return TimeCutoffAssessment()

        # Extract weather telemetry
        wind_speed = weather.wind_speed_mph if weather and weather.wind_speed_mph is not None else 18.0
        wind_dir = weather.wind_direction_deg if weather and weather.wind_direction_deg is not None else 225.0

        # Calculate average slope across samples
        avg_slope = 4.0
        if route.samples:
            slopes = [s.slope_pct for s in route.samples if s.slope_pct is not None]
            if slopes:
                avg_slope = sum(slopes) / len(slopes)

        # Determine specific active hazard profile
        if disaster_type == "WILDFIRE":
            resolved_hazard = "WILDFIRE"
            hazard_label = "Wildfire Flame Spread Front"
        elif disaster_type == "FLOOD_HURRICANE":
            resolved_hazard = "FLOOD_HURRICANE"
            hazard_label = "Flood & Storm Surge Inundation Front"
        elif disaster_type == "LANDSLIDE":
            resolved_hazard = "LANDSLIDE"
            hazard_label = "Steep Slope Debris Flow Front"
        else:
            # ALL_HAZARDS: select active physical hazard based on real-time environmental telemetry
            precip = weather.precipitation_mm if weather and weather.precipitation_mm is not None else 0.0
            if precip > 5.0:
                resolved_hazard = "FLOOD_HURRICANE"
                hazard_label = "Flash Flood Wave Inundation Front"
            elif avg_slope > 12.0:
                resolved_hazard = "LANDSLIDE"
                hazard_label = "Canyon Debris Flow Hazard Front"
            else:
                resolved_hazard = "WILDFIRE"
                hazard_label = "Wildfire Flame Spread Front (Rothermel Model)"

        # 1. Calculate physical rate of spread
        head_ros, flank_ros, back_ros = self._calculate_rothermel_spread_rate(
            resolved_hazard, wind_speed, wind_dir, avg_slope
        )

        # 2. Identify hazard origin anchor
        # Place hazard origin 4-8 km upwind / adjacent to worst bottleneck or route midpoint
        mid_idx = len(route_coords) // 2
        mid_pt = route_coords[mid_idx]

        if route.bottlenecks:
            worst_bn = max(route.bottlenecks, key=lambda b: b.bsi_score)
            origin_lat, origin_lon = worst_bn.latitude, worst_bn.longitude
        else:
            origin_lon, origin_lat = mid_pt[0], mid_pt[1]

        # Offset hazard ignition slightly upwind (3.5 km)
        upwind_rad = math.radians((wind_dir) % 360)
        h_lat = origin_lat + (3.5 * math.cos(upwind_rad) / 111.0)
        h_lon = origin_lon + (3.5 * math.sin(upwind_rad) / (111.0 * math.cos(math.radians(origin_lat))))

        # 3. Generate Isochrone perimeters for T+30, T+60, T+120 min
        isochrone_intervals = [
            (30, "#ef4444"),   # Red (Imminent)
            (60, "#f97316"),   # Orange (Critical)
            (120, "#eab308"),  # Amber / Yellow (Elevated)
        ]

        isochrones: List[HazardIsochrone] = []
        for time_min, color in isochrone_intervals:
            t_hours = time_min / 60.0
            h_dist = head_ros * t_hours
            f_dist = flank_ros * t_hours
            b_dist = back_ros * t_hours

            poly = self._generate_ellipse_polygon(
                h_lat, h_lon, h_dist, f_dist, b_dist, wind_dir
            )
            area_sq_km = round(math.pi * ((h_dist + b_dist) / 2.0) * f_dist, 1)

            isochrones.append(HazardIsochrone(
                time_min=time_min,
                polygon_coordinates=poly,
                area_sq_km=area_sq_km,
                hazard_front_speed_kmh=head_ros,
                color=color,
                hazard_type=resolved_hazard,
                hazard_label=f"{hazard_label} (T+{time_min}m)"
            ))

        # 4. Compute Time-to-Cutoff (TTC) along the route polyline
        # Find minimum distance and time for the hazard front to intercept any route vertex
        earliest_ttc_min = float("inf")
        intercept_lat: Optional[float] = None
        intercept_lon: Optional[float] = None
        intercept_dist_km: Optional[float] = None

        cum_dist_m = 0.0
        for i in range(len(route_coords)):
            pt_lon, pt_lat = route_coords[i][0], route_coords[i][1]
            if i > 0:
                prev_lon, prev_lat = route_coords[i-1][0], route_coords[i-1][1]
                cum_dist_m += haversine_distance(prev_lat, prev_lon, pt_lat, pt_lon)

            # Distance from hazard anchor to this point
            dist_to_hazard_m = haversine_distance(h_lat, h_lon, pt_lat, pt_lon)
            dist_to_hazard_km = dist_to_hazard_m / 1000.0

            # Angle from hazard to route point
            d_lon = math.radians(pt_lon - h_lon)
            y = math.sin(d_lon) * math.cos(math.radians(pt_lat))
            x = math.cos(math.radians(h_lat)) * math.sin(math.radians(pt_lat)) - math.sin(math.radians(h_lat)) * math.cos(math.radians(pt_lat)) * math.cos(d_lon)
            bearing_to_pt = (math.degrees(math.atan2(y, x)) + 360) % 360

            # Downwind direction angle difference
            downwind_deg = (wind_dir + 180) % 360
            angle_diff = abs((bearing_to_pt - downwind_deg + 180) % 360 - 180)

            # Effective spread speed towards this point
            if angle_diff <= 45:
                speed_towards_pt = head_ros * math.cos(math.radians(angle_diff))
            elif angle_diff >= 135:
                speed_towards_pt = max(0.1, back_ros)
            else:
                speed_towards_pt = max(0.2, flank_ros * math.sin(math.radians(angle_diff)))

            time_min = (dist_to_hazard_km / max(0.2, speed_towards_pt)) * 60.0

            if time_min < earliest_ttc_min:
                earliest_ttc_min = time_min
                intercept_lat = pt_lat
                intercept_lon = pt_lon
                intercept_dist_km = round(cum_dist_m / 1000.0, 1)

        # 5. Format urgency and deadline
        ttc_final = round(max(15.0, min(180.0, earliest_ttc_min)), 0)

        if ttc_final <= 30:
            urgency = "IMMINENT"
        elif ttc_final <= 60:
            urgency = "CRITICAL"
        elif ttc_final <= 120:
            urgency = "ELEVATED"
        else:
            urgency = "CLEAR"

        now = datetime.datetime.now()
        deadline_time = (now + datetime.timedelta(minutes=ttc_final)).strftime("%H:%M")

        assessment = TimeCutoffAssessment(
            time_to_cutoff_min=ttc_final,
            intercept_distance_km=intercept_dist_km or round(route.distance_km * 0.4, 1),
            intercept_latitude=intercept_lat or origin_lat,
            intercept_longitude=intercept_lon or origin_lon,
            urgency_level=urgency,
            spread_rate_kmh=head_ros,
            hazard_type=resolved_hazard,
            hazard_label=hazard_label,
            hazard_origin_description=f"Advancing {hazard_label} driven by {wind_speed:.0f} mph winds",
            clearance_deadline_iso=f"Clear before {deadline_time}",
            isochrones=isochrones
        )


        route.time_cutoff = assessment
        return assessment

    def evaluate_all_routes(
        self,
        routes: List[Route],
        disaster_type: str = "ALL_HAZARDS",
        weather: Optional[WeatherSnapshot] = None
    ) -> List[HazardIsochrone]:
        """Evaluate all candidate routes and return unified isochrone polygon list."""
        all_isochrones: List[HazardIsochrone] = []
        for r in routes:
            assessment = self.evaluate_route_time_cutoff(r, disaster_type, weather)
            if not all_isochrones and assessment.isochrones:
                all_isochrones = assessment.isochrones
        return all_isochrones


isochrone_service = IsochroneService()
