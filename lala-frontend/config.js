/**
 * Frontend Configuration
 * Set window.API_URL before loading api.js
 * 
 * For Vercel: Create this dynamically with environment variables
 * For Local Dev: Uses http://localhost:5000/api
 */
(function() {
  // Check if running on Vercel (production)
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // Production: API_URL set to Render backend
    window.API_URL = 'https://lala-1hht.onrender.com/api';
  } else {
    // Development: use localhost
    window.API_URL = 'http://localhost:5000/api';
  }
})();
