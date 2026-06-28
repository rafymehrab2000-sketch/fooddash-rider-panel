import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = 'https://fooddash-food-delivery-project-production.up.railway.app/api';
const SOCKET_URL = 'https://fooddash-food-delivery-project-production.up.railway.app';
const DELIVERY_KEY = 'riderActiveDelivery';
const PROFILE_KEY = 'riderProfile';

export default function App() {
  const [screen, setScreen] = useState('login');
  const [rider, setRider] = useState(null);
  const [token, setToken] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(() => localStorage.getItem('riderOnline') !== 'false');
  const [orders, setOrders] = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null);
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
  const prevStatusRef = useRef(null);

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

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/rider/available`);
      setOrders(res.data);
    } catch { console.error('Failed to fetch available orders'); }
  }, []);

  const fetchActiveDelivery = useCallback(async () => {
    if (!rider) return;
    try {
      const res = await axios.get(`${API_URL}/rider/my-delivery/${rider.name}`);
      if (res.data) {
        setActiveDelivery(res.data);
        localStorage.setItem(DELIVERY_KEY, JSON.stringify(res.data));
      } else {
        const stored = localStorage.getItem(DELIVERY_KEY);
        if (stored) setActiveDelivery(JSON.parse(stored));
      }
    } catch {
      const stored = localStorage.getItem(DELIVERY_KEY);
      if (stored) setActiveDelivery(JSON.parse(stored));
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
    if (screen === 'available') fetchOrders();
    if (screen === 'active') fetchActiveDelivery();
    if (screen === 'earnings') fetchEarnings();
    if (screen === 'profile') {
      const stored = localStorage.getItem(PROFILE_KEY);
      if (stored) {
        const p = JSON.parse(stored);
        setProfilePhone(p.phone ?? '');
        setProfileYtunnus(p.ytunnus ?? '');
        setProfileVehicle(p.vehicleType ?? 'Scooter');
      }
    }
  }, [screen, fetchOrders, fetchActiveDelivery, fetchEarnings]);

  // Poll GET /orders/:id every 5s on active screen — catches 'ready' status reliably.
  useEffect(() => {
    if (screen !== 'active' || !activeDelivery?.id) return;
    const orderId = activeDelivery.id;
    const poll = async () => {
      try {
        const res = await axios.get(`${API_URL}/orders/${orderId}`);
        const newStatus = res.data?.status;
        if (!newStatus) return;
        console.log(`[poll] order #${orderId} status: "${newStatus}"`);
        setActiveDelivery(prev => {
          if (!prev || prev.status === newStatus) return prev;
          console.log(`[poll] "${prev.status}" → "${newStatus}"`);
          const updated = { ...prev, status: newStatus };
          localStorage.setItem(DELIVERY_KEY, JSON.stringify(updated));
          return updated;
        });
      } catch (err) { console.error('[poll] error:', err.message); }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [screen, activeDelivery?.id]);

  // Single notification trigger for 'ready' — covers both poll and socket.
  useEffect(() => {
    if (activeDelivery?.status === 'ready' && prevStatusRef.current !== 'ready') {
      showToast('🍔 Your order is ready for pickup!');
      if (Notification.permission === 'granted') {
        new Notification('Order Ready for Pickup! 🍔', { body: 'Head to the restaurant — the order is ready!' });
      }
    }
    prevStatusRef.current = activeDelivery?.status ?? null;
  }, [activeDelivery?.status, showToast]);

  useEffect(() => {
    if (!socket) return;
    const handleRiderAvailable = () => { fetchOrders(); };
    const handleNewOrder = () => {
      fetchOrders();
      if (!isOnline) return;
      if (Notification.permission === 'granted') {
        new Notification('New Delivery Available 🛵', { body: 'A new order is ready for pickup!' });
      }
      showToast('New delivery available! 🛵');
    };
    const handleStatusChanged = (data) => {
      console.log('[socket] order_status_changed:', data);
      const { orderId, status } = data ?? {};
      if (!orderId || !status) return;
      const id = Number(orderId);
      setActiveDelivery(prev => {
        if (prev?.id !== id) return prev;
        const updated = { ...prev, status };
        localStorage.setItem(DELIVERY_KEY, JSON.stringify(updated));
        return updated;
      });
    };
    socket.on('rider_available', handleRiderAvailable);
    socket.on('new_order', handleNewOrder);
    socket.on('order_status_changed', handleStatusChanged);
    return () => {
      socket.off('rider_available', handleRiderAvailable);
      socket.off('new_order', handleNewOrder);
      socket.off('order_status_changed', handleStatusChanged);
    };
  }, [socket, fetchOrders, showToast, isOnline]);

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

  const acceptOrder = (order) => {
    setActiveDelivery(order);
    localStorage.setItem(DELIVERY_KEY, JSON.stringify(order));
    setScreen('active');
  };

  const markAsPickedUp = async (id) => {
    setActiveDelivery(prev => {
      if (!prev) return null;
      const updated = { ...prev, status: 'out_for_delivery' };
      localStorage.setItem(DELIVERY_KEY, JSON.stringify(updated));
      return updated;
    });
    try {
      await axios.put(`${API_URL}/rider/${id}/pickup`, { riderName: rider.name });
    } catch { fetchActiveDelivery(); }
  };

  const deliverOrder = async (id) => {
    try { await axios.put(`${API_URL}/rider/${id}/deliver`); } catch { /* swallow */ }
    localStorage.removeItem(DELIVERY_KEY);
    setActiveDelivery(null);
    setScreen('available');
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    const profileData = { phone: profilePhone, ytunnus: profileYtunnus, vehicleType: profileVehicle };
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

  const totalFiltered = filteredEarnings.reduce((s, o) => s + (o.total ?? 0), 0);

  const buildChart = () => {
    if (earningsFilter === 'weekly') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const label = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()];
        const total = filteredEarnings
          .filter(o => new Date(o.createdAt).toDateString() === d.toDateString())
          .reduce((s, o) => s + (o.total ?? 0), 0);
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
        .reduce((s, o) => s + (o.total ?? 0), 0);
      return { label: `W${4 - i}`, total };
    }).reverse();
  };

  const chartData = buildChart();
  const chartMax = Math.max(...chartData.map(d => d.total), 1);

  // ─── Shared nav helpers ──────────────────────────────────────────────────────

  const NavButtons = ({ backTo = 'available' }) => (
    <div style={{ display: 'flex', gap: 6 }}>
      {screen !== 'earnings' && <button style={styles.smallBtn} onClick={() => setScreen('earnings')}>💰 Earnings</button>}
      {screen !== 'profile' && <button style={styles.smallBtn} onClick={() => setScreen('profile')}>👤 Profile</button>}
      {screen !== 'available' && <button style={styles.smallBtn} onClick={() => setScreen(backTo)}>← Back</button>}
    </div>
  );

  const OnlineToggle = () => (
    <div style={styles.toggleWrap} onClick={toggleOnline} title={isOnline ? 'Go offline' : 'Go online'}>
      <div style={{ ...styles.toggleTrack, backgroundColor: isOnline ? '#4CAF50' : '#aaa' }}>
        <div style={{ ...styles.toggleThumb, transform: isOnline ? 'translateX(18px)' : 'translateX(0)' }} />
      </div>
      <span style={styles.toggleLabel}>{isOnline ? 'Online' : 'Offline'}</span>
    </div>
  );

  // ─── LOGIN ───────────────────────────────────────────────────────────────────

  if (screen === 'login') return (
    <div style={styles.container}>
      <div style={styles.loginCard}>
        <h1 style={styles.loginTitle}>🛵 Rider Panel</h1>
        <p style={styles.loginSub}>FoodDash Delivery</p>
        {errorMsg && <p style={styles.errorMsg}>{errorMsg}</p>}
        <input style={styles.input} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input style={styles.input} placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button style={styles.primaryBtn} onClick={login}>Login</button>
      </div>
    </div>
  );

  // ─── AVAILABLE ───────────────────────────────────────────────────────────────

  if (screen === 'available') return (
    <div style={styles.container}>
      {toast && <div style={styles.toast}>{toast}</div>}
      <div style={styles.header}>
        <div>
          <h2 style={styles.headerTitle}>🛵 Available Deliveries</h2>
          <p style={styles.headerSub}>Welcome, {rider?.name}</p>
        </div>
        <div style={styles.headerRight}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <OnlineToggle />
            <div style={{ ...styles.liveChip, backgroundColor: connected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)' }}>
              <span style={{ ...styles.liveDot, backgroundColor: connected ? '#a5d6a7' : '#ffcc80' }} />
              {connected ? 'Live' : 'Connecting…'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button style={styles.smallBtn} onClick={() => setScreen('earnings')}>💰 Earnings</button>
            <button style={styles.smallBtn} onClick={() => setScreen('profile')}>👤 Profile</button>
            <button style={styles.smallBtn} onClick={() => setScreen('active')}>My Delivery</button>
          </div>
        </div>
      </div>

      {!isOnline ? (
        <div style={styles.offlineBanner}>
          <p style={styles.offlineIcon}>🔴</p>
          <p style={styles.offlineTitle}>You're Offline</p>
          <p style={styles.offlineText}>Toggle online to see available deliveries and receive notifications.</p>
        </div>
      ) : (
        <>
          <button style={styles.refreshBtn} onClick={fetchOrders}>🔄 Refresh</button>
          {orders.length === 0 ? (
            <div style={styles.empty}><p style={styles.emptyText}>No deliveries available right now</p></div>
          ) : (
            orders.map(order => (
              <div key={order.id} style={styles.orderCard}>
                <h3 style={styles.orderId}>Order #{order.id}</h3>
                <p style={styles.orderInfo}>📍 Pickup: {order.restaurant?.name} — {order.restaurant?.address}</p>
                {order.restaurant?.phone && <p style={styles.orderInfo}>📞 Restaurant: {order.restaurant.phone}</p>}
                <p style={styles.orderInfo}>🏠 Deliver to: {order.customerAddress}</p>
                <p style={styles.orderInfo}>👤 Customer: {order.customerName}</p>
                <p style={styles.orderInfo}>📞 Customer: {order.customerPhone}</p>
                <p style={styles.orderTotal}>Total: €{order.total}</p>
                <button style={styles.acceptBtn} onClick={() => acceptOrder(order)}>Accept Delivery</button>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );

  // ─── ACTIVE DELIVERY ─────────────────────────────────────────────────────────

  if (screen === 'active') return (
    <div style={styles.container}>
      {toast && <div style={styles.toast}>{toast}</div>}
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>🚴 Active Delivery</h2>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <OnlineToggle />
          <NavButtons />
        </div>
      </div>

      {!activeDelivery ? (
        <div style={styles.empty}><p style={styles.emptyText}>No active delivery</p></div>
      ) : (
        <div style={styles.orderCard}>
          <h3 style={styles.orderId}>Order #{activeDelivery.id}</h3>

          {/* Live status badge */}
          <div style={styles.statusRow}>
            <span style={styles.statusLabel}>Live status:</span>
            <span style={{ ...styles.statusBadge, backgroundColor: STATUS_COLORS[activeDelivery.status] ?? '#ccc' }}>
              {activeDelivery.status}
            </span>
          </div>

          {/* Status banner */}
          {(activeDelivery.status === 'accepted' || activeDelivery.status === 'preparing') && (
            <div style={styles.waitingBanner}>⏳ Waiting for restaurant to prepare your order…</div>
          )}
          {activeDelivery.status === 'ready' && (
            <div style={styles.readyBanner}>🍔 Ready for Pickup!</div>
          )}

          {/* Pickup info */}
          <div style={styles.section}>
            <p style={styles.sectionTitle}>📍 Pickup</p>
            <p style={styles.orderInfo}>{activeDelivery.restaurant?.name}</p>
            <p style={styles.orderInfo}>{activeDelivery.restaurant?.address}</p>
            {activeDelivery.restaurant?.phone ? (
              <a href={`tel:${activeDelivery.restaurant.phone}`} style={styles.callBtn}>
                📞 Call Restaurant — {activeDelivery.restaurant.phone}
              </a>
            ) : (
              <p style={styles.noPhone}>No restaurant phone on file</p>
            )}
          </div>

          {/* Delivery info */}
          <div style={styles.section}>
            <p style={styles.sectionTitle}>🏠 Delivery</p>
            <p style={styles.orderInfo}>{activeDelivery.customerName}</p>
            <p style={styles.orderInfo}>{activeDelivery.customerAddress}</p>
            <a href={`tel:${activeDelivery.customerPhone}`} style={styles.callBtn}>
              📞 Call Customer — {activeDelivery.customerPhone}
            </a>
          </div>

          {/* Special notes */}
          <div style={styles.section}>
            <p style={styles.sectionTitle}>📝 Delivery Notes</p>
            <p style={activeDelivery.notes ? styles.orderInfo : styles.noPhone}>
              {activeDelivery.notes ?? 'No special notes'}
            </p>
          </div>

          <p style={styles.orderTotal}>Total: €{Number(activeDelivery.total).toFixed(2)}</p>

          {activeDelivery.status === 'ready' && (
            <button style={styles.pickupBtn} onClick={() => markAsPickedUp(activeDelivery.id)}>
              🛵 Mark as Picked Up
            </button>
          )}
          {(activeDelivery.status === 'out_for_delivery' || activeDelivery.status === 'picked_up') && (
            <button style={styles.deliverBtn} onClick={() => deliverOrder(activeDelivery.id)}>
              ✅ Mark as Delivered
            </button>
          )}
          {(activeDelivery.status === 'accepted' || activeDelivery.status === 'preparing') && (
            <p style={styles.waitingNote}>Polling every 5s — pickup button appears once restaurant marks ready.</p>
          )}
        </div>
      )}
    </div>
  );

  // ─── EARNINGS ────────────────────────────────────────────────────────────────

  if (screen === 'earnings') return (
    <div style={styles.container}>
      {toast && <div style={styles.toast}>{toast}</div>}
      <div style={styles.navyHeader}>
        <div>
          <h2 style={styles.headerTitle}>💰 Earnings</h2>
          <p style={styles.headerSub}>{rider?.name}</p>
        </div>
        <NavButtons />
      </div>

      {/* Summary card */}
      <div style={styles.amberCard}>
        <p style={styles.amberLabel}>Total Earnings</p>
        <p style={styles.amberTotal}>€{totalFiltered.toFixed(2)}</p>
        <p style={styles.amberSub}>{filteredEarnings.length} deliver{filteredEarnings.length !== 1 ? 'ies' : 'y'} completed</p>
      </div>

      {/* Filter tabs */}
      <div style={styles.filterRow}>
        {['weekly', 'monthly'].map(f => (
          <button
            key={f}
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
          <div key={order.id} style={styles.earningsCard}>
            <div style={styles.earningsRow}>
              <span style={styles.earningsId}>Order #{order.id}</span>
              <span style={styles.earningsAmt}>€{Number(order.total).toFixed(2)}</span>
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
      {toast && <div style={styles.toast}>{toast}</div>}
      <div style={styles.navyHeader}>
        <div>
          <h2 style={styles.headerTitle}>👤 Profile</h2>
          <p style={styles.headerSub}>{rider?.name}</p>
        </div>
        <NavButtons backTo="available" />
      </div>

      {/* Read-only account info */}
      <div style={styles.orderCard}>
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
      <div style={styles.orderCard}>
        <p style={styles.sectionTitle}>Business Details</p>

        <label style={styles.fieldLabel}>Phone Number</label>
        <input
          style={styles.input}
          placeholder="+358 40 123 4567"
          value={profilePhone}
          onChange={e => setProfilePhone(e.target.value)}
        />

        <label style={styles.fieldLabel}>Y-tunnus (Finnish Business ID)</label>
        <input
          style={styles.input}
          placeholder="1234567-8"
          value={profileYtunnus}
          onChange={e => setProfileYtunnus(e.target.value)}
        />

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
          style={{ ...styles.primaryBtn, marginTop: 8, opacity: profileSaving ? 0.7 : 1 }}
          onClick={saveProfile}
          disabled={profileSaving}
        >
          {profileSaving ? 'Saving…' : profileSaved ? '✅ Saved!' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  accepted: '#2196F3',
  preparing: '#9C27B0',
  ready: '#4CAF50',
  out_for_delivery: '#00BCD4',
  picked_up: '#00BCD4',
  delivered: '#888',
};

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#f0f2f5', padding: 20 },

  // Login
  loginCard: { maxWidth: 400, margin: '100px auto', backgroundColor: '#fff', padding: 40, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' },
  loginTitle: { textAlign: 'center', color: '#ff6b35', fontSize: 32, margin: '0 0 8px' },
  loginSub: { textAlign: 'center', color: '#888', marginBottom: 24 },
  errorMsg: { color: 'red', textAlign: 'center', marginBottom: 12 },
  input: { width: '100%', padding: 12, marginBottom: 12, borderRadius: 8, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box', backgroundColor: '#fff' },
  primaryBtn: { width: '100%', padding: 14, backgroundColor: '#ff6b35', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' },

  // Headers
  header: { backgroundColor: '#ff6b35', padding: 20, borderRadius: 12, marginBottom: 20, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  navyHeader: { backgroundColor: '#1a237e', padding: 20, borderRadius: 12, marginBottom: 20, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { margin: '0 0 4px', fontSize: 22, fontWeight: 700 },
  headerSub: { margin: 0, opacity: 0.8, fontSize: 13 },
  headerRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },

  // Live chip
  liveChip: { display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#fff' },
  liveDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },

  // Small nav button
  smallBtn: { backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 },

  // Online toggle
  toggleWrap: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' },
  toggleTrack: { width: 38, height: 20, borderRadius: 10, position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 2, left: 2, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  toggleLabel: { color: '#fff', fontSize: 12, fontWeight: 700 },

  // Offline banner
  offlineBanner: { backgroundColor: '#fff', borderRadius: 12, padding: '48px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  offlineIcon: { fontSize: 40, margin: '0 0 12px' },
  offlineTitle: { fontSize: 20, fontWeight: 700, color: '#333', margin: '0 0 8px' },
  offlineText: { color: '#888', fontSize: 14, margin: 0 },

  // Order cards
  orderCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  orderId: { color: '#ff6b35', margin: '0 0 12px', fontSize: 17, fontWeight: 700 },
  orderInfo: { color: '#555', margin: '4px 0', fontSize: 14 },
  orderTotal: { fontWeight: 'bold', fontSize: 18, margin: '12px 0' },
  acceptBtn: { width: '100%', padding: 12, backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' },
  pickupBtn: { width: '100%', padding: 12, backgroundColor: '#ff6b35', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', marginTop: 8 },
  deliverBtn: { width: '100%', padding: 12, backgroundColor: '#2196F3', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', marginTop: 8 },
  refreshBtn: { marginBottom: 16, padding: '10px 20px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' },

  // Status
  statusRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusLabel: { fontSize: 11, color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' },
  statusBadge: { padding: '3px 10px', borderRadius: 20, color: '#fff', fontSize: 12, fontWeight: 700, textTransform: 'capitalize', fontFamily: 'monospace' },

  // Banners
  waitingBanner: { backgroundColor: '#fff3e0', color: '#e65100', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontWeight: 600, fontSize: 14, border: '1px solid #ffcc80' },
  readyBanner: { backgroundColor: '#e8f5e9', color: '#2e7d32', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontWeight: 700, fontSize: 14, border: '1px solid #a5d6a7' },
  waitingNote: { marginTop: 12, fontSize: 12, color: '#999', textAlign: 'center', fontStyle: 'italic' },

  // Sections inside active card
  section: { borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 12 },
  sectionTitle: { fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', margin: '0 0 6px' },
  callBtn: { display: 'inline-block', marginTop: 6, padding: '8px 14px', backgroundColor: '#e8f5e9', color: '#2e7d32', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid #a5d6a7' },
  noPhone: { color: '#bbb', fontSize: 13, fontStyle: 'italic', margin: '4px 0' },

  // Empty
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyText: { color: '#888', fontSize: 16 },

  // Toast
  toast: { position: 'fixed', top: 20, right: 20, zIndex: 9999, backgroundColor: '#ff6b35', color: '#fff', padding: '14px 20px', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', fontSize: 14, fontWeight: 600 },

  // Earnings
  amberCard: { backgroundColor: '#ffc107', padding: 24, borderRadius: 12, marginBottom: 16, textAlign: 'center' },
  amberLabel: { margin: '0 0 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#5d4037' },
  amberTotal: { margin: '0 0 4px', fontSize: 40, fontWeight: 800, color: '#212121' },
  amberSub: { margin: 0, fontSize: 13, color: '#5d4037' },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16 },
  filterTab: { flex: 1, padding: '10px 0', borderRadius: 8, border: '2px solid #1a237e', backgroundColor: '#fff', color: '#1a237e', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  filterTabActive: { backgroundColor: '#1a237e', color: '#fff' },
  chartCard: { backgroundColor: '#fff', borderRadius: 12, padding: '16px 16px 8px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  chartTitle: { margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' },
  chartArea: { display: 'flex', alignItems: 'flex-end', height: 110, gap: 6 },
  chartCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', backgroundColor: '#ffc107', borderRadius: '4px 4px 0 0', minHeight: 0, transition: 'height 0.3s' },
  chartValue: { fontSize: 9, color: '#1a237e', fontWeight: 700, marginBottom: 2 },
  chartLabel: { fontSize: 10, color: '#888', marginTop: 4 },
  earningsCard: { backgroundColor: '#fff', padding: '14px 18px', borderRadius: 12, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  earningsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  earningsId: { fontWeight: 700, color: '#1a237e', fontSize: 14 },
  earningsAmt: { fontWeight: 800, color: '#2e7d32', fontSize: 15 },
  earningsInfo: { margin: '2px 0', fontSize: 13, color: '#555' },
  earningsDate: { margin: '5px 0 0', fontSize: 11, color: '#aaa' },

  // Profile
  profileRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' },
  profileLabel: { fontSize: 13, color: '#888', fontWeight: 600 },
  profileValue: { fontSize: 14, color: '#333', fontWeight: 600 },
  fieldLabel: { display: 'block', fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, marginTop: 4 },
};
