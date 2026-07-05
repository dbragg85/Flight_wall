/**
 * Flight Logic Utility
 * Event detection, deduplication, and priority assignment
 */

const fs = require('fs');
const path = require('path');
const { isAmazonFlight } = require('./airlineLogos');

// Paths to data files
const DATA_DIR = path.join(__dirname, '..', 'data');
const SEEN_FLIGHTS_PATH = path.join(DATA_DIR, 'seenFlights.json');
const ACTIVE_FLIGHTS_PATH = path.join(DATA_DIR, 'activeFlights.json');

// Event thresholds
const THRESHOLDS = {
  CLOSE_DISTANCE_NM: 15,      // Notify when flight gets within this distance
  LOW_ALTITUDE_FT: 10000,     // Notify when flight descends below this
  ARRIVING_SOON_MINUTES: 15,  // Notify when ETA is within this
  DEDUP_MINUTES: 60,          // Don't repeat same event within this time
};

// Event types
const EVENT_TYPES = {
  NEW_FLIGHT: 'new_flight',
  APPROACHING: 'approaching',
  LOW_ALTITUDE: 'low_altitude',
  ARRIVING_SOON: 'arriving_soon',
  AMAZON: 'amazon',
};

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load JSON file safely
 * @param {string} filePath - Path to JSON file
 * @param {*} defaultValue - Default value if file doesn't exist
 * @returns {*} Parsed JSON or default value
 */
function loadJsonFile(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
  }
  return defaultValue;
}

/**
 * Save JSON file safely
 * @param {string} filePath - Path to JSON file
 * @param {*} data - Data to save
 */
function saveJsonFile(filePath, data) {
  ensureDataDir();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error.message);
  }
}

/**
 * Load seen flights (notification history)
 * @returns {Object} Map of flight IDs to notification records
 */
function loadSeenFlights() {
  return loadJsonFile(SEEN_FLIGHTS_PATH, {});
}

/**
 * Save seen flights
 * @param {Object} seenFlights - Map of flight IDs to notification records
 */
function saveSeenFlights(seenFlights) {
  saveJsonFile(SEEN_FLIGHTS_PATH, seenFlights);
}

/**
 * Load active flights
 * @returns {Object} Map of flight IDs to flight data
 */
function loadActiveFlights() {
  return loadJsonFile(ACTIVE_FLIGHTS_PATH, { flights: [], lastUpdated: null });
}

/**
 * Save active flights
 * @param {Array} flights - Array of active flight objects
 */
function saveActiveFlights(flights) {
  saveJsonFile(ACTIVE_FLIGHTS_PATH, {
    flights,
    lastUpdated: new Date().toISOString(),
  });
}

/**
 * Generate event key for deduplication
 * @param {string} flightId - Flight identifier
 * @param {string} eventType - Type of event
 * @returns {string} Unique event key
 */
function getEventKey(flightId, eventType) {
  return `${flightId}:${eventType}`;
}

/**
 * Check if an event was recently notified
 * @param {Object} seenFlights - Seen flights map
 * @param {string} flightId - Flight identifier
 * @param {string} eventType - Type of event
 * @returns {boolean} True if recently notified
 */
function wasRecentlyNotified(seenFlights, flightId, eventType) {
  const eventKey = getEventKey(flightId, eventType);
  const record = seenFlights[eventKey];
  
  if (!record) return false;
  
  const lastNotified = new Date(record.lastNotified);
  const now = new Date();
  const minutesAgo = (now - lastNotified) / (1000 * 60);
  
  return minutesAgo < THRESHOLDS.DEDUP_MINUTES;
}

/**
 * Mark an event as notified
 * @param {Object} seenFlights - Seen flights map
 * @param {string} flightId - Flight identifier
 * @param {string} eventType - Type of event
 * @param {Object} flight - Flight data
 */
function markAsNotified(seenFlights, flightId, eventType, flight) {
  const eventKey = getEventKey(flightId, eventType);
  seenFlights[eventKey] = {
    lastNotified: new Date().toISOString(),
    callsign: flight.callsign,
    eventType,
  };
}

/**
 * Determine priority level based on flight and event
 * @param {Object} flight - Flight object
 * @param {string} eventType - Event type
 * @returns {string} Priority level: 'normal', 'important', or 'urgent'
 */
