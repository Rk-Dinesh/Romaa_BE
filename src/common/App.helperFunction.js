export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Standard paginated response builder
export const paginatedResponse = (res, { data, page, limit, total }) => {
  return res.status(200).json({
    status: true,
    data,
    pagination: {
      current_page:  Number(page),
      page_size:     Number(limit),
      total_items:   Number(total),
      total_pages:   Math.ceil(total / limit),
    },
  });
};

// Structured error logger — includes correlationId when set by upstream middleware
export const logError = (logger, req, err, context = "") => {
  logger.error({
    correlationId: req?.correlationId,
    context,
    message: err.message,
    stack: err.stack,
  });
};

export const getUserToUserTokenDto = (user) => {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    mobile: user.mobile,
    level: user.level,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export const getUserFullDto = (user) => {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    mobile: user.mobile,
    city: user.city,
    country: user.country,
    pincode: user.pincode,
    state: user.state,
    address: user.address,
    bloodGroup: user.bloodGroup,
    userId: user.user_id,
    level: user.level,
    status: user.status,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};
