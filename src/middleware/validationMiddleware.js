const { ValidationError } = require('./errorHandler');
const {
  validatePlayerId,
  validateAmount,
  validateReason,
  validateItemId,
  validateRewardId,
  validatePrice,
  validateIdempotencyKey,
  validateRequestBody
} = require('../validator');

/**
 * Middleware to validate request body structure
 */
function validateBody(requiredFields) {
  return (req, res, next) => {
    try {
      validateRequestBody(req.body, requiredFields);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to validate playerId parameter
 */
function validatePlayerIdParam(req, res, next) {
  try {
    req.params.playerId = validatePlayerId(req.params.playerId);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to validate rewardId parameter
 */
function validateRewardIdParam(req, res, next) {
  try {
    req.params.rewardId = validateRewardId(req.params.rewardId);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to validate credit request body
 */
function validateCreditBody(req, res, next) {
  try {
    req.body.amount = validateAmount(req.body.amount);
    req.body.reason = validateReason(req.body.reason);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to validate purchase request body
 */
function validatePurchaseBody(req, res, next) {
  try {
    req.body.itemId = validateItemId(req.body.itemId);
    req.body.price = validatePrice(req.body.price);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to validate claim request body
 */
function validateClaimBody(req, res, next) {
  try {
    req.body.playerId = validatePlayerId(req.body.playerId);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  validateBody,
  validatePlayerIdParam,
  validateRewardIdParam,
  validateCreditBody,
  validatePurchaseBody,
  validateClaimBody
};
