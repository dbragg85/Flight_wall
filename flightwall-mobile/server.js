/**
 * FlightWall Mobile Server
 * Event-driven flight alert system with push notifications
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const cron = require('node-cron');
const os = require('os');

const { fetchFlights } = require('./utils/flightApi');
const { processFlights, loadActiveFlights, getRecentEvents } = require('./utils/flightLogic');
const { sendNotification, sendTestNotification, sendBatchNotifications } = require('./utils/notifier');
const { enrichFlightWithRoute, lookupFlightSchedule, lookupAirportSchedule, lookupRoute } = require('./utils/routeLookup');

const app = express();
const PORT = process.env.PORT || 3000;

// Store for recent events (in-memory, also persisted to JSON)
let recentNotifications = [];

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// API Routes
// ============================================

/**
 * GET /api/flights
 * Returns current active flights
 * Supports optional lat/lon query params to search from a different location
 */
app.get('/api/flights', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    
    // If lat/lon provided, fetch flights from that location
    if (lat && lon) {
      const flights = await fetchFlights(parseFloat(lat), parseFloat(lon));
      return res.json({
        success: true,
        flights: flights || [],
        lastUpdated: new Date().toISOString(),
        count: (flights || []).length,
        location: { lat: parseFloat(lat), lon: parseFloat(lon) },
      });
    }
    
    // Otherwise return cached active flights from polling
    const data = loadActiveFlights();
    res.json({
      success: true,
      flights: data.flights || [],
      lastUpdated: data.lastUpdated,
      count: (data.flights || []).length,
    });
  } catch (error) {
    console.error('Error fetching flights:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/events
 * Returns recently notified events
 */
app.get('/api/events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const events = getRecentEvents(limit);
    res.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/test-notification
 * Send a test notification to verify ntfy is working
 */
app.post('/api/test-notification', async (req, res) => {
  try {
    const success = await sendTestNotification();
    res.json({
      success,
      message: success ? 'Test notification sent!' : 'Failed to send notification',
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/status
 * Returns system status and configuration
 */
app.get('/api/status', (req, res) => {
  const pollInterval = parseInt(process.env.POLL_INTERVAL_MINUTES) || 5;
  const requestsPerDay = Math.floor(1440 / pollInterval);
  const requestsPerMonth = requestsPerDay * 31;
  
  res.json({
    success: true,
    status: 'running',
    config: {
      homeLat: process.env.HOME_LAT,
      homeLon: process.env.HOME_LON,
      searchRadiusNm: process.env.SEARCH_RADIUS_NM || 25,
      pollIntervalMinutes: pollInterval,
      minAltitudeFt: process.env.MIN_ALTITUDE_FT || 0,
      maxAltitudeFt: process.env.MAX_ALTITUDE_FT || 45000,
      ntfyConfigured: !!process.env.NTFY_TOPIC,
      apiConfigured: !!(process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_HOST && process.env.RAPIDAPI_URL),
    },
    estimates: {
      requestsPerDay,
      requestsPerMonth,
      warningThreshold: 9500,
      isOverThreshold: requestsPerMonth > 9500,
    },
    serverTime: new Date().toISOString(),
  });
});

/**
 * GET /api/trigger-poll
 * Manually trigger a poll (for testing)
 */
app.post('/api/trigger-poll', async (req, res) => {
  try {
    console.log('🔄 Manual poll triggered');
    const result = await pollFlights();
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error triggering poll:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /
 * Serve the simple mobile dashboard
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * GET /radar
 * Serve the visual radar dashboard
 */
app.get('/radar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/**
 * GET /api/route/:callsign
 * Returns route info (origin, destination) for a callsign
 */
app.get('/api/route/:callsign', async (req, res) => {
  try {
    const { callsign } = req.params;
    
    if (!callsign) {
      return res.status(400).json({ success: false, error: 'Callsign required' });
    }
    
    console.log(`🛫 Route lookup for ${callsign}`);
    
    const routeInfo = await lookupRoute(callsign);
    
    if (!routeInfo) {
      return res.json({
        success: true,
        callsign,
        route: null,
        message: 'No route data available',
      });
    }
    
    res.json({
      success: true,
      callsign,
      route: {
        origin: routeInfo.origin,
        originName: routeInfo.originName,
        destination: routeInfo.destination,
        destinationName: routeInfo.destinationName,
        flightNumber: routeInfo.flightNumber,
        airlineName: routeInfo.airlineName,
        aircraftModel: routeInfo.aircraftModel,
        registration: routeInfo.registration,
        status: routeInfo.status,
        isDelayed: routeInfo.isDelayed,
        delayMinutes: routeInfo.delayMinutes,
      },
    });
    
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/schedule/:callsign
 * Returns 48-hour flight schedule (24h past + 24h future) for a callsign or registration
 */
app.get('/api/schedule/:callsign', async (req, res) => {
  try {
    const { callsign } = req.params;
    const { registration } = req.query;
    
    if (!callsign) {
      return res.status(400).json({ success: false, error: 'Callsign required' });
    }
    
    console.log(`📅 Schedule request for ${callsign}${registration ? ` (reg: ${registration})` : ''}`);
    
    const schedule = await lookupFlightSchedule(callsign, registration);
    
    console.log(`📅 Schedule result for ${callsign}: ${schedule.length} entries`);
    if (schedule.length > 0) {
      console.log(`   First entry: ${schedule[0].origin} → ${schedule[0].destination}`);
    }
    
    res.json({
      success: true,
      callsign,
      registration: registration || null,
      schedule,
      count: schedule.length,
      dateRange: {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/taf/:icao
 * Returns TAF (Terminal Aerodrome Forecast) for an airport
 */
app.get('/api/taf/:icao', async (req, res) => {
  try {
    const { icao } = req.params;
    
    if (!icao) {
      return res.status(400).json({ success: false, error: 'ICAO code required' });
    }
    
    console.log(`🌤️  TAF request for ${icao}`);
    
    const axios = require('axios');
    const response = await axios.get(
      `https://aviationweather.gov/api/data/taf?ids=${icao}&format=json`,
      { timeout: 10000 }
    );
    
    if (response.data && response.data.length > 0) {
      const taf = response.data[0];
      res.json({
        success: true,
        icao: taf.icaoId,
        rawTAF: taf.rawTAF,
        issueTime: taf.issueTime,
        validFrom: taf.validTimeFrom,
        validTo: taf.validTimeTo,
        forecasts: taf.fcsts,
        name: taf.name,
      });
    } else {
      res.json({
        success: true,
        icao,
        rawTAF: null,
        message: 'No TAF available',
      });
    }
    
  } catch (error) {
    console.error('Error fetching TAF:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/radar
 * Returns weather radar tile URLs from RainViewer
 */
app.get('/api/radar', async (req, res) => {
  try {
    const axios = require('axios');
    const response = await axios.get(
      'https://api.rainviewer.com/public/weather-maps.json',
      { timeout: 10000 }
    );
    
    const data = response.data;
    
    res.json({
      success: true,
      host: data.host,
      radar: {
        past: data.radar.past.slice(-6), // Last 6 frames (30 min)
        nowcast: data.radar.nowcast || [],
      },
      generated: data.generated,
    });
    
  } catch (error) {
    console.error('Error fetching radar:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/airport/:code/schedule
 * Returns airport departures and arrivals
 */
app.get('/api/airport/:code/schedule', async (req, res) => {
  try {
    const { code } = req.params;
    const { direction = 'both' } = req.query;
    
    let departures = [];
    let arrivals = [];
    
    if (direction === 'both' || direction === 'departure') {
      departures = await lookupAirportSchedule(code, 'departure');
    }
    
    if (direction === 'both' || direction === 'arrival') {
      arrivals = await lookupAirportSchedule(code, 'arrival');
    }
    
    res.json({
      success: true,
      airport: code,
      departures,
      arrivals,
      counts: {
        departures: departures.length,
        arrivals: arrivals.length,
      },
    });
    
  } catch (error) {
    console.error('Error fetching airport schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Polling Logic
// ============================================

/**
 * Main polling function - fetches flights and sends notifications
 * Has a 60-second timeout to prevent blocking the scheduler
 */
async function pollFlights() {
  console.log('\n' + '='.repeat(50));
  console.log(`⏰ Polling at ${new Date().toLocaleTimeString()}`);
  console.log('='.repeat(50));
  
  // Wrap in timeout to prevent blocking
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Poll timeout after 60s')), 60000)
  );
  
  try {
    return await Promise.race([pollFlightsInternal(), timeoutPromise]);
  } catch (error) {
    console.error(`❌ Poll error: ${error.message}`);
    return { error: error.message };
  }
}

async function pollFlightsInternal() {
  try {
    // Fetch current flights from API
    const flights = await fetchFlights();
    
    if (flights.length === 0) {
      console.log('📭 No flights in range');
      return { flightsFound: 0, eventsDetected: 0, notificationsSent: 0 };
    }
    
    // Process flights and detect events
    const { events, activeFlights } = processFlights(flights);
    
    // Send notifications for events
    let notificationsSent = 0;
    if (events.length > 0) {
      console.log(`\n🔔 Sending ${events.length} notification(s)...`);
      
      // Send notifications with raw ADS-B data (no enrichment for reliability)
      const enrichedNotifications = events.map(e => ({
        flight: e.flight,
        event: e.event,
        options: {
          dashboardUrl: getDashboardUrl(),
        },
      }));
      
      notificationsSent = await sendBatchNotifications(enrichedNotifications);
      
      // Store in recent notifications
      recentNotifications = [...events, ...recentNotifications].slice(0, 50);
    }
    
    console.log(`\n📊 Summary: ${activeFlights.length} flights, ${events.length} events, ${notificationsSent} notifications sent`);
    
    return {
      flightsFound: activeFlights.length,
      eventsDetected: events.length,
      notificationsSent,
    };
    
  } catch (error) {
    console.error('❌ Poll internal error:', error.message);
    return { error: error.message };
  }
}

// End of pollFlightsInternal

/**
 * Get dashboard URL for notification click actions
 */
function getDashboardUrl() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return `http://${iface.address}:${PORT}`;
      }
    }
  }
  return `http://localhost:${PORT}`;
}

/**
 * Get local IP addresses for display
 */
function getLocalIPs() {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

/**
 * Display startup information
 */
function displayStartupInfo() {
  const pollInterval = parseInt(process.env.POLL_INTERVAL_MINUTES) || 5;
  const requestsPerDay = Math.floor(1440 / pollInterval);
  const requestsPerMonth = requestsPerDay * 31;
  
  console.log('\n' + '═'.repeat(60));
  console.log('  ✈️  FlightWall Mobile - Flight Alert System');
  console.log('═'.repeat(60));
  
  console.log('\n📍 Configuration:');
  console.log(`   Location: ${process.env.HOME_LAT}, ${process.env.HOME_LON}`);
  console.log(`   Search Radius: ${process.env.SEARCH_RADIUS_NM || 25} NM`);
  console.log(`   Poll Interval: ${pollInterval} minutes`);
  console.log(`   Altitude Filter: ${process.env.MIN_ALTITUDE_FT || 0} - ${process.env.MAX_ALTITUDE_FT || 45000} ft`);
  
  console.log('\n🔑 API Status:');
  console.log(`   RapidAPI: ${process.env.RAPIDAPI_KEY ? '✅ Configured' : '⚠️  Not configured (using mock data)'}`);
  console.log(`   ntfy: ${process.env.NTFY_TOPIC ? '✅ Configured' : '⚠️  Not configured'}`);
  
  console.log('\n💰 API Request Estimates:');
  console.log(`   Requests per day: ${requestsPerDay}`);
  console.log(`   Requests per month (31 days): ${requestsPerMonth}`);
  if (requestsPerMonth > 9500) {
    console.log('   ⚠️  WARNING: Estimated monthly requests exceed 9,500!');
    console.log('   Consider increasing POLL_INTERVAL_MINUTES to reduce API usage.');
  } else {
    console.log(`   ✅ Within safe limits (threshold: 9,500/month)`);
  }
  
  console.log('\n🌐 Dashboard URLs:');
  console.log(`   Local: http://localhost:${PORT}`);
  
  const localIPs = getLocalIPs();
  if (localIPs.length > 0) {
    console.log('   Network:');
    localIPs.forEach(ip => {
      console.log(`     http://${ip.address}:${PORT} (${ip.name})`);
    });
    console.log('\n   📱 Open one of these URLs on your phone to view the dashboard');
  }
  
  console.log('\n🚀 Using ngrok for remote access:');
  console.log('   1. Install ngrok: https://ngrok.com/download');
  console.log('   2. Run: ngrok http 3000');
  console.log('   3. Use the provided URL on any device');
  
  console.log('\n' + '═'.repeat(60) + '\n');
}

// ============================================
// Start Server
// ============================================

app.listen(PORT, '0.0.0.0', () => {
  displayStartupInfo();
  
  const pollInterval = parseInt(process.env.POLL_INTERVAL_MINUTES) || 5;
  
  // Safety check - don't allow polling faster than 5 minutes
  if (pollInterval < 5) {
    console.warn('⚠️  POLL_INTERVAL_MINUTES is less than 5. Using 5 minutes for safety.');
  }
  
  const safePollInterval = Math.max(pollInterval, 5);
  const pollIntervalMs = safePollInterval * 60 * 1000;
  
  // Use setInterval instead of node-cron for reliability
  console.log(`⏰ Scheduling polls every ${safePollInterval} minutes (${pollIntervalMs}ms)`);
  
  setInterval(() => {
    pollFlights().catch(err => console.error('Poll error:', err));
  }, pollIntervalMs);
  
  // Run initial poll after 5 seconds
  console.log('🔄 Initial poll in 5 seconds...\n');
  setTimeout(() => {
    pollFlights().catch(err => console.error('Initial poll error:', err));
  }, 5000);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down FlightWall...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down FlightWall...');
  process.exit(0);
});
