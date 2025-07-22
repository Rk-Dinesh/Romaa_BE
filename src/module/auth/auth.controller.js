import logger from "../../config/logger.js";
import jwt from "jsonwebtoken";
import * as AuthService from "./auth.service.js";
import RoleService from "../role/role.service.js";
import UserService from "../user/user.service.js";
import { ErrorMessage } from "../../common/App.message.js";
import { getUserToUserTokenDto } from "../../common/App.helperFunction.js";
import { setCookieConfig } from "../../config/cookies.js";

export const signinCheck = async (req, res) => {
  try {
    const { email, mobile } = req.body;
    const clientId = req.headers["x-client-id"] ?? "";

    if (!clientId)
      res
        .status(401)
        .json({ message: "Unauthorized - Authentication required" });

    const identifier = email ?? mobile ?? "";
    const user = await UserService.getUserByEmailOrMobile(identifier);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json({ message: "User found" });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const signIn = async (req, res) => {
  try {
    const { email, mobile, password } = req.body;
    const clientId = req.headers["x-client-id"] ?? "";

    if (!clientId) {
      res
        .status(401)
        .json({ message: "Unauthorized - Authentication required" });
      return;
    }

    const identifier = email ?? mobile ?? "";
    const user = await UserService.getUserByEmailOrMobile(identifier);

    if (!user) {
      logger.error(`Sign In failed: User not found - ${identifier}`);
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (!user.password) {
      logger.error(
        `Sign In failed: Password is missing for user - ${identifier}`
      );
      res.status(400).json({ message: "Password is missing" });
      return;
    }

    const isPasswordValid = await AuthService.comparePassword(
      password,
      user.password
    );

    if (!isPasswordValid) {
      logger.error(`Sign In failed: Invalid credentials - ${identifier}`);
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const accessToken = await AuthService.generateToken(user);
    const refreshToken = AuthService.generateRefreshToken(user);

    await UserService.updateUserById(user._id, {
      refreshToken,
      lastLogin: new Date(),
    });
    const safeUser = user.toObject
      ? getUserToUserTokenDto(user.toObject())
      : {};
    let response;
    if (clientId === "ADMIN") {
      res.cookie("refreshToken", refreshToken, setCookieConfig);
      response = {
        accessToken,
        userData: safeUser,
      };
    } else if (clientId === "MOBILE") {
      response = {
        refreshToken,
        accessToken,
        userData: safeUser,
      };
    }
    logger.info(`User logged in successfully: ${identifier}`);
    res.status(200).json({
      status: true,
      message: "User logged in successfully",
      ...response,
    });
  } catch (error) {
    logger.error(`Error in signin: ${error.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const refreshToken = async (req, res) => {
  try {
    const clientId = req.headers["x-client-id"] ?? "";
    const isMobile = clientId === "MOBILE";
    const refreshToken = isMobile
      ? req.body.refreshToken
      : req.cookies.refreshToken;
    if (!refreshToken) {
      res.status(400).json({ message: "Token required" });
      return;
    }
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    const user = decoded?.id ? await UserService.getUserById(decoded.id) : null;
    if (!user || user?.refreshToken !== refreshToken) {
      res.status(403).json({ message: "Invalid refresh token" });
      return;
    }
    const accessToken = await AuthService.generateToken(user);
    const userData = user.toObject
      ? getUserToUserTokenDto(user.toObject())
      : {};
    res.status(200).json({
      status: true,
      message: "Token refreshed successfully",
      accessToken,
      userData,
    });
  } catch (error) {
    logger.error("Invalid refresh token error" + error);
    res.status(500).json({ message: "Invalid refresh token" });
  }
};

export const signOut = async (req, res) => {
  try {
    const clientId = req.headers["x-client-id"] ?? "";
    const isMobile = clientId === "MOBILE";
    const refreshToken = isMobile
      ? req.body.refreshToken
      : req.cookies.refreshToken;
    if (!refreshToken) {
      logger.error(
        `Signout failed: No refresh token provided (Client: ${clientId})`
      );
      res.status(400).json({ message: "No refresh token provided" });
      return;
    }
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    } catch (error) {
      logger.error(
        `Invalid or expired refresh token during sign-out (Client: ${clientId}) error: ${error}`
      );
      res.status(401).json({ message: "Invalid or expired refresh token" });
      return;
    }
    if (!decoded?.id) {
      logger.error("Signout failed: Invalid token payload");
      res.status(401).json({ message: "Invalid token payload" });
      return;
    }
    // Remove the refresh token from the database (invalidate it)
    const user = await UserService.revokeRefreshToken(decoded.id);
    if (!user) {
      logger.error(`User not found in sign-out for Id: ${decoded.id}`);
      res.status(500).json({ message: "User not found" });
      return;
    }

    if (!isMobile) {
      // Clear the refresh token cookie in the browser
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    }

    logger.info(
      `User signed out successfully (Client: ${clientId}, User Id: ${decoded.id})`
    );
    res.status(200).json({ message: "Signed out successfully" });
  } catch (error) {
    logger.error(`Error in signOut: ${error.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
};
