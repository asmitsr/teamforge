const mongoose = require('mongoose');
const joinRequestSchema = new mongoose.Schema({
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined', 'cancelled'], default: 'pending' },
  message: { type: String, default: '', maxlength: 300 },
}, { timestamps: true });
joinRequestSchema.index({ team: 1, status: 1, createdAt: -1 });
joinRequestSchema.index({ user: 1, status: 1 });
module.exports = mongoose.model('JoinRequest', joinRequestSchema);
