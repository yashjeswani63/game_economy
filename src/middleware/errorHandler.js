const { ValidationError } = require('../validator');

function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  if (err instanceof ValidationError || err.name === 'ValidationError' || err.statusCode === 400) {
    return res.status(err.statusCode || 400).json({
      success: false,
      error: err.message
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
}

module.exports = {
  ValidationError,
  errorHandler
};
