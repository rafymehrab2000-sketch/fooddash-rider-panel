import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import DeliveryMap from './DeliveryMap';
import SupportChat from './SupportChat';
import OrderChat from './OrderChat';
import InstallPrompt from './InstallPrompt';

const API_URL = 'https://fooddash-food-delivery-project-production.up.railway.app/api';
const SOCKET_URL = 'https://fooddash-food-delivery-project-production.up.railway.app';
const DELIVERY_KEY = 'riderActiveDelivery';
const PROFILE_KEY = 'riderProfile';

function formatFinnishPhone(raw) {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('358')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  digits = digits.slice(0, 9);
  if (!digits) return '';
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += ' ' + digits.slice(2, 5);
  if (digits.length > 5) out += ' ' + digits.slice(5, 9);
  return out;
}

function formatYTunnus(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 7) return digits;
  return digits.slice(0, 7) + '-' + digits.slice(7, 8);
}

const isPhoneValid = phone => /^\d{2} \d{3} \d{4}$/.test(phone);
const isYTunnusValid = ytunnus => /^\d{7}-\d$/.test(ytunnus);

const riderEarning = (order) => Math.round((order?.deliveryFee ?? 0) * 0.975 * 100) / 100;

export default function App() {
  const [screen, setScreen] = useState('login');
  const [rider, setRider] = useState(null);
  const [token, setToken] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(() => localStorage.getItem('riderOnline') !== 'false');
  const [orders, setOrders] = useState([]);
  const [activeDeliveries, setActiveDeliveries] = useState([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState(null);
  const [earnings, setEarnings] = useState([]);
  const [earningsFilter, setEarningsFilter] = useState('weekly');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileYtunnus, setProfileYtunnus] = useState('');
  const [profileVehicle, setProfileVehicle] = useState('Scooter');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [orderChatUnread, setOrderChatUnread] = useState({});
  const [chatOrderId, setChatOrderId] = useState(null);
  const prevStatusesRef = useRef({});
  const totalChatUnread = Object.values(orderChatUnread).reduce((a, b) => a + b, 0);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    else delete axios.defaults.headers.common['Authorization'];
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const s = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    setSocket(s);
    return () => { s.disconnect(); setSocket(null); setConnected(false); };
  }, [token]);

  const hasUnpickedActive = activeDeliveries.some(o => ['accepted', 'preparing', 'ready'].includes(o.status));

  const fetchOrders = useCallback(async () => {
    try {
      const availableRes = await axios.get(`${API_URL}/rider/available`);
      setOrders(availableRes.data.filter(o => o.deliveryType == null || o.deliveryType === 'platform'));

      if (rider) {
        const allRes = await axios.get(`${API_URL}/orders`);
        const mine = allRes.data.filter(
          o => o.assignedRider === rider.name
            && !['delivered', 'cancelled'].includes(o.status)
            && (o.deliveryType == null || o.deliveryType === 'platform')
        );
        setActiveDeliveries(mine);
        localStorage.setItem(DELIVERY_KEY, JSON.stringify(mine));
      }
    } catch {
      console.error('Failed to fetch orders');
      const stored = localStorage.getItem(DELIVERY_KEY);
      if (stored) setActiveDeliveries(JSON.parse(stored));
    }
  }, [rider]);

  const fetchEarnings = useCallback(async () => {
    if (!rider) return;
    try {
      const res = await axios.get(`${API_URL}/orders`);
      const delivered = res.data.filter(
        o => o.status === 'delivered' && o.assignedRider === rider.name
      );
      setEarnings(delivered);
    } catch { console.error('Failed to fetch earnings'); }
  }, [rider]);

  useEffect(() => {
    if (screen === 'available' || screen === 'active') fetchOrders();
    if (screen === 'earnings') fetchEarnings();
    if (screen === 'profile') {
      const stored = localStorage.getItem(PROFILE_KEY);
      if (stored) {
        const p = JSON.parse(stored);
        setProfilePhone(formatFinnishPhone((p.phone ?? '').replace('+358', '')));
        setProfileYtunnus(formatYTunnus(p.ytunnus ?? ''));
        setProfileVehicle(p.vehicleType ?? 'Scooter');
      }
    }
  }, [screen, fetchOrders, fetchEarnings]);

  // Poll GET /orders/:id every 5s per not-yet-ready active delivery — catches 'ready' status reliably.
  const pendingIds = activeDeliveries.filter(o => ['accepted', 'preparing'].includes(o.status)).map(o => o.id).join(',');
  useEffect(() => {
    if (screen !== 'active' || !pendingIds) return;
    const ids = pendingIds.split(',').map(Number);
    const poll = async () => {
      for (const id of ids) {
        try {
          const res = await axios.get(`${API_URL}/orders/${id}`);
          const newStatus = res.data?.status;
          if (!newStatus) continue;
          setActiveDeliveries(prev => {
            const target = prev.find(o => o.id === id);
            if (!target || target.status === newStatus) return prev;
            const updated = prev.map(o => o.id === id ? { ...o, status: newStatus } : o);
            localStorage.setItem(DELIVERY_KEY, JSON.stringify(updated));
            return updated;
          });
        } catch (err) { console.error('[poll] error:', err.message); }
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [screen, pendingIds]);

  // Notification trigger for 'ready' — covers both poll and socket, per delivery.
  useEffect(() => {
    activeDeliveries.forEach(o => {
      if (o.status === 'ready' && prevStatusesRef.current[o.id] !== 'ready') {
        showToast(`🍔 Order #${o.id} is ready for pickup!`);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Order Ready for Pickup! 🍔', { body: `Order #${o.id} — head to the restaurant!` });
        }
      }
    });
    const next = {};
    activeDeliveries.forEach(o => { next[o.id] = o.status; });
    prevStatusesRef.current = next;
  }, [activeDeliveries, showToast]);

  useEffect(() => {
    if (!socket) return;
    const handleRiderAvailable = () => { fetchOrders(); };
    const handleNewOrder = () => {
      fetchOrders();
      if (!isOnline) return;
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('New Delivery Available 🛵', { body: 'A new order is ready for pickup!' });
      }
      showToast('New delivery available! 🛵');
    };
    const handleOrderTaken = (data) => {
      const { orderId } = data ?? {};
      if (!orderId) return;
      const id = Number(orderId);
      setOrders(prev => prev.filter(o => o.id !== id));
    };
    const handleStatusChanged = (data) => {
      const { orderId, status } = data ?? {};
      if (!orderId || !status) return;
      const id = Number(orderId);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      setActiveDeliveries(prev => {
        if (!prev.some(o => o.id === id)) return prev;
        const updated = prev.map(o => o.id === id ? { ...o, status } : o);
        localStorage.setItem(DELIVERY_KEY, JSON.stringify(updated));
        return updated;
      });
    };
    socket.on('rider_available', handleRiderAvailable);
    socket.on('new_order', handleNewOrder);
    socket.on('order_taken', handleOrderTaken);
    socket.on('order_status_changed', handleStatusChanged);
    return () => {
      socket.off('rider_available', handleRiderAvailable);
      socket.off('new_order', handleNewOrder);
      socket.off('order_taken', handleOrderTaken);
      socket.off('order_status_changed', handleStatusChanged);
    };
  }, [socket, fetchOrders, showToast, isOnline]);

  useEffect(() => {
    if (!socket || !rider?.id) return;
    const eventName = `rider_${rider.id}_order_chat_message`;
    const handler = (data) => {
      const { orderId } = data ?? {};
      if (orderId == null) return;
      if (chatOrderId === orderId) return;
      setOrderChatUnread(prev => ({ ...prev, [orderId]: (prev[orderId] || 0) + 1 }));
      showToast(`💬 New message from ${data.customerName || 'customer'} (Order #${orderId})`);
    };
    socket.on(eventName, handler);
    return () => socket.off(eventName, handler);
  }, [socket, rider?.id, chatOrderId, showToast]);

  const openChatBell = () => {
    const unreadOrderId = Object.keys(orderChatUnread).find(id => orderChatUnread[id] > 0);
    const targetId = unreadOrderId ? Number(unreadOrderId) : activeDeliveries[0]?.id;
    if (!targetId) { showToast('No active delivery to chat about'); return; }
    setSelectedDeliveryId(targetId);
    setScreen('active');
    setChatOrderId(targetId);
    setOrderChatUnread(prev => ({ ...prev, [targetId]: 0 }));
  };

  const toggleOnline = () => {
    setIsOnline(prev => {
      const next = !prev;
      localStorage.setItem('riderOnline', String(next));
      return next;
    });
  };

  const login = async () => {
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      if (res.data.user.role !== 'rider') { setErrorMsg('You are not a rider!'); return; }
      if ('Notification' in window) Notification.requestPermission();
      setToken(res.data.token);
      setRider(res.data.user);
      setScreen('available');
    } catch { setErrorMsg('Invalid email or password'); }
  };

  const acceptOrder = async (order) => {
    try {
      const res = await axios.put(`${API_URL}/rider/${order.id}/accept`, { riderName: rider.name });
      const accepted = res.data;
      setOrders(prev => prev.filter(o => o.id !== order.id));
      setActiveDeliveries(prev => {
        const updated = [...prev, accepted];
        localStorage.setItem(DELIVERY_KEY, JSON.stringify(updated));
        return updated;
      });
      setSelectedDeliveryId(accepted.id);
      setScreen('active');
    } catch (err) {
      if (err.response?.status === 409) {
        showToast('Sorry, another rider already took that order.');
        fetchOrders();
      } else {
        showToast('Failed to accept delivery. Please try again.');
      }
    }
  };

  const markAsPickedUp = async (id) => {
    setActiveDeliveries(prev => {
      const updated = prev.map(o => o.id === id ? { ...o, status: 'out_for_delivery' } : o);
      localStorage.setItem(DELIVERY_KEY, JSON.stringify(updated));
      return updated;
    });
    try {
      await axios.put(`${API_URL}/rider/${id}/pickup`, { riderName: rider.name });
    } catch { fetchOrders(); }
  };

  const deliverOrder = async (id) => {
    try { await axios.put(`${API_URL}/rider/${id}/deliver`); } catch { /* swallow */ }
    const remaining = activeDeliveries.filter(o => o.id !== id);
    localStorage.setItem(DELIVERY_KEY, JSON.stringify(remaining));
    setActiveDeliveries(remaining);
    setSelectedDeliveryId(null);
    setScreen(remaining.length > 0 ? 'active' : 'available');
  };

  const saveProfile = async () => {
    if (profileYtunnus && !isYTunnusValid(profileYtunnus)) return;
    setProfileSaving(true);
    const profileData = {
      phone: profilePhone ? `+358 ${profilePhone}` : '',
      ytunnus: profileYtunnus,
      vehicleType: profileVehicle,
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profileData));
    try {
      await axios.put(`${API_URL}/users/profile`, profileData);
    } catch { console.warn('Profile saved locally; backend sync failed'); }
    setProfileSaving(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  // ─── Earnings helpers ────────────────────────────────────────────────────────

  const filteredEarnings = earnings.filter(o => {
    const d = new Date(o.createdAt);
    const cutoff = new Date(Date.now() - (earningsFilter === 'weekly' ? 7 : 30) * 864e5);
    return d >= cutoff;
  });

  const totalFiltered = filteredEarnings.reduce((s, o) => s + riderEarning(o), 0);

  const buildChart = () => {
    if (earningsFilter === 'weekly') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const label = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()];
        const total = filteredEarnings
          .filter(o => new Date(o.createdAt).toDateString() === d.toDateString())
          .reduce((s, o) => s + riderEarning(o), 0);
        return { label, total };
      });
    }
    return Array.from({ length: 4 }, (_, i) => {
      const end = new Date();
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      const total = filteredEarnings
        .filter(o => { const d = new Date(o.createdAt); return d >= start && d < end; })
        .reduce((s, o) => s + riderEarning(o), 0);
      return { label: `W${4 - i}`, total };
    }).reverse();
  };

  const chartData = buildChart();
  const chartMax = Math.max(...chartData.map(d => d.total), 1);

  // ─── Shared nav helpers ──────────────────────────────────────────────────────

  const ChatBell = () => (
    <button className="tk-hover tk-press" style={styles.smallBtn} onClick={openChatBell} title="Messages">
      🔔{totalChatUnread > 0 ? ` ${totalChatUnread}` : ''}
    </button>
  );

  const NavButtons = ({ backTo = 'available' }) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <InstallPrompt />
      <ChatBell />
      {screen !== 'earnings' && <button className="tk-hover tk-press" style={styles.smallBtn} onClick={() => setScreen('earnings')}>💰 Earnings</button>}
      {screen !== 'profile' && <button className="tk-hover tk-press" style={styles.smallBtn} onClick={() => setScreen('profile')}>👤 Profile</button>}
      {screen !== 'available' && <button className="tk-hover tk-press" style={styles.smallBtn} onClick={() => setScreen(backTo)}>← Back</button>}
    </div>
  );

  const OnlineToggle = () => (
    <div className="tk-hover" style={styles.toggleWrap} onClick={toggleOnline} title={isOnline ? 'Go offline' : 'Go online'}>
      <div style={{ ...styles.toggleTrack, backgroundColor: isOnline ? '#2FAE66' : '#8891A5' }}>
        <div style={{ ...styles.toggleThumb, transform: isOnline ? 'translateX(20px)' : 'translateX(0)' }} />
      </div>
      <span style={styles.toggleLabel}>{isOnline ? 'Online' : 'Offline'}</span>
    </div>
  );

  // ─── LOGIN ───────────────────────────────────────────────────────────────────

  if (screen === 'login') return (
    <div style={styles.container}>
      <div className="tk-slide-up" style={styles.loginCard}>
        <img src="/logo.png" alt="Tuokaa" style={styles.loginLogo} />
        <h1 style={styles.loginTitle}>🛵 Rider Panel</h1>
        <p style={styles.loginSub}>Tuokaa Delivery</p>
        {errorMsg && <p style={styles.errorMsg}>{errorMsg}</p>}
        <input
          style={styles.input}
          placeholder="Email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Password"
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') login(); }}
        />
        <button className="tk-hover tk-press" style={styles.primaryBtn} onClick={login}>Login</button>
      </div>
    </div>
  );

  // ─── AVAILABLE ───────────────────────────────────────────────────────────────

  if (screen === 'available') return (
    <div style={styles.container}>
      {toast && <div className="tk-pop" style={styles.toast}>{toast}</div>}
      <div style={styles.header}>
        <div>
          <h2 style={styles.headerTitle}>🛵 Available Deliveries</h2>
          <p style={styles.headerSub}>Welcome, {rider?.name}</p>
        </div>
        <div style={styles.headerRight}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <OnlineToggle />
            <div style={{ ...styles.liveChip, backgroundColor: connected ? 'rgba(245,166,35,0.28)' : 'rgba(255,255,255,0.12)' }}>
              <span className={connected ? 'tk-pulse' : ''} style={{ ...styles.liveDot, backgroundColor: connected ? '#F5A623' : '#ffcc80' }} />
              {connected ? 'Live' : 'Connecting…'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <InstallPrompt />
            <ChatBell />
            <button className="tk-hover tk-press" style={styles.smallBtn} onClick={() => setScreen('earnings')}>💰 Earnings</button>
            <button className="tk-hover tk-press" style={styles.smallBtn} onClick={() => setScreen('profile')}>👤 Profile</button>
            <button className="tk-hover tk-press" style={styles.smallBtn} onClick={() => setScreen('active')}>My Deliveries{activeDeliveries.length > 0 ? ` (${activeDeliveries.length})` : ''}</button>
            <button className="tk-hover tk-press" style={styles.smallBtn} onClick={() => setSupportOpen(true)}>💬 Support</button>
          </div>
        </div>
      </div>

      {supportOpen && <SupportChat onClose={() => setSupportOpen(false)} />}

      {!isOnline ? (
        <div style={styles.offlineBanner}>
          <p style={styles.offlineIcon}>🔴</p>
          <p style={styles.offlineTitle}>You're Offline</p>
          <p style={styles.offlineText}>Toggle online to see available deliveries and receive notifications.</p>
        </div>
      ) : hasUnpickedActive ? (
        <div style={styles.offlineBanner}>
          <p style={styles.offlineIcon}>📦</p>
          <p style={styles.offlineTitle}>Pick up your current order first</p>
          <p style={styles.offlineText}>You have a delivery waiting to be picked up. Complete pickup before accepting new deliveries.</p>
          <button className="tk-hover tk-press" style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={() => setScreen('active')}>View My Deliveries</button>
        </div>
      ) : (
        <>
          <button className="tk-hover tk-press" style={styles.refreshBtn} onClick={fetchOrders}>🔄 Refresh</button>
          {orders.length === 0 ? (
            <div style={styles.empty}><p style={styles.emptyText}>No deliveries available right now</p></div>
          ) : (
            orders.map(order => (
              <div key={order.id} className="tk-hover tk-slide-up" style={styles.orderCard}>
                <h3 style={styles.orderId}>Order #{order.id}</h3>
                <p style={styles.orderInfo}>📍 Pickup: {order.restaurant?.name} — {order.restaurant?.address}</p>
                {order.restaurant?.phone && <p style={styles.orderInfo}>📞 Restaurant: {order.restaurant.phone}</p>}
                <p style={styles.orderInfo}>🏠 Deliver to: {order.customerAddress}</p>
                <p style={styles.orderInfo}>👤 Customer: {order.customerName}</p>
                <p style={styles.orderInfo}>📞 Customer: {order.customerPhone}</p>
                <p style={styles.orderTotal}>🚴 Your earning: €{riderEarning(order).toFixed(2)}</p>
                {order.distance != null && <p style={styles.orderInfo}>📍 {order.distance.toFixed(1)} km</p>}
                <button className="tk-hover tk-press" style={styles.acceptBtn} onClick={() => acceptOrder(order)}>Accept Delivery</button>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );

  // ─── ACTIVE DELIVERIES ───────────────────────────────────────────────────────

  if (screen === 'active') {
    const selected = activeDeliveries.find(o => o.id === selectedDeliveryId) || null;

    if (!selected) return (
      <div style={styles.container}>
        {toast && <div className="tk-pop" style={styles.toast}>{toast}</div>}
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>🚴 Active Deliveries</h2>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <OnlineToggle />
            <NavButtons />
          </div>
        </div>

        {activeDeliveries.length === 0 ? (
          <div style={styles.empty}><p style={styles.emptyText}>No active deliveries</p></div>
        ) : (
          activeDeliveries.map(o => (
            <div key={o.id} className="tk-hover tk-slide-up" style={{ ...styles.orderCard, cursor: 'pointer' }} onClick={() => setSelectedDeliveryId(o.id)}>
              <div style={styles.statusRow}>
                <h3 style={styles.orderId}>Order #{o.id}</h3>
                <span style={{ ...styles.statusBadge, backgroundColor: STATUS_COLORS[o.status] ?? '#ccc' }}>
                  {o.status}
                </span>
              </div>
              <p style={styles.orderInfo}>📍 {o.restaurant?.name}</p>
              <p style={styles.orderInfo}>🏠 {o.customerAddress}</p>
              <p style={styles.orderTotal}>🚴 Your earning: €{riderEarning(o).toFixed(2)}</p>
              {o.distance != null && <p style={styles.orderInfo}>📍 {o.distance.toFixed(1)} km</p>}
              <p style={{ ...styles.waitingNote, textAlign: 'left', fontStyle: 'normal', color: '#ff6b35', fontWeight: 700 }}>Tap to view details →</p>
            </div>
          ))
        )}
      </div>
    );

    return (
      <div style={styles.container}>
        {toast && <div className="tk-pop" style={styles.toast}>{toast}</div>}
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>🚴 Delivery #{selected.id}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <OnlineToggle />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <InstallPrompt />
              <ChatBell />
              <button className="tk-hover tk-press" style={styles.smallBtn} onClick={() => setScreen('earnings')}>💰 Earnings</button>
              <button className="tk-hover tk-press" style={styles.smallBtn} onClick={() => setScreen('profile')}>👤 Profile</button>
              <button className="tk-hover tk-press" style={styles.smallBtn} onClick={() => setSelectedDeliveryId(null)}>← Back to List</button>
            </div>
          </div>
        </div>

        <div className="tk-slide-up" style={styles.orderCard}>
          <h3 style={styles.orderId}>Order #{selected.id}</h3>

          {/* Live status badge */}
          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>Live status:</span>
            <span style={{ ...styles.statusBadge, backgroundColor: STATUS_COLORS[selected.status] ?? '#ccc' }}>
              {selected.status}
            </span>
          </div>

          {/* Status banner */}
          {(selected.status === 'accepted' || selected.status === 'preparing') && (
            <div style={styles.waitingBanner}>⏳ Waiting for restaurant to prepare your order…</div>
          )}
          {selected.status === 'ready' && (
            <div style={styles.readyBanner}>🍔 Ready for Pickup!</div>
          )}

          {/* Pickup info */}
          <div style={styles.section}>
            <p style={styles.sectionTitle}>📍 Pickup</p>
            <p style={styles.orderInfo}>{selected.restaurant?.name}</p>
            <p style={styles.orderInfo}>{selected.restaurant?.address}</p>
            {selected.restaurant?.phone ? (
              <a href={`tel:${selected.restaurant.phone}`} className="tk-hover tk-press" style={styles.callBtn}>
                📞 Call Restaurant — {selected.restaurant.phone}
              </a>
            ) : (
              <p style={styles.noPhone}>No restaurant phone on file</p>
            )}
          </div>

          {/* Delivery info */}
          <div style={styles.section}>
            <p style={styles.sectionTitle}>🏠 Delivery</p>
            <p style={styles.orderInfo}>{selected.customerName}</p>
            <p style={styles.orderInfo}>{selected.customerAddress}</p>
            <a href={`tel:${selected.customerPhone}`} className="tk-hover tk-press" style={styles.callBtn}>
              📞 Call Customer — {selected.customerPhone}
            </a>
            {(selected.status === 'out_for_delivery' || selected.status === 'picked_up') && (
              <button
                className="tk-hover tk-press"
                style={{ ...styles.callBtn, background: 'none', border: '1.5px solid #F5A623', color: '#D98C0F', cursor: 'pointer', marginTop: 8 }}
                onClick={() => { setChatOrderId(selected.id); setOrderChatUnread(prev => ({ ...prev, [selected.id]: 0 })); }}
              >
                💬 Message Customer
              </button>
            )}
          </div>

          {/* Special notes */}
          <div style={styles.section}>
            <p style={styles.sectionTitle}>📝 Delivery Notes</p>
            <p style={selected.notes ? styles.orderInfo : styles.noPhone}>
              {selected.notes ?? 'No special notes'}
            </p>
          </div>

          <p style={styles.orderTotal}>🚴 Your earning: €{riderEarning(selected).toFixed(2)}</p>
          {selected.distance != null && <p style={styles.orderInfo}>📍 {selected.distance.toFixed(1)} km</p>}

          {selected.status === 'ready' && (
            <button className="tk-hover tk-press" style={styles.pickupBtn} onClick={() => markAsPickedUp(selected.id)}>
              🛵 Mark as Picked Up
            </button>
          )}
          {(selected.status === 'out_for_delivery' || selected.status === 'picked_up') && (
            <button className="tk-hover tk-press" style={styles.deliverBtn} onClick={() => deliverOrder(selected.id)}>
              ✅ Mark as Delivered
            </button>
          )}
          {(selected.status === 'accepted' || selected.status === 'preparing') && (
            <p style={styles.waitingNote}>Polling every 5s — pickup button appears once restaurant marks ready.</p>
          )}
        </div>
        <DeliveryMap activeDelivery={selected} />
        {chatOrderId === selected.id && (
          <OrderChat
            orderId={selected.id}
            customerName={selected.customerName}
            socket={socket}
            onClose={() => setChatOrderId(null)}
          />
        )}
      </div>
    );
  }

  // ─── EARNINGS ────────────────────────────────────────────────────────────────

  if (screen === 'earnings') return (
    <div style={styles.container}>
      {toast && <div className="tk-pop" style={styles.toast}>{toast}</div>}
      <div style={styles.navyHeader}>
        <div>
          <h2 style={styles.headerTitle}>💰 Earnings</h2>
          <p style={styles.headerSub}>{rider?.name}</p>
        </div>
        <NavButtons />
      </div>

      {/* Summary card */}
      <div className="tk-slide-up" style={styles.amberCard}>
        <p style={styles.amberLabel}>Total Earnings</p>
        <p style={styles.amberTotal}>€{totalFiltered.toFixed(2)}</p>
        <p style={styles.amberSub}>{filteredEarnings.length} deliver{filteredEarnings.length !== 1 ? 'ies' : 'y'} completed</p>
      </div>

      {/* Filter tabs */}
      <div style={styles.filterRow}>
        {['weekly', 'monthly'].map(f => (
          <button
            key={f}
            className="tk-hover tk-press"
            style={{ ...styles.filterTab, ...(earningsFilter === f ? styles.filterTabActive : {}) }}
            onClick={() => setEarningsFilter(f)}
          >
            {f === 'weekly' ? 'This Week' : 'This Month'}
          </button>
        ))}
      </div>

      {/* Bar chart */}
      <div style={styles.chartCard}>
        <p style={styles.chartTitle}>{earningsFilter === 'weekly' ? 'Daily Earnings (last 7 days)' : 'Weekly Earnings (last 4 weeks)'}</p>
        <div style={styles.chartArea}>
          {chartData.map((d, i) => (
            <div key={i} style={styles.chartCol}>
              {d.total > 0 && <span style={styles.chartValue}>€{d.total.toFixed(0)}</span>}
              <div style={{ ...styles.chartBar, height: `${Math.max((d.total / chartMax) * 100, d.total > 0 ? 4 : 0)}%` }} />
              <span style={styles.chartLabel}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Order list */}
      {filteredEarnings.length === 0 ? (
        <div style={styles.empty}><p style={styles.emptyText}>No completed deliveries in this period</p></div>
      ) : (
        filteredEarnings.map(order => (
          <div key={order.id} className="tk-hover" style={styles.earningsCard}>
            <div style={styles.earningsRow}>
              <span style={styles.earningsId}>Order #{order.id}</span>
              <span style={styles.earningsAmt}>Earned: €{riderEarning(order).toFixed(2)}</span>
            </div>
            <p style={styles.earningsInfo}>🍽️ {order.restaurant?.name}</p>
            <p style={styles.earningsInfo}>🏠 {order.customerAddress}</p>
            <p style={styles.earningsDate}>
              {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IE', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
              }) : '—'}
            </p>
          </div>
        ))
      )}
    </div>
  );

  // ─── PROFILE ─────────────────────────────────────────────────────────────────

  if (screen === 'profile') return (
    <div style={styles.container}>
      {toast && <div className="tk-pop" style={styles.toast}>{toast}</div>}
      <div style={styles.navyHeader}>
        <div>
          <h2 style={styles.headerTitle}>👤 Profile</h2>
          <p style={styles.headerSub}>{rider?.name}</p>
        </div>
        <NavButtons backTo="available" />
      </div>

      {/* Read-only account info */}
      <div className="tk-slide-up" style={styles.orderCard}>
        <p style={styles.sectionTitle}>Account</p>
        <div style={styles.profileRow}>
          <span style={styles.profileLabel}>Name</span>
          <span style={styles.profileValue}>{rider?.name}</span>
        </div>
        <div style={styles.profileRow}>
          <span style={styles.profileLabel}>Email</span>
          <span style={styles.profileValue}>{rider?.email}</span>
        </div>
      </div>

      {/* Editable fields */}
      <div className="tk-slide-up" style={styles.orderCard}>
        <p style={styles.sectionTitle}>Business Details</p>

        <label style={styles.fieldLabel}>Phone Number</label>
        <div style={styles.phoneInputWrap}>
          <span style={styles.phonePrefix}>+358</span>
          <input
            style={styles.phoneInput}
            placeholder="40 123 4567"
            value={profilePhone}
            onChange={e => setProfilePhone(formatFinnishPhone(e.target.value))}
          />
          {profilePhone && (
            <span style={{ color: isPhoneValid(profilePhone) ? '#2e7d32' : '#c62828', fontSize: 14, flexShrink: 0 }}>
              {isPhoneValid(profilePhone) ? '✓' : '✗'}
            </span>
          )}
        </div>
        <p style={styles.fieldHint}>Format: +358 XX XXX XXXX</p>

        <label style={styles.fieldLabel}>Y-tunnus (Finnish Business ID)</label>
        <input
          style={styles.input}
          placeholder="1234567-8"
          value={profileYtunnus}
          onChange={e => setProfileYtunnus(formatYTunnus(e.target.value))}
        />
        <p style={profileYtunnus && !isYTunnusValid(profileYtunnus) ? styles.fieldHintError : styles.fieldHint}>
          {profileYtunnus && !isYTunnusValid(profileYtunnus)
            ? 'Invalid format — use 7 digits, a dash, then 1 check digit (e.g. 1234567-8)'
            : 'Format: XXXXXXX-X (7 digits, dash, 1 check digit)'}
        </p>

        <label style={styles.fieldLabel}>Vehicle Type</label>
        <select
          style={{ ...styles.input, cursor: 'pointer' }}
          value={profileVehicle}
          onChange={e => setProfileVehicle(e.target.value)}
        >
          {['Bicycle', 'Scooter', 'Car', 'Walking'].map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <button
          className="tk-hover tk-press"
          style={{ ...styles.primaryBtn, marginTop: 8, opacity: (profileSaving || (profileYtunnus && !isYTunnusValid(profileYtunnus))) ? 0.7 : 1 }}
          onClick={saveProfile}
          disabled={profileSaving || (profileYtunnus && !isYTunnusValid(profileYtunnus))}
        >
          {profileSaving ? 'Saving…' : profileSaved ? '✅ Saved!' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  accepted: '#2F80ED',
  preparing: '#8355C7',
  ready: '#2FAE66',
  out_for_delivery: '#1AA6B7',
  picked_up: '#1AA6B7',
  delivered: '#98A0B3',
};

const NAVY = '#1A2744';
const NAVY_LIGHT = '#253358';
const AMBER = '#F5A623';
const AMBER_DARK = '#D98C0F';

const styles = {
  container: { minHeight: '100vh', background: 'linear-gradient(180deg, #EEF1F8 0%, #E7EBF5 100%)', padding: 'clamp(14px, 4vw, 28px)', maxWidth: 620, margin: '0 auto', boxSizing: 'border-box' },

  // Login
  loginCard: { maxWidth: 420, margin: 'clamp(40px, 14vh, 110px) auto', backgroundColor: '#fff', padding: 'clamp(32px, 6vw, 44px) clamp(24px, 6vw, 36px)', borderRadius: 22, boxShadow: '0 12px 32px rgba(26,39,68,0.14), 0 2px 8px rgba(26,39,68,0.08)', border: '1px solid #E4E8F1' },
  loginLogo: { display: 'block', width: 72, height: 72, borderRadius: 18, objectFit: 'cover', margin: '0 auto 18px', boxShadow: '0 1px 3px rgba(26,39,68,0.06), 0 1px 2px rgba(26,39,68,0.08)' },
  loginTitle: { textAlign: 'center', color: NAVY, fontSize: 27, fontWeight: 800, letterSpacing: '-0.3px', margin: '0 0 4px' },
  loginSub: { textAlign: 'center', color: '#6B7488', marginBottom: 30, fontSize: 14, fontWeight: 500 },
  errorMsg: { color: '#E5484D', textAlign: 'center', marginBottom: 16, fontSize: 13, fontWeight: 600, backgroundColor: '#FDEDED', padding: '10px 14px', borderRadius: 10, border: '1px solid #F6C6C7' },
  input: { width: '100%', padding: '13px 14px', marginBottom: 14, borderRadius: 10, border: '1.5px solid #E4E8F1', fontSize: 16, boxSizing: 'border-box', backgroundColor: '#fff', color: NAVY, transition: 'border-color .15s' },
  primaryBtn: { width: '100%', padding: 15, background: `linear-gradient(135deg, ${AMBER} 0%, ${AMBER_DARK} 100%)`, color: NAVY, border: 'none', borderRadius: 10, fontSize: 15.5, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.2px', boxShadow: '0 6px 18px rgba(245,166,35,0.35)' },

  // Headers
  header: { background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_LIGHT} 100%)`, padding: 'clamp(16px,4vw,22px) clamp(16px,4vw,24px)', borderRadius: 22, marginBottom: 20, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 16px rgba(26,39,68,0.08), 0 1px 3px rgba(26,39,68,0.06)', gap: 12, flexWrap: 'wrap', borderBottom: `3px solid ${AMBER}` },
  navyHeader: { background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_LIGHT} 100%)`, padding: 'clamp(16px,4vw,22px) clamp(16px,4vw,24px)', borderRadius: 22, marginBottom: 20, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 16px rgba(26,39,68,0.08), 0 1px 3px rgba(26,39,68,0.06)', gap: 12, flexWrap: 'wrap' },
  headerTitle: { margin: '0 0 4px', fontSize: 'clamp(19px,4vw,23px)', fontWeight: 800, letterSpacing: '-0.3px' },
  headerSub: { margin: 0, opacity: 0.75, fontSize: 13, fontWeight: 500 },
  headerRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },

  // Live chip
  liveChip: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '0.3px' },
  liveDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },

  // Small nav button
  smallBtn: { backgroundColor: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.28)', padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.1px' },

  // Online toggle
  toggleWrap: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', padding: '4px 10px 4px 4px', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.10)' },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, position: 'relative', transition: 'background-color 0.2s', flexShrink: 0, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)' },
  toggleThumb: { position: 'absolute', top: 3, left: 3, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff', transition: 'transform 0.25s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 1px 4px rgba(0,0,0,0.35)' },
  toggleLabel: { color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.3px' },

  // Offline banner
  offlineBanner: { backgroundColor: '#fff', borderRadius: 22, padding: 'clamp(36px,8vw,56px) 24px', textAlign: 'center', boxShadow: '0 4px 16px rgba(26,39,68,0.08), 0 1px 3px rgba(26,39,68,0.06)', border: '1px solid #E4E8F1' },
  offlineIcon: { fontSize: 44, margin: '0 0 14px' },
  offlineTitle: { fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 8px' },
  offlineText: { color: '#6B7488', fontSize: 14, margin: 0, lineHeight: 1.5 },

  // Order cards
  orderCard: { backgroundColor: '#fff', padding: 'clamp(18px,4vw,22px)', borderRadius: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(26,39,68,0.06), 0 1px 2px rgba(26,39,68,0.08)', border: '1px solid #E4E8F1' },
  orderId: { color: NAVY, margin: '0 0 12px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.2px' },
  orderInfo: { color: '#6B7488', margin: '5px 0', fontSize: 14, lineHeight: 1.5 },
  orderTotal: { fontWeight: 800, fontSize: 19, margin: '14px 0', color: NAVY },
  acceptBtn: { width: '100%', padding: 14, background: `linear-gradient(135deg, ${AMBER}, ${AMBER_DARK})`, color: NAVY, border: 'none', borderRadius: 10, fontSize: 15.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 18px rgba(245,166,35,0.35)' },
  pickupBtn: { width: '100%', padding: 14, background: `linear-gradient(135deg, ${AMBER}, ${AMBER_DARK})`, color: NAVY, border: 'none', borderRadius: 10, fontSize: 15.5, fontWeight: 700, cursor: 'pointer', marginTop: 8, boxShadow: '0 6px 18px rgba(245,166,35,0.35)' },
  deliverBtn: { width: '100%', padding: 14, background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`, color: '#fff', border: 'none', borderRadius: 10, fontSize: 15.5, fontWeight: 700, cursor: 'pointer', marginTop: 8, boxShadow: '0 4px 16px rgba(26,39,68,0.08), 0 1px 3px rgba(26,39,68,0.06)' },
  refreshBtn: { marginBottom: 16, padding: '11px 20px', backgroundColor: '#fff', border: '1.5px solid #E4E8F1', borderRadius: 10, cursor: 'pointer', fontWeight: 600, color: NAVY, fontSize: 13.5 },

  // Status
  statusRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusLabel: { fontSize: 11, color: '#98A0B3', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' },
  statusBadge: { padding: '4px 12px', borderRadius: 20, color: '#fff', fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.3px', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' },

  // Banners
  waitingBanner: { backgroundColor: '#FFF4E0', color: '#8a5a00', borderRadius: 10, padding: '13px 16px', marginBottom: 16, fontWeight: 600, fontSize: 14, border: '1px solid #FFDFA3' },
  readyBanner: { backgroundColor: '#E7F7EE', color: '#1E7F4B', borderRadius: 10, padding: '13px 16px', marginBottom: 16, fontWeight: 700, fontSize: 14, border: '1px solid #B7E9CC' },
  waitingNote: { marginTop: 12, fontSize: 12, color: '#98A0B3', textAlign: 'center', fontStyle: 'italic' },

  // Sections inside active card
  section: { borderTop: '1px solid #E4E8F1', paddingTop: 14, marginBottom: 14 },
  sectionTitle: { fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#98A0B3', margin: '0 0 8px' },
  callBtn: { display: 'inline-block', marginTop: 8, padding: '10px 16px', backgroundColor: '#E7F7EE', color: '#1E7F4B', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', border: '1px solid #B7E9CC' },
  noPhone: { color: '#98A0B3', fontSize: 13, fontStyle: 'italic', margin: '4px 0' },

  // Empty
  empty: { textAlign: 'center', padding: '70px 20px' },
  emptyText: { color: '#6B7488', fontSize: 16, fontWeight: 500 },

  // Toast
  toast: { position: 'fixed', top: 20, right: 20, zIndex: 9999, background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`, color: '#fff', padding: '15px 20px', borderRadius: 12, boxShadow: '0 12px 32px rgba(26,39,68,0.14), 0 2px 8px rgba(26,39,68,0.08)', fontSize: 13.5, fontWeight: 600, borderLeft: `4px solid ${AMBER}`, maxWidth: '86vw' },

  // Earnings
  amberCard: { background: `linear-gradient(135deg, ${AMBER} 0%, ${AMBER_DARK} 100%)`, padding: 28, borderRadius: 22, marginBottom: 18, textAlign: 'center', boxShadow: '0 6px 18px rgba(245,166,35,0.35)' },
  amberLabel: { margin: '0 0 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'rgba(26,39,68,0.75)' },
  amberTotal: { margin: '0 0 6px', fontSize: 42, fontWeight: 800, color: NAVY, letterSpacing: '-0.5px' },
  amberSub: { margin: 0, fontSize: 13, fontWeight: 600, color: 'rgba(26,39,68,0.7)' },
  filterRow: { display: 'flex', gap: 10, marginBottom: 18 },
  filterTab: { flex: 1, padding: '11px 0', borderRadius: 10, border: `1.5px solid ${NAVY}`, backgroundColor: '#fff', color: NAVY, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  filterTabActive: { backgroundColor: NAVY, color: '#fff', boxShadow: '0 1px 3px rgba(26,39,68,0.06), 0 1px 2px rgba(26,39,68,0.08)' },
  chartCard: { backgroundColor: '#fff', borderRadius: 16, padding: '18px 18px 10px', marginBottom: 18, boxShadow: '0 1px 3px rgba(26,39,68,0.06), 0 1px 2px rgba(26,39,68,0.08)', border: '1px solid #E4E8F1' },
  chartTitle: { margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: '#98A0B3', textTransform: 'uppercase', letterSpacing: '0.6px' },
  chartArea: { display: 'flex', alignItems: 'flex-end', height: 120, gap: 8 },
  chartCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', background: `linear-gradient(180deg, ${AMBER}, ${AMBER_DARK})`, borderRadius: '6px 6px 2px 2px', minHeight: 0, transition: 'height 0.3s ease' },
  chartValue: { fontSize: 9.5, color: NAVY, fontWeight: 700, marginBottom: 4 },
  chartLabel: { fontSize: 10.5, color: '#98A0B3', marginTop: 6, fontWeight: 600 },
  earningsCard: { backgroundColor: '#fff', padding: '15px 18px', borderRadius: 16, marginBottom: 10, boxShadow: '0 1px 3px rgba(26,39,68,0.06), 0 1px 2px rgba(26,39,68,0.08)', border: '1px solid #E4E8F1' },
  earningsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  earningsId: { fontWeight: 700, color: NAVY, fontSize: 14 },
  earningsAmt: { fontWeight: 800, color: '#1E7F4B', fontSize: 15.5 },
  earningsInfo: { margin: '2px 0', fontSize: 13, color: '#6B7488' },
  earningsDate: { margin: '6px 0 0', fontSize: 11, color: '#98A0B3', fontWeight: 500 },

  // Profile
  profileRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #E4E8F1' },
  profileLabel: { fontSize: 13, color: '#6B7488', fontWeight: 600 },
  profileValue: { fontSize: 14, color: NAVY, fontWeight: 700 },
  fieldLabel: { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#6B7488', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6, marginTop: 6 },
  phoneInputWrap: { display: 'flex', alignItems: 'center', width: '100%', padding: '0 14px', marginBottom: 6, borderRadius: 10, border: '1.5px solid #E4E8F1', backgroundColor: '#fff', boxSizing: 'border-box' },
  phonePrefix: { fontSize: 15, fontWeight: 700, color: '#6B7488', marginRight: 8, flexShrink: 0 },
  phoneInput: { flex: 1, minWidth: 0, padding: '13px 0', border: 'none', outline: 'none', fontSize: 16, backgroundColor: 'transparent', color: NAVY },
  fieldHint: { fontSize: 11.5, color: '#98A0B3', margin: '0 0 14px' },
  fieldHintError: { fontSize: 11.5, color: '#E5484D', margin: '0 0 14px', fontWeight: 600 },
};
