import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const App = () => {
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const pendingNotificationRef = useRef(null);
  const notificationCounterRef = useRef(0);
  const [notifications, setNotifications] = useState([]);
  const [showAudioPermissionModal, setShowAudioPermissionModal] = useState(false);
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState('checking...');

  useEffect(() => {
    // Initialize User ID
    const userId = localStorage.getItem('userId') || `user-${Date.now()}`;
    localStorage.setItem('userId', userId);

    // Register Service Worker and subscribe to push
    initializeNotifications(userId);

    // Pre-load audio
    audioRef.current = new Audio('/notification.mp3');
    audioRef.current.load();

    // Initialize socket connection
    socketRef.current = io('http://localhost:4001');

    const socket = socketRef.current;
    socket.on('connect', () => {
      console.log('Connected to server:', socket.id);
      socket.emit('register', userId);

      // Re-sync push subscription on reconnection (e.g. if server restarted)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          subscribeToPushNotifications(registration, userId);
        });
      }
    });

    socket.on('init', (data) => {
      console.log('Server init:', data);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    socket.on('notification', (data) => {
      console.log('Notification received:', data);
      setNotifications((prevNotifications) => [...prevNotifications, data]);

      if (!("Notification" in window)) {
        alert("This browser does not support desktop notification");
        return;
      }

      // If we have permission, show it.
      // Note: We removed the visibility check so this works in background too.
      if (Notification.permission === "granted") {
        sendPushNotification(data, localStorage.getItem('audioPermission') === 'enabled');
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(function (permission) {
          if (permission === "granted") {
            sendPushNotification(data, localStorage.getItem('audioPermission') === 'enabled');
          }
        });
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('notification');
      socket.disconnect();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const initializeNotifications = async (userId) => {
    if ('serviceWorker' in navigator) {
      try {
        // Register Service Worker
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        console.log('Service Worker registered:', registration);
        setServiceWorkerStatus('registered ✓');

        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;

        // Subscribe to push notifications
        await subscribeToPushNotifications(registration, userId);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        setServiceWorkerStatus('failed ✗');
      }
    } else {
      console.warn('Service Workers not supported');
      setServiceWorkerStatus('not supported');
    }
  };

  const subscribeToPushNotifications = async (registration, userId) => {
    try {
      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        console.log('No existing subscription, creating new one...');
        // Get VAPID public key from server
        const response = await fetch('http://localhost:4001/api/vapid-public-key');
        const { publicKey } = await response.json();

        // Convert VAPID key to Uint8Array
        const convertedVapidKey = urlBase64ToUint8Array(publicKey);

        // Subscribe to push notifications
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });
      } else {
        console.log('Found existing subscription');
      }

      console.log('Push subscription:', subscription);

      // Send subscription to server via API
      const responseOfSubscription = await fetch('http://localhost:4001/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, subscription }),
      }).then((response) => response.json());
      console.log('Subscription sent to server', responseOfSubscription);

    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
    }
  };

  // Helper function to convert VAPID key
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const handleEnableAudio = () => {
    localStorage.setItem('audioPermission', 'enabled');

    if (audioRef.current) {
      audioRef.current.play()
        .then(() => {
          console.log('Audio enabled successfully');
          setShowAudioPermissionModal(false);

          if (pendingNotificationRef.current) {
            sendPushNotification(pendingNotificationRef.current, true);
            pendingNotificationRef.current = null;
          }
        })
        .catch((error) => {
          console.error('Failed to enable audio:', error);
          setShowAudioPermissionModal(false);

          if (pendingNotificationRef.current) {
            sendPushNotification(pendingNotificationRef.current, false);
            pendingNotificationRef.current = null;
          }
        });
    }
  };

  const handleDisableAudio = () => {
    localStorage.setItem('audioPermission', 'disabled');
    setShowAudioPermissionModal(false);

    if (pendingNotificationRef.current) {
      sendPushNotification(pendingNotificationRef.current, false);
      pendingNotificationRef.current = null;
    }
  };

  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((error) => {
        console.error('Audio play failed:', error);
      });
    }
  };

  const sendPushNotification = (data, playSound = false) => {
    notificationCounterRef.current += 1;

    // Only show notification if page is visible (app is open)
    // When app is closed, service worker handles it automatically
    var notification = new Notification(data.message, {
      body: data?.body || undefined,
      icon: '/notification-bell.png',
      tag: `notification-${notificationCounterRef.current}`,
    });

    if (playSound) {
      playNotificationSound();
    }

    notification.onclick = function () {
      if (data.url) {
        window.open(data.url);
      }
    };
    // When app is closed/minimized, the service worker's 'push' event 
    // will automatically handle showing the notification
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Socket.IO Notification App</h1>
      <p style={{ fontSize: '12px', color: '#666' }}>
        Service Worker: {serviceWorkerStatus}
      </p>
      <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
        ✓ Notifications work even when app is closed
      </p>
      <ul>
        {notifications.map((notification, index) => (
          <li key={index}>{notification.message}</li>
        ))}
      </ul>

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
