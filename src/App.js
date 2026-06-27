import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = 'https://fooddash-food-delivery-project-production.up.railway.app/api';
const SOCKET_URL = 'https://fooddash-food-delivery-project-production.up.railway.app';

export default function App() {
  const [screen, setScreen] = useState('login');
  const [rider, setRider] = useState(null);
  const [token, setToken] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [orders, setOrders] = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Connect socket when token is available
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

    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  const fetchOrders = useCallback(async () => {
    const res = await axios.get(`${API_URL}/rider/available`);
    setOrders(res.data);
  }, []);

  const fetchActiveDelivery = useCallback(async () => {
    if (!rider) return;
    const res = await axios.get(`${API_URL}/rider/my-delivery/${rider.name}`);
    setActiveDelivery(res.data);
  }, [rider]);

  // Initial data fetch when screen changes
  useEffect(() => {
    if (screen === 'available') fetchOrders();
    if (screen === 'active') fetchActiveDelivery();
  }, [screen, fetchOrders, fetchActiveDelivery]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleRiderAvailable = () => {
      fetchOrders();
      if (Notification.permission === 'granted') {
        new Notification('New Delivery Available 🛵', {
          body: 'A new order is ready for pickup!',
        });
      }
      showToast('New delivery available! 🛵');
    };

    const handleStatusChanged = (data) => {
      const { orderId, status } = data ?? {};
      if (!orderId || !status) return;
      setActiveDelivery(prev =>
        prev?.id === orderId ? { ...prev, status } : prev
      );
    };

    socket.on('rider_available', handleRiderAvailable);
    socket.on('order_status_changed', handleStatusChanged);

    return () => {
      socket.off('rider_available', handleRiderAvailable);
      socket.off('order_status_changed', handleStatusChanged);
    };
  }, [socket, fetchOrders, showToast]);

  const login = async () => {
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      if (res.data.user.role !== 'rider') {
        setErrorMsg('You are not a rider!');
        return;
      }
      if ('Notification' in window) Notification.requestPermission();
      setToken(res.data.token);
      setRider(res.data.user);
      setScreen('available');
    } catch (err) {
      setErrorMsg('Invalid email or password');
    }
  };

  const pickupOrder = async (id) => {
    await axios.put(`${API_URL}/rider/${id}/pickup`, { riderName: rider.name });
    setScreen('active');
  };

  const deliverOrder = async (id) => {
    await axios.put(`${API_URL}/rider/${id}/deliver`);
    setActiveDelivery(null);
    setScreen('available');
  };

  if (screen === 'login') return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🛵 Rider Panel</h1>
        <p style={styles.subtitle}>FoodDash Delivery</p>
        {errorMsg && <p style={styles.errorMsg}>{errorMsg}</p>}
        <input style={styles.input} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input style={styles.input} placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button style={styles.button} onClick={login}>Login</button>
      </div>
    </div>
  );

  if (screen === 'available') return (
    <div style={styles.container}>
      {toast && <div style={styles.toast}>{toast}</div>}
      <div style={styles.header}>
        <div>
          <h2 style={styles.headerTitle}>🛵 Available Deliveries</h2>
          <p style={styles.headerSub}>Welcome, {rider?.name}</p>
        </div>
        <div style={styles.headerRight}>
          <div style={{ ...styles.liveChip, backgroundColor: connected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)' }}>
            <span style={{ ...styles.liveDot, backgroundColor: connected ? '#a5d6a7' : '#ffcc80' }} />
            {connected ? 'Live' : 'Connecting…'}
          </div>
          <button style={styles.smallButton} onClick={() => setScreen('active')}>My Active Delivery</button>
        </div>
      </div>
      <button style={styles.refreshBtn} onClick={fetchOrders}>🔄 Refresh</button>
      {orders.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>No deliveries available right now</p>
        </div>
      ) : (
        orders.map(order => (
          <div key={order.id} style={styles.orderCard}>
            <h3 style={styles.orderId}>Order #{order.id}</h3>
            <p style={styles.orderInfo}>📍 Pickup: {order.restaurant.name} - {order.restaurant.address}</p>
            <p style={styles.orderInfo}>🏠 Deliver to: {order.customerAddress}</p>
            <p style={styles.orderInfo}>👤 Customer: {order.customerName}</p>
            <p style={styles.orderInfo}>📞 Phone: {order.customerPhone}</p>
            <p style={styles.orderTotal}>Total: €{order.total}</p>
            <button style={styles.acceptBtn} onClick={() => pickupOrder(order.id)}>Accept Delivery</button>
          </div>
        ))
      )}
    </div>
  );

  if (screen === 'active') return (
    <div style={styles.container}>
      {toast && <div style={styles.toast}>{toast}</div>}
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>🚴 Active Delivery</h2>
        <button style={styles.smallButton} onClick={() => setScreen('available')}>← Back</button>
      </div>
      {!activeDelivery ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>No active delivery</p>
        </div>
      ) : (
        <div style={styles.orderCard}>
          <h3 style={styles.orderId}>Order #{activeDelivery.id}</h3>
          <p style={styles.orderInfo}>📍 Pickup: {activeDelivery.restaurant.name}</p>
          <p style={styles.orderInfo}>📍 Address: {activeDelivery.restaurant.address}</p>
          <p style={styles.orderInfo}>🏠 Deliver to: {activeDelivery.customerAddress}</p>
          <p style={styles.orderInfo}>👤 Customer: {activeDelivery.customerName}</p>
          <p style={styles.orderInfo}>📞 Phone: {activeDelivery.customerPhone}</p>
          <p style={styles.orderTotal}>Total: €{activeDelivery.total}</p>
          <button style={styles.deliverBtn} onClick={() => deliverOrder(activeDelivery.id)}>✅ Mark as Delivered</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#f0f2f5', padding: '20px' },
  card: { maxWidth: '400px', margin: '100px auto', backgroundColor: '#fff', padding: '40px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' },
  title: { textAlign: 'center', color: '#ff6b35', fontSize: '32px', margin: '0 0 8px' },
  subtitle: { textAlign: 'center', color: '#888', marginBottom: '24px' },
  errorMsg: { color: 'red', textAlign: 'center', marginBottom: '12px' },
  input: { width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box' },
  button: { width: '100%', padding: '14px', backgroundColor: '#ff6b35', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' },
  header: { backgroundColor: '#ff6b35', padding: '20px', borderRadius: '12px', marginBottom: '20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { margin: '0 0 4px', fontSize: '24px' },
  headerSub: { margin: 0, opacity: 0.8, fontSize: '14px' },
  headerRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 },
  liveChip: { display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#fff' },
  liveDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  smallButton: { backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' },
  refreshBtn: { marginBottom: '16px', padding: '10px 20px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' },
  orderCard: { backgroundColor: '#fff', padding: '20px', borderRadius: '12px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  orderId: { color: '#ff6b35', margin: '0 0 12px' },
  orderInfo: { color: '#555', margin: '4px 0', fontSize: '14px' },
  orderTotal: { fontWeight: 'bold', fontSize: '18px', margin: '12px 0' },
  acceptBtn: { width: '100%', padding: '12px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' },
  deliverBtn: { width: '100%', padding: '12px', backgroundColor: '#2196F3', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' },
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyText: { color: '#888', fontSize: '16px' },
  toast: {
    position: 'fixed', top: 20, right: 20, zIndex: 9999,
    backgroundColor: '#ff6b35', color: '#fff',
    padding: '14px 20px', borderRadius: 10,
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    fontSize: 14, fontWeight: 600,
    animation: 'none',
  },
};
