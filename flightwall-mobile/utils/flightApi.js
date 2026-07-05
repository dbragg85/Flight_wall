/**
 * Flight API Utility
 * Handles communication with RapidAPI flight/aircraft endpoints
 */

const axios = require('axios');
const { getAirlineLogo, getAirlineName, isAmazonFlight } = require('./airlineLogos');

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in nautical miles
 */
function calculateDistanceNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate bearing between two points
 * @returns {string} Cardinal direction (N, NE, E, etc.)
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let bearing = Math.atan2(y, x) * (180 / Math.PI);
  bearing = (bearing + 360) % 360;
  
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

/**
 * Estimate minutes until aircraft arrives based on distance and speed
 * @param {number} distanceNm - Distance in nautical miles
 * @param {number} groundSpeedKt - Ground speed in knots
 * @returns {number|null} Estimated minutes or null if cannot calculate
 */
function estimateMinutesAway(distanceNm, groundSpeedKt) {
  if (!groundSpeedKt || groundSpeedKt < 50) return null;
  return Math.round((distanceNm / groundSpeedKt) * 60);
}

/**
 * Normalize flight data from various API response formats
 * Different RapidAPI providers return different structures
 * @param {Object} rawFlight - Raw flight data from API
 * @param {number} homeLat - Home latitude
 * @param {number} homeLon - Home longitude
 * @returns {Object} Normalized flight object
 */
function normalizeFlight(rawFlight, homeLat, homeLon) {
  // Extract data defensively - different APIs use different field names
  const flight = {
    // Try various field names for each property
    id: rawFlight.id || rawFlight.flight_id || rawFlight.hex || rawFlight.icao24 || 
        rawFlight.registration || generateFlightId(rawFlight),
    
    callsign: cleanString(
      rawFlight.callsign || rawFlight.flight || rawFlight.call_sign || 
      rawFlight.flightNumber || rawFlight.flight_number || ''
    ),
    
    airlineIcao: rawFlight.airline_icao || rawFlight.airlineIcao || 
                 rawFlight.operator_icao || extractAirlineIcao(rawFlight),
    
    airlineIata: rawFlight.airline_iata || rawFlight.airlineIata || 
                 rawFlight.operator_iata || null,
    
    airlineName: rawFlight.airline_name || rawFlight.airlineName || 
                 rawFlight.operator || rawFlight.airline || null,
    
    flightNumber: rawFlight.flight_number || rawFlight.flightNumber || 
                  rawFlight.flight_iata || rawFlight.flight || null,
    
    origin: rawFlight.origin || rawFlight.dep_iata || rawFlight.departure || 
            rawFlight.from || rawFlight.origin_airport_iata || null,
    
    destination: rawFlight.destination || rawFlight.arr_iata || rawFlight.arrival || 
                 rawFlight.to || rawFlight.destination_airport_iata || null,
    
    aircraftType: rawFlight.aircraft_type || rawFlight.aircraftType || 
                  rawFlight.type || rawFlight.model || rawFlight.aircraft?.model || null,
    
    registration: rawFlight.registration || rawFlight.reg || rawFlight.tail_number || 
                  rawFlight.aircraft?.registration || null,
    
    latitude: parseFloat(
      rawFlight.latitude || rawFlight.lat || rawFlight.geography?.latitude || 
      rawFlight.position?.latitude || 0
    ),
    
    longitude: parseFloat(
      rawFlight.longitude || rawFlight.lon || rawFlight.lng || 
      rawFlight.geography?.longitude || rawFlight.position?.longitude || 0
    ),
    
    altitudeFt: parseAltitude(rawFlight),
    
    groundSpeedKt: parseSpeed(rawFlight),
    
    heading: parseFloat(
      rawFlight.heading || rawFlight.direction || rawFlight.track || 
      rawFlight.true_track || rawFlight.dir || 0
    ),
    
    lastSeen: new Date().toISOString(),
  };
  
  // Calculate derived fields
  if (flight.latitude && flight.longitude) {
    flight.distanceNm = Math.round(
      calculateDistanceNm(homeLat, homeLon, flight.latitude, flight.longitude) * 10
    ) / 10;
    
    flight.bearing = calculateBearing(homeLat, homeLon, flight.latitude, flight.longitude);
    flight.estimatedMinutesAway = estimateMinutesAway(flight.distanceNm, flight.groundSpeedKt);
  }
  
  // Get airline name if not provided
  if (!flight.airlineName) {
    flight.airlineName = getAirlineName(flight.airlineIata || flight.airlineIcao);
  }
  
  // Get logo URL
  flight.logoUrl = getAirlineLogo({
    airlineIata: flight.airlineIata,
    airlineIcao: flight.airlineIcao,
    callsign: flight.callsign,
  });
  
  // Mark Amazon flights
  flight.isAmazon = isAmazonFlight(flight.callsign);
  
  return flight;
}

