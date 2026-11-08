const mongoose = require('mongoose');
// Append-only. Every team change writes one row in the SAME transaction
// as the change itself, so the log can never claim something that did not happen.
const auditLogSchema = new mongoose.Schema({
  hackathonId: { type: String, required: true, index: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  action: { type: String, required: true }, // team_created | member_joined | member_left | leader_changed | request_accepted | request_declined | team_deleted | invite_regenerated | member_removed
  details: { type: String, default: '' },
}, { timestamps: true });
auditLogSchema.index({ team: 1, createdAt: -1 });
module.exports = mongoose.model('AuditLog', auditLogSchema);
