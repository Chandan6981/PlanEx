const express    = require('express');
const http       = require('http');
const socketIo   = require('socket.io');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const dotenv     = require('dotenv');
const path       = require('path');

dotenv.config();

// ── Validate required env variables on startup ────────────────────────────────
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
REQUIRED_ENV.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ Missing required env variable: ${key}`);
    process.exit(1);
  }
});

const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, {
  cors: {
    origin:      process.env.CLIENT_URL || 'http://localhost:3000',
    methods:     ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());                        // sets secure HTTP headers
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10kb' })); // reject large payloads
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Attach socket.io instance to every request
app.use((req, res, next) => { req.io = io; next(); });

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/projects',      require('./routes/projects'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/analytics',     require('./routes/analytics'));

// ── Central error handler (must be after all routes) ─────────────────────────
app.use(require('./middleware/errorHandler'));

// ── Socket.io ─────────────────────────────────────────────────────────────────
const socketHandler = require('./socket/socketHandler');
socketHandler(io);

// ── MongoDB with indexes ──────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    // Ensure indexes exist (safe to run on every startup)
    require('./models/Task').ensureIndexes();
    require('./models/User').ensureIndexes();
  })
  .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});