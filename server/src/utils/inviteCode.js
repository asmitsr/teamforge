const crypto = require('crypto');
// Crockford Base32: no I, L, O, U — so a code read over the phone cannot
// be confused (0/O, 1/I/l). 8 chars from 32 symbols = 32^8 ≈ 1.1 trillion
// combinations; guessing is hopeless, and we still rate-limit attempts.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateInviteCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return code;
}
module.exports = { generateInviteCode, ALPHABET };
