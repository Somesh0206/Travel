import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons for webpack builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const INDIA_CENTER = [20.5937, 78.9629]; // Central India default

function makeDivIcon(color, glyph = "") {
  return L.divIcon({
    className: "mova-marker",
    html: `<div style="width:30px;height:30px;border-radius:999px;background:${color};display:grid;place-items:center;color:#0a0a0e;font-weight:800;font-family:Outfit;border:2px solid #ffffff;box-shadow:0 4px 12px ${color}88">${glyph}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function MapController({ d1, d2, userLoc, roadCoords }) {
  const map = useMap();

  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); };
  }, [map]);

  useEffect(() => {
    if (roadCoords && roadCoords.length >= 2) {
      const bounds = L.latLngBounds(roadCoords);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } else if (d1 && d2) {
      const bounds = L.latLngBounds([[d1.lat, d1.lng], [d2.lat, d2.lng]]);
      map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16 });
    } else if (d1) {
      map.flyTo([d1.lat, d1.lng], 13, { duration: 1 });
    } else if (d2) {
      map.flyTo([d2.lat, d2.lng], 13, { duration: 1 });
    } else if (userLoc) {
      map.flyTo([userLoc.lat, userLoc.lng], 14, { duration: 0.8 });
    }
  }, [d1, d2, userLoc, roadCoords, map]);

  return null;
}

function MapClickListener({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

export default function MapView({
  theme = "dark",
  stops = [],
  routeStops = [],
  roadCoords = [],
  d1 = null,
  d2 = null,
  userLoc = null,
  police = [],
  liveUsers = [],
  height = "64vh",
  onMapClick = null,
  clickMode = null, // "origin" | "destination" | null
}) {
  const [mapStyle, setMapStyle] = useState("dark"); // "dark" | "streets" | "satellite"

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

  const routeLine = useMemo(() => routeStops.map((s) => [s.lat, s.lng]), [routeStops]);

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 relative isolate shadow-2xl"
      style={{ height }} data-testid="mova-map">
      
      {/* Map Header Overlay Controls */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-2 items-center">
        {/* Style Switcher */}
        <div className="bg-black/75 backdrop-blur-md p-1 rounded-xl border border-white/15 flex gap-1 shadow-lg">
          <button
            type="button"
            onClick={() => setMapStyle("dark")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              mapStyle === "dark" ? "bg-[#00E5FF] text-black" : "text-white/80 hover:text-white"
            }`}
          >
            🌙 Dark
          </button>
          <button
            type="button"
            onClick={() => setMapStyle("streets")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              mapStyle === "streets" ? "bg-[#00E5FF] text-black" : "text-white/80 hover:text-white"
            }`}
          >
            🗺️ Map
          </button>
          <button
            type="button"
            onClick={() => setMapStyle("satellite")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              mapStyle === "satellite" ? "bg-[#00E5FF] text-black" : "text-white/80 hover:text-white"
            }`}
          >
            🛰️ Satellite
          </button>
        </div>

        {/* Map Click Mode Status Indicator */}
        {clickMode && (
          <div className="bg-emerald-500/90 text-black font-bold text-xs px-3 py-1.5 rounded-xl border border-emerald-300 shadow-md animate-pulse">
            📍 Click map to set {clickMode === "origin" ? "Start (Point A)" : "Destination (Point B)"}
          </div>
        )}
      </div>

      <MapContainer center={INDIA_CENTER} zoom={5} scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }} preferCanvas={false}>
        <TileLayer
          url={tileConfig.url}
          subdomains={tileConfig.subdomains}
          maxZoom={19}
          attribution={tileConfig.attr}
        />

        <MapClickListener onMapClick={onMapClick} />

        {stops.map((s) => (
          <CircleMarker key={s.id || s.name} center={[s.lat, s.lng]} radius={6}
            pathOptions={{ color: s.accessible ? "#00E5FF" : "#a0a0b0", fillColor: s.accessible ? "#00E5FF" : "#52526a", fillOpacity: 0.9 }}>
            <Popup>
              <b>{s.name}</b><br />
              {s.accessible ? "Accessible stop" : "Standard stop"}
            </Popup>
          </CircleMarker>
        ))}

        {/* Render Road Polyline following actual street navigation */}
        {roadCoords && roadCoords.length >= 2 ? (
          <>
            <Polyline positions={roadCoords} pathOptions={{ color: "#00E5FF", weight: 6, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
            <Polyline positions={roadCoords} pathOptions={{ color: "#ffffff", weight: 2, opacity: 0.6, dashArray: "6, 8" }} />
          </>
        ) : routeStops.length >= 2 ? (
          <Polyline positions={routeLine} pathOptions={{ color: "#00E5FF", weight: 5, opacity: 0.95, className: "route-line" }} />
        ) : null}

        {d1 && (
          <Marker position={[d1.lat, d1.lng]} icon={makeDivIcon("#00E5FF", "A")}>
            <Popup><b>Start (Point A)</b><br />{d1.name}<br /><span className="text-[10px] opacity-75">{d1.lat.toFixed(4)}, {d1.lng.toFixed(4)}</span></Popup>
          </Marker>
        )}
        {d2 && (
          <Marker position={[d2.lat, d2.lng]} icon={makeDivIcon("#B24CFF", "B")}>
            <Popup><b>Destination (Point B)</b><br />{d2.name}<br /><span className="text-[10px] opacity-75">{d2.lat.toFixed(4)}, {d2.lng.toFixed(4)}</span></Popup>
          </Marker>
        )}

        {userLoc && (
          <CircleMarker center={[userLoc.lat, userLoc.lng]} radius={9}
            pathOptions={{ color: "#34C759", fillColor: "#34C759", fillOpacity: 0.9 }}>
            <Popup>You are here</Popup>
          </CircleMarker>
        )}

        {police.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} icon={makeDivIcon("#FF3B30", "P")}>
            <Popup><b>{p.name}</b><br />{p.phone}</Popup>
          </Marker>
        ))}

        {liveUsers.map((u, i) => (
          <Marker key={i} position={[u.lat, u.lng]} icon={makeDivIcon("#34C759", "U")}>
            <Popup><b>{u.user_name}</b><br />{u.user_email}</Popup>
          </Marker>
        ))}

        <MapController d1={d1} d2={d2} userLoc={userLoc} roadCoords={roadCoords} />
      </MapContainer>
    </div>
  );
}
