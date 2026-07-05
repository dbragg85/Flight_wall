/**
 * FlightWall Visual Radar Dashboard
 */

// Configuration
const CONFIG = {
  REFRESH_INTERVAL: 30000,
  MAP_ZOOM: 10,
  MAP_ZOOM_REGION: 6,
  CARRIER_FILTER: ['ABX', 'ATN', 'CSB', 'ASA', 'SCX'],
};

// Gateway airport data with coordinates
const GATEWAYS = {
  Hubs: {
    KCVG: { name: 'Cincinnati/N. Kentucky', lat: 39.0488, lon: -84.6678 },
    KILN: { name: 'Wilmington Air Park', lat: 39.4278, lon: -83.7921 },
  },
  East: {
    KABE: { name: 'Allentown', lat: 40.6521, lon: -75.4408 },
    KATL: { name: 'Atlanta', lat: 33.6407, lon: -84.4277 },
    KBDL: { name: 'Hartford', lat: 41.9389, lon: -72.6832 },
    KBNA: { name: 'Nashville', lat: 36.1245, lon: -86.6782 },
    KBWI: { name: 'Baltimore', lat: 39.1754, lon: -76.6683 },
    KCLT: { name: 'Charlotte', lat: 35.2140, lon: -80.9431 },
    KJAX: { name: 'Jacksonville', lat: 30.4941, lon: -81.6879 },
    KJFK: { name: 'New York JFK', lat: 40.6413, lon: -73.7781 },
    KLAL: { name: 'Lakeland', lat: 27.9889, lon: -82.0186 },
    KMHT: { name: 'Manchester', lat: 42.9326, lon: -71.4357 },
    KMIA: { name: 'Miami', lat: 25.7959, lon: -80.2870 },
    KPIT: { name: 'Pittsburgh', lat: 40.4915, lon: -80.2329 },
    KRIC: { name: 'Richmond', lat: 37.5052, lon: -77.3197 },
    KTOL: { name: 'Toledo', lat: 41.5868, lon: -83.8078 },
    TJSJ: { name: 'San Juan', lat: 18.4394, lon: -66.0018 },
  },
  Central: {
    KABQ: { name: 'Albuquerque', lat: 35.0402, lon: -106.6090 },
    KAFW: { name: 'Fort Worth Alliance', lat: 32.9876, lon: -97.3189 },
    KAUS: { name: 'Austin', lat: 30.1975, lon: -97.6664 },
    KDEN: { name: 'Denver', lat: 39.8561, lon: -104.6737 },
    KIAH: { name: 'Houston Intercontinental', lat: 29.9902, lon: -95.3368 },
    KLAS: { name: 'Las Vegas', lat: 36.0840, lon: -115.1537 },
    KMCI: { name: 'Kansas City', lat: 39.2976, lon: -94.7139 },
    KMSP: { name: 'Minneapolis', lat: 44.8848, lon: -93.2223 },
    KMSY: { name: 'New Orleans', lat: 29.9934, lon: -90.2580 },
    KPHX: { name: 'Phoenix', lat: 33.4373, lon: -112.0078 },
    KRFD: { name: 'Rockford', lat: 42.1954, lon: -89.0972 },
    KSTL: { name: 'St. Louis', lat: 38.7487, lon: -90.3700 },
  },
  West: {
    KBOI: { name: 'Boise', lat: 43.5644, lon: -116.2228 },
    KGEG: { name: 'Spokane', lat: 47.6199, lon: -117.5338 },
    KONT: { name: 'Ontario', lat: 34.0560, lon: -117.6012 },
    KPDX: { name: 'Portland', lat: 45.5898, lon: -122.5951 },
    KSBD: { name: 'San Bernardino', lat: 34.0954, lon: -117.2348 },
    KSCK: { name: 'Stockton', lat: 37.8942, lon: -121.2386 },
    KSEA: { name: 'Seattle', lat: 47.4502, lon: -122.3088 },
    KSFO: { name: 'San Francisco', lat: 37.6213, lon: -122.3790 },
    KSMF: { name: 'Sacramento', lat: 38.6954, lon: -121.5910 },
    PANC: { name: 'Anchorage', lat: 61.1743, lon: -149.9962 },
    PAFA: { name: 'Fairbanks', lat: 64.8151, lon: -147.8561 },
    PHNL: { name: 'Honolulu', lat: 21.3187, lon: -157.9225 },
    PHOG: { name: 'Maui', lat: 20.8986, lon: -156.4305 },
    PHKO: { name: 'Kona', lat: 19.7388, lon: -156.0456 },
    PHLI: { name: 'Lihue', lat: 21.9760, lon: -159.3390 },
  },
};

// Current gateway selection state
let selectedGateway = 'KCVG';
let selectedRegion = null;
let gatewayMarkers = {};
let gatewayCircles = [];

// State
let map = null;
let markers = {};
let homeMarker = null;
let rangeCircles = [];
let flights = [];
let refreshCountdown = 30;
let countdownInterval = null;
let selectedFlight = null;
let selectedSchedule = []; // Preserve schedule across refreshes
let scheduleCache = {}; // Cache for schedule data to avoid repeated API calls
let routeCache = {}; // Cache for route data
let flightPathLine = null; // Route line for selected flight
let positionHistory = {}; // Store position history for trails
let radarLayer = null; // Weather radar overlay
let radarTimestamp = null; // Current radar frame timestamp
let tafCache = {}; // Cache for TAF data

