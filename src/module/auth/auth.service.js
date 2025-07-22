import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import RoleService from "../role/role.service.js";
import dotenv from "dotenv"
dotenv.config()

export const generateToken = async (user) => {
  const getPermission = await RoleService.getRolesById(user.roleId);
  return jwt.sign(
    {
      id: user._id,
      level: user.level,
      permissions: getPermission?.permissions,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "60m",
    }
  );
};

export const generateRefreshToken = (user) => {
  return jwt.sign({ id: user._id }, process.env.REFRESH_SECRET, {
    expiresIn: "7d",
  });
};

export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

export const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};
