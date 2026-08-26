export async function analyzeRoutes(origin, destination, sampleIntervalM = 500, waypoints = [], disasterType = 'ALL_HAZARDS') {
  const response = await fetch('/api/routes/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      origin,
      destination,
      waypoints: waypoints.filter(w => typeof w === 'string' ? w.trim() !== '' : Boolean(w)),
      sample_interval_m: sampleIntervalM,
      disaster_type: disasterType,
    }),
  });


  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.detail || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return await response.json();
}

export async function resolveLocation(query) {
  const response = await fetch('/api/location/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to resolve location');
  }

  return await response.json();
}
