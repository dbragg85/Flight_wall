/**
 * FlightWall Mobile - Dashboard JavaScript
 */

// Configuration
const CONFIG = {
  refreshInterval: 30000, // Auto-refresh every 30 seconds
  apiEndpoints: {
    flights: '/api/flights',
    events: '/api/events',
    status: '/api/status',
    testNotification: '/api/test-notification',
    triggerPoll: '/api/trigger-poll',
  },
};

// State
let state = {
  flights: [],
  lastUpdated: null,
  isLoading: true,
  error: null,
  refreshTimer: null,
};

// DOM Elements
const elements = {
  flightsGrid: document.getElementById('flights-grid'),
  loadingState: document.getElementById('loading-state'),
  emptyState: document.getElementById('empty-state'),
  flightCount: document.getElementById('flight-count'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  lastUpdate: document.getElementById('last-update'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnTest: document.getElementById('btn-test'),
  toastContainer: document.getElementById('toast-container'),
};

// ============================================
// API Functions
// ============================================

async function fetchFlights() {
  try {
    const response = await fetch(CONFIG.apiEndpoints.flights);
    if (!response.ok) throw new Error('Failed to fetch flights');
    return await response.json();
  } catch (error) {
    console.error('Error fetching flights:', error);
    throw error;
  }
}

async function sendTestNotification() {
  try {
    const response = await fetch(CONFIG.apiEndpoints.testNotification, {
      method: 'POST',
    });
    return await response.json();
  } catch (error) {
    console.error('Error sending test notification:', error);
    throw error;
  }
}

async function triggerPoll() {
  try {
    const response = await fetch(CONFIG.apiEndpoints.triggerPoll, {
      method: 'POST',
    });
    return await response.json();
  } catch (error) {
    console.error('Error triggering poll:', error);
    throw error;
  }
}

// ============================================
// UI Functions
// ============================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function updateStatus(connected, message) {
  elements.statusDot.className = `status-dot ${connected ? 'connected' : 'error'}`;
  elements.statusText.textContent = message;
}

function updateLastUpdated(timestamp) {
  if (!timestamp) {
    elements.lastUpdate.textContent = '--';
    return;
  }
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) {
    elements.lastUpdate.textContent = 'Just now';
  } else if (diffMins === 1) {
    elements.lastUpdate.textContent = '1 min ago';
  } else if (diffMins < 60) {
    elements.lastUpdate.textContent = `${diffMins} mins ago`;
  } else {
    elements.lastUpdate.textContent = date.toLocaleTimeString();
  }
}

function formatDistance(nm) {
  if (nm === undefined || nm === null) return '--';
  return `${nm.toFixed(1)} NM`;
}

function formatAltitude(ft) {
  if (ft === undefined || ft === null) return '--';
  return `${ft.toLocaleString()} ft`;
}

function formatSpeed(kt) {
  if (kt === undefined || kt === null) return '--';
  return `${kt} kt`;
}

function createFlightCard(flight) {
  const card = document.createElement('div');
  card.className = `flight-card ${flight.isAmazon ? 'amazon' : ''}`;
  
  // Determine fallback icon
  const fallbackIcon = flight.isAmazon ? '📦' : '✈️';
  
  // Build logo HTML
  const logoHtml = flight.logoUrl
    ? `<img src="${flight.logoUrl}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'fallback-icon\\'>${fallbackIcon}</span>'">`
    : `<span class="fallback-icon">${fallbackIcon}</span>`;
  
  // Build route display
  const origin = flight.origin || '???';
  const destination = flight.destination || '???';
  
  // Build ETA badge if available
  const etaBadgeHtml = flight.estimatedMinutesAway
    ? `<div class="eta-badge">⏱️ Arriving in ~${flight.estimatedMinutesAway} min</div>`
    : '';
  
  // Distance class based on proximity
  let distanceClass = '';
  if (flight.distanceNm !== undefined) {
    if (flight.distanceNm < 5) distanceClass = 'warning';
    else if (flight.distanceNm < 15) distanceClass = 'highlight';
  }
  
  card.innerHTML = `
    <div class="card-header">
      <div class="airline-logo">
        ${logoHtml}
      </div>
      <div class="card-title">
        <div class="callsign">${flight.callsign || 'Unknown'}</div>
        <div class="airline-name">${flight.airlineName || ''}</div>
      </div>
      ${flight.isAmazon ? '<span class="amazon-badge">Amazon</span>' : ''}
    </div>
    
    <div class="card-body">
      <div class="route">
        <span class="route-code">${origin}</span>
        <span class="route-arrow">→</span>
        <span class="route-code">${destination}</span>
      </div>
      <div class="aircraft-type">${flight.aircraftType || ''}</div>
    </div>
    
    <div class="card-stats">
      <div class="stat">
        <span class="stat-value ${distanceClass}">${formatDistance(flight.distanceNm)} ${flight.bearing || ''}</span>
        <span class="stat-key">Distance</span>
      </div>
      <div class="stat">
        <span class="stat-value">${formatAltitude(flight.altitudeFt)}</span>
        <span class="stat-key">Altitude</span>
      </div>
      <div class="stat">
        <span class="stat-value">${formatSpeed(flight.groundSpeedKt)}</span>
        <span class="stat-key">Speed</span>
      </div>
      <div class="stat">
        <span class="stat-value">${flight.heading ? flight.heading + '°' : '--'}</span>
        <span class="stat-key">Heading</span>
      </div>
      ${etaBadgeHtml}
    </div>
  `;
  
  return card;
}