// Airline logo mappings
const AIRLINE_LOGOS = {
  'DAL': { name: 'Delta Air Lines', logo: 'https://logo.clearbit.com/delta.com' },
  'AAL': { name: 'American Airlines', logo: 'https://logo.clearbit.com/aa.com' },
  'UAL': { name: 'United Airlines', logo: 'https://logo.clearbit.com/united.com' },
  'SWA': { name: 'Southwest Airlines', logo: 'https://logo.clearbit.com/southwest.com' },
  'JBU': { name: 'JetBlue', logo: 'https://logo.clearbit.com/jetblue.com' },
  'ASA': { name: 'Alaska Airlines', logo: 'https://logo.clearbit.com/alaskaair.com' },
  'FFT': { name: 'Frontier Airlines', logo: 'https://logo.clearbit.com/flyfrontier.com' },
  'NKS': { name: 'Spirit Airlines', logo: 'https://logo.clearbit.com/spirit.com' },
  'AAY': { name: 'Allegiant Air', logo: 'https://logo.clearbit.com/allegiantair.com' },
  'EDV': { name: 'Endeavor Air', logo: 'https://logo.clearbit.com/delta.com' },
  'JIA': { name: 'PSA Airlines', logo: 'https://logo.clearbit.com/aa.com' },
  'RPA': { name: 'Republic Airways', logo: 'https://logo.clearbit.com/republicairways.com' },
  'SKW': { name: 'SkyWest', logo: 'https://logo.clearbit.com/skywest.com' },
  'ENY': { name: 'Envoy Air', logo: 'https://logo.clearbit.com/aa.com' },
  'UPS': { name: 'UPS Airlines', logo: 'https://logo.clearbit.com/ups.com' },
  'FDX': { name: 'FedEx', logo: 'https://logo.clearbit.com/fedex.com' },
  'ABX': { name: 'ABX Air', logo: 'https://logo.clearbit.com/abxair.com' },
  'GTI': { name: 'Atlas Air', logo: 'https://logo.clearbit.com/atlasair.com' },
  'EJA': { name: 'NetJets', logo: 'https://logo.clearbit.com/netjets.com' },
  'LXJ': { name: 'Flexjet', logo: 'https://logo.clearbit.com/flexjet.com' },
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initGatewaySelector();
  updateDateTime();
  setInterval(updateDateTime, 1000);
  fetchFlights();
  fetchWeather();
  fetchRadar();
  startCountdown();
  
  // Refresh radar every 5 minutes
  setInterval(fetchRadar, 5 * 60 * 1000);
});

