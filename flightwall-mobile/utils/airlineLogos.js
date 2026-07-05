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
  
  // US Regional Airlines (Delta Connection, American Eagle, United Express, etc.)
  '9E': 'delta.com',     // Endeavor Air (Delta Connection)
  'OH': 'delta.com',     // PSA Airlines (American Eagle) - uses AA branding
  'YX': 'aa.com',        // Republic Airways (flies for multiple)
  'CP': 'delta.com',     // Compass Airlines
  'G7': 'delta.com',     // GoJet Airlines
  'ZW': 'united.com',    // Air Wisconsin (United Express)
  'C5': 'united.com',    // CommutAir (United Express)
  'AX': 'aa.com',        // Trans States Airlines
  'MQ': 'aa.com',        // Envoy Air (American Eagle)
  'OO': 'skywest.com',   // SkyWest Airlines
  'YV': 'united.com',    // Mesa Airlines
  'QX': 'alaskaair.com', // Horizon Air
  'EV': 'united.com',    // ExpressJet
  'PT': 'piedmont-airlines.com', // Piedmont Airlines (American Eagle)
  
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
  
  // Private/Charter/Other
  'EJA': 'netjets.com',  // NetJets
  'XOJ': 'xojet.com',    // XO Jet
  'LXJ': 'flexjet.com',  // Flexjet
  'TVS': 'tvsair.com',   // TVS Air
  'JIA': 'psa-airlines.com', // PSA Airlines (American Eagle)
};

// ICAO to IATA mapping for common airlines
const ICAO_TO_IATA = {
  // Major US Airlines
  'DAL': 'DL',
  'AAL': 'AA',
  'UAL': 'UA',
  'SWA': 'WN',
  'FFT': 'F9',
  'NKS': 'NK',
  'JBU': 'B6',
  'ASA': 'AS',
  
  // US Regional Airlines
  'EDV': '9E',   // Endeavor Air (Delta Connection)
  'JIA': 'JIA',  // PSA Airlines (American Eagle) - keep as JIA for direct lookup
  'RPA': 'YX',   // Republic Airways
  'CPZ': 'CP',   // Compass Airlines
  'GJS': 'G7',   // GoJet Airlines
  'AWI': 'ZW',   // Air Wisconsin
  'UCA': 'C5',   // CommutAir
  'LOF': 'AX',   // Trans States
  'ENY': 'MQ',   // Envoy Air
  'SKW': 'OO',   // SkyWest
  'ASH': 'YV',   // Mesa Airlines
  'QXE': 'QX',   // Horizon Air
  'ASQ': 'EV',   // ExpressJet
  'PDT': 'PT',   // Piedmont Airlines
  'EJA': 'EJA',  // NetJets - keep as EJA for direct lookup
  
  // International Airlines
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
  
  // Cargo Airlines
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

// Direct ICAO code to domain mapping (for regional carriers that use ICAO in callsigns)
const ICAO_DOMAINS = {
  'EDV': 'delta.com',      // Endeavor Air (Delta Connection)
  'JIA': 'aa.com',         // PSA Airlines (American Eagle)
  'EJA': 'netjets.com',    // NetJets
  'RPA': 'republicairways.com', // Republic Airways
  'ENY': 'aa.com',         // Envoy Air (American Eagle)
  'SKW': 'skywest.com',    // SkyWest
  'ASH': 'united.com',     // Mesa Airlines (United Express)
  'GJS': 'delta.com',      // GoJet (Delta Connection)
  'CPZ': 'delta.com',      // Compass Airlines
  'AWI': 'united.com',     // Air Wisconsin
  'UCA': 'united.com',     // CommutAir
  'QXE': 'alaskaair.com',  // Horizon Air
  'PDT': 'aa.com',         // Piedmont Airlines
  'DAL': 'delta.com',
  'AAL': 'aa.com',
  'UAL': 'united.com',
  'SWA': 'southwest.com',
  'UPS': 'ups.com',
  'FDX': 'fedex.com',
  'GTI': 'atlasair.com',
  'ABX': 'amazon.com',     // ABX Air (Amazon contractor)
  'ATN': 'amazon.com',     // Air Transport Intl (Amazon)
};

/**
 * Get airline logo URL from Clearbit
 * @param {Object} params - Airline identifiers
 * @param {string} params.airlineIata - IATA airline code (e.g., 'DL')
 * @param {string} params.airlineIcao - ICAO airline code (e.g., 'DAL')
 * @param {string} params.callsign - Flight callsign (e.g., 'DAL123')
 * @returns {string|null} Logo URL or null if not found
 */
function getAirlineLogo({ airlineIata, airlineIcao, callsign }) {
  // Check for Amazon-related flights first
  if (callsign && isAmazonFlight(callsign)) {
    return 'https://logo.clearbit.com/amazon.com';
  }
  
  // Try to get domain from ICAO code directly (from callsign prefix)
  if (callsign) {
    const icaoPrefix = callsign.substring(0, 3).toUpperCase();
    const icaoDomain = ICAO_DOMAINS[icaoPrefix];
    if (icaoDomain) {
      return `https://logo.clearbit.com/${icaoDomain}`;
    }
  }
  
  // Try ICAO code if provided
  if (airlineIcao) {
    const icaoDomain = ICAO_DOMAINS[airlineIcao.toUpperCase()];
    if (icaoDomain) {
      return `https://logo.clearbit.com/${icaoDomain}`;
    }
  }
  
  // Try IATA code
  let iataCode = airlineIata;
  
  // Convert ICAO to IATA if needed
  if (!iataCode && airlineIcao) {
    iataCode = ICAO_TO_IATA[airlineIcao.toUpperCase()];
  }
  
  // Try from callsign
  if (!iataCode && callsign) {
    const icaoPrefix = callsign.substring(0, 3).toUpperCase();
    iataCode = ICAO_TO_IATA[icaoPrefix];
  }
  
  // Look up domain by IATA
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
    // Major US Airlines
    'DL': 'Delta Air Lines',
    'AA': 'American Airlines',
    'UA': 'United Airlines',
    'WN': 'Southwest Airlines',
    'F9': 'Frontier Airlines',
    'NK': 'Spirit Airlines',
    'B6': 'JetBlue Airways',
    'AS': 'Alaska Airlines',
    
    // US Regional Airlines (IATA codes)
    '9E': 'Endeavor Air',
    'OH': 'PSA Airlines',
    'YX': 'Republic Airways',
    'MQ': 'Envoy Air',
    'OO': 'SkyWest Airlines',
    'YV': 'Mesa Airlines',
    'QX': 'Horizon Air',
    
    // US Regional Airlines (ICAO codes used as callsigns)
    'EDV': 'Endeavor Air',
    'JIA': 'PSA Airlines',
    'EJA': 'NetJets',
    'RPA': 'Republic Airways',
    'ENY': 'Envoy Air',
    'SKW': 'SkyWest Airlines',
    'ASH': 'Mesa Airlines',
    
    // International Airlines
    'AF': 'Air France',
    'BA': 'British Airways',
    'LH': 'Lufthansa',
    'EK': 'Emirates',
    'QR': 'Qatar Airways',
    'SQ': 'Singapore Airlines',
    'AC': 'Air Canada',
    'KL': 'KLM',
    
    // Cargo Airlines
    '5X': 'UPS Airlines',
    'FX': 'FedEx Express',
    'K4': 'Kalitta Air',
    'PO': 'Polar Air Cargo',
    'CV': 'Cargolux',
    'QY': 'DHL Aviation',
    'M3': 'ABX Air',
    '8C': 'Air Transport Intl',
    '5Y': 'Atlas Air',
    'UPS': 'UPS Airlines',
    'FDX': 'FedEx Express',
    'GTI': 'Atlas Air',
    'ABX': 'ABX Air',
    'ATN': 'Air Transport Intl',
  };
  
  if (!code) return null;
  
  const upperCode = code.toUpperCase().trim();
  
  // Try direct lookup first (works for both IATA and ICAO)
  let name = AIRLINE_NAMES[upperCode];
  if (name) return name;
  
  // Try ICAO to IATA conversion
  const iata = ICAO_TO_IATA[upperCode];
  if (iata) {
    name = AIRLINE_NAMES[iata];
    if (name) return name;
  }
  
  // Try extracting from callsign (first 3 chars)
  if (upperCode.length >= 3) {
    const prefix = upperCode.substring(0, 3);
    name = AIRLINE_NAMES[prefix];
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
  ICAO_DOMAINS,
  AIRLINE_DOMAINS,
};
