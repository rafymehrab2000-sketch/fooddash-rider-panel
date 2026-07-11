import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_URL = 'https://fooddash-food-delivery-project-production.up.railway.app/api';
const POLL_INTERVAL = 5000;

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

export default function SupportChat({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [sessionStart, setSessionStart] = useState(0);
  const messagesEndRef = useRef(null);

  const visibleMessages = messages.filter(
    msg => new Date(msg.createdAt).getTime() >= sessionStart
  );

  const fetchMessages = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/rider-support/messages`);
      setMessages(res.data);
      setError('');
    } catch {
      setError('Failed to load messages');
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (ended) return;
    const message = text.trim();
    if (!message) return;
    try {
      await axios.post(`${API_URL}/rider-support/messages`, { message });
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

  const handleEndConversation = () => {
    if (window.confirm('Are you sure you want to end this conversation?')) {
      setEnded(true);
    }
  };

  const handleStartNewChat = () => {
    setSessionStart(Date.now());
    setEnded(false);
    setText('');
    setError('');
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>💬 Rider Support</span>
          <div style={styles.headerActions}>
            <button
              style={styles.endBtn}
              onClick={ended ? handleStartNewChat : handleEndConversation}
            >
              {ended ? 'Start New Chat' : 'End Conversation'}
            </button>
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.messageList}>
          {visibleMessages.length === 0 ? (
            <p style={styles.empty}>No messages yet. Send us a message and we'll get back to you.</p>
          ) : (
            visibleMessages.map(msg => (
              <div
                key={msg.id}
                style={{ ...styles.messageRow, justifyContent: msg.senderType === 'rider' ? 'flex-end' : 'flex-start' }}
              >
                <div style={msg.senderType === 'rider' ? styles.bubbleRider : styles.bubbleAdmin}>
                  <div>{msg.message}</div>
                  <div style={{ ...styles.bubbleTime, color: msg.senderType === 'rider' ? 'rgba(255,255,255,0.8)' : '#888' }}>
                    {timeAgo(msg.createdAt)}
                  </div>
                </div>
              </div>
            ))
          )}
          {ended && <p style={styles.endedNotice}>Conversation ended</p>}
          <div ref={messagesEndRef} />
        </div>

        <div style={styles.replyRow}>
          <input
            style={styles.replyInput}
            type="text"
            placeholder={ended ? 'Conversation ended' : 'Type a message...'}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={ended}
          />
          <button style={styles.sendButton} onClick={handleSend} disabled={ended || !text.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16,
  },
  modal: {
    backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 420,
    height: '70vh', maxHeight: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
  },
  header: {
    backgroundColor: '#ff6b35', color: '#fff', padding: '14px 18px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  title: { fontWeight: 700, fontSize: 16 },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  endBtn: {
    background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
    borderRadius: 14, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
    borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14,
  },
  error: { backgroundColor: '#ffe0e0', color: '#cc0000', padding: '10px 16px', fontSize: 13 },
  messageList: { flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  empty: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 24 },
  endedNotice: { color: '#888', fontSize: 12, textAlign: 'center', margin: '8px 0 0' },
  messageRow: { display: 'flex' },
  bubbleRider: {
    backgroundColor: '#ff6b35', color: '#fff', padding: '10px 14px',
    borderRadius: '14px 14px 2px 14px', maxWidth: '75%', fontSize: 14,
  },
  bubbleAdmin: {
    backgroundColor: '#eee', color: '#1a1a1a', padding: '10px 14px',
    borderRadius: '14px 14px 14px 2px', maxWidth: '75%', fontSize: 14,
  },
  bubbleTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  replyRow: { display: 'flex', gap: 10, padding: '14px 16px', borderTop: '1px solid #eee' },
  replyInput: {
    flex: 1, padding: '10px 14px', borderRadius: 20, border: '1px solid #ddd',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  },
  sendButton: {
    padding: '10px 20px', borderRadius: 20, border: 'none',
    backgroundColor: '#ff6b35', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
};
