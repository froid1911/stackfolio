export type ErrorCode =
  | "INVALID_COUNTERPARTY"
  | "CATEGORY_RULE_NOT_FOUND"
  | "INVALID_GIFT_BASIS";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidCounterpartyError extends Error implements ReducerError {
  errorCode = "INVALID_COUNTERPARTY" as ErrorCode;
  constructor(message = "InvalidCounterpartyError") {
    super(message);
  }
}

export class CategoryRuleNotFoundError extends Error implements ReducerError {
  errorCode = "CATEGORY_RULE_NOT_FOUND" as ErrorCode;
  constructor(message = "CategoryRuleNotFoundError") {
    super(message);
  }
}

export class InvalidGiftBasisError extends Error implements ReducerError {
  errorCode = "INVALID_GIFT_BASIS" as ErrorCode;
  constructor(message = "InvalidGiftBasisError") {
    super(message);
  }
}

export const errors = {
  AddCategoryRule: { InvalidCounterpartyError },

  UpdateCategoryRule: { CategoryRuleNotFoundError },

  RemoveCategoryRule: { CategoryRuleNotFoundError },

  SetEventCategories: { InvalidGiftBasisError },
};
