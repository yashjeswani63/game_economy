const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;
const MAX_STRING_LENGTH = 255;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

function validatePlayerId(playerId) {
  if (!playerId || typeof playerId !== 'string') {
    throw new ValidationError('playerId is required and must be a string');
  }
  if (playerId.length > MAX_STRING_LENGTH) {
    throw new ValidationError('playerId exceeds maximum length');
  }
  if (playerId.trim() === '') {
    throw new ValidationError('playerId cannot be empty');
  }
  return playerId;
}

function validateAmount(amount) {
  if (amount === undefined || amount === null) {
    throw new ValidationError('amount is required');
  }
  const num = Number(amount);
  if (isNaN(num)) {
    throw new ValidationError('amount must be a number');
  }
  if (!Number.isInteger(num)) {
    throw new ValidationError('amount must be an integer');
  }
  if (num <= 0) {
    throw new ValidationError('amount must be greater than 0');
  }
  if (num > MAX_AMOUNT) {
    throw new ValidationError('amount exceeds maximum allowed value');
  }
  return num;
}

function validateReason(reason) {
  if (!reason || typeof reason !== 'string') {
    throw new ValidationError('reason is required and must be a string');
  }
  if (reason.length > MAX_STRING_LENGTH) {
    throw new ValidationError('reason exceeds maximum length');
  }
  return reason;
}

function validateItemId(itemId) {
  if (!itemId || typeof itemId !== 'string') {
    throw new ValidationError('itemId is required and must be a string');
  }
  if (itemId.length > MAX_STRING_LENGTH) {
    throw new ValidationError('itemId exceeds maximum length');
  }
  if (itemId.trim() === '') {
    throw new ValidationError('itemId cannot be empty');
  }
  return itemId;
}

function validateRewardId(rewardId) {
  if (!rewardId || typeof rewardId !== 'string') {
    throw new ValidationError('rewardId is required and must be a string');
  }
  if (rewardId.length > MAX_STRING_LENGTH) {
    throw new ValidationError('rewardId exceeds maximum length');
  }
  if (rewardId.trim() === '') {
    throw new ValidationError('rewardId cannot be empty');
  }
  return rewardId;
}

function validatePrice(price) {
  if (price === undefined || price === null) {
    throw new ValidationError('price is required');
  }
  const num = Number(price);
  if (isNaN(num)) {
    throw new ValidationError('price must be a number');
  }
  if (!Number.isInteger(num)) {
    throw new ValidationError('price must be an integer');
  }
  if (num <= 0) {
    throw new ValidationError('price must be greater than 0');
  }
  if (num > MAX_AMOUNT) {
    throw new ValidationError('price exceeds maximum allowed value');
  }
  return num;
}

function validateIdempotencyKey(key) {
  if (!key || typeof key !== 'string') {
    throw new ValidationError('idempotency key is required and must be a string');
  }
  if (key.length > MAX_STRING_LENGTH) {
    throw new ValidationError('idempotency key exceeds maximum length');
  }
  return key;
}

function validateRequestBody(body, requiredFields) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('request body must be a valid JSON object');
  }

  for (const field of requiredFields) {
    if (!(field in body)) {
      throw new ValidationError(`missing required field: ${field}`);
    }
  }

  return body;
}

module.exports = {
  ValidationError,
  validatePlayerId,
  validateAmount,
  validateReason,
  validateItemId,
  validateRewardId,
  validatePrice,
  validateIdempotencyKey,
  validateRequestBody
};
