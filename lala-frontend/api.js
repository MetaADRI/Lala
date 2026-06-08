const API_BASE = 'http://localhost:5000/api';

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
    return res.json();
  }
};