// Fetch and display weather radar
async function fetchRadar() {
  try {
    const response = await fetch('/api/radar');
    const data = await response.json();
    
    if (data.success && data.radar.past.length > 0) {
      // Use most recent radar frame
      const latestFrame = data.radar.past[data.radar.past.length - 1];
      const radarUrl = `${data.host}${latestFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;
      
      // Remove old radar layer
      if (radarLayer) {
        map.removeLayer(radarLayer);
      }
      
      // Add new radar layer
      radarLayer = L.tileLayer(radarUrl, {
        opacity: 0.5,
        zIndex: 100,
      }).addTo(map);
      
      // Update timestamp
      radarTimestamp = new Date(latestFrame.time * 1000);
      updateRadarTimestamp();
    }
  } catch (error) {
    console.error('Failed to fetch radar:', error);
  }
}

// Update radar timestamp display
function updateRadarTimestamp() {
  const el = document.getElementById('radar-timestamp');
  if (el && radarTimestamp) {
    const hours = radarTimestamp.getUTCHours().toString().padStart(2, '0');
    const minutes = radarTimestamp.getUTCMinutes().toString().padStart(2, '0');
    el.textContent = `Radar: ${hours}:${minutes}Z`;
  }
}

// Fetch TAF for selected gateway
async function fetchTAF(icao) {
  // Check cache first (cache for 30 minutes)
  const cached = tafCache[icao];
  if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
    return cached.data;
  }
  
  try {
    const response = await fetch(`/api/taf/${icao}`);
    const data = await response.json();
    
    if (data.success) {
      tafCache[icao] = {
        data: data,
        timestamp: Date.now(),
      };
      return data;
    }
  } catch (error) {
    console.error(`Failed to fetch TAF for ${icao}:`, error);
  }
  
  return null;
}

// Fetch historical flights for gateway
async function fetchHistoricalFlights(icao) {
  const container = document.getElementById('historical-content');
  const totalBadge = document.getElementById('history-total');
  
  if (!container) return;
  
  container.innerHTML = '<div class="no-history">Loading history...</div>';
  
  try {
    // Convert ICAO to IATA (remove K prefix for US airports)
    const iata = icao.startsWith('K') ? icao.substring(1) : icao;
    
    const response = await fetch(`/api/airport/${iata}/history`);
    const data = await response.json();
    
    if (data.success && data.carrierStats) {
      const stats = data.carrierStats;
      const carriers = Object.entries(stats)
        .filter(([code]) => CONFIG.CARRIER_FILTER.includes(code))
        .sort((a, b) => b[1].count - a[1].count);
      
      if (carriers.length === 0) {
        container.innerHTML = '<div class="no-history">No filtered carriers in last 24h</div>';
        totalBadge.textContent = '0';
        return;
      }
      
      const total = carriers.reduce((sum, [, v]) => sum + v.count, 0);
      totalBadge.textContent = total;
      
      container.innerHTML = `
        <div class="carrier-stats">
          ${carriers.map(([code, info]) => `
            <div class="carrier-row">
              <span class="carrier-code">${code}</span>
              <span class="carrier-name">${info.name || 'Unknown'}</span>
              <span class="flight-count">${info.count}</span>
              <span class="flight-label">flights</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      container.innerHTML = '<div class="no-history">History unavailable</div>';
      totalBadge.textContent = '0';
    }
  } catch (error) {
    console.error('Failed to fetch history:', error);
    container.innerHTML = '<div class="no-history">Failed to load history</div>';
    totalBadge.textContent = '0';
  }
}

// Display TAF in gateway panel
async function displayTAF(icao) {
  const tafContainer = document.getElementById('taf-display');
  if (!tafContainer) return;
  
  tafContainer.innerHTML = '<div class="taf-loading">Loading TAF...</div>';
  
  const taf = await fetchTAF(icao);
  
  if (taf && taf.rawTAF) {
    // Parse key info from TAF
    const forecasts = taf.forecasts || [];
    const currentFcst = forecasts[0];
    
    let wxSummary = 'VFR';
    let wxClass = 'vfr';
    
    if (currentFcst) {
      const visib = currentFcst.visib;
      const ceiling = currentFcst.clouds?.[0]?.base;
      
      // Determine flight category
      if (visib < 1 || ceiling < 500) {
        wxSummary = 'LIFR';
        wxClass = 'lifr';
      } else if (visib < 3 || ceiling < 1000) {
        wxSummary = 'IFR';
        wxClass = 'ifr';
      } else if (visib < 5 || ceiling < 3000) {
        wxSummary = 'MVFR';
        wxClass = 'mvfr';
      }
      
      // Add weather if present
      if (currentFcst.wxString) {
        wxSummary += ` • ${currentFcst.wxString}`;
      }
    }
    
    tafContainer.innerHTML = `
      <div class="taf-header">
        <span class="taf-icao">${icao}</span>
        <span class="taf-category ${wxClass}">${wxSummary}</span>
      </div>
      <div class="taf-raw">${taf.rawTAF}</div>
    `;
  } else {
    tafContainer.innerHTML = `<div class="taf-unavailable">TAF unavailable for ${icao}</div>`;
  }
}

// Initialize gateway selector panel
function initGatewaySelector() {
  const container = document.getElementById('gateway-categories');
  if (!container) return;
  
  let html = '';
  
  Object.entries(GATEWAYS).forEach(([region, gateways]) => {
    const count = Object.keys(gateways).length;
    const gatewayList = Object.entries(gateways).map(([icao, data]) => `
      <div class="gateway-item" data-icao="${icao}" onclick="selectGateway('${icao}')">
        <span class="icao">${icao.substring(1)}</span>
        <span class="name">${data.name}</span>
      </div>
    `).join('');
    
    html += `
      <div class="gateway-category" data-region="${region}">
        <div class="category-header" onclick="toggleCategory('${region}')">
          <span>${region}</span>
          <span class="count">${count}</span>
          <span class="category-toggle">▼</span>
        </div>
        <div class="gateway-list" id="gateway-list-${region}">
          <div class="gateway-item region-all" onclick="selectRegion('${region}')">
            <span class="icao" style="color: var(--accent-blue);">ALL</span>
            <span class="name">Show all ${region}</span>
          </div>
          ${gatewayList}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Expand Hubs by default and select KCVG
  toggleCategory('Hubs');
  highlightSelectedGateway('KCVG');
  
  // Load TAF and history for default gateway
  displayTAF('KCVG');
  fetchHistoricalFlights('KCVG');
}

// Toggle category dropdown
function toggleCategory(region) {
  const header = document.querySelector(`.gateway-category[data-region="${region}"] .category-header`);
  const list = document.getElementById(`gateway-list-${region}`);
  
  if (header && list) {
    header.classList.toggle('expanded');
    list.classList.toggle('expanded');
  }
}

// Select a single gateway
function selectGateway(icao) {
  showGateway(icao);
  highlightSelectedGateway(icao);
  // Refresh flights for new location
  fetchFlights();
  // Fetch TAF for this gateway
  displayTAF(icao);
  // Fetch historical flights
  fetchHistoricalFlights(icao);
}

// Select entire region
function selectRegion(region) {
  showRegion(region);
  highlightSelectedRegion(region);
  // Refresh flights for new region (uses first gateway)
  fetchFlights();
}

// Update UI to show selected gateway
function highlightSelectedGateway(icao) {
  // Remove all selections
  document.querySelectorAll('.gateway-item').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.category-header').forEach(el => el.classList.remove('active'));
  
  // Add selection to gateway
  const item = document.querySelector(`.gateway-item[data-icao="${icao}"]`);
  if (item) {
    item.classList.add('selected');
  }
}

// Update UI to show selected region
function highlightSelectedRegion(region) {
  // Remove all selections
  document.querySelectorAll('.gateway-item').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.category-header').forEach(el => el.classList.remove('active'));
  
  // Add selection to region header
  const header = document.querySelector(`.gateway-category[data-region="${region}"] .category-header`);
  if (header) {
    header.classList.add('active');
  }
  
  // Select the "ALL" item
  const allItem = document.querySelector(`#gateway-list-${region} .region-all`);
  if (allItem) {
    allItem.classList.add('selected');
  }
}

// Initialize Leaflet map
function initMap() {
  // Default to KCVG
  const defaultGateway = GATEWAYS.Hubs.KCVG;
  
  map = L.map('radar-map', {
    center: [defaultGateway.lat, defaultGateway.lon],
    zoom: CONFIG.MAP_ZOOM,
    zoomControl: true,
    attributionControl: false,
  });

  // Dark map tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(map);

  // Show default gateway (KCVG)
  showGateway('KCVG');
}

// Show a single gateway on the map
function showGateway(icao) {
  clearGatewayLayers();
  
  const gateway = findGateway(icao);
  if (!gateway) return;
  
  selectedGateway = icao;
  selectedRegion = null;
  
  map.setView([gateway.lat, gateway.lon], CONFIG.MAP_ZOOM);
  
  addGatewayToMap(icao, gateway);
  updateGatewayHeader(icao, gateway.name);
}

// Show all gateways in a region
function showRegion(region) {
  clearGatewayLayers();
  
  const gateways = GATEWAYS[region];
  if (!gateways) return;
  
  selectedRegion = region;
  selectedGateway = null;
  
  // Add all gateways in region
  const bounds = [];
  Object.entries(gateways).forEach(([icao, gateway]) => {
    addGatewayToMap(icao, gateway);
    bounds.push([gateway.lat, gateway.lon]);
  });
  
  // Fit map to show all gateways
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [50, 50] });
  }
  
  updateGatewayHeader(region, `${Object.keys(gateways).length} gateways`);
}

// Add a gateway marker and circles to the map
function addGatewayToMap(icao, gateway) {
  // Gateway marker
  const markerIcon = L.divIcon({
    className: 'gateway-marker-container',
    html: `<div class="gateway-marker">${icao.substring(1)}</div>`,
    iconSize: [40, 20],
    iconAnchor: [20, 10],
  });
  
  const marker = L.marker([gateway.lat, gateway.lon], { icon: markerIcon })
    .addTo(map)
    .bindPopup(`<b>${icao}</b><br>${gateway.name}`);
  
  gatewayMarkers[icao] = marker;
  
  // Range circles (5 NM and 10 NM only)
  const circleOptions = {
    fill: false,
    weight: 1,
    opacity: 0.5,
  };
  
  const circle5nm = L.circle([gateway.lat, gateway.lon], { 
    ...circleOptions, 
    radius: 9260, // 5 NM in meters
    color: '#00ff88' 
  }).addTo(map);
  
  const circle10nm = L.circle([gateway.lat, gateway.lon], { 
    ...circleOptions, 
    radius: 18520, // 10 NM in meters
    color: '#00aaff' 
  }).addTo(map);
  
  gatewayCircles.push(circle5nm, circle10nm);
  
  // Add range labels for single gateway view only
  if (!selectedRegion) {
    const label5nm = L.marker([gateway.lat + 0.075, gateway.lon], {
      icon: L.divIcon({ 
        className: 'range-label', 
        html: '<span style="color:#00ff88;font-size:11px;">5 NM</span>' 
      })
    }).addTo(map);
    
    const label10nm = L.marker([gateway.lat + 0.15, gateway.lon], {
      icon: L.divIcon({ 
        className: 'range-label', 
        html: '<span style="color:#00aaff;font-size:11px;">10 NM</span>' 
      })
    }).addTo(map);
    
    gatewayCircles.push(label5nm, label10nm);
  }
}

// Clear all gateway layers from map
function clearGatewayLayers() {
  Object.values(gatewayMarkers).forEach(marker => map.removeLayer(marker));
  gatewayMarkers = {};
  
  gatewayCircles.forEach(layer => map.removeLayer(layer));
  gatewayCircles = [];
}

// Find a gateway by ICAO code
function findGateway(icao) {
  for (const region of Object.values(GATEWAYS)) {
    if (region[icao]) return region[icao];
  }
  return null;
}

// Update the header to show current gateway
function updateGatewayHeader(code, name) {
  const badge = document.getElementById('radar-gateway-badge');
  if (badge) {
    badge.textContent = code;
    badge.title = name;
  }
}

// Update date/time display (Zulu/UTC time)
function updateDateTime() {
  const now = new Date();
  
  // 24-hour Zulu time format
  const hours = now.getUTCHours().toString().padStart(2, '0');
  const minutes = now.getUTCMinutes().toString().padStart(2, '0');
  const seconds = now.getUTCSeconds().toString().padStart(2, '0');
  document.getElementById('current-time').textContent = `${hours}:${minutes}:${seconds}Z`;
  
  // Zulu date format
  const day = now.getUTCDate().toString().padStart(2, '0');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[now.getUTCMonth()];
  const year = now.getUTCFullYear();
  document.getElementById('current-date').textContent = `${day} ${month} ${year} UTC`;
}

// Countdown timer
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  refreshCountdown = 30;
  
  countdownInterval = setInterval(() => {
    refreshCountdown--;
    document.getElementById('refresh-countdown').textContent = refreshCountdown;
    
    if (refreshCountdown <= 0) {
      fetchFlights();
      refreshCountdown = 30;
    }
  }, 1000);
}

