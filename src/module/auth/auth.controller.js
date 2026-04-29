import logger from "../../config/logger.js";
import jwt from "jsonwebtoken";
import * as AuthService from "./auth.service.js";
import RoleService from "../role/role.service.js";
import UserService from "../user/user.service.js";
import EmployeeModel from "../hr/employee/employee.model.js";
import { ErrorMessage } from "../../common/App.message.js";
import { getUserToUserTokenDto } from "../../common/App.helperFunction.js";
import { setCookieConfig } from "../../config/cookies.js";

export const signinCheck = async (req, res) => {
  try {
    const { email, mobile } = req.body;
    const clientId = req.headers["x-client-id"] ?? "";

    if (!clientId) {
      return res
        .status(401)
        .json({ status: false, message: "Unauthorized access. A valid client identifier is required to proceed" });
    }

    const identifier = email ?? mobile ?? "";
    if (!identifier) {
      return res.status(400).json({ status: false, message: "Please provide an email address or mobile number to sign in" });
    }

    const user = await UserService.getUserByEmailOrMobile(identifier);
    if (!user) {
      return res.status(404).json({ status: false, message: "No user account found with the provided credentials. Please verify your email or mobile number and try again" });
    }

    res.status(200).json({ status: true, message: "User account verified successfully" });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ status: false, message: "An unexpected error occurred while verifying user credentials. Please try again later" });
  }
};

export const signIn = async (req, res) => {
  try {
    const { email, mobile, password } = req.body;
    const clientId = req.headers["x-client-id"] ?? "";

    if (!clientId) {
      return res
        .status(401)
        .json({ status: false, message: "Unauthorized access. A valid client identifier is required to proceed" });
    }

    if (!password) {
      return res.status(400).json({ status: false, message: "Password is required. Please enter your password to sign in" });
    }

    const identifier = email ?? mobile ?? "";
    if (!identifier) {
      return res.status(400).json({ status: false, message: "Please provide an email address or mobile number to sign in" });
    }

    const user = await UserService.getUserByEmailOrMobile(identifier);

    if (!user) {
      logger.error(`Sign In failed: User not found - ${identifier}`);
      return res.status(404).json({ status: false, message: "No user account found with the provided credentials. Please verify your email or mobile number and try again" });
    }

    if (!user.password) {
      logger.error(
        `Sign In failed: Password is missing for user - ${identifier}`
      );
      return res.status(400).json({ status: false, message: "Your account has not been set up with a password. Please contact your administrator to configure your login credentials" });
    }

    const isPasswordValid = await AuthService.comparePassword(
      password,
      user.password
    );

    if (!isPasswordValid) {
      logger.error(`Sign In failed: Invalid credentials - ${identifier}`);
      return res.status(401).json({ status: false, message: "Invalid password provided. Please check your login details and try again" });
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
      message: "Signed in successfully",
      ...response,
    });
  } catch (error) {
    logger.error(`Error in signin: ${error.message}`);
    res.status(500).json({ status: false, message: "An unexpected error occurred during sign in. Please try again later" });
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
      return res.status(400).json({ status: false, message: "Session refresh token is required. Please sign in again to continue" });
    }
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    } catch (jwtError) {
      logger.error("Invalid or expired refresh token: " + jwtError.message);
      return res.status(401).json({ status: false, message: "Your session has expired or the refresh token is invalid. Please sign in again" });
    }

    const user = decoded?.id ? await UserService.getUserById(decoded.id) : null;
    if (!user || user?.refreshToken !== refreshToken) {
      return res.status(403).json({ status: false, message: "The provided refresh token is no longer valid. Please sign in again to obtain a new session" });
    }
    const accessToken = await AuthService.generateToken(user);
    const userData = user.toObject
      ? getUserToUserTokenDto(user.toObject())
      : {};
    res.status(200).json({
      status: true,
      message: "Session token refreshed successfully",
      accessToken,
      userData,
    });
  } catch (error) {
    logger.error("Error refreshing token: " + error);
    res.status(500).json({ status: false, message: "An unexpected error occurred while refreshing your session. Please sign in again" });
  }
};

export const updateOnboardingStatus = async (req, res) => {
  try {
    await EmployeeModel.findByIdAndUpdate(
      req.user._id,
      { $set: { hasSeenOnboarding: true } },
      { new: true, runValidators: false }
    );
    res.status(200).json({ status: true });
  } catch (error) {
    logger.error(`Error updating onboarding status: ${error.message}`);
    res.status(500).json({ status: false, message: error.message });
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
      return res.status(400).json({ status: false, message: "No active session found. A refresh token is required to sign out" });
    }
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    } catch (error) {
      logger.error(
        `Invalid or expired refresh token during sign-out (Client: ${clientId}) error: ${error}`
      );
      return res.status(401).json({ status: false, message: "Your session token is invalid or has already expired. You may already be signed out" });
    }
    if (!decoded?.id) {
      logger.error("Signout failed: Invalid token payload");
      return res.status(401).json({ status: false, message: "Invalid session token. Unable to identify the user account for sign out" });
    }
    // Remove the refresh token from the database (invalidate it)
    const user = await UserService.revokeRefreshToken(decoded.id);
    if (!user) {
      logger.error(`User not found in sign-out for Id: ${decoded.id}`);
      return res.status(404).json({ status: false, message: "User account not found. The account may have been deactivated or removed" });
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
    res.status(200).json({ status: true, message: "Signed out successfully. Your session has been terminated" });
  } catch (error) {
    logger.error(`Error in signOut: ${error.message}`);
    res.status(500).json({ status: false, message: "An unexpected error occurred during sign out. Please try again" });
  }
};
