import math
from typing import Tuple, List

EARTH_RADIUS_METERS = 6371000.0  # Mean radius of Earth in meters

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points 
    on the Earth in meters using the Haversine formula.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    
    # Clamp 'a' to [0, 1] to avoid floating point domain errors in asin/sqrt
    a = max(0.0, min(1.0, a))
    
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c

def interpolate_coordinate(
    lat1: float, lon1: float, 
    lat2: float, lon2: float, 
    fraction: float
) -> Tuple[float, float]:
    """
    Interpolate a coordinate along a great circle segment between 
    (lat1, lon1) and (lat2, lon2) at a given fraction (0.0 to 1.0).
    """
    if fraction <= 0.0:
        return (lat1, lon1)
    if fraction >= 1.0:
        return (lat2, lon2)
        
    phi1 = math.radians(lat1)
    lambda1 = math.radians(lon1)
    phi2 = math.radians(lat2)
    lambda2 = math.radians(lon2)

    delta_phi = phi2 - phi1
    delta_lambda = lambda2 - lambda1

    # For short line segments, simple linear interpolation on radians is precise and fast
    interp_phi = phi1 + fraction * delta_phi
    interp_lambda = lambda1 + fraction * delta_lambda

    return (math.degrees(interp_phi), math.degrees(interp_lambda))