// Check if flight matches carrier filter
function matchesCarrierFilter(callsign) {
  if (!callsign) return false;
  const prefix = callsign.substring(0, 3).toUpperCase();
  return CONFIG.CARRIER_FILTER.includes(prefix);
}

// Fetch route info for a callsign
async function fetchRoute(callsign) {
  if (!callsign) return null;
  
  // Check cache first (cache for 10 minutes)
  const cached = routeCache[callsign];
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
    return cached.data;
  }
  
  try {
    const response = await fetch(`/api/route/${callsign}`);
    const data = await response.json();
    
    if (data.success && data.route) {
      routeCache[callsign] = {
        data: data.route,
        timestamp: Date.now(),
      };
      return data.route;
    }
  } catch (error) {
    console.error(`Failed to fetch route for ${callsign}:`, error);
  }
  
  // Cache null result to avoid repeated failed lookups
  routeCache[callsign] = { data: null, timestamp: Date.now() };
  return null;
}

// Enrich flights with route data (runs in background)
async function enrichFlightsWithRoutes(flightList) {
  for (const flight of flightList) {
    if (!flight.origin || !flight.destination) {
      const route = await fetchRoute(flight.callsign);
      if (route) {
        flight.origin = route.origin || flight.origin;
        flight.destination = route.destination || flight.destination;
        flight.originName = route.originName;
        flight.destinationName = route.destinationName;
        flight.airlineName = route.airlineName || flight.airlineName;
        flight.aircraftType = route.aircraftModel || flight.aircraftType;
        flight.registration = route.registration || flight.registration;
        flight.flightStatus = route.status;
        flight.isDelayed = route.isDelayed;
        flight.delayMinutes = route.delayMinutes;
      }
      // Small delay between API calls to avoid rate limits
      await new Promise(r => setTimeout(r, 200));
    }
  }
  // Update UI after enrichment
  updateUI();
}

