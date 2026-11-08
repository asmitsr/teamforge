// Last middleware. Never leak stack traces to the client.
function errorHandler(err, req, res, _next) {
  // eslint-disable-next-line no-console
  console.error(err);
  if (err && err.code === 11000) return res.status(409).json({ error: { message: 'Duplicate record', code: 'CONFLICT' } });
  return res.status(500).json({ error: { message: 'Something went wrong', code: 'INTERNAL_ERROR' } });
}
function notFound(req, res) { return res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } }); }
module.exports = { errorHandler, notFound };
