const axios = require('axios');

/**
 * Service to handle SMS via Africa's Talking
 * Note: Credentials should be in .env
 */
const smsService = {
  /**
   * Generic SMS sender — used for booking confirmations, reminders etc.
   */
  sendSMS: async (phone, message) => {
    console.log(`[SMS Service] Sending SMS to ${phone}: ${message}`);

    if (!process.env.AT_USERNAME || !process.env.AT_API_KEY) {
      console.warn("⚠️ Africa's Talking credentials missing. Using mock SMS.");
      return { success: true, message: 'Mock SMS sent (credentials not configured)' };
    }

    try {
      // Uncomment when Africa's Talking npm package is installed:
      // const AfricasTalking = require('africastalking')({
      //   apiKey: process.env.AT_API_KEY,
      //   username: process.env.AT_USERNAME,
      // });
      // const sms = AfricasTalking.SMS;
      // await sms.send({ to: [phone], message });
      return { success: true };
    } catch (error) {
      console.error('SMS Send Error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * OTP-specific wrapper (calls sendSMS internally)
   */
  sendOTP: async (phone, otp) => {
    const msg = `Your Lala verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`;
    return smsService.sendSMS(phone, msg);
  },

  sendBookingConfirmation: async (booking) => {
    const msg = `Lala: Booking confirmed! Your stay from ${booking.checkIn} to ${booking.checkOut}. Ref: ${booking.transactionRef || booking.id.split('-')[0].toUpperCase()}. Enjoy your stay!`;
    return smsService.sendSMS(booking.guestPhone, msg);
  }
};

module.exports = smsService;
