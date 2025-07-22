export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
