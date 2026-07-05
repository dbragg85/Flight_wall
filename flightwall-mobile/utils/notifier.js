/**
 * Notification Utility
 * Sends push notifications via ntfy.sh
 */

const axios = require('axios');
const { getFallbackEmoji } = require('./airlineLogos');

// ntfy priority levels
const PRIORITY = {
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
  URGENT: 5,
};

// Map our priority levels to ntfy priorities
const PRIORITY_MAP = {
  'normal': PRIORITY.DEFAULT,
  'important': PRIORITY.HIGH,
  'urgent': PRIORITY.URGENT,
};

/**
 * Format flight notification message
 * @param {Object} flight - Normalized flight object
 * @param {Object} event - Event details (may contain multiple reasons)
 * @returns {string} Formatted message
 */
function formatMessage(flight, event) {
  const emoji = getFallbackEmoji(flight.callsign);
  const lines = [];
  
  // Airline name (prominent)
  if (flight.airlineName) {
    lines.push(`🏢 ${flight.airlineName}`);
  }
  
  // Flight identifier and number
  const flightId = flight.flightNumber || flight.callsign || 'Unknown';
  lines.push(`${emoji} ${flightId}`);
  
  // Route (if available)
  if (flight.origin || flight.destination) {
    lines.push(`🛫 ${flight.origin || '???'} → ${flight.destination || '???'}`);
    if (flight.originName || flight.destinationName) {
      const originDisplay = flight.originName || flight.origin || '???';
      const destDisplay = flight.destinationName || flight.destination || '???';
      lines.push(`   ${originDisplay} → ${destDisplay}`);
    }
  }
  
  // Aircraft info with seats and age
  const aircraftParts = [];
  if (flight.aircraftType || flight.aircraftModel) {
    aircraftParts.push(flight.aircraftModel || flight.aircraftType);
  }
  if (flight.seats) {
    aircraftParts.push(`${flight.seats} seats`);
  }
  if (flight.aircraftAge) {
    aircraftParts.push(`${flight.aircraftAge}yr`);
  }
  if (flight.registration) {
    aircraftParts.push(flight.registration);
  }
  if (aircraftParts.length > 0) {
    lines.push(`🛩️ ${aircraftParts.join(' • ')}`);
  }
  
  // Position info
  const positionParts = [];
  if (flight.distanceNm !== undefined) {
    positionParts.push(`${flight.distanceNm} NM ${flight.bearing || ''}`);
  }
  if (flight.altitudeFt !== null && flight.altitudeFt !== undefined) {
    positionParts.push(`${flight.altitudeFt.toLocaleString()} ft`);
  }
  if (positionParts.length > 0) {
    lines.push(`📍 ${positionParts.join(' • ')}`);
  }
  
  // Flight time and distance remaining
  // Only show "in air" if actually airborne (altitude > 500 ft)
  const isAirborne = flight.altitudeFt && flight.altitudeFt > 500;
  const timeParts = [];
  if (flight.flightTimeElapsed && isAirborne) {
    timeParts.push(`${flight.flightTimeElapsed} in air`);
  }
  if (flight.distanceRemaining && isAirborne) {
    timeParts.push(`${flight.distanceRemaining} NM to go`);
  }
  if (timeParts.length > 0) {
    lines.push(`⏱️ ${timeParts.join(' • ')}`);
  }
  
  // Ground status or ETA
  if (!isAirborne && flight.altitudeFt !== null && flight.altitudeFt <= 500) {
    lines.push(`🛬 On ground (taxiing/departing)`);
  } else if (flight.estimatedMinutesAway) {
    lines.push(`🎯 Arriving in ~${flight.estimatedMinutesAway} min`);
  }
  
  // Delay status
  if (flight.isDelayed && flight.delayMinutes > 0) {
    lines.push(`⚠️ Delayed ${flight.delayMinutes} min`);
  } else if (flight.isEarly && flight.delayMinutes < 0) {
    lines.push(`✅ ${Math.abs(flight.delayMinutes)} min early`);
  }
  
  return lines.join('\n');
}

/**
 * Format notification title
 * @param {Object} flight - Normalized flight object
 * @param {Object} event - Event details
 * @returns {string} Notification title
 */
