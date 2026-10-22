const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../lib/prisma');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is missing. Add it to backend/.env');
}

const BCRYPT_COST = 12; // NFR-02
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

// Prototype only: OTPs live in memory and are "sent" to the server console.
const otpStore = new Map();

// Makes an unknown phone number take as long as a wrong password
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function publicUser(user) {
  return {
    id: user.id,
    phone_number: user.phone_number,
    email: user.email,
    role: user.role,
  };
}

async function register(data) {
  const body = data || {};
  const full_name = str(body.full_name);
  const national_id = str(body.national_id);
  const phone_number = str(body.phone_number);
  const email = str(body.email).toLowerCase();
  const address = str(body.address);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!full_name || !national_id || !phone_number || !password) {
    throw fail(400, 'full_name, national_id, phone_number and password are required');
  }
  if (password.length < 8) {
    throw fail(400, 'Password must be at least 8 characters');
  }

  const orConditions = [{ phone_number }];
  if (email) orConditions.push({ email });
  const existingUser = await prisma.user.findFirst({ where: { OR: orConditions } });
  if (existingUser) {
    throw fail(409, 'Phone number or email is already registered');
  }

  const existingOwner = await prisma.owner.findUnique({ where: { national_id } });
  if (existingOwner) {
    throw fail(409, 'This national ID is already registered. Visit the land office to link it to your account.');
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    const user = await prisma.user.create({
      data: {
        phone_number,
        email: email || null,
        password_hash,
        role: 'CITIZEN',
        owner: {
          create: {
            full_name,
            national_id,
            phone_number,
            address: address || null,
          },
        },
      },
    });
    return publicUser(user);
  } catch (err) {
    if (err.code === 'P2002') {
      throw fail(409, 'Phone number, email or national ID is already registered');
    }
    throw err;
  }
}

async function login(data) {
  const body = data || {};
  const identifier = str(body.identifier);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!identifier || !password) {
    throw fail(400, 'identifier and password are required');
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ phone_number: identifier }, { email: identifier.toLowerCase() }],
    },
  });

  const passwordOk = await bcrypt.compare(
    password,
    user ? user.password_hash : DUMMY_HASH
  );
  if (!user || !user.is_active || !passwordOk) {
    throw fail(401, 'Invalid credentials');
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  otpStore.set(user.id, {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  console.log(`[MOCK SMS] OTP for ${user.phone_number}: ${code}`);

  const result = { otp_required: true, user_id: user.id };
  if (process.env.NODE_ENV !== 'production') result.dev_otp = code;
  return result;
}

async function verifyOtp(data) {
  const body = data || {};
  const userId = Number(body.user_id);
  const otp = str(String(body.otp ?? ''));

  const entry = otpStore.get(userId);
  if (!entry || Date.now() > entry.expiresAt) {
    otpStore.delete(userId);
    throw fail(401, 'OTP expired or not requested. Please log in again.');
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_OTP_ATTEMPTS) {
    otpStore.delete(userId);
    throw fail(429, 'Too many attempts. Please log in again.');
  }
  if (entry.code !== otp) {
    throw fail(401, 'Invalid OTP');
  }
  otpStore.delete(userId);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { is_phone_verified: true },
  });

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  return { token, user: publicUser(user) };
}

async function getProfile(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone_number: true,
      email: true,
      role: true,
      is_phone_verified: true,
      created_at: true,
      owner: {
        select: { id: true, full_name: true, national_id: true, address: true },
      },
    },
  });
}

module.exports = { register, login, verifyOtp, getProfile };