function renderFlights(flights) {
  // Clear existing content except loading state
  const existingCards = elements.flightsGrid.querySelectorAll('.flight-card');
  existingCards.forEach(card => card.remove());
  
  // Hide loading state
  elements.loadingState.style.display = 'none';
  
  // Update flight count
  elements.flightCount.textContent = flights.length;
  
  if (flights.length === 0) {
    elements.emptyState.style.display = 'flex';
    return;
  }
  
  elements.emptyState.style.display = 'none';
  
  // Sort flights by distance (closest first)
  const sortedFlights = [...flights].sort((a, b) => {
    const distA = a.distanceNm ?? Infinity;
    const distB = b.distanceNm ?? Infinity;
    return distA - distB;
  });
  
  // Render each flight card
  sortedFlights.forEach(flight => {
    const card = createFlightCard(flight);
    elements.flightsGrid.appendChild(card);
  });
}

// ============================================
// Main Functions
// ============================================

async function refreshData() {
  try {
    state.isLoading = true;
    updateStatus(true, 'Updating...');
    
    const data = await fetchFlights();
    
    if (data.success) {
      state.flights = data.flights || [];
      state.lastUpdated = data.lastUpdated;
      state.error = null;
      
      renderFlights(state.flights);
      updateLastUpdated(state.lastUpdated);
      updateStatus(true, 'Connected');
    } else {
      throw new Error(data.error || 'Unknown error');
    }
    
  } catch (error) {
    state.error = error.message;
    updateStatus(false, 'Error');
    showToast(`Error: ${error.message}`, 'error');
  } finally {
    state.isLoading = false;
  }
}

function startAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }
  
  state.refreshTimer = setInterval(() => {
    refreshData();
  }, CONFIG.refreshInterval);
}

// ============================================
// Event Handlers
// ============================================

elements.btnRefresh.addEventListener('click', async () => {
  elements.btnRefresh.disabled = true;
  
  try {
    // Trigger a server-side poll first
    await triggerPoll();
    // Then refresh the UI
    await refreshData();
    showToast('Refreshed!', 'success');
  } catch (error) {
    showToast('Refresh failed', 'error');
  } finally {
    elements.btnRefresh.disabled = false;
  }
});

elements.btnTest.addEventListener('click', async () => {
  elements.btnTest.disabled = true;
  
  try {
    const result = await sendTestNotification();
    if (result.success) {
      showToast('Test notification sent!', 'success');
    } else {
      showToast(result.message || 'Failed to send', 'error');
    }
  } catch (error) {
    showToast('Failed to send notification', 'error');
  } finally {
    elements.btnTest.disabled = false;
  }
});

// Handle visibility change - refresh when tab becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshData();
  }
});

// ============================================
// Initialize
// ============================================

async function init() {
  console.log('🛫 FlightWall Mobile Dashboard initializing...');
  
  // Initial data fetch
  await refreshData();
  
  // Start auto-refresh
  startAutoRefresh();
  
  // Update "last updated" display every 30 seconds
  setInterval(() => {
    updateLastUpdated(state.lastUpdated);
  }, 30000);
  
  console.log('✅ Dashboard ready');
}

// Start the app
init();