// Get current search location based on selected gateway/region
function getSearchLocation() {
  // If a single gateway is selected, use its coordinates
  if (selectedGateway) {
    const gateway = findGateway(selectedGateway);
    if (gateway) {
      return { lat: gateway.lat, lon: gateway.lon };
    }
  }
  
  // If a region is selected, use the first gateway's coordinates (or center)
  if (selectedRegion && GATEWAYS[selectedRegion]) {
    const gateways = Object.values(GATEWAYS[selectedRegion]);
    if (gateways.length > 0) {
      // Use KCVG for Hubs, otherwise first gateway in region
      if (selectedRegion === 'Hubs' && GATEWAYS.Hubs.KCVG) {
        return { lat: GATEWAYS.Hubs.KCVG.lat, lon: GATEWAYS.Hubs.KCVG.lon };
      }
      return { lat: gateways[0].lat, lon: gateways[0].lon };
    }
  }
  
  // Default to KCVG
  return { lat: GATEWAYS.Hubs.KCVG.lat, lon: GATEWAYS.Hubs.KCVG.lon };
}

// Fetch flights from API at selected gateway location
async function fetchFlights() {
  try {
    const location = getSearchLocation();
    const url = `/api/flights?lat=${location.lat}&lon=${location.lon}`;
    
    console.log(`Fetching flights near ${selectedGateway || selectedRegion || 'KCVG'} (${location.lat.toFixed(4)}, ${location.lon.toFixed(4)})`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success && data.flights) {
      // Filter to only show specified carriers
      const filteredFlights = data.flights.filter(f => matchesCarrierFilter(f.callsign));
      flights = filteredFlights.sort((a, b) => (a.distanceNm || 999) - (b.distanceNm || 999));
      updateUI();
      document.getElementById('last-updated-time').textContent = new Date().toLocaleTimeString();
      
      // Enrich with route data in background (won't block UI)
      enrichFlightsWithRoutes(flights);
    }
  } catch (error) {
    console.error('Failed to fetch flights:', error);
  }
  
  startCountdown();
}

// Fetch weather
async function fetchWeather() {
  try {
    const response = await fetch('https://wttr.in/Cincinnati?format=j1');
    const data = await response.json();
    const current = data.current_condition?.[0];
    
    if (current) {
      document.getElementById('weather-temp').textContent = `${current.temp_F}°F`;
      document.getElementById('weather-condition').textContent = current.weatherDesc?.[0]?.value || 'Unknown';
      document.getElementById('weather-wind').textContent = `${current.winddir16Point} ${current.windspeedMiles} mph`;
      document.getElementById('weather-visibility').textContent = `${current.visibility} mi`;
      document.getElementById('weather-pressure').textContent = `${current.pressure} inHg`;
      document.getElementById('weather-humidity').textContent = `${current.humidity}%`;
      
      // Set weather icon based on condition
      const condition = (current.weatherDesc?.[0]?.value || '').toLowerCase();
      let icon = '☀️';
      if (condition.includes('cloud')) icon = '⛅';
      if (condition.includes('rain')) icon = '🌧️';
      if (condition.includes('storm')) icon = '⛈️';
      if (condition.includes('snow')) icon = '❄️';
      if (condition.includes('fog')) icon = '🌫️';
      if (condition.includes('overcast')) icon = '☁️';
      document.getElementById('weather-icon').textContent = icon;
    }
  } catch (error) {
    console.error('Failed to fetch weather:', error);
  }
}

// Update all UI elements
function updateUI() {
  updateFlightCount();
  updateCurrentFlight();
  updateFlightsList();
  updateMapMarkers();
  
  // Preserve selected flight and schedule across refreshes
  if (selectedFlight) {
    // Re-find the flight in the updated list to get fresh position data
    const updatedFlight = flights.find(f => f.callsign === selectedFlight.callsign);
    if (updatedFlight) {
      selectedFlight = updatedFlight;
    }
    // Re-render Gantt with preserved schedule
    if (selectedSchedule.length > 0) {
      updateGanttChart(selectedFlight, selectedSchedule);
    }
  }
}

// Update flight count badge
function updateFlightCount() {
  document.getElementById('flight-count-badge').textContent = `${flights.length} Nearby`;
}

// Get airline info from callsign
function getAirlineInfo(callsign) {
  if (!callsign) return { name: 'Unknown', logo: null };
  const prefix = callsign.substring(0, 3).toUpperCase();
  return AIRLINE_LOGOS[prefix] || { name: 'Private/Unknown', logo: null };
}

// Get altitude color
function getAltitudeColor(altitude) {
  if (!altitude || altitude <= 0) return '#888888';
  if (altitude < 5000) return '#00ff88';
  if (altitude < 10000) return '#00aaff';
  if (altitude < 20000) return '#ffaa00';
  return '#ff4466';
}

