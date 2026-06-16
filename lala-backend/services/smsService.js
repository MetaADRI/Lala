const axios = require('axios');

/**
 * Service to handle SMS via Africa's Talking
 * Note: Credentials should be in .env
 */
const smsService = {
  sendOTP: async (phone, otp) => {
    console.log(`[SMS Service] Sending OTP ${otp} to ${phone}`);
    
    // Fallback to console log if API keys are missing
    if (!process.env.AT_USERNAME || !process.env.AT_API_KEY) {
      console.warn('⚠️ Africa\'s Talking credentials missing. Using mock SMS.');
      return { success: true, message: 'Mock OTP sent' };
    }

    try {
      const options = {
        apiKey: process.env.AT_API_KEY,
        username: process.env.AT_USERNAME,
      };
      
      // Implementation for Africa's Talking SMS API would go here
      // const AfricasTalking = require('africastalking')(options);
      // const sms = AfricasTalking.SMS;
      // await sms.send({ to: [phone], message: `Your Lala verification code is: ${otp}` });
      
      return { success: true };
    } catch (error) {
      console.error('SMS Send Error:', error);
      return { success: false, error: error.message };
    }
  }
};

module.exports = smsService;
