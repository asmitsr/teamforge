const mongoose = require('mongoose');
const config = require('../config');
// members is an embedded array so "how full is this team?" is one
// document read, and the size check + push can be one atomic update.
const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });
const teamSchema = new mongoose.Schema({
  hackathonId: { type: String, default: config.hackathonId, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 500 },
  leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: { type: [memberSchema], default: [] },
  maxSize: { type: Number, default: config.teamMaxSize },
  inviteCode: { type: String, required: true, unique: true, index: true },
  inviteCodeExpiresAt: { type: Date, required: true },
  lookingForTeammates: { type: Boolean, default: true },
  skillsWanted: { type: [String], default: [] },
}, { timestamps: true });
teamSchema.index({ hackathonId: 1, lookingForTeammates: 1, createdAt: -1 });
module.exports = mongoose.model('Team', teamSchema);