function determinePriority(flight, eventType) {
  // Amazon flights are always important
  if (flight.isAmazon || isAmazonFlight(flight.callsign)) {
    return 'important';
  }
  
  // Very close or low altitude is urgent
  if (flight.distanceNm !== undefined && flight.distanceNm < 5) {
    return 'urgent';
  }
  
  if (flight.altitudeFt !== null && flight.altitudeFt < 5000) {
    return 'urgent';
  }
  
  // Approaching or low altitude events are important
  if (eventType === EVENT_TYPES.APPROACHING || eventType === EVENT_TYPES.LOW_ALTITUDE) {
    return 'important';
  }
  
  return 'normal';
}

/**
 * Detect events for a single flight
 * @param {Object} flight - Current flight data
 * @param {Object} previousFlight - Previous flight data (if any)
 * @param {Object} seenFlights - Notification history
 * @returns {Array} Array of detected events
 */
function detectFlightEvents(flight, previousFlight, seenFlights) {
  const events = [];
  const flightId = flight.id || flight.callsign;
  
  // Event 1: New flight entered search radius
  if (!previousFlight) {
    if (!wasRecentlyNotified(seenFlights, flightId, EVENT_TYPES.NEW_FLIGHT)) {
      // Check for Amazon first
      if (flight.isAmazon || isAmazonFlight(flight.callsign)) {
        events.push({
          type: EVENT_TYPES.AMAZON,
          reason: 'Amazon/cargo flight detected in area',
          priority: 'important',
        });
      } else {
        events.push({
          type: EVENT_TYPES.NEW_FLIGHT,
          reason: 'New flight entered search radius',
          priority: determinePriority(flight, EVENT_TYPES.NEW_FLIGHT),
        });
      }
    }
  }
  
  // Event 2: Flight approaching (getting closer than threshold)
  if (flight.distanceNm !== undefined && flight.distanceNm < THRESHOLDS.CLOSE_DISTANCE_NM) {
    // Check if it just crossed the threshold
    const wasFarther = previousFlight && previousFlight.distanceNm >= THRESHOLDS.CLOSE_DISTANCE_NM;
    const notRecentlyNotified = !wasRecentlyNotified(seenFlights, flightId, EVENT_TYPES.APPROACHING);
    
    if ((wasFarther || !previousFlight) && notRecentlyNotified) {
      events.push({
        type: EVENT_TYPES.APPROACHING,
        reason: `Flight within ${THRESHOLDS.CLOSE_DISTANCE_NM} NM`,
        priority: determinePriority(flight, EVENT_TYPES.APPROACHING),
      });
    }
  }
  
  // Event 3: Low altitude (descended below threshold)
  if (flight.altitudeFt !== null && flight.altitudeFt < THRESHOLDS.LOW_ALTITUDE_FT) {
    // Check if it just descended below threshold
    const wasHigher = previousFlight && previousFlight.altitudeFt >= THRESHOLDS.LOW_ALTITUDE_FT;
    const notRecentlyNotified = !wasRecentlyNotified(seenFlights, flightId, EVENT_TYPES.LOW_ALTITUDE);
    
    if ((wasHigher || !previousFlight) && notRecentlyNotified) {
      events.push({
        type: EVENT_TYPES.LOW_ALTITUDE,
        reason: `Flight below ${THRESHOLDS.LOW_ALTITUDE_FT.toLocaleString()} ft`,
        priority: determinePriority(flight, EVENT_TYPES.LOW_ALTITUDE),
      });
    }
  }
  
  // Event 4: Arriving soon
  if (flight.estimatedMinutesAway && flight.estimatedMinutesAway <= THRESHOLDS.ARRIVING_SOON_MINUTES) {
    const notRecentlyNotified = !wasRecentlyNotified(seenFlights, flightId, EVENT_TYPES.ARRIVING_SOON);
    
    // Only trigger if this is a meaningful approach (descending or getting closer)
    const isApproaching = !previousFlight || 
      (previousFlight.distanceNm && flight.distanceNm < previousFlight.distanceNm);
    
    if (isApproaching && notRecentlyNotified) {
      events.push({
        type: EVENT_TYPES.ARRIVING_SOON,
        reason: `Arriving in ~${flight.estimatedMinutesAway} minutes`,
        priority: determinePriority(flight, EVENT_TYPES.ARRIVING_SOON),
      });
    }
  }
  
  return events;
}

