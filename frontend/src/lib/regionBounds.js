/**
 * lib/regionBounds.js — Single source of truth for all region data.
 * Imported by Map, ObjectPanel, AlertFeed, StatusBar, AIAssistant, App, store.
 */

// Leaflet map center + zoom per region
export const REGION_VIEW = {
  all:         { center: [18.5,  75.5], zoom: 6 },
  maharashtra: { center: [19.7,  75.7], zoom: 7 },
  goa:         { center: [15.3,  74.0], zoom: 9 },
  karnataka:   { center: [15.3,  75.7], zoom: 7 },
  telangana:   { center: [17.9,  79.4], zoom: 7 },
  gujarat:     { center: [22.3,  71.2], zoom: 7 },
}

// Strict lat/lon bounding boxes — used for filtering AND map lock
export const REGION_BOUNDS = {
  all:         { latMin: 14.0, latMax: 22.5, lonMin: 70.0, lonMax: 80.5 },
  maharashtra: { latMin: 15.6, latMax: 22.1, lonMin: 72.6, lonMax: 80.9 },
  goa:         { latMin: 14.9, latMax: 15.8, lonMin: 73.6, lonMax: 74.4 },
  karnataka:   { latMin: 11.6, latMax: 18.5, lonMin: 74.0, lonMax: 78.6 },
  telangana:   { latMin: 15.8, latMax: 19.9, lonMin: 77.2, lonMax: 81.3 },
  gujarat:     { latMin: 20.1, latMax: 24.7, lonMin: 68.2, lonMax: 74.5 },
}

// Human-readable labels
export const REGION_LABELS = {
  all:         'All 5 States',
  maharashtra: 'Maharashtra',
  goa:         'Goa',
  karnataka:   'Karnataka',
  telangana:   'Telangana',
  gujarat:     'Gujarat',
}

// Boundary polygon corners for each region (for drawing on map)
// Format: [[lat,lon], ...] — SW, NW, NE, SE, SW (closed)
export function getRegionPolygon(region) {
  const b = REGION_BOUNDS[region]
  if (!b) return null
  return [
    [b.latMin, b.lonMin],
    [b.latMax, b.lonMin],
    [b.latMax, b.lonMax],
    [b.latMin, b.lonMax],
    [b.latMin, b.lonMin],
  ]
}

// Convert REGION_BOUNDS to Leaflet LatLngBounds format [[sw], [ne]]
export function getLeafletBounds(region) {
  const b = REGION_BOUNDS[region]
  if (!b) return null
  return [
    [b.latMin, b.lonMin],  // SW corner
    [b.latMax, b.lonMax],  // NE corner
  ]
}

// Returns true if lat/lon is inside the region
export function isInRegion(lat, lon, region) {
  if (!region || region === 'all') {
    // For "all" — still lock to overall 5-state bounding box
    const b = REGION_BOUNDS.all
    return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax
  }
  const b = REGION_BOUNDS[region]
  if (!b) return true
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax
}