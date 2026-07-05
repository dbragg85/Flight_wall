/**
 * FlightWall Visual Radar Dashboard
 */

// Configuration
const CONFIG = {
  HOME_LAT: 39.1135,
  HOME_LON: -84.5677,
  REFRESH_INTERVAL: 30000,
  MAP_ZOOM: 11,
};

// State
let map = null;
let markers = {};
let homeMarker = null;
let rangeCircles = [];
let flights = [];
let refreshCountdown = 30;
let countdownInterval = null;

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

// Update date/time display
function updateDateTime() {
  const now = new Date();
  document.getElementById('current-time').textContent = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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

// Fetch flights from API
async function fetchFlights() {
  try {
    const response = await fetch('/api/flights');
    const data = await response.json();
    
    if (data.success && data.flights) {
      flights = data.flights.sort((a, b) => (a.distanceNm || 999) - (b.distanceNm || 999));
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
  updateFlightsTable();
  updateMapMarkers();
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

// Update current flight panel
function updateCurrentFlight() {
  const container = document.getElementById('current-flight-content');
  
  if (flights.length === 0) {
    container.innerHTML = `
      <div class="no-flight">
        <div class="no-flight-icon">📡</div>
        <h3>No Aircraft Nearby</h3>
        <p>Scanning airspace within 10 NM...</p>
      </div>
    `;
    return;
  }
  
  // Get closest flight
  const flight = flights[0];
  const airline = getAirlineInfo(flight.callsign);
  const altColor = getAltitudeColor(flight.altitudeFt);
  
  // Determine if climbing/descending (would need previous data, simplified here)
  const altTrend = flight.altitudeFt > 10000 ? '↑ CLIMBING' : flight.altitudeFt < 3000 ? '↓ DESCENDING' : '→ LEVEL';
  
  container.innerHTML = `
    <div class="flight-hero" style="background: linear-gradient(135deg, ${altColor}22, #16213e);">
      <div class="flight-hero-overlay">
        <div class="airline-badge">
          ${airline.logo ? `<img src="${airline.logo}" class="airline-logo-small" onerror="this.style.display='none'">` : ''}
          <span>${airline.name}</span>
        </div>
        <div class="flight-callsign">
          ${flight.callsign || 'N/A'}
          <span class="aircraft-type">${flight.aircraftType || 'Unknown'}</span>
        </div>
      </div>
    </div>
    
    <div class="flight-details">
      <div class="route-display">
        <div class="airport-code">
          <div class="code">${flight.origin || '---'}</div>
          <div class="name">${flight.originName || 'Origin'}</div>
        </div>
        <div class="route-arrow">
          <div class="route-line"></div>
          <span class="route-plane">✈️</span>
          <div class="route-line"></div>
        </div>
        <div class="airport-code">
          <div class="code">${flight.destination || '---'}</div>
          <div class="name">${flight.destinationName || 'Destination'}</div>
        </div>
      </div>
      
      <div class="flight-stats">
        <div class="stat-box">
          <div class="stat-value" style="color: ${altColor}">${flight.altitudeFt?.toLocaleString() || '--'}</div>
          <div class="stat-label">Altitude (ft)</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${flight.groundSpeedKt || '--'}</div>
          <div class="stat-label">Speed (kts)</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color: #00ff88">${flight.distanceNm?.toFixed(1) || '--'}</div>
          <div class="stat-label">Distance (NM)</div>
        </div>
      </div>
      
      <div class="eta-banner">
        <span class="eta-icon">🎯</span>
        <div class="eta-text">
          <h4>${flight.estimatedMinutesAway ? `ARRIVING IN ~${flight.estimatedMinutesAway} MINUTES` : altTrend}</h4>
          <p>${flight.altitudeFt <= 500 ? 'On ground' : `At ${flight.altitudeFt?.toLocaleString()} ft`} • ${flight.bearing || ''} of home</p>
        </div>
      </div>
    </div>
  `;
}

// Update flights table
function updateFlightsTable() {
  const tbody = document.getElementById('flights-table-body');
  
  if (flights.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 40px;">
          No flights detected within range
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = flights.map(flight => {
    const airline = getAirlineInfo(flight.callsign);
    const altColor = getAltitudeColor(flight.altitudeFt);
    const isClose = flight.distanceNm < 5;
    
    return `
      <tr>
        <td>
          <div class="airline-cell">
            ${airline.logo 
              ? `<img src="${airline.logo}" class="airline-logo-table" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>✈️</text></svg>'">`
              : '<span style="font-size:24px">✈️</span>'
            }
            <span>${airline.name}</span>
          </div>
        </td>
        <td><span class="callsign-link">${flight.callsign || 'N/A'}</span></td>
        <td>${flight.aircraftType || '--'}</td>
        <td>${flight.origin || '---'} → ${flight.destination || '---'}</td>
        <td style="color: ${altColor}">${flight.altitudeFt?.toLocaleString() || '--'} ft ↑</td>
        <td>${flight.groundSpeedKt || '--'} kts</td>
        <td class="${isClose ? 'distance-close' : ''}">${flight.distanceNm?.toFixed(1) || '--'} NM</td>
        <td>
          <svg class="trend-indicator" viewBox="0 0 40 30">
            <polyline points="5,25 15,15 25,20 35,5" fill="none" stroke="${altColor}" stroke-width="2"/>
          </svg>
        </td>
      </tr>
    `;
  }).join('');
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
