/**
 * Airline Logo Utility
 * Maps airline codes to logo URLs using Clearbit Logo API
 */

// Mapping of airline IATA codes to their domain names for Clearbit logos
const AIRLINE_DOMAINS = {
  // Major US Airlines
  'DL': 'delta.com',
  'AA': 'aa.com',
  'UA': 'united.com',
  'WN': 'southwest.com',
  'F9': 'flyfrontier.com',
  'NK': 'spirit.com',
  'B6': 'jetblue.com',
  'AS': 'alaskaair.com',
  
  // International Airlines
  'AF': 'airfrance.com',
  'BA': 'britishairways.com',
  'LH': 'lufthansa.com',
  'EK': 'emirates.com',
  'QR': 'qatarairways.com',
  'SQ': 'singaporeair.com',
  'CX': 'cathaypacific.com',
  'NH': 'ana.co.jp',
  'JL': 'jal.co.jp',
  'KE': 'koreanair.com',
  'TK': 'turkishairlines.com',
  'LX': 'swiss.com',
  'AZ': 'ita-airways.com',
  'IB': 'iberia.com',
  'KL': 'klm.com',
  'AC': 'aircanada.com',
  'QF': 'qantas.com',
  'VS': 'virginatlantic.com',
  
  // Cargo Airlines
  '5X': 'ups.com',
  'FX': 'fedex.com',
  'K4': 'kalittaair.com',
  'PO': 'polaraircargo.com',
  'CV': 'cargolux.com',
  'QY': 'dhl.com',
  'M3': 'abxair.com',
  '8C': 'airtransport.cc',
  '5Y': 'atlasair.com',
  
  // Amazon Air (various operators)
  'ER': 'amazon.com',    // Amazon Prime Air / Aer Lingus Regional
  'SWQ': 'amazon.com',   // Swift Air (Amazon contractor)
};

// ICAO to IATA mapping for common airlines
const ICAO_TO_IATA = {
  'DAL': 'DL',
  'AAL': 'AA',
  'UAL': 'UA',
  'SWA': 'WN',
  'FFT': 'F9',
  'NKS': 'NK',
  'JBU': 'B6',
  'ASA': 'AS',
  'AFR': 'AF',
  'BAW': 'BA',
  'DLH': 'LH',
  'UAE': 'EK',
  'QTR': 'QR',
  'SIA': 'SQ',
  'CPA': 'CX',
  'ANA': 'NH',
  'JAL': 'JL',
  'KAL': 'KE',
  'THY': 'TK',
  'SWR': 'LX',
  'AZA': 'AZ',
  'IBE': 'IB',
  'KLM': 'KL',
  'ACA': 'AC',
  'QFA': 'QF',
  'VIR': 'VS',
  'UPS': '5X',
  'FDX': 'FX',
  'CKS': 'K4',
  'PAC': 'PO',
  'CLX': 'CV',
  'BCS': 'QY',
  'ABX': 'M3',
  'ATN': '8C',
  'GTI': '5Y',
};

// Amazon-related callsign patterns
const AMAZON_PATTERNS = [
  /^AZA/i,      // Amazon callsigns
  /^AMAZON/i,
  /^GTI/i,      // Atlas Air (Amazon contractor)
  /^ABX/i,      // ABX Air (Amazon contractor)
  /^ATN/i,      // Air Transport International (Amazon)
  /^SWQ/i,      // Swift Air (Amazon contractor)
];

/**
 * Get airline logo URL from Clearbit
 * @param {Object} params - Airline identifiers
 * @param {string} params.airlineIata - IATA airline code (e.g., 'DL')
 * @param {string} params.airlineIcao - ICAO airline code (e.g., 'DAL')
 * @param {string} params.callsign - Flight callsign (e.g., 'DAL123')
 * @returns {string|null} Logo URL or null if not found
 */
function getAirlineLogo({ airlineIata, airlineIcao, callsign }) {
  let iataCode = airlineIata;
  
  // Try to get IATA from ICAO if not provided
  if (!iataCode && airlineIcao) {
    iataCode = ICAO_TO_IATA[airlineIcao.toUpperCase()];
  }
  
  // Try to extract airline code from callsign
  if (!iataCode && callsign) {
    const icaoPrefix = callsign.substring(0, 3).toUpperCase();
    iataCode = ICAO_TO_IATA[icaoPrefix];
  }
  
  // Check for Amazon-related flights
  if (callsign && isAmazonFlight(callsign)) {
    return 'https://logo.clearbit.com/amazon.com';
  }
  
  // Look up domain and return Clearbit logo URL
  if (iataCode) {
    const domain = AIRLINE_DOMAINS[iataCode.toUpperCase()];
    if (domain) {
      return `https://logo.clearbit.com/${domain}`;
    }
  }
  
  return null;
}

/**
 * Get airline name from code
 * @param {string} code - IATA or ICAO code
 * @returns {string} Airline name or the code itself
 */
function getAirlineName(code) {
  const AIRLINE_NAMES = {
    'DL': 'Delta Air Lines',
    'AA': 'American Airlines',
    'UA': 'United Airlines',
    'WN': 'Southwest Airlines',
    'F9': 'Frontier Airlines',
    'NK': 'Spirit Airlines',
    'B6': 'JetBlue Airways',
    'AS': 'Alaska Airlines',
    'AF': 'Air France',
    'BA': 'British Airways',
    'LH': 'Lufthansa',
    'EK': 'Emirates',
    'QR': 'Qatar Airways',
    '5X': 'UPS Airlines',
    'FX': 'FedEx Express',
    'K4': 'Kalitta Air',
    'PO': 'Polar Air Cargo',
    'CV': 'Cargolux',
    'QY': 'DHL Aviation',
    'M3': 'ABX Air',
    '8C': 'Air Transport International',
    '5Y': 'Atlas Air',
  };
  
  if (!code) return null;
  
  // Try IATA first
  let name = AIRLINE_NAMES[code.toUpperCase()];
  if (name) return name;
  
  // Try ICAO to IATA conversion
  const iata = ICAO_TO_IATA[code.toUpperCase()];
  if (iata) {
    name = AIRLINE_NAMES[iata];
    if (name) return name;
  }
  
  return null;
}

/**
 * Check if a flight is Amazon-related
 * @param {string} callsign - Flight callsign
 * @returns {boolean} True if Amazon-related
 */
function isAmazonFlight(callsign) {
  if (!callsign) return false;
  return AMAZON_PATTERNS.some(pattern => pattern.test(callsign));
}

/**
 * Get fallback emoji for flight type
 * @param {string} callsign - Flight callsign
 * @returns {string} Emoji representation
 */
function getFallbackEmoji(callsign) {
  if (isAmazonFlight(callsign)) return '📦';
  
  // Cargo airlines
  const cargoPatterns = [/^UPS/i, /^FDX/i, /^GTI/i, /^ABX/i, /^CLX/i];
  if (cargoPatterns.some(p => p.test(callsign))) return '📦';
  
  return '✈️';
}

module.exports = {
  getAirlineLogo,
  getAirlineName,
  isAmazonFlight,
  getFallbackEmoji,
  ICAO_TO_IATA,
  AIRLINE_DOMAINS,
};
