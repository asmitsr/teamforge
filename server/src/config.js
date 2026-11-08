require('dotenv').config();
// All config comes from env vars, so the same code runs locally, in CI and on Render.
module.exports = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/teamforge',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  hackathonId: process.env.HACKATHON_ID || 'hack4hack-2026',
  teamMinSize: Number(process.env.TEAM_MIN_SIZE || 2),
  teamMaxSize: Number(process.env.TEAM_MAX_SIZE || 4),
  inviteTtlHours: Number(process.env.INVITE_CODE_TTL_HOURS || 48),
};