function formatTitle(flight, event) {
  const prefix = flight.isAmazon ? '📦' : '✈️';
  let title = `${prefix} FlightWall Alert`;
  
  if (event && event.type) {
    const typeLabels = {
      'new_flight': 'New Flight Detected',
      'approaching': 'Flight Approaching',
      'low_altitude': 'Low Altitude Alert',
      'arriving_soon': 'Arriving Soon',
      'amazon': 'Amazon Flight',
    };
    title = `${prefix} ${typeLabels[event.type] || 'Flight Alert'}`;
  }
  
  return title;
}

/**
 * Send notification via ntfy
 * @param {Object} flight - Normalized flight object
 * @param {Object} event - Event details { type, reason, priority }
 * @param {Object} options - Additional options
 * @returns {Promise<boolean>} Success status
 */
async function sendNotification(flight, event = {}, options = {}) {
  const { NTFY_TOPIC } = process.env;
  
  if (!NTFY_TOPIC) {
    console.warn('⚠️  NTFY_TOPIC not configured. Skipping notification.');
    return false;
  }
  
  const ntfyUrl = `https://ntfy.sh/${NTFY_TOPIC}`;
  const message = formatMessage(flight, event);
  const title = formatTitle(flight, event);
  const priority = PRIORITY_MAP[event.priority] || PRIORITY.DEFAULT;
  
  // Build headers
  const headers = {
    'Title': title,
    'Priority': String(priority),
    'Tags': 'airplane,radar',
  };
  
  // Add click action to dashboard if available
  if (options.dashboardUrl) {
    headers['Click'] = options.dashboardUrl;
  }
  
  // Note: Logo attachments from Clearbit don't work reliably with ntfy
  // The airline name is included in the message instead
  
  // Add actions
  const actions = [];
  if (options.dashboardUrl) {
    actions.push(`view, Open Dashboard, ${options.dashboardUrl}`);
  }
  if (actions.length > 0) {
    headers['Actions'] = actions.join('; ');
  }
  
  try {
    console.log(`📤 Sending notification: ${title}`);
    console.log(`   Message: ${message.split('\n')[0]}...`);
    
    await axios.post(ntfyUrl, message, {
      headers,
      timeout: 10000,
    });
    
    console.log('✅ Notification sent successfully');
    return true;
    
  } catch (error) {
    if (error.response) {
      console.error(`❌ ntfy Error: ${error.response.status} - ${error.response.statusText}`);
    } else {
      console.error(`❌ Notification failed: ${error.message}`);
    }
    return false;
  }
}

/**
 * Send a test notification
 * @returns {Promise<boolean>} Success status
 */
async function sendTestNotification() {
  const { NTFY_TOPIC, HOME_LAT, HOME_LON } = process.env;
  
  if (!NTFY_TOPIC) {
    console.error('❌ NTFY_TOPIC not configured');
    return false;
  }
  
  const testFlight = {
    callsign: 'TEST123',
    airlineIcao: 'TST',
    origin: 'TEST',
    destination: 'HOME',
    aircraftType: 'Test Aircraft',
    distanceNm: 10.5,
    bearing: 'NW',
    altitudeFt: 25000,
    estimatedMinutesAway: 8,
    isAmazon: false,
    logoUrl: null,
  };
  
  const testEvent = {
    type: 'new_flight',
    reason: 'Test notification from FlightWall',
    priority: 'normal',
  };
  
  console.log('🧪 Sending test notification...');
  return sendNotification(testFlight, testEvent);
}

/**
 * Send batch notifications (with rate limiting)
 * @param {Array} notifications - Array of { flight, event } objects
 * @param {number} delayMs - Delay between notifications in ms
 * @returns {Promise<number>} Number of successful notifications
 */
async function sendBatchNotifications(notifications, delayMs = 500) {
  let successCount = 0;
  
  for (let i = 0; i < notifications.length; i++) {
    const { flight, event, options } = notifications[i];
    
    const success = await sendNotification(flight, event, options);
    if (success) successCount++;
    
    // Add delay between notifications to avoid rate limiting
    if (i < notifications.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return successCount;
}

module.exports = {
  sendNotification,
  sendTestNotification,
  sendBatchNotifications,
  formatMessage,
  formatTitle,
  PRIORITY,
  PRIORITY_MAP,
};
