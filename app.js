// ============================================================
//  TRUE VALUE MATTRESS — App JavaScript
//  Booking System + UI Interactions
// ============================================================

/* ── Navbar scroll effect ─────────────────────────────────── */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 60) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
}, { passive: true });

/* ── Mobile menu ──────────────────────────────────────────── */
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
});

function closeMobile() {
  mobileMenu.classList.remove('open');
}

/* ── Scroll reveal ────────────────────────────────────────── */
const revealEls = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

revealEls.forEach(el => revealObserver.observe(el));

/* ── Booking System ───────────────────────────────────────── */

let currentStep = 1;
const totalSteps = 3;
let selectedTime = '';

// Store hours: open 9 AM, close 5 PM (last slot)
const STORE_OPEN_HOUR = 9;   // 9 AM
const STORE_CLOSE_HOUR = 17; // 5 PM last slot (17:00)

// All time slots the store offers
const ALL_TIME_SLOTS = [
  '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM',
  '3:00 PM', '4:00 PM', '5:00 PM'
];

/**
 * Convert a slot string like "9:00 AM" → 24-hour integer like 9
 * Used to compare against current local time.
 */
function slotToHour(slotStr) {
  const [time, period] = slotStr.split(' ');
  let [hour] = time.split(':').map(Number);
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return hour;
}

/**
 * Returns true if a given slot is in the past for the selected date.
 * For today: any slot whose hour <= current hour is considered past/not bookable.
 * For future dates: all slots are valid.
 */
function isSlotPast(dateStr, slotStr) {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA'); // "YYYY-MM-DD" in local time

  if (dateStr !== todayStr) return false; // future date — all slots fine

  const slotHour = slotToHour(slotStr);
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Block the slot if the current time is past the start of that hour
  // Give a small 5-minute buffer so someone doesn't lose a slot they're actively selecting
  if (currentHour > slotHour) return true;
  if (currentHour === slotHour && currentMinute > 5) return true;

  return false;
}

async function renderTimeSlots(dateStr) {
  const container = document.getElementById('timeSlots');
  selectedTime = '';

  if (!dateStr) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.84rem;padding:0.5rem 0;">Select a date to see available times.</div>';
    return;
  }

  container.innerHTML = '<div style="color:var(--text-muted);font-size:0.84rem;padding:0.5rem 0;">Checking availability…</div>';

  try {
    const res  = await fetch(`/api/available-slots?date=${dateStr}`);
    const data = await res.json();
    container.innerHTML = '';

    data.slots.forEach(s => {
      const past = isSlotPast(dateStr, s.time);
      const unavailable = !s.available || past;

      const el = document.createElement('div');
      el.className = 'time-slot' + (unavailable ? (past ? ' past' : ' unavailable') : '');
      el.textContent = s.time;

      if (!unavailable) {
        el.addEventListener('click', () => {
          document.querySelectorAll('.time-slot').forEach(x => x.classList.remove('selected'));
          el.classList.add('selected');
          selectedTime = s.time;
        });
      }
      container.appendChild(el);
    });

    // If ALL slots are past/unavailable for today, show a helpful message
    const allGone = container.querySelectorAll('.time-slot:not(.past):not(.unavailable)').length === 0;
    if (allGone) {
      const msg = document.createElement('div');
      msg.style.cssText = 'color:var(--text-muted);font-size:0.82rem;margin-top:0.75rem;padding:0.6rem 1rem;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);';
      msg.textContent = 'No slots available for this date. Please try tomorrow or another day.';
      container.appendChild(msg);
    }

  } catch {
    // Fallback to local simulation if backend not running
    container.innerHTML = '';
    ALL_TIME_SLOTS.forEach(t => {
      const past = isSlotPast(dateStr, t);
      const el = document.createElement('div');
      el.className = 'time-slot' + (past ? ' past' : '');
      el.textContent = t;
      if (!past) {
        el.addEventListener('click', () => {
          document.querySelectorAll('.time-slot').forEach(x => x.classList.remove('selected'));
          el.classList.add('selected');
          selectedTime = t;
        });
      }
      container.appendChild(el);
    });
  }
}

// Populate time slots on date change
document.getElementById('apptDate').addEventListener('change', function () {
  renderTimeSlots(this.value);
});

// Set min date to today
const today = new Date().toLocaleDateString('en-CA');
document.getElementById('apptDate').min = today;

// Initial render (empty)
renderTimeSlots('');

/* ── Step Navigation ──────────────────────────────────────── */
function setStep(step) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  const stepEl = document.getElementById(step === 'confirm' ? 'stepConfirm' : `step${step}`);
  if (stepEl) stepEl.classList.add('active');
  currentStep = step;
  updateProgress(step);
}

function updateProgress(step) {
  const bar = document.getElementById('fpBar');
  const pct = step === 'confirm' ? 100 : (step / totalSteps) * 100;
  bar.style.width = pct + '%';
}

function nextStep(from) {
  if (from === 1) {
    if (!validateStep1()) return;
    setStep(2);
  } else if (from === 2) {
    if (!validateStep2()) return;
    setStep(3);
  }
}

function prevStep(from) {
  setStep(from - 1);
}

