const messages = {
  USER_NOT_FOUND: 'User not found',
  EMAIL_NOT_FOUND: 'User with this email does not exist',
  OTP_NOT_MATCH: 'OTP not matching',
  PASSWORD_MISMATCH: 'Passwords do not match',
  PASSWORD_SAME_AS_OLD: 'Password must be different from your old password',
  ADDRESS_NOT_FOUND: 'Address not found',
  ADDRESS_ADDED: 'Address added successfully',
  ADDRESS_UPDATED: 'Address updated successfully',
  ADDRESS_DELETED: 'Address deleted',
  PRODUCT_NOT_FOUND: 'Product not found.',
  PRODUCT_BLOCKED: 'This product has been blocked by the admin.',
  VARIANT_INVALID: 'Invalid Variant selected',
  QUANTITY_EXCEEDS: 'Requested quantity exceeds stock',
  CART_NOT_FOUND: 'Cart not found',
  ITEM_NOT_FOUND: 'Product not found in cart',
  SOMETHING_WENT_WRONG: 'Something went wrong',
  SERVER_ERROR : 'Internal Server Error'
    // ...add more as needed
};

module.exports = messages;