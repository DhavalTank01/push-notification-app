import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const App = () => {
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const audioPermissionAskedRef = useRef(false);
  const audioEnabledRef = useRef(false);
  const pendingNotificationRef = useRef(null);
  const notificationCounterRef = useRef(0);
  const [notifications, setNotifications] = useState([]);
  const [showAudioPermissionModal, setShowAudioPermissionModal] = useState(false);

  useEffect(() => {
    // Pre-load audio
    audioRef.current = new Audio('/notification.mp3');
    audioRef.current.load();

    // Initialize socket connection
    socketRef.current = io('http://localhost:4001');

    const socket = socketRef.current;
    socket.on('connect', () => {
      console.log('Connected to server:', socket.id);

      // Register user with a unique ID (could be from login, localStorage, etc.)
      const userId = localStorage.getItem('userId') || `user-${Date.now()}`;
      localStorage.setItem('userId', userId);
      socket.emit('register', userId);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    socket.on('init', (data) => {
      console.log('Init data:', data);
    });

    socket.on('notification', (data) => {
      console.log('Notification received:', data);
      setNotifications((prevNotifications) => [...prevNotifications, data]);

      if (!("Notification" in window)) {
        alert("This browser does not support desktop notification");
        return;
      }

      console.log('Notification.permission', Notification.permission);

      if (Notification.permission === "granted") {
        handleNotification(data);
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(function (permission) {
          if (permission === "granted") {
            handleNotification(data);
          } else {
            alert("Notification permission denied. Please enable notifications for this website.");
          }
        });
      }
    });

    // Cleanup on component unmount
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('init');
      socket.off('notification');
      socket.disconnect();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleNotification = (data) => {
    // If audio permission not asked yet, show modal
    if (!audioPermissionAskedRef.current) {
      pendingNotificationRef.current = data;
      setShowAudioPermissionModal(true);
    } else {
      sendPushNotification(data);
    }
  };

  const handleEnableAudio = () => {
    audioPermissionAskedRef.current = true;

    // Play audio immediately during user interaction
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => {
          audioEnabledRef.current = true;
          console.log('Audio enabled successfully');
          setShowAudioPermissionModal(false);

          // Send the pending notification
          if (pendingNotificationRef.current) {
            sendPushNotification(pendingNotificationRef.current);
            pendingNotificationRef.current = null;
          }
        })
        .catch((error) => {
          console.error('Failed to enable audio:', error);
          audioEnabledRef.current = false;
          setShowAudioPermissionModal(false);

          // Still send notification, just without sound
          if (pendingNotificationRef.current) {
            sendPushNotification(pendingNotificationRef.current);
            pendingNotificationRef.current = null;
          }
        });
    }
  };

  const handleDisableAudio = () => {
    audioPermissionAskedRef.current = true;
    audioEnabledRef.current = false;
    setShowAudioPermissionModal(false);

    // Send the pending notification without sound
    if (pendingNotificationRef.current) {
      sendPushNotification(pendingNotificationRef.current);
      pendingNotificationRef.current = null;
    }
  };

  const playNotificationSound = () => {
    if (audioRef.current && audioEnabledRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((error) => {
        console.error('Audio play failed:', error);
      });
    }
  };

  const sendPushNotification = (data) => {
    // Increment counter to create unique tag for each notification
    notificationCounterRef.current += 1;

    var notification = new Notification(data.message, {
      body: data?.body || undefined,
      icon: '/notification-bell.png',
      tag: `notification-${notificationCounterRef.current}`, // Unique tag for each notification
      // Or remove tag completely to show all notifications:
      // (don't include tag property at all)
    });

    // Play notification sound
    playNotificationSound();

    notification.onclick = function () {
      if (data.url) {
        window.open(data.url);
      }
    };

    notification.onclose = function () {
      console.log('Notification closed');
    };

    notification.onerror = function (error) {
      console.error('Notification error', error);
    };
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Socket.IO Notification App</h1>
      <ul>
        {notifications.map((notification, index) => (
          <li key={index}>{notification.message}</li>
        ))}
      </ul>

      {/* Audio Permission Modal */}
      {showAudioPermissionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '400px',
            textAlign: 'center',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '15px' }}>Enable Notification Sounds?</h2>
            <p style={{ marginBottom: '25px', color: '#666' }}>
              Do you want to hear an audio alert when new notifications arrive?
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={handleEnableAudio}
                style={{
                  padding: '10px 30px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                Yes, Enable
              </button>
              <button
                onClick={handleDisableAudio}
                style={{
                  padding: '10px 30px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                No, Thanks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;