import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_URL = 'https://fooddash-food-delivery-project-production.up.railway.app/api';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function OrderChat({ orderId, customerName, socket, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/order-chat/${orderId}/messages`);
      setMessages(res.data);
      setError('');
    } catch {
      setError('Failed to load messages');
    }
  }, [orderId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    if (!socket) return;
    const eventName = `order_chat_order-${orderId}-rider`;
    const handler = (payload) => {
      const message = payload?.message;
      if (!message) return;
      setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]));
    };
    socket.on(eventName, handler);
    return () => socket.off(eventName, handler);
  }, [socket, orderId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const message = text.trim();
    if (!message) return;
    try {
      await axios.post(`${API_URL}/order-chat/${orderId}/messages`, { message });
      setText('');
      fetchMessages();
    } catch {
      setError('Failed to send message');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="tk-fade-in" style={styles.overlay} onClick={onClose}>
      <div className="tk-pop" style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <span style={styles.title}>💬 {customerName || 'Customer'}</span>
            <div style={styles.subtitle}>Order #{orderId}</div>
          </div>
          <button className="tk-hover tk-press" style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div className="tk-scroll-light" style={styles.messageList}>
          {messages.length === 0 ? (
            <p style={styles.empty}>No messages yet. Send the customer an update.</p>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                style={{ ...styles.messageRow, justifyContent: msg.senderRole === 'rider' ? 'flex-end' : 'flex-start' }}
              >
                <div style={msg.senderRole === 'rider' ? styles.bubbleRider : styles.bubbleCustomer}>
                  <div>{msg.message}</div>
                  <div style={{ ...styles.bubbleTime, color: msg.senderRole === 'rider' ? 'rgba(255,255,255,0.75)' : '#98A0B3' }}>
                    {timeAgo(msg.createdAt)}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={styles.replyRow}>
          <input
            style={styles.replyInput}
            type="text"
            placeholder="Type a message..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="tk-hover tk-press" style={styles.sendButton} onClick={handleSend} disabled={!text.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(18,27,52,0.55)', WebkitBackdropFilter: 'blur(2px)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16,
  },
  modal: {
    backgroundColor: '#fff', borderRadius: 22, width: '100%', maxWidth: 420,
    height: '70vh', maxHeight: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 12px 32px rgba(26,39,68,0.14), 0 2px 8px rgba(26,39,68,0.08)',
  },
  header: {
    background: 'linear-gradient(135deg, #1A2744 0%, #253358 100%)', color: '#fff', padding: '16px 18px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #F5A623',
  },
  title: { fontWeight: 700, fontSize: 16 },
  subtitle: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  closeBtn: {
    background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)', color: '#fff',
    borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 14,
  },
  error: { backgroundColor: '#FDEDED', color: '#E5484D', padding: '10px 16px', fontSize: 13, fontWeight: 600 },
  messageList: { flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, backgroundColor: '#F7F8FC' },
  empty: { color: '#98A0B3', fontSize: 13, textAlign: 'center', marginTop: 24 },
  messageRow: { display: 'flex' },
  bubbleRider: {
    background: 'linear-gradient(135deg, #1A2744, #253358)', color: '#fff', padding: '10px 14px',
    borderRadius: '16px 16px 4px 16px', maxWidth: '75%', fontSize: 14, boxShadow: '0 1px 3px rgba(26,39,68,0.06), 0 1px 2px rgba(26,39,68,0.08)',
  },
  bubbleCustomer: {
    backgroundColor: '#fff', color: '#1A2744', padding: '10px 14px', border: '1px solid #E4E8F1',
    borderRadius: '16px 16px 16px 4px', maxWidth: '75%', fontSize: 14, boxShadow: '0 1px 3px rgba(26,39,68,0.06)',
  },
  bubbleTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  replyRow: { display: 'flex', gap: 10, padding: '14px 16px', borderTop: '1px solid #E4E8F1', backgroundColor: '#fff' },
  replyInput: {
    flex: 1, padding: '11px 16px', borderRadius: 22, border: '1.5px solid #E4E8F1',
    fontSize: 16, outline: 'none', boxSizing: 'border-box', color: '#1A2744',
  },
  sendButton: {
    padding: '11px 22px', borderRadius: 22, border: 'none',
    background: 'linear-gradient(135deg, #F5A623, #D98C0F)', color: '#1A2744', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(245,166,35,0.35)',
  },
};
