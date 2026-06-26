// Use environment variable for API URL, fallback to localhost for development
const API_BASE = window.API_URL || 'http://localhost:5000/api';

console.log('🔗 Connected to API:', API_BASE);

const api = {
  // ─── AUTH ──────────────────────────────────────────────────────────────────
  register: async (email, password, name, phone, role) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, phone, role })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('lala_token', data.token);
      localStorage.setItem('lala_user', JSON.stringify(data.user));
    }
    return data;
  },

  login: async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('lala_token', data.token);
      localStorage.setItem('lala_user', JSON.stringify(data.user));
    }
    return data;
  },

  // ─── LISTINGS ──────────────────────────────────────────────────────────────
  getListings: async (filters = {}) => {
    const clean = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== '' && v !== null && v !== undefined));
    const params = new URLSearchParams(clean).toString();
    const res = await fetch(`${API_BASE}/listings${params ? '?' + params : ''}`);
    return res.json();
  },

  getListingsByCity: async () => {
    const res = await fetch(`${API_BASE}/listings`);
    const listings = await res.json();
    const counts = {};
    listings.forEach(l => { counts[l.city] = (counts[l.city] || 0) + 1; });
    return counts;
  },

  getListing: async (id) => {
    const res = await fetch(`${API_BASE}/listings/${id}`);
    return res.json();
  },

  // ─── BOOKINGS ──────────────────────────────────────────────────────────────
  /**
   * Creates a booking AND initiates mobile money payment in one call.
   * @param {Object} data - { listingId, checkIn, checkOut, provider, phone }
   * @returns { booking, message, transactionRef }
   */
  createBooking: async (data) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  /**
   * Fetches a single booking by ID (for the confirmation page).
   */
  getBooking: async (id) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  /**
   * Confirm a booking after payment succeeds (called by polling or webhook).
   */
  confirmBooking: async (id) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings/${id}/confirm`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  getGuestBookings: async () => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings/guest/all`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  getAllBookings: async () => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings/admin/all`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  getHostBookings: async () => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings/host/all`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  // ─── SAVED LISTINGS ────────────────────────────────────────────────────────
  toggleSaved: async (listingId) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/saved-listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ listingId })
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  getSavedListings: async () => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/saved-listings`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  // ─── HOST SETUP ────────────────────────────────────────────────────────────
  setupHost: async (name) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/auth/setup-host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name })
    });
    return res.json();
  },

  // ─── PROFILE ───────────────────────────────────────────────────────────────
  updateProfile: async (data) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.token) {
      localStorage.setItem('lala_token', result.token);
      localStorage.setItem('lala_user', JSON.stringify(result.user));
    }
    return result;
  },

  // ─── HOST / ADMIN ──────────────────────────────────────────────────────────
  getMyListings: async () => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/listings/mine`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  createListing: async (listingData) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(listingData)
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  getPendingListings: async () => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/listings/pending`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  approveListing: async (id) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/listings/${id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  rejectListing: async (id) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/listings/${id}/reject`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  updateListing: async (id, data) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/listings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  cancelBooking: async (id) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings/${id}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  hostCancelBooking: async (id) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings/${id}/host-cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  // ─── REVIEWS ───────────────────────────────────────────────────────────────
  getReviews: async (listingId) => {
    const res = await fetch(`${API_BASE}/reviews/${listingId}`);
    return res.json();
  },

  createReview: async (reviewData) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(reviewData)
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  checkCanReview: async (listingId) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/reviews/can-review/${listingId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  getHostRating: async () => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/reviews/host/rating`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  hostRespond: async (reviewId, response) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/reviews/host/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ reviewId, response })
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  // ─── UPLOAD ────────────────────────────────────────────────────────────────
  uploadPhotos: async (files) => {
    const token = localStorage.getItem('lala_token');
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('photos', f));
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  // ─── HELPERS ───────────────────────────────────────────────────────────────
  logout: () => {
    localStorage.removeItem('lala_token');
    localStorage.removeItem('lala_user');
    window.location.href = 'guest-login.html';
  },

  isLoggedIn: () => {
    return !!localStorage.getItem('lala_token');
  },

  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem('lala_user'));
    } catch {
      return null;
    }
  }
};