// Update current flight panel (compact)
function updateCurrentFlight() {
  const container = document.getElementById('current-flight-content');
  
  if (flights.length === 0) {
    container.innerHTML = `
      <div class="no-flight">
        <div class="no-flight-icon">📡</div>
        <p>Scanning for carriers...</p>
      </div>
    `;
    return;
  }
  
  // Get closest flight or selected flight
  const flight = selectedFlight || flights[0];
  const airline = getAirlineInfo(flight.callsign);
  const altColor = getAltitudeColor(flight.altitudeFt);
  
  // Build status badge
  let statusBadge = '';
  if (flight.isDelayed && flight.delayMinutes > 0) {
    statusBadge = `<span class="delay-badge">⚠️ +${flight.delayMinutes}min</span>`;
  } else if (flight.flightStatus) {
    statusBadge = `<span class="status-badge-small">${flight.flightStatus}</span>`;
  }
  
  // Show origin/destination names if available
  const originDisplay = flight.originName 
    ? `<span class="code">${flight.origin || '---'}</span><span class="city-name">${flight.originName}</span>`
    : `<span class="code">${flight.origin || '---'}</span>`;
  const destDisplay = flight.destinationName
    ? `<span class="code">${flight.destination || '---'}</span><span class="city-name">${flight.destinationName}</span>`
    : `<span class="code">${flight.destination || '---'}</span>`;
  
  container.innerHTML = `
    <div class="flight-header">
      ${airline.logo 
        ? `<img src="${airline.logo}" class="airline-logo" onerror="this.style.display='none'">`
        : '<span style="font-size:32px">✈️</span>'
      }
      <div class="flight-id">
        <div class="callsign">${flight.callsign || 'N/A'} ${statusBadge}</div>
        <div class="aircraft">${flight.airlineName || airline.name} • ${flight.aircraftType || 'Unknown'}</div>
        ${flight.registration ? `<div class="registration">${flight.registration}</div>` : ''}
      </div>
    </div>
    
    <div class="route-compact">
      <div class="route-endpoint">${originDisplay}</div>
      <span class="arrow">✈️ →</span>
      <div class="route-endpoint">${destDisplay}</div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-item">
        <div class="value" style="color: ${altColor}">${flight.altitudeFt?.toLocaleString() || '--'}</div>
        <div class="label">Alt (ft)</div>
      </div>
      <div class="stat-item">
        <div class="value">${flight.groundSpeedKt || '--'}</div>
        <div class="label">Spd (kts)</div>
      </div>
      <div class="stat-item">
        <div class="value" style="color: #00ff88">${flight.distanceNm?.toFixed(1) || '--'}</div>
        <div class="label">Dist (NM)</div>
      </div>
    </div>
  `;
}

