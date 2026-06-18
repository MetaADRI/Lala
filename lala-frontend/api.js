// Use environment variable for API URL, fallback to localhost for development
const API_BASE = window.API_URL || 'http://localhost:5000/api';

console.log('🔗 Connected to API:', API_BASE);

const api = {
  // ─── AUTH ──────────────────────────────────────────────────────────────────
  requestOTP: async (phone) => {
    const res = await fetch(`${API_BASE}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    return res.json();
  },

  verifyOTP: async (phone, otp) => {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
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
    // Remove empty filter values so the URL stays clean
    const clean = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v));
    const params = new URLSearchParams(clean).toString();
    const res = await fetch(`${API_BASE}/listings${params ? '?' + params : ''}`);
    return res.json();
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

  getHostBookings: async () => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings/host/all`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) api.logout();
    return res.json();
  },

  // ─── HOST / ADMIN ──────────────────────────────────────────────────────────
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

  // ─── HELPERS ───────────────────────────────────────────────────────────────
  logout: () => {
    localStorage.removeItem('lala_token');
    localStorage.removeItem('lala_user');
    window.location.href = 'signup.html';
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
