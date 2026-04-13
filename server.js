require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend + parse JSON
app.use(express.json());
app.use(express.static(__dirname));

// Neon Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Fixed time slots for booking UI
const ALL_TIME_SLOTS = [
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM'
];

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateBookingRef() {
  const now = new Date();
  const stamp =
    now.getFullYear().toString().slice(-2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    '-' +
    Math.floor(1000 + Math.random() * 9000);

  return `TVM-${stamp}`;
}

async function initDatabase() {
  const sql = `
    CREATE TABLE IF NOT EXISTS bookings (
      id BIGSERIAL PRIMARY KEY,
      booking_ref TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      booking_date DATE NOT NULL,
      booking_time TEXT NOT NULL,
      mattress_size TEXT,
      budget TEXT,
      position TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (booking_date, booking_time)
    );
  `;

  await pool.query(sql);
  console.log('Database ready');
}

async function sendConfirmationEmail(booking) {
  const { data, error } = await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: [booking.email],
    subject: `True Value Mattress Appointment Confirmation - ${booking.booking_ref}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
        <h2>Appointment Confirmed</h2>
        <p>Hello ${booking.first_name} ${booking.last_name},</p>
        <p>Thank you for booking with <strong>True Value Mattress</strong>.</p>

        <h3>Your Appointment Details</h3>
        <ul>
          <li><strong>Booking Ref:</strong> ${booking.booking_ref}</li>
          <li><strong>Date:</strong> ${booking.booking_date}</li>
          <li><strong>Time:</strong> ${booking.booking_time}</li>
          <li><strong>Mattress Size:</strong> ${booking.mattress_size || 'Not specified'}</li>
          <li><strong>Budget:</strong> ${booking.budget || 'Not specified'}</li>
          <li><strong>Sleep Position:</strong> ${booking.position || 'Not specified'}</li>
          <li><strong>Phone:</strong> ${booking.phone || 'Not provided'}</li>
          <li><strong>Notes:</strong> ${booking.notes || 'None'}</li>
        </ul>

        <p>We look forward to helping you find the perfect mattress.</p>
        <p>True Value Mattress</p>
      </div>
    `
  });

  if (error) {
    throw new Error(error.message || 'Failed to send confirmation email');
  }

  return data;
}

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ ok: true, message: 'Server and database are working' });
  } catch (err) {
    console.error('Health check failed:', err);
    return res.status(500).json({ ok: false, error: 'Database connection failed' });
  }
});

// Get available slots for a date
app.get('/api/available-slots', async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }

  try {
    const result = await pool.query(
      `SELECT booking_time
       FROM bookings
       WHERE booking_date = $1`,
      [date]
    );

    const bookedTimes = result.rows.map(row => row.booking_time);

    const slots = ALL_TIME_SLOTS.map(time => ({
      time,
      available: !bookedTimes.includes(time)
    }));

    return res.json({ slots });
  } catch (err) {
    console.error('Error loading available slots:', err);
    return res.status(500).json({ error: 'Failed to load available slots.' });
  }
});

// Create booking
app.post('/api/bookings', async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone = '',
    date,
    time,
    size = '',
    budget = '',
    position = '',
    notes = ''
  } = req.body;

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }

  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }

  if (!time) {
    return res.status(400).json({ error: 'Time is required.' });
  }

  if (!ALL_TIME_SLOTS.includes(time)) {
    return res.status(400).json({ error: 'Invalid time slot selected.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const bookingRef = generateBookingRef();

    const insertResult = await client.query(
      `INSERT INTO bookings (
        booking_ref,
        first_name,
        last_name,
        email,
        phone,
        booking_date,
        booking_time,
        mattress_size,
        budget,
        position,
        notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        bookingRef,
        firstName.trim(),
        lastName.trim(),
        email.trim(),
        phone.trim(),
        date,
        time,
        size,
        budget,
        position,
        notes.trim()
      ]
    );

    const booking = insertResult.rows[0];

    await client.query('COMMIT');

    try {
      await sendConfirmationEmail(booking);
    } catch (emailErr) {
      console.error('Email send failed:', emailErr);
    }

    return res.status(201).json({
      success: true,
      booking_ref: booking.booking_ref,
      message: 'Appointment booked successfully.'
    });
  } catch (err) {
    await client.query('ROLLBACK');

    // Handle double-booking cleanly
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'That time slot has already been booked. Please choose another time.'
      });
    }

    console.error('Booking creation failed:', err);
    return res.status(500).json({ error: 'Failed to create booking.' });
  } finally {
    client.release();
  }
});

// Start server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });