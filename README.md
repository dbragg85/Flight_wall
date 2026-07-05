# FlightWall Mobile

A lightweight, event-driven flight alert system that monitors nearby aircraft and sends push notifications to your phone.

## Features

- 📡 **Real-time Flight Tracking** - Monitors flights within a configurable radius
- 🔔 **Smart Notifications** - Alerts for new flights, approaching aircraft, low altitude, and arrivals
- 📦 **Amazon/Cargo Detection** - Special alerts for Amazon Air and cargo flights
- 📱 **Mobile Dashboard** - Dark mode radar-style interface optimized for phones
- 🛡️ **Cost Control** - Built-in safeguards to prevent API overuse

## Quick Start

### 1. Clone and Install

```bash
cd flightwall-mobile
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# RapidAPI credentials (get from rapidapi.com)
RAPIDAPI_KEY=your_api_key
RAPIDAPI_HOST=your_api_host
RAPIDAPI_URL=https://your-api-endpoint

# ntfy topic (create a unique private name)
NTFY_TOPIC=flightwall-yourname-private

# Your location
HOME_LAT=40.7128
HOME_LON=-74.0060

# Search settings
SEARCH_RADIUS_NM=25
POLL_INTERVAL_MINUTES=5
```

### 3. Set Up Phone Notifications

1. Install the **ntfy** app on your phone:
   - [iOS App Store](https://apps.apple.com/app/ntfy/id1625396347)
   - [Google Play Store](https://play.google.com/store/apps/details?id=io.heckel.ntfy)

2. Open the app and subscribe to your private topic (the same value as `NTFY_TOPIC` in your `.env`)

### 4. Start the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 5. Open the Dashboard

The server will display URLs at startup:

```
🌐 Dashboard URLs:
   Local: http://localhost:3000
   Network:
     http://192.168.1.100:3000 (en0)
```

Open the network URL on your phone (must be on same WiFi).

### 6. Test It

Click the "Test Notification" button on the dashboard to verify notifications are working.

## Remote Access with ngrok

To access the dashboard from anywhere:

```bash
# Install ngrok from https://ngrok.com/download
ngrok http 3000
```

Use the provided ngrok URL on any device.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard |
| `/api/flights` | GET | Current active flights |
| `/api/events` | GET | Recent notification events |
| `/api/status` | GET | System status and config |
| `/api/test-notification` | POST | Send test notification |
| `/api/trigger-poll` | POST | Manually trigger a poll |

## Event Types

Notifications are sent for these events:

| Event | Description | Default Priority |
|-------|-------------|------------------|
| New Flight | Aircraft enters search radius | Normal |
| Approaching | Flight within 15 NM | Important |
| Low Altitude | Descends below 10,000 ft | Important |
| Arriving Soon | ETA within 15 minutes | Normal |
| Amazon Flight | Amazon/cargo aircraft detected | Important |

## Cost Control

The system prevents accidental API abuse:

- **Minimum poll interval**: 5 minutes (enforced)
- **Monthly estimate**: Displayed at startup
- **Warning**: Alerts if estimates exceed 9,500 requests/month

## Project Structure

```
flightwall-mobile/
├── server.js           # Express server & polling logic
├── package.json        # Dependencies & scripts
├── .env.example        # Environment template
├── public/             # Dashboard files
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/               # JSON storage
│   ├── seenFlights.json
│   └── activeFlights.json
└── utils/
    ├── flightApi.js    # RapidAPI integration
    ├── flightLogic.js  # Event detection
    ├── notifier.js     # ntfy notifications
    └── airlineLogos.js # Logo mapping
```

## Supported Airlines

The system includes logo mappings for major airlines including:

- **US Carriers**: Delta, American, United, Southwest, JetBlue, Alaska, Frontier, Spirit
- **International**: Air France, British Airways, Lufthansa, Emirates, and more
- **Cargo**: UPS, FedEx, Kalitta Air, Atlas Air, Cargolux, DHL

## Development

```bash
# Run with nodemon (auto-reload)
npm run dev

# Run tests (when implemented)
npm test
```

## License

MIT