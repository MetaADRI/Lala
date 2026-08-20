const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-otp', authController.verifyLoginOTP);
router.post('/confirm-email', authController.confirmEmail);
router.post('/resend-confirmation', authController.resendConfirmation);
router.patch('/profile', authMiddleware, authController.updateProfile);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