/**
 * Generate a unique flight ID from available data
 */
function generateFlightId(rawFlight) {
  const parts = [
    rawFlight.callsign || rawFlight.flight || '',
    rawFlight.registration || rawFlight.reg || '',
    rawFlight.latitude || rawFlight.lat || '',
    rawFlight.longitude || rawFlight.lon || '',
  ].filter(Boolean);
  
  return parts.join('-') || `unknown-${Date.now()}`;
}

/**
 * Extract airline ICAO code from callsign
 */
function extractAirlineIcao(rawFlight) {
  const callsign = rawFlight.callsign || rawFlight.flight || '';
  if (callsign && callsign.length >= 3) {
    // First 3 characters of callsign are typically the airline ICAO
    const prefix = callsign.substring(0, 3).toUpperCase();
    if (/^[A-Z]{3}$/.test(prefix)) {
      return prefix;
    }
  }
  return null;
}

/**
 * Clean string values
 */
function cleanString(str) {
  if (!str) return '';
  return String(str).trim().toUpperCase();
}

/**
 * Parse altitude from various formats
 */
function parseAltitude(rawFlight) {
  // Try different field names
  let alt = rawFlight.altitude || rawFlight.alt || rawFlight.baro_altitude ||
            rawFlight.geo_altitude || rawFlight.alt_baro || rawFlight.altitude_ft ||
            rawFlight.geography?.altitude || rawFlight.position?.altitude;
  
  if (alt === null || alt === undefined) return null;
  
  alt = parseFloat(alt);
  
  // Some APIs return altitude in meters, convert if it seems like meters
  // (typical cruising altitude in meters would be ~10000, in feet ~35000)
  if (alt > 0 && alt < 15000 && rawFlight.altitude_unit !== 'ft') {
    // Likely meters, convert to feet
    alt = Math.round(alt * 3.28084);
  }
  
  return Math.round(alt);
}

/**
 * Parse speed from various formats
 */
function parseSpeed(rawFlight) {
  let speed = rawFlight.ground_speed || rawFlight.groundSpeed || rawFlight.speed ||
              rawFlight.velocity || rawFlight.gs || rawFlight.speed_horizontal;
  
  if (speed === null || speed === undefined) return null;
  
  speed = parseFloat(speed);
  
  // Some APIs return speed in m/s, convert if it seems like m/s
  if (speed > 0 && speed < 350) {
    // Likely m/s, convert to knots
    speed = Math.round(speed * 1.94384);
  }
  
  return Math.round(speed);
}

/**
 * Fetch flights from RapidAPI
 * @returns {Promise<Array>} Array of normalized flight objects
 */
