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

export async function repairSegment(routeId, segmentId, payload = {}) {
  const response = await fetch(`/api/routes/${encodeURIComponent(routeId)}/segments/${encodeURIComponent(segmentId)}/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      route_id: routeId,
      segment_id: segmentId,
      action: payload.action || 'auto_repair',
      avoid_coordinate: payload.avoid_coordinate || null,
      disaster_type: payload.disaster_type || 'ALL_HAZARDS',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    let msg = errorData.detail;
    if (Array.isArray(msg)) {
      msg = msg.map(e => e.msg || JSON.stringify(e)).join(', ');
    } else if (typeof msg === 'object' && msg !== null) {
      msg = msg.message || JSON.stringify(msg);
    }
    throw new Error(msg || `Repair failed with status ${response.status}`);
  }

  return await response.json();
}


/**
 * Returns the SSE URL for a route's live monitoring stream.
 * Use with `new EventSource(url)` in components.
 */
export function getLiveMonitoringUrl(routeId, { disasterType = 'ALL_HAZARDS', currentSampleId = null } = {}) {
  const params = new URLSearchParams({ disaster_type: disasterType });
  if (currentSampleId) params.set('current_sample_id', currentSampleId);
  return `/api/routes/${encodeURIComponent(routeId)}/live?${params}`;
}

