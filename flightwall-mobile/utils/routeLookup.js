/**
 * Route Lookup Utility
 * Uses AeroDataBox API to get flight route, aircraft, and timing information
 */

const axios = require('axios');

// Cache to avoid duplicate API calls
const routeCache = new Map();
const aircraftCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Look up flight route from AeroDataBox
 * @param {string} callsign - Flight callsign (e.g., "JIA5514")
 * @returns {Promise<Object|null>} Route info or null
 */
async function lookupRoute(callsign) {
  if (!callsign) return null;
  
  const cleanCallsign = callsign.trim().toUpperCase();
  
  // Check cache first
  const cached = routeCache.get(cleanCallsign);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`📋 Route cache hit for ${cleanCallsign}`);
    return cached.data;
  }
  
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    console.warn('⚠️  No RapidAPI key for route lookup');
    return null;
  }
  
  try {
    console.log(`🔍 Looking up route for ${cleanCallsign}...`);
    
    const response = await axios.get(
      `https://aerodatabox.p.rapidapi.com/flights/callsign/${cleanCallsign}`,
      {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
        },
        timeout: 10000,
      }
    );
    
    const flights = response.data;
    
    if (!Array.isArray(flights) || flights.length === 0) {
      console.log(`📭 No route found for ${cleanCallsign}`);
      routeCache.set(cleanCallsign, { data: null, timestamp: Date.now() });
      return null;
    }
    
    // Find the most relevant flight (in progress or most recent)
    const flight = findRelevantFlight(flights);
    
    if (!flight) {
      routeCache.set(cleanCallsign, { data: null, timestamp: Date.now() });
      return null;
    }
    
    // Get delay status
    const delay = getDelayStatus(flight);
    
    const routeInfo = {
      origin: flight.departure?.airport?.iata || null,
      originName: flight.departure?.airport?.shortName || flight.departure?.airport?.name || null,
      destination: flight.arrival?.airport?.iata || null,
      destinationName: flight.arrival?.airport?.shortName || flight.arrival?.airport?.name || null,
      destLat: flight.arrival?.airport?.location?.lat || null,
      destLon: flight.arrival?.airport?.location?.lon || null,
      flightNumber: flight.number || null,
      airlineName: flight.airline?.name || null,
      airlineIata: flight.airline?.iata || null,
      aircraftModel: flight.aircraft?.model || null,
      registration: flight.aircraft?.reg || null,
      status: flight.status || null,
      departureTimeUtc: flight.departure?.runwayTime?.utc || flight.departure?.revisedTime?.utc || flight.departure?.scheduledTime?.utc || null,
      isDelayed: delay.isDelayed,
      isEarly: delay.isEarly,
      delayMinutes: delay.delayMinutes,
    };
    
    console.log(`✅ Route found: ${routeInfo.origin} → ${routeInfo.destination}`);
    
    // Cache the result
    routeCache.set(cleanCallsign, { data: routeInfo, timestamp: Date.now() });
    
    return routeInfo;
    
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`📭 No route data for ${cleanCallsign}`);
    } else if (error.response?.status === 429) {
      console.warn('⚠️  AeroDataBox rate limit reached');
    } else {
      console.error(`❌ Route lookup error: ${error.message}`);
    }
    
    // Cache null to avoid repeated failed lookups
    routeCache.set(cleanCallsign, { data: null, timestamp: Date.now() });
    return null;
  }
}

/**
 * Find the most relevant flight from API results
 * Prefers in-progress flights, then most recent
 */
function findRelevantFlight(flights) {
  // Priority: EnRoute > Departed > Expected > Arrived
  const statusPriority = {
    'EnRoute': 4,
    'Departed': 3,
    'Expected': 2,
    'Arrived': 1,
    'Unknown': 0,
  };
  
  return flights.reduce((best, current) => {
    const currentPriority = statusPriority[current.status] || 0;
    const bestPriority = statusPriority[best?.status] || -1;
    return currentPriority > bestPriority ? current : best;
  }, null);
}

/**
 * Enrich flight data with route, aircraft, weather, and timing information
 * @param {Object} flight - Flight object from ADS-B Exchange
 * @returns {Promise<Object>} Enriched flight object
 */
async function enrichFlightWithRoute(flight) {
  if (!flight || !flight.callsign) return flight;
  
  let enrichedFlight = { ...flight };
  
  // Look up route info
  const routeInfo = await lookupRoute(flight.callsign);
  
  if (routeInfo) {
    enrichedFlight = {
      ...enrichedFlight,
      origin: routeInfo.origin || flight.origin,
      destination: routeInfo.destination || flight.destination,
      originName: routeInfo.originName,
      destinationName: routeInfo.destinationName,
      destLat: routeInfo.destLat,
      destLon: routeInfo.destLon,
      flightNumber: routeInfo.flightNumber || flight.flightNumber,
      airlineName: routeInfo.airlineName || flight.airlineName,
      aircraftType: routeInfo.aircraftModel || flight.aircraftType,
      registration: routeInfo.registration || flight.registration,
      departureTimeUtc: routeInfo.departureTimeUtc,
      flightStatus: routeInfo.status,
      isDelayed: routeInfo.isDelayed,
      delayMinutes: routeInfo.delayMinutes,
    };
    
    // Calculate flight time elapsed
    if (routeInfo.departureTimeUtc) {
      enrichedFlight.flightTimeElapsed = calculateFlightTime(routeInfo.departureTimeUtc);
    }
    
    // Calculate distance remaining to destination
    if (routeInfo.destLat && routeInfo.destLon && flight.latitude && flight.longitude) {
      enrichedFlight.distanceRemaining = calculateDistanceRemaining(
        flight.latitude, flight.longitude,
        routeInfo.destLat, routeInfo.destLon
      );
    }
  }
  
  // Aircraft lookup disabled for faster/more reliable polling
  // To re-enable: uncomment below
  // const reg = enrichedFlight.registration || flight.registration;
  // if (reg) {
  //   const aircraftInfo = await lookupAircraft(reg);
  //   if (aircraftInfo) {
  //     enrichedFlight.seats = aircraftInfo.seats;
  //     enrichedFlight.aircraftAge = aircraftInfo.ageYears;
  //     enrichedFlight.aircraftModel = aircraftInfo.modelCode || aircraftInfo.model;
  //     enrichedFlight.isFreighter = aircraftInfo.isFreighter;
  //   }
  // }
  
  // Weather lookup disabled for faster processing
  // To re-enable: uncomment below
  // if (enrichedFlight.destination) {
  //   const weather = await getAirportWeather(enrichedFlight.destination);
  //   if (weather) {
  //     enrichedFlight.destWeather = weather;
  //   }
  // }
  
  return enrichedFlight;
}

/**
 * Look up aircraft details from AeroDataBox
 * @param {string} registration - Aircraft registration (e.g., "N592NN")
 * @returns {Promise<Object|null>} Aircraft info or null
 */
async function lookupAircraft(registration) {
  if (!registration) return null;
  
  const cleanReg = registration.trim().toUpperCase();
  
  // Check cache first
  const cached = aircraftCache.get(cleanReg);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return null;
  
  try {
    console.log(`🔍 Looking up aircraft ${cleanReg}...`);
    
    const response = await axios.get(
      `https://aerodatabox.p.rapidapi.com/aircrafts/reg/${cleanReg}`,
      {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
        },
        timeout: 10000,
      }
    );
    
    const data = response.data;
    
    const aircraftInfo = {
      seats: data.numSeats || null,
      ageYears: data.ageYears ? Math.round(data.ageYears * 10) / 10 : null,
      model: data.modelCode || data.model || null,
      typeName: data.typeName || null,
      engines: data.numEngines || null,
      engineType: data.engineType || null,
      isFreighter: data.isFreighter || false,
      serial: data.serial || null,
      built: data.rolloutDate || null,
    };
    
    console.log(`✅ Aircraft: ${aircraftInfo.typeName}, ${aircraftInfo.seats} seats, ${aircraftInfo.ageYears}yr old`);
    
    aircraftCache.set(cleanReg, { data: aircraftInfo, timestamp: Date.now() });
    return aircraftInfo;
    
  } catch (error) {
    if (error.response?.status !== 404) {
      console.error(`❌ Aircraft lookup error: ${error.message}`);
    }
    aircraftCache.set(cleanReg, { data: null, timestamp: Date.now() });
    return null;
  }
}

/**
 * Get weather for an airport using free wttr.in API
 * @param {string} airportCode - IATA airport code (e.g., "CVG")
 * @returns {Promise<Object|null>} Weather info or null
 */
