const mongoose = require('mongoose');
// One user = one person. teamId is the single source of truth for
// "one team per person per hackathon" — it is set/cleared inside the
// same transaction that adds/removes the member, so the two can never drift.
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  skills: { type: [String], default: [] },           // e.g. ["React","Node.js"]
  timezone: { type: String, default: 'Asia/Dhaka' }, // IANA name, shown in UI
  utcOffset: { type: Number, default: 6, min: -12, max: 14 }, // hours from UTC, used for suggestions
  bio: { type: String, default: '', maxlength: 300 },
  lookingForTeammates: { type: Boolean, default: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
}, { timestamps: true });
userSchema.index({ lookingForTeammates: 1, createdAt: -1 });
module.exports = mongoose.model('User', userSchema);
