/**
 * regionBounds.js
 * Adapted for airspace_simulation.zip:
 * Maharashtra, Goa, Telangana, Gujarat, Delhi/NCR
 */

export const REGION_VIEW = {
  all:         { center: [21.0, 76.5], zoom: 5,  label: 'All 5 States'  },
  maharashtra: { center: [19.7, 75.7], zoom: 7,  label: 'Maharashtra'   },
  goa:         { center: [15.4, 74.0], zoom: 10, label: 'Goa'           },
  telangana:   { center: [17.9, 79.4], zoom: 7,  label: 'Telangana'     },
  gujarat:     { center: [22.3, 71.2], zoom: 7,  label: 'Gujarat'       },
  delhi:       { center: [28.6, 77.1], zoom: 9,  label: 'Delhi / NCR'   },
}

export const REGION_BOUNDS = {
  all:         { latMin: 14.0, latMax: 30.5, lonMin: 68.0, lonMax: 82.0 },
  maharashtra: { latMin: 15.6, latMax: 22.1, lonMin: 72.6, lonMax: 80.9 },
  goa:         { latMin: 14.9, latMax: 15.8, lonMin: 73.6, lonMax: 74.4 },
  telangana:   { latMin: 15.8, latMax: 19.9, lonMin: 77.2, lonMax: 81.3 },
  gujarat:     { latMin: 20.1, latMax: 24.7, lonMin: 68.2, lonMax: 74.5 },
  delhi:       { latMin: 28.2, latMax: 29.0, lonMin: 76.7, lonMax: 77.6 },
}

export const REGION_LABELS = {
  all:         'All 5 States',
  maharashtra: 'Maharashtra',
  goa:         'Goa',
  telangana:   'Telangana',
  gujarat:     'Gujarat',
  delhi:       'Delhi / NCR',
}

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

export function getLeafletBounds(region) {
  const b = REGION_BOUNDS[region]
  if (!b) return null
  return [[b.latMin, b.lonMin], [b.latMax, b.lonMax]]
}

export function isInRegion(lat, lon, region) {
  const key = region || 'all'
  const b = REGION_BOUNDS[key] || REGION_BOUNDS.all
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax
}