/* ── Validation ───────────────────────────────────────────── */
function validateStep1() {
  const first = document.getElementById('firstName').value.trim();
  const last = document.getElementById('lastName').value.trim();
  const email = document.getElementById('email').value.trim();

  if (!first || !last) {
    showAlert('Please enter your full name.');
    return false;
  }
  if (!email || !email.includes('@')) {
    showAlert('Please enter a valid email address.');
    return false;
  }
  return true;
}

function validateStep2() {
  const date = document.getElementById('apptDate').value;
  if (!date) {
    showAlert('Please select a preferred date.');
    return false;
  }
  if (!selectedTime) {
    showAlert('Please select a time slot.');
    return false;
  }
  // Double-check selected time isn't past (edge case: user left form open)
  if (isSlotPast(date, selectedTime)) {
    showAlert('That time has already passed. Please select a future time slot.');
    selectedTime = '';
    document.querySelectorAll('.time-slot').forEach(x => x.classList.remove('selected'));
    renderTimeSlots(date);
    return false;
  }
  return true;
}

/* ── Submit ───────────────────────────────────────────────── */
async function submitBooking() {
  const first    = document.getElementById('firstName').value.trim();
  const last     = document.getElementById('lastName').value.trim();
  const email    = document.getElementById('email').value.trim();
  const phone    = document.getElementById('phone').value.trim();
  const date     = document.getElementById('apptDate').value;
  const size     = document.getElementById('mattressSize').value;
  const budget   = document.getElementById('budget').value;
  const posEl    = document.querySelector('input[name="position"]:checked');
  const position = posEl ? posEl.value : '';
  const notes    = document.getElementById('notes').value.trim();

  // Final guard: check the slot isn't now in the past
  if (isSlotPast(date, selectedTime)) {
    showAlert('Sorry, that time slot just passed. Please go back and pick a new time.');
    return;
  }

  // Disable submit button while loading
  const submitBtn = document.querySelector('.btn-submit');
  submitBtn.textContent = 'Submitting…';
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: first, lastName: last, email, phone, date, time: selectedTime, size, budget, position, notes })
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.error || 'Something went wrong. Please try again.');
      submitBtn.textContent = 'Confirm Appointment ✓';
      submitBtn.disabled = false;
      return;
    }

    // Format date for display
    const dateObj = new Date(date + 'T12:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Confirmation screen
    document.getElementById('confirmSummary').innerHTML = `
      <div><strong>Reference:</strong> ${data.booking_ref}</div>
      <div><strong>Name:</strong> ${first} ${last}</div>
      <div><strong>Email:</strong> ${email}</div>
      ${phone ? `<div><strong>Phone:</strong> ${phone}</div>` : ''}
      <div><strong>Date:</strong> ${formattedDate}</div>
      <div><strong>Time:</strong> ${selectedTime}</div>
      ${size ? `<div><strong>Size:</strong> ${size}</div>` : ''}
      ${budget ? `<div><strong>Budget:</strong> ${budget}</div>` : ''}
      ${position ? `<div><strong>Sleep Position:</strong> ${position}</div>` : ''}
    `;

    document.getElementById('confirmMsg').textContent =
      `Thank you, ${first}! A confirmation email has been sent to ${email}. We'll call to confirm your appointment shortly.`;

    setStep('confirm');

  } catch (err) {
    showAlert('Network error — please check your connection and try again.');
    submitBtn.textContent = 'Confirm Appointment ✓';
    submitBtn.disabled = false;
  }
}

function resetForm() {
  ['firstName', 'lastName', 'email', 'phone', 'apptDate', 'notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('mattressSize').selectedIndex = 0;
  document.getElementById('budget').selectedIndex = 0;
  const checkedRadio = document.querySelector('input[name="position"]:checked');
  if (checkedRadio) checkedRadio.checked = false;
  selectedTime = '';
  renderTimeSlots('');
  setStep(1);
}

/* ── Alert ────────────────────────────────────────────────── */
function showAlert(msg) {
  const old = document.querySelector('.tvm-alert');
  if (old) old.remove();

  const alert = document.createElement('div');
  alert.className = 'tvm-alert';
  alert.textContent = msg;
  alert.style.cssText = `
    position: fixed;
    top: 5rem; left: 50%; transform: translateX(-50%);
    background: #1c1508;
    color: #e2c47a;
    border: 1px solid rgba(201,168,76,0.4);
    padding: 0.8rem 1.75rem;
    border-radius: 50px;
    font-size: 0.86rem;
    font-family: 'DM Sans', sans-serif;
    z-index: 9999;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    animation: alertIn 0.35s cubic-bezier(0.16,1,0.3,1);
    white-space: nowrap;
    letter-spacing: 0.02em;
  `;
  const style = document.createElement('style');
  style.textContent = `@keyframes alertIn { from { opacity:0; transform:translateX(-50%) translateY(-12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
  document.head.appendChild(style);
  document.body.appendChild(alert);

  setTimeout(() => {
    alert.style.opacity = '0';
    alert.style.transition = 'opacity 0.3s';
    setTimeout(() => alert.remove(), 300);
  }, 3500);
}

/* ── Smooth anchor close-mobile ──────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', () => {
    closeMobile();
  });
});

/* ── Init ─────────────────────────────────────────────────── */
updateProgress(1);