async function fetchFlights() {
  const {
    RAPIDAPI_KEY,
    RAPIDAPI_HOST,
    RAPIDAPI_URL,
    HOME_LAT,
    HOME_LON,
    SEARCH_RADIUS_NM,
    MIN_ALTITUDE_FT,
    MAX_ALTITUDE_FT,
  } = process.env;
  
  if (!RAPIDAPI_KEY || !RAPIDAPI_HOST || !RAPIDAPI_URL) {
    console.warn('⚠️  RapidAPI credentials not configured. Using mock data.');
    return getMockFlights(parseFloat(HOME_LAT), parseFloat(HOME_LON));
  }
  
  const homeLat = parseFloat(HOME_LAT);
  const homeLon = parseFloat(HOME_LON);
  const searchRadius = parseFloat(SEARCH_RADIUS_NM) || 25;
  const minAlt = parseFloat(MIN_ALTITUDE_FT) || 0;
  const maxAlt = parseFloat(MAX_ALTITUDE_FT) || 45000;
  
  try {
    // Build request URL - different APIs have different parameter formats
    // Adjust this based on your specific RapidAPI endpoint
    let url = RAPIDAPI_URL;
    
    // Common parameter patterns for flight APIs
    const params = {
      lat: homeLat,
      lon: homeLon,
      // Some APIs use these
      latitude: homeLat,
      longitude: homeLon,
      // Radius parameters
      radius: searchRadius,
      distance: searchRadius,
      // Bounding box alternative (some APIs prefer this)
      // Calculate rough bounding box (1 degree ≈ 60 nm)
      lat_min: homeLat - (searchRadius / 60),
      lat_max: homeLat + (searchRadius / 60),
      lon_min: homeLon - (searchRadius / 60),
      lon_max: homeLon + (searchRadius / 60),
    };
    
    console.log(`📡 Fetching flights within ${searchRadius} NM of (${homeLat}, ${homeLon})...`);
    
    const response = await axios.get(url, {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
      params,
      timeout: 30000,
    });
    
    // Parse response defensively - different APIs return different structures
    let flights = [];
    const data = response.data;
    
    if (Array.isArray(data)) {
      flights = data;
    } else if (data.aircraft) {
      flights = data.aircraft;
    } else if (data.flights) {
      flights = data.flights;
    } else if (data.data) {
      flights = Array.isArray(data.data) ? data.data : [data.data];
    } else if (data.states) {
      // OpenSky format
      flights = parseOpenSkyFormat(data.states);
    } else if (data.ac) {
      // ADS-B Exchange format
      flights = data.ac;
    } else if (typeof data === 'object') {
      // Try to find an array in the response
      const arrayKey = Object.keys(data).find(key => Array.isArray(data[key]));
      if (arrayKey) {
        flights = data[arrayKey];
      }
    }
    
    console.log(`📊 Received ${flights.length} raw flights from API`);
    
    // Normalize and filter flights
    const normalizedFlights = flights
      .map(f => normalizeFlight(f, homeLat, homeLon))
      .filter(f => {
        // Filter by distance
        if (f.distanceNm > searchRadius) return false;
        
        // Filter by altitude
        if (f.altitudeFt !== null) {
          if (f.altitudeFt < minAlt || f.altitudeFt > maxAlt) return false;
        }
        
        // Must have valid coordinates
        if (!f.latitude || !f.longitude) return false;
        
        return true;
      });
    
    console.log(`✅ ${normalizedFlights.length} flights within search criteria`);
    
    return normalizedFlights;
    
  } catch (error) {
    if (error.response) {
      console.error(`❌ API Error: ${error.response.status} - ${error.response.statusText}`);
      console.error('Response:', error.response.data);
    } else if (error.request) {
      console.error('❌ Network Error: No response received');
    } else {
      console.error('❌ Error:', error.message);
    }
    
    return [];
  }
}

/**
 * Parse OpenSky Network format
 * States array format: [icao24, callsign, origin_country, time_position, last_contact,
 *                       longitude, latitude, baro_altitude, on_ground, velocity,
 *                       true_track, vertical_rate, sensors, geo_altitude, squawk,
 *                       spi, position_source]
 */
function parseOpenSkyFormat(states) {
  if (!Array.isArray(states)) return [];
  
  return states.map(s => ({
    icao24: s[0],
    callsign: s[1],
    origin_country: s[2],
    longitude: s[5],
    latitude: s[6],
    baro_altitude: s[7],
    on_ground: s[8],
    velocity: s[9],
    true_track: s[10],
    vertical_rate: s[11],
    geo_altitude: s[13],
  }));
}

/**
 * Get mock flights for testing (when API not configured)
 */
function getMockFlights(homeLat, homeLon) {
  const mockFlights = [
    {
      callsign: 'DAL1234',
      airline_icao: 'DAL',
      airline_iata: 'DL',
      origin: 'ATL',
      destination: 'JFK',
      aircraft_type: 'B737-900',
      registration: 'N123DA',
      latitude: homeLat + 0.15,
      longitude: homeLon - 0.1,
      altitude: 28000,
      ground_speed: 450,
      heading: 45,
    },
    {
      callsign: 'AAL567',
      airline_icao: 'AAL',
      airline_iata: 'AA',
      origin: 'DFW',
      destination: 'LGA',
      aircraft_type: 'A321',
      registration: 'N567AA',
      latitude: homeLat - 0.08,
      longitude: homeLon + 0.12,
      altitude: 35000,
      ground_speed: 480,
      heading: 90,
    },
    {
      callsign: 'GTI8765',
      airline_icao: 'GTI',
      origin: 'CVG',
      destination: 'ONT',
      aircraft_type: 'B767-300F',
      registration: 'N8765GT',
      latitude: homeLat + 0.05,
      longitude: homeLon - 0.05,
      altitude: 31000,
      ground_speed: 420,
      heading: 270,
    },
  ];
  
  console.log('🎭 Using mock flight data for testing');
  return mockFlights.map(f => normalizeFlight(f, homeLat, homeLon));
}

module.exports = {
  fetchFlights,
  normalizeFlight,
  calculateDistanceNm,
  calculateBearing,
  estimateMinutesAway,
};