async function getAirportWeather(airportCode) {
  if (!airportCode) return null;
  
  try {
    const response = await axios.get(
      `https://wttr.in/${airportCode}?format=j1`,
      { timeout: 5000 }
    );
    
    const current = response.data?.current_condition?.[0];
    if (!current) return null;
    
    return {
      tempF: current.temp_F,
      tempC: current.temp_C,
      condition: current.weatherDesc?.[0]?.value || 'Unknown',
      windMph: current.windspeedMiles,
      windDir: current.winddir16Point,
      visibility: current.visibility,
      humidity: current.humidity,
    };
  } catch (error) {
    console.log(`⚠️ Weather unavailable for ${airportCode}`);
    return null;
  }
}

/**
 * Calculate flight time elapsed
 * @param {string} departureTimeUtc - ISO departure time
 * @returns {string|null} Formatted time string (e.g., "1h 23m")
 */
function calculateFlightTime(departureTimeUtc) {
  if (!departureTimeUtc) return null;
  
  try {
    const departed = new Date(departureTimeUtc);
    const now = new Date();
    const diffMs = now - departed;
    
    if (diffMs < 0) return null; // Not yet departed
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  } catch {
    return null;
  }
}

/**
 * Calculate distance remaining to destination
 * @param {number} currentLat - Current latitude
 * @param {number} currentLon - Current longitude
 * @param {number} destLat - Destination latitude
 * @param {number} destLon - Destination longitude
 * @returns {number|null} Distance in nautical miles
 */
function calculateDistanceRemaining(currentLat, currentLon, destLat, destLon) {
  if (!currentLat || !currentLon || !destLat || !destLon) return null;
  
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = toRad(destLat - currentLat);
  const dLon = toRad(destLon - currentLon);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(currentLat)) * Math.cos(toRad(destLat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Get delay status from flight data
 * @param {Object} flightData - Flight data from AeroDataBox
 * @returns {Object} Delay info
 */
function getDelayStatus(flightData) {
  if (!flightData) return { isDelayed: false, delayMinutes: 0 };
  
  const scheduled = flightData.arrival?.scheduledTime?.utc;
  const revised = flightData.arrival?.revisedTime?.utc;
  
  if (!scheduled || !revised) return { isDelayed: false, delayMinutes: 0 };
  
  try {
    const scheduledTime = new Date(scheduled);
    const revisedTime = new Date(revised);
    const diffMs = revisedTime - scheduledTime;
    const delayMinutes = Math.round(diffMs / (1000 * 60));
    
    return {
      isDelayed: delayMinutes > 15,
      isEarly: delayMinutes < -5,
      delayMinutes: delayMinutes,
    };
  } catch {
    return { isDelayed: false, delayMinutes: 0 };
  }
}

/**
 * Clear the route cache
 */
function clearRouteCache() {
  routeCache.clear();
  aircraftCache.clear();
  console.log('🧹 Caches cleared');
}

/**
 * Fetch flight schedule for 24 hours prior and 24 hours future
 * Uses the Flight History & Schedule endpoint
 * @param {string} callsign - Flight callsign (e.g., "ABX306")
 * @param {string} registration - Aircraft registration (optional, e.g., "N767AX")
 * @returns {Promise<Array>} Array of scheduled flights
 */
async function lookupFlightSchedule(callsign, registration = null) {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    console.warn('⚠️  No RapidAPI key for schedule lookup');
    return [];
  }
  
  // Calculate date range: 24 hours ago to 24 hours ahead
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  const dateFrom = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
  const dateTo = tomorrow.toISOString().split('T')[0];
  
  // Try callsign first, then registration if available
  const searchMethods = [];
  
  if (callsign) {
    const cleanCallsign = callsign.trim().toUpperCase();
    searchMethods.push({ type: 'CallSign', param: cleanCallsign });
  }
  
  if (registration) {
    const cleanReg = registration.trim().toUpperCase().replace(/-/g, '');
    searchMethods.push({ type: 'Reg', param: cleanReg });
  }
  
  for (const method of searchMethods) {
    try {
      console.log(`🔍 Looking up schedule: ${method.type}=${method.param} from ${dateFrom} to ${dateTo}`);
      
      const response = await axios.get(
        `https://aerodatabox.p.rapidapi.com/flights/${method.type}/${method.param}/${dateFrom}/${dateTo}`,
        {
          headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
          },
          timeout: 15000,
        }
      );
      
      const flights = response.data;
      
      if (!Array.isArray(flights) || flights.length === 0) {
        console.log(`📭 No schedule found for ${method.type}=${method.param}`);
        continue;
      }
      
      console.log(`✅ Found ${flights.length} scheduled flights`);
      
      // Transform the data into a usable format
      const schedule = flights.map(flight => ({
        flightNumber: flight.number || null,
        callsign: flight.callSign || callsign,
        status: flight.status || 'Unknown',
        origin: flight.departure?.airport?.iata || null,
        originName: flight.departure?.airport?.name || null,
        destination: flight.arrival?.airport?.iata || null,
        destinationName: flight.arrival?.airport?.name || null,
        departureScheduled: flight.departure?.scheduledTime?.utc || null,
        departureActual: flight.departure?.actualTime?.utc || flight.departure?.runwayTime?.utc || null,
        arrivalScheduled: flight.arrival?.scheduledTime?.utc || null,
        arrivalActual: flight.arrival?.actualTime?.utc || flight.arrival?.runwayTime?.utc || null,
        aircraftReg: flight.aircraft?.reg || registration,
        aircraftModel: flight.aircraft?.model || null,
        airline: flight.airline?.name || null,
      }));
      
      // Sort by departure time
      schedule.sort((a, b) => {
        const timeA = new Date(a.departureScheduled || a.departureActual || 0);
        const timeB = new Date(b.departureScheduled || b.departureActual || 0);
        return timeA - timeB;
      });
      
      return schedule;
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`📭 No schedule data for ${method.type}=${method.param}`);
      } else if (error.response?.status === 429) {
        console.warn('⚠️  AeroDataBox rate limit reached for schedule lookup');
        return [];
      } else {
        console.error(`❌ Schedule lookup error: ${error.message}`);
      }
    }
  }
  
  return [];
}