/**
 * Process all flights and detect events
 * Consolidates multiple events per flight into a single notification
 * @param {Array} currentFlights - Array of current flight objects
 * @returns {Object} { events: Array, activeFlights: Array }
 */
function processFlights(currentFlights) {
  const seenFlights = loadSeenFlights();
  const previousData = loadActiveFlights();
  
  // Build map of previous flights by ID
  const previousFlightsMap = {};
  if (previousData.flights) {
    previousData.flights.forEach(f => {
      const id = f.id || f.callsign;
      if (id) previousFlightsMap[id] = f;
    });
  }
  
  // Detect events for each flight and consolidate
  const consolidatedEvents = [];
  
  currentFlights.forEach(flight => {
    const flightId = flight.id || flight.callsign;
    const previousFlight = previousFlightsMap[flightId];
    
    const flightEvents = detectFlightEvents(flight, previousFlight, seenFlights);
    
    // Skip if no events for this flight
    if (flightEvents.length === 0) return;
    
    // Consolidate multiple events into ONE notification per flight
    const eventTypes = flightEvents.map(e => e.type);
    const reasons = flightEvents.map(e => e.reason);
    
    // Determine the highest priority among all events
    const priorityOrder = { 'urgent': 3, 'important': 2, 'normal': 1 };
    const highestPriority = flightEvents.reduce((highest, e) => {
      return priorityOrder[e.priority] > priorityOrder[highest] ? e.priority : highest;
    }, 'normal');
    
    // Create a single consolidated event
    const consolidatedEvent = {
      type: eventTypes.includes(EVENT_TYPES.AMAZON) ? 'amazon' : 
            eventTypes.includes(EVENT_TYPES.NEW_FLIGHT) ? 'new_flight' : 
            eventTypes[0],
      reasons: reasons,
      reason: reasons.join(' • '),
      priority: highestPriority,
      eventCount: flightEvents.length,
    };
    
    consolidatedEvents.push({
      flight,
      event: consolidatedEvent,
      timestamp: new Date().toISOString(),
    });
    
    // Mark ALL event types as notified for this flight
    flightEvents.forEach(event => {
      markAsNotified(seenFlights, flightId, event.type, flight);
    });
  });
  
  // Save updated seen flights
  saveSeenFlights(seenFlights);
  
  // Save current flights as active
  saveActiveFlights(currentFlights);
  
  // Clean up old entries (older than 24 hours)
  cleanupOldEntries(seenFlights);
  
  console.log(`🔍 Processed ${currentFlights.length} flights, detected ${consolidatedEvents.length} notification(s)`);
  
  return {
    events: consolidatedEvents,
    activeFlights: currentFlights,
  };
}

/**
 * Clean up notification records older than 24 hours
 * @param {Object} seenFlights - Seen flights map
 */
function cleanupOldEntries(seenFlights) {
  const now = new Date();
  const cutoff = 24 * 60 * 60 * 1000; // 24 hours in ms
  
  let cleaned = 0;
  for (const key of Object.keys(seenFlights)) {
    const record = seenFlights[key];
    const lastNotified = new Date(record.lastNotified);
    if (now - lastNotified > cutoff) {
      delete seenFlights[key];
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} old notification records`);
    saveSeenFlights(seenFlights);
  }
}

/**
 * Get recent events for dashboard display
 * @param {number} limit - Maximum number of events to return
 * @returns {Array} Recent events
 */
function getRecentEvents(limit = 20) {
  const seenFlights = loadSeenFlights();
  
  // Convert to array and sort by timestamp
  const events = Object.entries(seenFlights)
    .map(([key, value]) => ({
      key,
      ...value,
    }))
    .sort((a, b) => new Date(b.lastNotified) - new Date(a.lastNotified))
    .slice(0, limit);
  
  return events;
}

module.exports = {
  processFlights,
  loadActiveFlights,
  saveActiveFlights,
  loadSeenFlights,
  saveSeenFlights,
  getRecentEvents,
  detectFlightEvents,
  determinePriority,
  THRESHOLDS,
  EVENT_TYPES,
};