// Update flights list (compact)
function updateFlightsList() {
  const container = document.getElementById('flights-list');
  document.getElementById('nearby-count').textContent = flights.length;
  
  if (flights.length === 0) {
    container.innerHTML = `
      <div class="no-flight">
        <div class="no-flight-icon">📋</div>
        <p>No filtered carriers nearby</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = flights.map(flight => {
    const airline = getAirlineInfo(flight.callsign);
    const isSelected = selectedFlight && selectedFlight.callsign === flight.callsign;
    
    return `
      <div class="flight-row ${isSelected ? 'selected' : ''}" onclick="selectFlight('${flight.callsign}')">
        ${airline.logo 
          ? `<img src="${airline.logo}" class="logo" onerror="this.outerHTML='<span style=\\'font-size:20px\\'>✈️</span>'">`
          : '<span style="font-size:20px">✈️</span>'
        }
        <div class="info">
          <div class="callsign">${flight.callsign || 'N/A'}</div>
          <div class="route">${flight.origin || '---'} → ${flight.destination || '---'}</div>
        </div>
        <div class="distance">${flight.distanceNm?.toFixed(1) || '--'} NM</div>
      </div>
    `;
  }).join('');
}

// Select a flight and show Gantt chart
async function selectFlight(callsign) {
  selectedFlight = flights.find(f => f.callsign === callsign);
  if (selectedFlight) {
    document.getElementById('selected-flight-badge').textContent = callsign;
    updateCurrentFlight();
    updateFlightsList();
    
    // Show loading state
    const container = document.getElementById('gantt-container');
    container.innerHTML = `
      <div class="gantt-loading">
        <div class="loading-spinner"></div>
        <p>Loading schedule for ${callsign}...</p>
      </div>
    `;
    
    // Fetch real schedule data
    const schedule = await fetchSchedule(selectedFlight);
    
    // Store schedule for persistence across refreshes
    selectedSchedule = schedule;
    
    // Draw flight route on map
    drawFlightRoute(selectedFlight, schedule);
    
    updateGanttChart(selectedFlight, schedule);
  }
}

// Draw flight route line on map
function drawFlightRoute(flight, schedule) {
  // Remove existing route line and markers
  if (flightPathLine) {
    if (Array.isArray(flightPathLine)) {
      flightPathLine.forEach(layer => map.removeLayer(layer));
    } else {
      map.removeLayer(flightPathLine);
    }
    flightPathLine = null;
  }
  
  if (!flight || !flight.latitude || !flight.longitude) return;
  
  // Find current leg from schedule
  const currentLeg = schedule.find(s => 
    s.status === 'EnRoute' || s.status === 'Departed'
  ) || schedule[schedule.length - 1];
  
  if (!currentLeg) return;
  
  // Get airport coordinates - prefer from schedule data, fallback to gateway lookup
  const originCoords = (currentLeg.originLat && currentLeg.originLon) 
    ? [currentLeg.originLat, currentLeg.originLon]
    : getAirportCoords(currentLeg.origin);
  const destCoords = (currentLeg.destLat && currentLeg.destLon)
    ? [currentLeg.destLat, currentLeg.destLon]
    : getAirportCoords(currentLeg.destination);
  const currentPos = [flight.latitude, flight.longitude];
  
  const layers = [];
  
  // Draw completed portion (origin to current position) - solid line
  if (originCoords) {
    const completedLine = L.polyline([originCoords, currentPos], {
      color: '#00ff88',
      weight: 3,
      opacity: 0.8,
    }).addTo(map);
    layers.push(completedLine);
    
    // Origin marker
    const originMarker = L.circleMarker(originCoords, {
      radius: 8,
      color: '#00aaff',
      fillColor: '#00aaff',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map).bindPopup(`<b>${currentLeg.origin}</b><br>${currentLeg.originName || 'Origin'}`);
    layers.push(originMarker);
  }
  
  // Draw remaining portion (current position to destination) - dashed line
  if (destCoords) {
    const remainingLine = L.polyline([currentPos, destCoords], {
      color: '#ffaa00',
      weight: 2,
      opacity: 0.6,
      dashArray: '8, 8',
    }).addTo(map);
    layers.push(remainingLine);
    
    // Destination marker
    const destMarker = L.circleMarker(destCoords, {
      radius: 8,
      color: '#ff9900',
      fillColor: '#ff9900',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map).bindPopup(`<b>${currentLeg.destination}</b><br>${currentLeg.destinationName || 'Destination'}`);
    layers.push(destMarker);
  }
  
  // Show delay/diversion indicator
  if (currentLeg.isDelayed || currentLeg.isDiverted) {
    const statusText = currentLeg.isDiverted ? '⚠️ POSSIBLE DIVERSION' : `⚠️ DELAYED +${currentLeg.delayMinutes}min`;
    const statusMarker = L.marker(currentPos, {
      icon: L.divIcon({
        className: 'flight-status-indicator',
        html: `<div class="status-label ${currentLeg.isDiverted ? 'diverted' : 'delayed'}">${statusText}</div>`,
        iconSize: [150, 20],
        iconAnchor: [75, -15],
      })
    }).addTo(map);
    layers.push(statusMarker);
  }
  
  flightPathLine = layers;
}

// Get airport coordinates from gateway data or schedule
function getAirportCoords(iata) {
  if (!iata) return null;
  
  const icao = 'K' + iata; // US airports
  
  // Check our gateway data first
  for (const region of Object.values(GATEWAYS)) {
    if (region[icao]) {
      return [region[icao].lat, region[icao].lon];
    }
  }
  
  // Check for non-K prefix airports (Hawaii, Puerto Rico, etc.)
  const prefixes = ['PH', 'PA', 'TJ', ''];
  for (const prefix of prefixes) {
    const code = prefix + iata;
    for (const region of Object.values(GATEWAYS)) {
      if (region[code]) {
        return [region[code].lat, region[code].lon];
      }
    }
  }
  
  return null;
}

// Fetch schedule data from API
async function fetchSchedule(flight) {
  const callsign = flight.callsign;
  const registration = flight.registration;
  
  if (!callsign) {
    console.warn('No callsign provided for schedule lookup');
    return [];
  }
  
  // Check cache first (cache for 5 minutes)
  const cacheKey = callsign;
  const cached = scheduleCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    console.log(`Using cached schedule for ${cacheKey}`);
    return cached.data;
  }
  
  try {
    const url = registration 
      ? `/api/schedule/${encodeURIComponent(callsign)}?registration=${encodeURIComponent(registration)}`
      : `/api/schedule/${encodeURIComponent(callsign)}`;
    
    console.log(`Fetching schedule from: ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`Schedule response for ${callsign}:`, data);
    
    if (data.success && data.schedule && data.schedule.length > 0) {
      // Cache the result
      scheduleCache[cacheKey] = {
        data: data.schedule,
        timestamp: Date.now(),
      };
      console.log(`Cached ${data.schedule.length} schedule entries for ${callsign}`);
      return data.schedule;
    } else {
      console.warn(`No schedule data returned for ${callsign}:`, data);
      // Cache empty result to avoid repeated lookups
      scheduleCache[cacheKey] = {
        data: [],
        timestamp: Date.now(),
      };
    }
  } catch (error) {
    console.error(`Failed to fetch schedule for ${callsign}:`, error);
  }
  
  return [];
}

