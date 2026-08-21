import { useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation, Compass, Layers, Car, Bus, Route, Maximize2, ShieldAlert } from "lucide-react";

// Fix default marker icons for webpack builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const INDIA_CENTER = [20.3558, 85.8175]; // KIIT Campus & Odisha Center default

function makeDivIcon(color, glyph = "", sub = "") {
  return L.divIcon({
    className: "mova-marker",
    html: `
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
      ">
        <div style="
          width:32px;
          height:32px;
          border-radius:999px;
          background:${color};
          display:grid;
          place-items:center;
          color:#0a0a0e;
          font-weight:900;
          font-size:14px;
          font-family:Outfit, sans-serif;
          border:2px solid #ffffff;
          box-shadow:0 0 16px ${color}aa, 0 4px 12px rgba(0,0,0,0.6);
        ">
          ${glyph}
        </div>
        ${sub ? `<span style="font-size:10px;font-weight:700;color:#fff;background:rgba(0,0,0,0.75);padding:1px 5px;border-radius:4px;margin-top:2px;white-space:nowrap;border:1px solid rgba(255,255,255,0.2);">${sub}</span>` : ""}
      </div>
    `,
    iconSize: [32, 48],
    iconAnchor: [16, 24],
  });
}

function makeVehicleIcon(label = "BUS", vehicleNo = "") {
  return L.divIcon({
    className: "mova-vehicle-marker",
    html: `
      <div style="
        position:relative;
        display:flex;
        flex-direction:column;
        align-items:center;
        animation:mova-pulse 2s infinite;
      ">
        <div style="
          width:36px;
          height:36px;
          border-radius:12px;
          background:linear-gradient(135deg, #00E5FF, #0072FF);
          display:grid;
          place-items:center;
          color:#ffffff;
          border:2px solid #ffffff;
          box-shadow:0 0 20px #00E5FF, 0 6px 14px rgba(0,0,0,0.8);
        ">
          🚌
        </div>
        <span style="
          font-size:9px;
          font-weight:800;
          color:#00E5FF;
          background:#0B132B;
          padding:2px 6px;
          border-radius:999px;
          margin-top:3px;
          white-space:nowrap;
          border:1px solid #00E5FF55;
          box-shadow:0 2px 6px rgba(0,0,0,0.5);
        ">
          ${vehicleNo || label}
        </span>
      </div>
    `,
    iconSize: [36, 54],
    iconAnchor: [18, 27],
  });
}

