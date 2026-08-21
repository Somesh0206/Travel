import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons for webpack builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const KIIT_CENTER = [20.3558, 85.8175];

function makeDivIcon(color, glyph = "") {
  return L.divIcon({
    className: "mova-marker",
    html: `<div style="width:28px;height:28px;border-radius:999px;background:${color};display:grid;place-items:center;color:#0a0a0e;font-weight:700;font-family:Outfit;border:2px solid #0a0a0e;box-shadow:0 0 0 2px ${color}55">${glyph}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function MapController({ d1, d2, userLoc }) {
  const map = useMap();

  // Fix rendering after mount / container resize
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); };
  }, [map]);

  // Fit bounds to route or fly to user
  useEffect(() => {
    if (d1 && d2) {
      const bounds = L.latLngBounds([[d1.lat, d1.lng], [d2.lat, d2.lng]]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } else if (userLoc) {
      map.flyTo([userLoc.lat, userLoc.lng], 15, { duration: 0.7 });
    }
  }, [d1, d2, userLoc, map]);

  return null;
}

export default function MapView({
  theme = "dark",
  stops = [],
  routeStops = [],
  d1 = null,
  d2 = null,
  userLoc = null,
  police = [],
  liveUsers = [],
  height = "60vh",
}) {
  const tileUrl = theme === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  const routeLine = useMemo(() => routeStops.map((s) => [s.lat, s.lng]), [routeStops]);

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 relative isolate"
      style={{ height }} data-testid="mova-map">
      <MapContainer center={KIIT_CENTER} zoom={13} scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }} preferCanvas={false}>
        <TileLayer url={tileUrl}
          subdomains={["a", "b", "c", "d"]}
          maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' />

        {stops.map((s) => (
          <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={6}
            pathOptions={{ color: s.accessible ? "#00E5FF" : "#a0a0b0", fillColor: s.accessible ? "#00E5FF" : "#52526a", fillOpacity: 0.9 }}>
            <Popup>
              <b>{s.name}</b><br />
              {s.accessible ? "Accessible stop" : "Standard stop"}
            </Popup>
          </CircleMarker>
        ))}

        {routeStops.length >= 2 && (
          <Polyline positions={routeLine} pathOptions={{ color: "#00E5FF", weight: 5, opacity: 0.95, className: "route-line" }} />
        )}

        {d1 && (
          <Marker position={[d1.lat, d1.lng]} icon={makeDivIcon("#00E5FF", "A")}>
            <Popup><b>Start</b><br />{d1.name}</Popup>
          </Marker>
        )}
        {d2 && (
          <Marker position={[d2.lat, d2.lng]} icon={makeDivIcon("#B24CFF", "B")}>
            <Popup><b>Destination</b><br />{d2.name}</Popup>
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

        <MapController d1={d1} d2={d2} userLoc={userLoc} />
      </MapContainer>
    </div>
  );
}