// Update Gantt chart for selected flight with real schedule data
function updateGanttChart(flight, schedule = []) {
  const container = document.getElementById('gantt-container');
  const airline = getAirlineInfo(flight.callsign);
  const prefix = flight.callsign?.substring(0, 3).toLowerCase() || 'abx';
  
  const now = new Date();
  const currentHour = now.getUTCHours();
  
  // Calculate 48-hour window: 24 hours ago to 24 hours ahead
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const windowDurationMs = 48 * 60 * 60 * 1000;
  
  // Create hour headers for 48-hour window
  let hoursHtml = '';
  for (let i = -24; i < 24; i++) {
    const hourTime = new Date(now.getTime() + i * 60 * 60 * 1000);
    const hourUTC = hourTime.getUTCHours();
    const label = hourUTC.toString().padStart(2, '0') + 'Z';
    const isCurrent = i === 0;
    const isYesterday = i < 0;
    hoursHtml += `<div class="gantt-hour ${isCurrent ? 'current' : ''} ${isYesterday ? 'past' : ''}">${label}</div>`;
  }
  
  // Calculate now line position (at 50% since we show -24h to +24h)
  const nowPercent = 50;
  
  // Convert real schedule to Gantt bars
  const legs = convertScheduleToLegs(schedule, windowStart, windowDurationMs);
  
  // Show message if no schedule data
  const noDataMessage = schedule.length === 0 
    ? '<div class="gantt-no-data">No schedule data available for this flight</div>'
    : '';
  
  container.innerHTML = `
    <div class="gantt-header">
      <div class="gantt-label-col">Flight</div>
      <div class="gantt-timeline">${hoursHtml}</div>
    </div>
    
    <div class="gantt-row">
      <div class="gantt-row-label">${flight.callsign}</div>
      <div class="gantt-row-timeline">
        <div class="gantt-now-line" style="left: ${nowPercent}%"></div>
        ${legs.map(leg => `
          <div class="gantt-bar ${prefix} ${leg.status}" 
               style="left: ${leg.startPercent}%; width: ${leg.widthPercent}%;"
               title="${leg.tooltip}">
            ${leg.route}
          </div>
        `).join('')}
        ${noDataMessage}
      </div>
    </div>
    
    ${schedule.length > 0 ? `
    <div class="schedule-list">
      <div class="schedule-list-header">Schedule Details (48-hour window)</div>
      ${schedule.map(s => {
        const depTime = s.departureActual || s.departureScheduled;
        const arrTime = s.arrivalActual || s.arrivalScheduled;
        const statusClass = getStatusClass(s.status);
        const delayIndicator = s.isDiverted 
          ? '<span class="delay-indicator diverted">DIVERTED?</span>'
          : s.isDelayed 
            ? `<span class="delay-indicator delayed">+${s.delayMinutes}min</span>`
            : '';
        return `
          <div class="schedule-item ${statusClass}">
            <span class="schedule-route">${s.origin || '---'} → ${s.destination || '---'}${delayIndicator}</span>
            <span class="schedule-times">
              ${formatZuluTime(depTime)} - ${formatZuluTime(arrTime)}
            </span>
            <span class="schedule-status">${s.status || 'Scheduled'}</span>
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}
  `;
}

// Convert schedule array to Gantt bar positions
function convertScheduleToLegs(schedule, windowStart, windowDurationMs) {
  const legs = [];
  
  schedule.forEach(flight => {
    const depTime = flight.departureActual || flight.departureScheduled;
    let arrTime = flight.arrivalActual || flight.arrivalScheduled;
    
    if (!depTime) return;
    
    const depDate = new Date(depTime);
    
    // If no arrival time, estimate 2 hours (common flight duration)
    let arrDate;
    if (!arrTime) {
      arrDate = new Date(depDate.getTime() + 2 * 60 * 60 * 1000);
      arrTime = arrDate.toISOString();
    } else {
      arrDate = new Date(arrTime);
    }
    
    // Calculate position within the 48-hour window
    const startOffset = depDate.getTime() - windowStart.getTime();
    const endOffset = arrDate.getTime() - windowStart.getTime();
    
    // Skip if completely outside window
    if (endOffset < 0 || startOffset > windowDurationMs) return;
    
    // Clamp to window boundaries
    const clampedStart = Math.max(0, startOffset);
    const clampedEnd = Math.min(windowDurationMs, endOffset);
    
    const startPercent = (clampedStart / windowDurationMs) * 100;
    // Minimum 2% width so bars are always visible
    const widthPercent = Math.max(2, ((clampedEnd - clampedStart) / windowDurationMs) * 100);
    
    const route = `${flight.origin || '---'}→${flight.destination || '---'}`;
    const tooltip = `${route}\nDep: ${formatZuluTime(depTime)}\nArr: ${formatZuluTime(arrTime)}\nStatus: ${flight.status || 'Scheduled'}`;
    
    legs.push({
      startPercent,
      widthPercent,
      route,
      tooltip,
      status: getStatusClass(flight.status),
    });
  });
  
  return legs;
}

// Get CSS class for flight status
function getStatusClass(status) {
  if (!status) return '';
  const s = status.toLowerCase();
  if (s.includes('landed') || s.includes('arrived')) return 'completed';
  if (s.includes('enroute') || s.includes('airborne')) return 'active';
  if (s.includes('departed')) return 'departed';
  if (s.includes('cancelled')) return 'cancelled';
  if (s.includes('delayed')) return 'delayed';
  return '';
}

// Format time to Zulu format
function formatZuluTime(isoString) {
  if (!isoString) return '--:--Z';
  try {
    const date = new Date(isoString);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}Z`;
  } catch {
    return '--:--Z';
  }
}

// Update map markers
function updateMapMarkers() {
  // Remove old markers
  Object.values(markers).forEach(marker => map.removeLayer(marker));
  markers = {};
  
  // Add new markers
  flights.forEach(flight => {
    if (!flight.latitude || !flight.longitude) return;
    
    const color = getAltitudeColor(flight.altitudeFt);
    const rotation = flight.heading || 0;
    const airline = getAirlineInfo(flight.callsign);
    const callsign = flight.callsign;
    
    const icon = L.divIcon({
      className: 'flight-marker',
      html: `<div class="flight-marker-inner" style="transform: rotate(${rotation}deg); color: ${color}; cursor: pointer;">✈️</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    
    const marker = L.marker([flight.latitude, flight.longitude], { icon })
      .addTo(map)
      .bindPopup(`
        <b>${callsign || 'Unknown'}</b><br>
        ${airline.name}<br>
        ${flight.aircraftType || 'Unknown aircraft'}<br>
        Alt: ${flight.altitudeFt?.toLocaleString() || '--'} ft<br>
        Speed: ${flight.groundSpeedKt || '--'} kts<br>
        Distance: ${flight.distanceNm?.toFixed(1) || '--'} NM<br>
        <a href="#" onclick="selectFlight('${callsign}'); return false;" style="color: #00ff88;">View Schedule</a>
      `);
    
    // Click on marker to select flight and show schedule
    marker.on('click', () => {
      if (callsign) {
        selectFlight(callsign);
      }
    });
    
    markers[flight.id || callsign] = marker;
  });
}
