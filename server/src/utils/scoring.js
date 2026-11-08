// Teammate-suggestion scoring, explained so it can be defended in interview.
//
// score = 0.6 * skillScore + 0.4 * timezoneScore   (range 0..1)
//
// skillScore = (candidate skills the user does NOT have) / (candidate skills)
//   → rewards complementary skills, not the same skills twice.
// timezoneScore = 1 - min(|offsetA - offsetB|, 24 - |offsetA - offsetB|) / 12
//   → 1.0 for the same offset, 0.0 for 12h apart (opposite working hours).
// Weights: skills matter more than timezone (0.6 vs 0.4) because a team
// that cannot build together fails even if it meets easily; timezone still
// matters because a hackathon team must overlap for live collaboration.
function scoreSuggestion(user, candidate) {
  const userSkills = new Set((user.skills || []).map((s) => String(s).toLowerCase()));
  const candSkills = (candidate.skills || []).map((s) => String(s).toLowerCase());
  const complementary = candSkills.filter((s) => !userSkills.has(s)).length;
  const skillScore = candSkills.length ? complementary / candSkills.length : 0;
  const diff = Math.abs((user.utcOffset || 0) - (candidate.utcOffset || 0));
  const wrapped = Math.min(diff, 24 - diff);
  const timezoneScore = 1 - wrapped / 12;
  const score = Math.round((0.6 * skillScore + 0.4 * timezoneScore) * 1000) / 1000;
  return { score, skillScore: Math.round(skillScore * 1000) / 1000, timezoneScore: Math.round(timezoneScore * 1000) / 1000,
    complementarySkills: (candidate.skills || []).filter((s) => !userSkills.has(String(s).toLowerCase())) };
}
module.exports = { scoreSuggestion };
