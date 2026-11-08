// Run a zod schema against req.body / req.query / req.params.
// On failure: 400 with the exact field errors (no stack leak).
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({ error: { message: 'Invalid input', code: 'VALIDATION_ERROR',
        details: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } });
    }
    req[source] = result.data;
    return next();
  };
}
module.exports = { validate };
