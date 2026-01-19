// Service Worker - handles background notifications
self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim());
});

// Listen for push events from the server
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  let notificationData = {
    title: 'New Notification',
    body: 'You have a new message',
    icon: '/notification-bell.png',
    badge: '/badge.png',
    tag: 'notification-' + Date.now(),
    data: {
      url: '/'
    }
  };

  // Parse the push data if available
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.message || data.title || 'New Notification',
        body: data.body || '',
        icon: data.icon || '/notification-bell.png',
        badge: '/badge.png',
        tag: data.tag || 'notification-' + Date.now(),
        data: {
          url: data.url || '/'
        }
      };
    } catch (e) {
      console.error('Error parsing push data:', e);
    }
  }

  // Check if the app is already open (handling via Socket.IO)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // If we have active windows, let the app handle it via Socket.IO
      // unless we want to force it (optional, but for this fix we return)
      if (windowClients.length > 0) {
        console.log('App is open, suppressing SW notification to avoid duplicate');
        return;
      }

      // Only show notification if app is closed
      return self.registration.showNotification(notificationData.title, {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        tag: notificationData.tag,
        data: notificationData.data,
        requireInteraction: false,
        vibrate: [200, 100, 200]
      });
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  // Open the URL in a new window or focus existing window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});