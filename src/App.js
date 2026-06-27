import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API = 'https://fooddash-food-delivery-project-production.up.railway.app/api';

export default function App() {
  const [screen, setScreen] = useState('login');
  const [rider, setRider] = useState(null);
  const [orders, setOrders] = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const prevOrderCountRef = useRef(null);
  const prevStatusRef = useRef(null);

  const fetchOrders = useCallback(async () => {
    const res = await axios.get(`${API}/rider/available`);
    const newOrders = res.data;
    if (
      Notification.permission === 'granted' &&
      prevOrderCountRef.current !== null &&
      newOrders.length > prevOrderCountRef.current
    ) {
      const diff = newOrders.length - prevOrderCountRef.current;
      new Notification('New Delivery Available 🛵', {
        body: `${diff} new order${diff > 1 ? 's' : ''} ready for pickup`,
      });
    }
    prevOrderCountRef.current = newOrders.length;
    setOrders(newOrders);
  }, []);

  const fetchActiveDelivery = useCallback(async () => {
    if (!rider) return;
    const res = await axios.get(`${API}/rider/my-delivery/${rider.name}`);
    const delivery = res.data;
    if (
      delivery &&
      Notification.permission === 'granted' &&
      prevStatusRef.current !== null &&
      delivery.status !== prevStatusRef.current
    ) {
      new Notification('Delivery Update 📦', {
        body: `Order #${delivery.id} status: ${delivery.status.replace('_', ' ')}`,
      });
    }
    if (delivery) prevStatusRef.current = delivery.status;
    setActiveDelivery(delivery);
  }, [rider]);

  useEffect(() => {
    if (screen === 'available') {
      fetchOrders();
      const interval = setInterval(fetchOrders, 30000);
      return () => clearInterval(interval);
    }
    if (screen === 'active') {
      fetchActiveDelivery();
      const interval = setInterval(fetchActiveDelivery, 30000);
      return () => clearInterval(interval);
    }
  }, [screen, fetchOrders, fetchActiveDelivery]);

  const login = async () => {
    try {
      const res = await axios.post(`${API}/auth/login`, { email, password });
      if (res.data.user.role !== 'rider') {
        setErrorMsg('You are not a rider!');
        return;
      }
      if ('Notification' in window) {
        Notification.requestPermission();
      }
      setRider(res.data.user);
      setScreen('available');
    } catch (err) {
      setErrorMsg('Invalid email or password');
    }
  };

  const pickupOrder = async (id) => {
    await axios.put(`${API}/rider/${id}/pickup`, { riderName: rider.name });
    prevStatusRef.current = null;
    setScreen('active');
  };

  const deliverOrder = async (id) => {
    await axios.put(`${API}/rider/${id}/deliver`);
    prevStatusRef.current = null;
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
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>🛵 Available Deliveries</h2>
        <p style={styles.headerSub}>Welcome, {rider?.name}</p>
        <button style={styles.smallButton} onClick={() => setScreen('active')}>My Active Delivery</button>
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
  header: { backgroundColor: '#ff6b35', padding: '20px', borderRadius: '12px', marginBottom: '20px', color: '#fff' },
  headerTitle: { margin: '0 0 4px', fontSize: '24px' },
  headerSub: { margin: '0 0 12px', opacity: 0.8 },
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
};
