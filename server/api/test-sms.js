const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Middleware
app.use(express.json());
app.use(cors({ 
  origin: true, 
  credentials: true 
}));

// SMS Configuration
const SENDCHAMP_BASE_URL = 'https://api.sendchamp.com/api/v1';
const SENDER_NAME = 'Schamp';

// Phone number formatter for Nigeria
const formatPhone = (phone) => {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('0')) return '234' + cleaned.substring(1);
  if (cleaned.startsWith('+234')) return cleaned.substring(1);
  if (!cleaned.startsWith('234')) return '234' + cleaned;
  return cleaned;
};

// SMS sender function
const sendSMS = async (phoneNumber, message) => {
  try {
    const response = await axios.post(
      `${SENDCHAMP_BASE_URL}/sms/send`,
      {
        to: [phoneNumber],
        message: message,
        sender_name: SENDER_NAME,
        route: 'dnd'
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SENDCHAMP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error('SMS Error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
};

// Test SMS endpoint
app.post('/api/test-sms', async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Phone and message required' });
    }

    const phoneNumber = formatPhone(phone);
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    const testMessage = `Test: ${message} - Moshood Abiola Polytechnic`;
    const result = await sendSMS(phoneNumber, testMessage);

    res.json(result);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = app;