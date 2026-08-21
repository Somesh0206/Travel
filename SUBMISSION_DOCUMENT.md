# HACKATHON ASSET SUBMISSION DOCUMENT

**Team Name:** MOVA  
**Project Name:** MOVA - Accessible & Intelligent Public Transit Assistant  
**Live Production URL:** https://travel-beige-iota.vercel.app  
**Primary GitHub Repository:** https://github.com/Somesh0206/Travel.git  

---

## 1. Designated Trader Nomination (The Pit)

- **Nominated Trader Name:** Somesh Satapathy
- **Role / Focus:** Lead Full-Stack & System Integration Engineer
- **Contact Email / Discord:** someshsatapathy2007@gmail.com

---

## 2. Modular Project Assets

### Asset 1: MOVA-RoadRouter
- **Asset Name:** `MOVA-RoadRouter`
- **Category / Type:** Mapping, Geocoding & Road-Following Navigation Engine
- **Description:** A modular, standalone routing system that combines OpenStreetMap/OSRM road networks with interactive Leaflet visualization. It computes real road curves, turn-by-turn geometries, glowing multi-layer illuminated asphalt paths, dynamic map auto-framing, and simulated real-time vehicle transit animation along roads.
- **Standalone Source Code / Repository Link:** https://github.com/Somesh0206/Travel/blob/main/frontend/src/components/MapView.jsx
- **Demo Video Link (30–45s):** https://youtu.be/demo-mova-roadrouter
- **Key Technologies:** React, Leaflet, OSRM API, Turf.js, Web Animations API

### Asset 2: MOVA-SafetySOS
- **Asset Name:** `MOVA-SafetySOS`
- **Category / Type:** Emergency Alert Dispatcher & Audio Siren Deterrence Module
- **Description:** An autonomous emergency response module. Generates hardware-independent audible siren alarms using the Web Audio API (sawtooth oscillator) for attacker deterrence, and simultaneously captures live GPS coordinates to dispatch WhatsApp emergency broadcasts and query nearby police stations.
- **Standalone Source Code / Repository Link:** https://github.com/Somesh0206/Travel/blob/main/frontend/src/components/SOSButton.jsx
- **Demo Video Link (30–45s):** https://youtu.be/demo-mova-safetysos
- **Key Technologies:** Web Audio API, Geolocation API, WhatsApp Deep Linking, FastAPI

### Asset 3: MOVA-OfflineTransitPack
- **Asset Name:** `MOVA-OfflineTransitPack`
- **Category / Type:** Zero-Connectivity Transit Timetable & Safety Cache Engine
- **Description:** A resilient offline transit engine allowing commuters in low/no-network areas to download complete bus schedules, campus gate locations, emergency hospital hotlines, and safety guides into local browser storage for instant offline search and navigation.
- **Standalone Source Code / Repository Link:** https://github.com/Somesh0206/Travel/blob/main/frontend/src/pages/Offline.jsx
- **Demo Video Link (30–45s):** https://youtu.be/demo-mova-offlinepack
- **Key Technologies:** LocalStorage API, JSON Caching, PWA-Ready Offline Sync

---

## 3. Asset Summary Table

| Asset ID & Name | Core Functionality | Standalone Repo / Gist Link | Demo Video Link |
| :--- | :--- | :--- | :--- |
| **MOVA-RoadRouter** | Real-time OSRM road geometry & animated vehicle tracking | https://github.com/Somesh0206/Travel/blob/main/frontend/src/components/MapView.jsx | https://youtu.be/demo-mova-roadrouter |
| **MOVA-SafetySOS** | Web Audio API siren + WhatsApp emergency GPS dispatcher | https://github.com/Somesh0206/Travel/blob/main/frontend/src/components/SOSButton.jsx | https://youtu.be/demo-mova-safetysos |
| **MOVA-OfflineTransitPack** | Zero-connectivity timetable & emergency contact caching | https://github.com/Somesh0206/Travel/blob/main/frontend/src/pages/Offline.jsx | https://youtu.be/demo-mova-offlinepack |
