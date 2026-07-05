/**
 * FlightWall Visual Radar Dashboard
 */

// Configuration
const CONFIG = {
  HOME_LAT: 39.1135,
  HOME_LON: -84.5677,
  REFRESH_INTERVAL: 30000,
  MAP_ZOOM: 11,
  // Only show these carrier callsign prefixes
  CARRIER_FILTER: ['ABX', 'ATN', 'CSB', 'ASA', 'SCX'],
};

// State
let map = null;
let markers = {};
let homeMarker = null;
let rangeCircles = [];
let flights = [];
let refreshCountdown = 30;
let countdownInterval = null;
let selectedFlight = null;
let scheduleCache = {}; // Cache for schedule data to avoid repeated API calls

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
  updateDateTime();
  setInterval(updateDateTime, 1000);
  fetchFlights();
  fetchWeather();
  startCountdown();
});

// Initialize Leaflet map
function initMap() {
  map = L.map('radar-map', {
    center: [CONFIG.HOME_LAT, CONFIG.HOME_LON],
    zoom: CONFIG.MAP_ZOOM,
    zoomControl: true,
    attributionControl: false,
  });

  // Dark map tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(map);

  // Home marker
  const homeIcon = L.divIcon({
    className: 'home-marker-container',
    html: '<div class="home-marker"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  
  homeMarker = L.marker([CONFIG.HOME_LAT, CONFIG.HOME_LON], { icon: homeIcon })
    .addTo(map)
    .bindPopup('<b>Home</b><br>3421 Glenway Ave<br>Cincinnati, OH');

  // Range circles
  const circleOptions = {
    fill: false,
    weight: 1,
    opacity: 0.5,
  };
  
  rangeCircles.push(
    L.circle([CONFIG.HOME_LAT, CONFIG.HOME_LON], { ...circleOptions, radius: 9260, color: '#00ff88' }).addTo(map), // 5 NM
    L.circle([CONFIG.HOME_LAT, CONFIG.HOME_LON], { ...circleOptions, radius: 18520, color: '#00aaff' }).addTo(map), // 10 NM
    L.circle([CONFIG.HOME_LAT, CONFIG.HOME_LON], { ...circleOptions, radius: 27780, color: '#ffaa00' }).addTo(map)  // 15 NM
  );

  // Add labels to circles
  L.marker([CONFIG.HOME_LAT + 0.075, CONFIG.HOME_LON], {
    icon: L.divIcon({ className: 'range-label', html: '<span style="color:#00ff88;font-size:11px;">5 NM</span>' })
  }).addTo(map);
  
  L.marker([CONFIG.HOME_LAT + 0.15, CONFIG.HOME_LON], {
    icon: L.divIcon({ className: 'range-label', html: '<span style="color:#00aaff;font-size:11px;">10 NM</span>' })
  }).addTo(map);
  
  L.marker([CONFIG.HOME_LAT + 0.225, CONFIG.HOME_LON], {
    icon: L.divIcon({ className: 'range-label', html: '<span style="color:#ffaa00;font-size:11px;">15 NM</span>' })
  }).addTo(map);
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

// Fetch flights from API
async function fetchFlights() {
  try {
    const response = await fetch('/api/flights');
    const data = await response.json();
    
    if (data.success && data.flights) {
      // Filter to only show specified carriers
      const filteredFlights = data.flights.filter(f => matchesCarrierFilter(f.callsign));
      flights = filteredFlights.sort((a, b) => (a.distanceNm || 999) - (b.distanceNm || 999));
      updateUI();
      document.getElementById('last-updated-time').textContent = new Date().toLocaleTimeString();
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
  if (selectedFlight) {
    updateGanttChart(selectedFlight);
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
  
  container.innerHTML = `
    <div class="flight-header">
      ${airline.logo 
        ? `<img src="${airline.logo}" class="airline-logo" onerror="this.style.display='none'">`
        : '<span style="font-size:32px">✈️</span>'
      }
      <div class="flight-id">
        <div class="callsign">${flight.callsign || 'N/A'}</div>
        <div class="aircraft">${airline.name} • ${flight.aircraftType || 'Unknown'}</div>
      </div>
    </div>
    
    <div class="route-compact">
      <span class="code">${flight.origin || '---'}</span>
      <span class="arrow">✈️ →</span>
      <span class="code">${flight.destination || '---'}</span>
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
    updateGanttChart(selectedFlight, schedule);
  }
}

// Fetch schedule data from API
async function fetchSchedule(flight) {
  const callsign = flight.callsign;
  const registration = flight.registration;
  
  // Check cache first (cache for 5 minutes)
  const cacheKey = callsign || registration;
  const cached = scheduleCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    console.log(`Using cached schedule for ${cacheKey}`);
    return cached.data;
  }
  
  try {
    const url = registration 
      ? `/api/schedule/${callsign}?registration=${registration}`
      : `/api/schedule/${callsign}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success && data.schedule) {
      // Cache the result
      scheduleCache[cacheKey] = {
        data: data.schedule,
        timestamp: Date.now(),
      };
      return data.schedule;
    }
  } catch (error) {
    console.error('Failed to fetch schedule:', error);
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
        return `
          <div class="schedule-item ${statusClass}">
            <span class="schedule-route">${s.origin || '---'} → ${s.destination || '---'}</span>
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
    const arrTime = flight.arrivalActual || flight.arrivalScheduled;
    
    if (!depTime || !arrTime) return;
    
    const depDate = new Date(depTime);
    const arrDate = new Date(arrTime);
    
    // Calculate position within the 48-hour window
    const startOffset = depDate.getTime() - windowStart.getTime();
    const endOffset = arrDate.getTime() - windowStart.getTime();
    
    // Skip if completely outside window
    if (endOffset < 0 || startOffset > windowDurationMs) return;
    
    // Clamp to window boundaries
    const clampedStart = Math.max(0, startOffset);
    const clampedEnd = Math.min(windowDurationMs, endOffset);
    
    const startPercent = (clampedStart / windowDurationMs) * 100;
    const widthPercent = Math.max(1, ((clampedEnd - clampedStart) / windowDurationMs) * 100);
    
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
    
    const icon = L.divIcon({
      className: 'flight-marker',
      html: `<div class="flight-marker-inner" style="transform: rotate(${rotation}deg); color: ${color};">✈️</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    
    const marker = L.marker([flight.latitude, flight.longitude], { icon })
      .addTo(map)
      .bindPopup(`
        <b>${flight.callsign || 'Unknown'}</b><br>
        ${airline.name}<br>
        ${flight.aircraftType || 'Unknown aircraft'}<br>
        Alt: ${flight.altitudeFt?.toLocaleString() || '--'} ft<br>
        Speed: ${flight.groundSpeedKt || '--'} kts<br>
        Distance: ${flight.distanceNm?.toFixed(1) || '--'} NM
      `);
    
    markers[flight.id || flight.callsign] = marker;
  });
}