function MapController({ d1, d2, userLoc, roadCoords, selectedRouteCoords }) {
  const map = useMap();

  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); };
  }, [map]);

  useEffect(() => {
    const coordsToFit = (roadCoords && roadCoords.length >= 2) ? roadCoords :
                        (selectedRouteCoords && selectedRouteCoords.length >= 2) ? selectedRouteCoords : null;

    if (coordsToFit) {
      const bounds = L.latLngBounds(coordsToFit);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (d1 && d2) {
      const bounds = L.latLngBounds([[d1.lat, d1.lng], [d2.lat, d2.lng]]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } else if (d1) {
      map.flyTo([d1.lat, d1.lng], 14, { duration: 0.8 });
    } else if (d2) {
      map.flyTo([d2.lat, d2.lng], 14, { duration: 0.8 });
    } else if (userLoc) {
      map.flyTo([userLoc.lat, userLoc.lng], 14, { duration: 0.8 });
    }
  }, [d1, d2, userLoc, roadCoords, selectedRouteCoords, map]);

  return null;
}

function MapClickListener({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
}

export default function MapView({
  theme = "dark",
  stops = [],
  campuses = [],
  hubs = [],
  police = [],
  roadCoords = [],
  roadCoordinates = [],
  selectedRouteRoadCoords = [],
  activeRouteName = "",
  activeVehicleNo = "",
  d1 = null,
  d2 = null,
  userLoc = null,
  liveUsers = [],
  height = "56vh",
  onSelectStop = null,
  onMapClick = null,
  clickMode = null,
  roadSteps = [],
  roadDistanceKm = null,
  roadDurationMin = null,
}) {
  const [mapStyle, setMapStyle] = useState("dark"); // "dark" | "streets" | "satellite"
  const [vehicleProgressIdx, setVehicleProgressIdx] = useState(0);

  // Unify coordinate arrays
  const activeRoad = useMemo(() => {
    if (roadCoordinates && roadCoordinates.length >= 2) return roadCoordinates;
    if (roadCoords && roadCoords.length >= 2) return roadCoords;
    if (selectedRouteRoadCoords && selectedRouteRoadCoords.length >= 2) return selectedRouteRoadCoords;
    return [];
  }, [roadCoordinates, roadCoords, selectedRouteRoadCoords]);

  // Smooth live vehicle animation along the road coordinates
  useEffect(() => {
    if (!activeRoad || activeRoad.length < 2) {
      setVehicleProgressIdx(0);
      return;
    }
    const interval = setInterval(() => {
      setVehicleProgressIdx((prev) => (prev + 1) % activeRoad.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [activeRoad]);

  const tileConfig = useMemo(() => {
    if (mapStyle === "satellite") {
      return {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        subdomains: [],
        attr: "&copy; Esri, Maxar, Earthstar Geographics",
      };
    }
    if (mapStyle === "streets") {
      return {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        subdomains: ["a", "b", "c"],
        attr: "&copy; OpenStreetMap contributors",
      };
    }
    return {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      subdomains: ["a", "b", "c", "d"],
      attr: "&copy; OpenStreetMap &copy; CARTO",
    };
  }, [mapStyle]);

  const currentVehiclePos = useMemo(() => {
    if (activeRoad && activeRoad.length > 0) {
      return activeRoad[vehicleProgressIdx] || activeRoad[0];
    }
    return null;
  }, [activeRoad, vehicleProgressIdx]);

  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/15 relative isolate shadow-2xl bg-[#090D16]"
      style={{ height }}
      data-testid="mova-map"
    >
      {/* Floating Top Controls Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center justify-between pointer-events-none">
        {/* Style Switcher */}
        <div className="bg-black/80 backdrop-blur-md p-1 rounded-xl border border-white/20 flex gap-1 shadow-2xl pointer-events-auto">
          <button
            type="button"
            onClick={() => setMapStyle("dark")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              mapStyle === "dark" ? "bg-[#00E5FF] text-black shadow-md shadow-[#00E5FF]/40" : "text-white/80 hover:text-white"
            }`}
          >
            🌙 Dark
          </button>
          <button
            type="button"
            onClick={() => setMapStyle("streets")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              mapStyle === "streets" ? "bg-[#00E5FF] text-black shadow-md shadow-[#00E5FF]/40" : "text-white/80 hover:text-white"
            }`}
          >
            🛣️ Road Map
          </button>
          <button
            type="button"
            onClick={() => setMapStyle("satellite")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              mapStyle === "satellite" ? "bg-[#00E5FF] text-black shadow-md shadow-[#00E5FF]/40" : "text-white/80 hover:text-white"
            }`}
          >
            🛰️ Satellite
          </button>
        </div>

        {/* Live Road Route Status Pill */}
        {activeRoad.length >= 2 && (
          <div className="bg-[#0B132B]/90 backdrop-blur-md border border-[#00E5FF]/50 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-2xl pointer-events-auto">
            <span className="h-2 w-2 rounded-full bg-[#00E5FF] animate-ping" />
            <span className="text-[#00E5FF]">
              {activeRouteName ? `🛣️ ${activeRouteName}` : "🛣️ Road Navigation Active"}
            </span>
            {roadDistanceKm && (
              <span className="text-white/80 font-mono text-[11px]">
                · {roadDistanceKm} km ({roadDurationMin}m)
              </span>
            )}
          </div>
        )}
      </div>

      <MapContainer
        center={INDIA_CENTER}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
        preferCanvas={false}
      >
        <TileLayer
          url={tileConfig.url}
          subdomains={tileConfig.subdomains}
          maxZoom={19}
          attribution={tileConfig.attr}
        />

        <MapClickListener onMapClick={onMapClick} />

        {/* ============================================================ */}
        {/* MULTI-LAYERED ROAD FOLLOWING ROUTE POLYLINES                  */}
        {/* ============================================================ */}
        {activeRoad.length >= 2 && (
          <>
            {/* 1. Road Glow Outer Atmosphere */}
            <Polyline
              positions={activeRoad}
              pathOptions={{
                color: "#00E5FF",
                weight: 14,
                opacity: 0.25,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* 2. Asphalt Road Foundation Bed */}
            <Polyline
              positions={activeRoad}
              pathOptions={{
                color: "#0B132B",
                weight: 8,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* 3. Primary Cyan Road Track */}
            <Polyline
              positions={activeRoad}
              pathOptions={{
                color: "#00E5FF",
                weight: 5,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* 4. Center White Road Line Markings */}
            <Polyline
              positions={activeRoad}
              pathOptions={{
                color: "#FFFFFF",
                weight: 2,
                opacity: 0.8,
                dashArray: "8, 12",
                lineCap: "round",
              }}
            />
          </>
        )}

        {/* Live Animated Transit Vehicle Icon Moving Along the Road Route */}
        {currentVehiclePos && activeRoad.length >= 2 && (
          <Marker
            position={[currentVehiclePos[0], currentVehiclePos[1]]}
            icon={makeVehicleIcon("LIVE", activeVehicleNo || "BUS")}
          >
            <Popup>
              <div className="text-xs">
                <b className="text-cyan-600">🚌 Live Vehicle in Transit</b>
                <div>Route: {activeRouteName || "Active Road Corridor"}</div>
                <div>Vehicle No: {activeVehicleNo || "OD-02-KIIT-101"}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Campus Stops */}
        {stops.map((s) => (
          <CircleMarker
            key={s.id || s.name}
            center={[s.lat, s.lng]}
            radius={s.accessible ? 7 : 5}
            pathOptions={{
              color: s.accessible ? "#00E5FF" : "#8E8E93",
              fillColor: s.accessible ? "#00E5FF" : "#3A3A3C",
              fillOpacity: 0.9,
              weight: 2,
            }}
            eventHandlers={{
              click: () => onSelectStop && onSelectStop(s),
            }}
          >
            <Popup>
              <div className="text-xs">
                <b className="font-bold">{s.name}</b>
                <div className="text-[11px] opacity-75 mt-0.5">
                  {s.accessible ? "♿ Accessible Stop (Ramp + Tactile)" : "Standard Stop"}
                </div>
                {onSelectStop && (
                  <button
                    type="button"
                    onClick={() => onSelectStop(s)}
                    className="mt-1.5 text-[10px] font-bold text-[#00E5FF] underline block"
                  >
                    Select as Origin / Destination
                  </button>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* KIIT Campus Hubs */}
        {campuses.map((c) => (
          <Marker
            key={c.id}
            position={[c.lat, c.lng]}
            icon={makeDivIcon("#00E5FF", "🏫", c.short)}
            eventHandlers={{ click: () => onSelectStop && onSelectStop(c) }}
          >
            <Popup>
              <div className="text-xs">
                <b className="text-[#00E5FF]">{c.name}</b>
                <div className="text-[11px] opacity-75">{c.city || "Bhubaneswar"}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Pan-India Transit Hubs (Airports, Railway Stations) */}
        {hubs.map((h) => (
          <Marker
            key={h.id}
            position={[h.lat, h.lng]}
            icon={makeDivIcon(
              h.category === "Airport" ? "#38BDF8" : h.category === "Railway Station" ? "#F59E0B" : "#10B981",
              h.category === "Airport" ? "✈️" : h.category === "Railway Station" ? "🚆" : "🏛️",
              h.short
            )}
            eventHandlers={{ click: () => onSelectStop && onSelectStop(h) }}
          >
            <Popup>
              <div className="text-xs">
                <b>{h.name}</b>
                <div className="text-[11px] opacity-75">{h.category} · {h.city}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Origin Marker (Point A) */}
        {d1 && (
          <Marker position={[d1.lat, d1.lng]} icon={makeDivIcon("#00E5FF", "A", "START")}>
            <Popup>
              <div className="text-xs">
                <b className="text-[#00E5FF]">Origin (Point A)</b>
                <div>{d1.name}</div>
                <span className="text-[10px] opacity-75 font-mono">
                  {d1.lat.toFixed(4)}, {d1.lng.toFixed(4)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker (Point B) */}
        {d2 && (
          <Marker position={[d2.lat, d2.lng]} icon={makeDivIcon("#B24CFF", "B", "DEST")}>
            <Popup>
              <div className="text-xs">
                <b className="text-[#B24CFF]">Destination (Point B)</b>
                <div>{d2.name}</div>
                <span className="text-[10px] opacity-75 font-mono">
                  {d2.lat.toFixed(4)}, {d2.lng.toFixed(4)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* User GPS Location Marker */}
        {userLoc && (
          <CircleMarker
            center={[userLoc.lat, userLoc.lng]}
            radius={10}
            pathOptions={{ color: "#34C759", fillColor: "#34C759", fillOpacity: 0.9, weight: 3 }}
          >
            <Popup><b>You are here (Live GPS)</b></Popup>
          </CircleMarker>
        )}

        {/* Police Stations & Emergency SOS Points */}
        {police.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} icon={makeDivIcon("#FF3B30", "🚨", "POLICE")}>
            <Popup>
              <div className="text-xs">
                <b className="text-red-500">{p.name}</b>
                <div>Emergency: {p.phone}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        <MapController
          d1={d1}
          d2={d2}
          userLoc={userLoc}
          roadCoords={activeRoad}
          selectedRouteCoords={selectedRouteRoadCoords}
        />
      </MapContainer>
    </div>
  );
}
