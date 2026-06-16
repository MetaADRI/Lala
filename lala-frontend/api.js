// Use environment variable for API URL, fallback to localhost for development
const API_BASE = window.API_URL || 'http://localhost:5000/api';

console.log('🔗 Connected to API:', API_BASE);

const api = {
  // AUTH
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

  // LISTINGS
  getListings: async (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    const res = await fetch(`${API_BASE}/listings?${params}`);
    return res.json();
  },

  getListing: async (id) => {
    const res = await fetch(`${API_BASE}/listings/${id}`);
    return res.json();
  },

  // BOOKINGS
  createBooking: async (bookingData) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(bookingData)
    });
    return res.json();
  },

  initiatePayment: async (paymentData) => {
    const token = localStorage.getItem('lala_token');
    const res = await fetch(`${API_BASE}/bookings/pay`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(paymentData)
    });
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
