import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pinIcon = (color) => new L.DivIcon({
  className: '',
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42"><path fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="1" d="M12 0C7.6 0 4 3.6 4 8c0 6 8 28 8 28s8-22 8-28c0-4.4-3.6-8-8-8z"/><circle fill="#fff" cx="12" cy="8" r="4"/></svg>`,
  iconSize: [28, 42],
  iconAnchor: [14, 42],
  popupAnchor: [0, -42],
});

const riderDot = new L.DivIcon({
  className: '',
  html: '<div style="width:18px;height:18px;background:#2196F3;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 6px rgba(0,0,0,0.5)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -12],
});

const restaurantIcon = pinIcon('#e53935');
const customerIcon = pinIcon('#43a047');

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocode(address) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    return null;
  } catch {
    return null;
  }
}

function MapBounds({ riderPos, restaurantPos, customerPos }) {
  const map = useMap();
  useEffect(() => {
    const valid = [riderPos, restaurantPos, customerPos].filter(Boolean);
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView(valid[0], 15);
    } else {
      try {
        map.fitBounds(valid, { padding: [50, 50] });
      } catch {
        map.setView(valid[0], 13);
      }
    }
  }, [map, riderPos, restaurantPos, customerPos]);
  return null;
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6B7488', fontWeight: 600 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0, boxShadow: '0 0 0 3px rgba(0,0,0,0.04)' }} />
      {label}
    </span>
  );
}

const BEFORE_PICKUP = new Set(['accepted', 'preparing', 'ready']);

export default function DeliveryMap({ activeDelivery }) {
  const [riderPos, setRiderPos] = useState(null);
  const [restaurantPos, setRestaurantPos] = useState(null);
  const [customerPos, setCustomerPos] = useState(null);
  const [geoError, setGeoError] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) { setGeoError(true); return; }
    const opts = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 };
    const onPos = (p) => setRiderPos([p.coords.latitude, p.coords.longitude]);
    const onErr = () => setGeoError(true);
    navigator.geolocation.getCurrentPosition(onPos, onErr, opts);
    const watchId = navigator.geolocation.watchPosition(onPos, onErr, opts);
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    const addr = activeDelivery?.restaurant?.address;
    if (!addr) return;
    geocode(addr).then(setRestaurantPos);
  }, [activeDelivery?.restaurant?.address]);

  // 1.2 s delay on second geocode request to respect Nominatim rate limit (1 req/s)
  useEffect(() => {
    const addr = activeDelivery?.customerAddress;
    if (!addr) return;
    const t = setTimeout(() => geocode(addr).then(setCustomerPos), 1200);
    return () => clearTimeout(t);
  }, [activeDelivery?.customerAddress]);

  const status = activeDelivery?.status;
  const beforePickup = BEFORE_PICKUP.has(status);
  const destPos = beforePickup ? restaurantPos : customerPos;
  const destLabel = beforePickup ? 'restaurant' : 'customer';
  const destAddress = beforePickup
    ? activeDelivery?.restaurant?.address
    : activeDelivery?.customerAddress;

  const distance = riderPos && destPos
    ? haversine(riderPos[0], riderPos[1], destPos[0], destPos[1])
    : null;

  const mapsUrl = destAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destAddress)}&travelmode=driving`
    : null;

  return (
    <div className="tk-slide-up" style={s.wrap}>
      <p style={s.heading}>📍 Live Map</p>

      <div style={s.infoRow}>
        <span style={s.distText}>
          {distance != null
            ? (distance < 1
              ? `${Math.round(distance * 1000)} m to ${destLabel}`
              : `${distance.toFixed(1)} km to ${destLabel}`)
            : destPos
              ? 'Calculating distance…'
              : 'Geocoding addresses…'}
        </span>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="tk-hover tk-press" style={s.navBtn}>
            🗺️ Navigate with Google Maps
          </a>
        )}
      </div>

      {geoError && (
        <p style={s.geoWarn}>⚠️ GPS unavailable — enable location to see your position on the map.</p>
      )}

      <div style={s.mapWrap}>
        <MapContainer
          center={[60.1699, 24.9384]}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapBounds riderPos={riderPos} restaurantPos={restaurantPos} customerPos={customerPos} />
          {riderPos && (
            <Marker position={riderPos} icon={riderDot}>
              <Popup>You are here</Popup>
            </Marker>
          )}
          {restaurantPos && (
            <Marker position={restaurantPos} icon={restaurantIcon}>
              <Popup>🍽️ {activeDelivery?.restaurant?.name}<br />{activeDelivery?.restaurant?.address}</Popup>
            </Marker>
          )}
          {customerPos && (
            <Marker position={customerPos} icon={customerIcon}>
              <Popup>🏠 {activeDelivery?.customerName}<br />{activeDelivery?.customerAddress}</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      <div style={s.legend}>
        <LegendDot color="#2196F3" label="You" />
        <LegendDot color="#e53935" label="Restaurant" />
        <LegendDot color="#43a047" label="Customer" />
      </div>
    </div>
  );
}

const s = {
  wrap: { backgroundColor: '#fff', borderRadius: 16, padding: '18px 18px 14px', marginBottom: 16, boxShadow: '0 1px 3px rgba(26,39,68,0.06), 0 1px 2px rgba(26,39,68,0.08)', border: '1px solid #E4E8F1' },
  heading: { fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#98A0B3', margin: '0 0 12px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' },
  distText: { fontSize: 13, color: '#1A2744', fontWeight: 700 },
  navBtn: { flexShrink: 0, padding: '9px 16px', background: 'linear-gradient(135deg, #1A2744, #253358)', color: '#fff', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 16px rgba(26,39,68,0.08), 0 1px 3px rgba(26,39,68,0.06)' },
  geoWarn: { fontSize: 12, color: '#8a5a00', backgroundColor: '#FFF4E0', padding: '10px 12px', borderRadius: 10, margin: '0 0 12px', border: '1px solid #FFDFA3', fontWeight: 500 },
  mapWrap: { height: 280, borderRadius: 14, overflow: 'hidden', border: '1px solid #E4E8F1' },
  legend: { display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' },
};