/**
 * Get CVG airport FIDS (Flight Information Display) - departures and arrivals
 * @param {string} direction - 'departure' or 'arrival'
 * @returns {Promise<Array>} Array of flights
 */
async function lookupAirportSchedule(airportCode = 'CVG', direction = 'departure') {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return [];
  
  // Calculate time range: now to 12 hours ahead
  const now = new Date();
  const future = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  
  const fromTime = now.toISOString().replace('Z', '');
  const toTime = future.toISOString().replace('Z', '');
  
  try {
    console.log(`🔍 Looking up ${airportCode} ${direction}s...`);
    
    const response = await axios.get(
      `https://aerodatabox.p.rapidapi.com/flights/airports/iata/${airportCode}/${fromTime}/${toTime}`,
      {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
        },
        params: {
          direction: direction,
          withCancelled: false,
          withCodeshared: false,
        },
        timeout: 15000,
      }
    );
    
    const data = response.data;
    const flights = direction === 'departure' ? data.departures : data.arrivals;
    
    if (!Array.isArray(flights)) return [];
    
    console.log(`✅ Found ${flights.length} ${direction}s at ${airportCode}`);
    
    return flights.map(flight => ({
      flightNumber: flight.number,
      callsign: flight.callSign,
      airline: flight.airline?.name,
      origin: direction === 'arrival' ? flight.departure?.airport?.iata : airportCode,
      destination: direction === 'departure' ? flight.arrival?.airport?.iata : airportCode,
      scheduledTime: direction === 'departure' 
        ? flight.departure?.scheduledTime?.utc 
        : flight.arrival?.scheduledTime?.utc,
      actualTime: direction === 'departure'
        ? flight.departure?.actualTime?.utc
        : flight.arrival?.actualTime?.utc,
      status: flight.status,
      terminal: direction === 'departure'
        ? flight.departure?.terminal
        : flight.arrival?.terminal,
      gate: direction === 'departure'
        ? flight.departure?.gate
        : flight.arrival?.gate,
      aircraftReg: flight.aircraft?.reg,
      aircraftModel: flight.aircraft?.model,
    }));
    
  } catch (error) {
    console.error(`❌ Airport schedule error: ${error.message}`);
    return [];
  }
}

module.exports = {
  lookupRoute,
  lookupAircraft,
  getAirportWeather,
  enrichFlightWithRoute,
  calculateFlightTime,
  calculateDistanceRemaining,
  getDelayStatus,
  clearRouteCache,
  lookupFlightSchedule,
  lookupAirportSchedule,
};
