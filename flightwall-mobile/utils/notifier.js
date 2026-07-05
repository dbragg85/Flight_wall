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
  
  // Flight identifier
  lines.push(`${emoji} ${flight.callsign || 'Unknown'}`);
  
  // Route (if available)
  if (flight.origin || flight.destination) {
    const route = [flight.origin || '???', flight.destination || '???'].join(' → ');
    lines.push(route);
  }
  
  // Aircraft type and registration
  const aircraftInfo = [flight.aircraftType, flight.registration].filter(Boolean).join(' • ');
  if (aircraftInfo) {
    lines.push(aircraftInfo);
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
    lines.push(positionParts.join(' • '));
  }
  
  // ETA
  if (flight.estimatedMinutesAway) {
    lines.push(`Arriving in ~${flight.estimatedMinutesAway} min`);
  }
  
  // Event reasons (consolidated)
  if (event && event.reasons && event.reasons.length > 0) {
    lines.push('');
    lines.push(`📍 ${event.reasons.join(' • ')}`);
  } else if (event && event.reason) {
    lines.push('');
    lines.push(`📍 ${event.reason}`);
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
  
  // Add airline logo as icon if available
  if (flight.logoUrl) {
    headers['Icon'] = flight.logoUrl;
  }
  
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
