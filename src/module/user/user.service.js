import bcrypt from "bcrypt";
import logger from "../../config/logger.js";
import UserModel from "./user.model.js";
import { Status } from "../../common/App.const.js";
import IdcodeServices from "../idcode/idcode.service.js";

class UserService {
  static async register(userData) {
    try {
      const idname = "EMPLOYEE";
      const idcode = "EMP";
      await IdcodeServices.addIdCode(idname, idcode);
      const user_id = await IdcodeServices.generateCode(idname);
      if (!user_id) {
        throw new Error("Failed to generate employee ID. Please contact the system administrator");
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Create and save user in DB
      const createUser = new UserModel({
        user_id,
        ...userData,
        password: hashedPassword,
      });

      const user = await createUser.save();

      // Convert Mongoose Document to a plain object
      return user;
    } catch (err) {
      logger.error("Error in user registration:", err ? err.message : err);
      if (err.code === 11000) {
        throw new Error("A user with this email or mobile number already exists in the system");
      }
      throw new Error(err.message || "User registration failed. Please verify the provided details and try again");
    }
  }

  static async getUserByEmailOrMobile(identifier) {
    try {
      const user = await UserModel.findOne({
        $or: [{ email: identifier }, { mobile: identifier }],
      });

      return user;
    } catch (error) {
      logger.error("Error fetching user by email or mobile: " + error);
      throw new Error("Unable to retrieve user details. Please try again later");
    }
  }

  static async updateUserById(userId, updateData) {
    try {
      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { $set: updateData, $inc: { __v: 1 } },
        { new: true }
      );
      return updatedUser;
    } catch (error) {
      logger.error("Error updating user by ID: " + error);
      throw new Error("Failed to update user record. Please verify the details and try again");
    }
  }

  static async checkIfUserExistsByMail(email) {
    try {
      const user = await UserModel.findOne({
        email,
        status: { $ne: Status.NEW },
      });
      return !user;
    } catch (error) {
      logger.error("Error checking user existence by email: " + error);
      throw new Error("Unable to verify email availability. Please try again later");
    }
  }

  static async checkIfUserExistsByMobile(mobile) {
    try {
      const user = await UserModel.findOne({
        mobile,
        status: { $ne: Status.NEW },
      });
      return !user;
    } catch (error) {
      logger.error("Error checking user existence by mobile: " + error);
      throw new Error("Unable to verify mobile number availability. Please try again later");
    }
  }

  static async addRefreshToken(refreshToken, userId) {
    try {
      const result = await UserModel.updateOne(
        { _id: userId },
        { $set: { refreshToken } }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      logger.error("Error storing refresh token: " + (error instanceof Error ? error.message : error));
      throw new Error("Failed to update session token. Please sign in again");
    }
  }

  static async revokeRefreshToken(userId) {
    try {
      const result = await UserModel.findByIdAndUpdate(userId, {
        refreshToken: null,
      });
      return result !== null;
    } catch (error) {
      logger.error("Error revoking refresh token: " + (error instanceof Error ? error.message : error));
      throw new Error("Failed to revoke session token. Please try signing out again");
    }
  }

  static async getUserById(id) {
    try {
      const user = await UserModel.findById(id);
      return user;
    } catch (error) {
      logger.error("Error fetching user by ID: " + error);
      throw new Error("Unable to retrieve user record. Please verify the user ID and try again");
    }
  }

  static async getUserByMail(email) {
    try {
      const user = await UserModel.findOne({
        email,
        status: { $ne: Status.NEW },
      });
      return user;
    } catch (error) {
      logger.error("Error fetching user by email: " + error);
      throw new Error("Unable to retrieve user record by email. Please try again later");
    }
  }

  static async getUsersByPage(pageData) {
    try {
      const { skip, limit, search, searchBy } = pageData;

      const filter = search && searchBy ? { [searchBy]: new RegExp(search, "i") } : {};

      const [data, total] = await Promise.all([
        UserModel.find(filter)
          .sort({ _id: 1 })
          .skip(skip)
          .limit(limit),
        UserModel.countDocuments(filter),
      ]);

      return {
        data,
        total,
        limit,
        skip,
        search,
        searchBy,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error("Error fetching paginated users: " + error.message);
      throw new Error("Unable to retrieve user list. Please adjust your search criteria and try again");
    }
  }

  static async getUserByMobile(mobile) {
    try {
      const user = await UserModel.findOne({
        mobile,
        status: { $ne: Status.NEW },
      });
      return user;
    } catch (error) {
      logger.error("Error fetching user by mobile: " + error);
      throw new Error("Unable to retrieve user record by mobile number. Please try again later");
    }
  }

  static async updateUser(userData) {
    try {
      const query = { _id: userData.id };
      const update = { $set: { ...userData } };
      const result = await UserModel.updateOne(query, update);
      if (result.matchedCount === 0) {
        throw new Error("User record not found. Please verify the user ID and try again");
      }
      return result;
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("An unexpected error occurred while updating the user record");
    }
  }

  static async deleteUser(id) {
    try {
      return await UserModel.findOneAndDelete(id);
    } catch (error) {
      logger.error("Error deleting user: " + error);
      throw new Error("Failed to delete user record. Please try again later");
    }
  }

  static async assignRoleToUser(userId, role_id) {
    try {
      return await UserModel.findByIdAndUpdate(
        userId,
        { $set: { roleId: role_id } },
        { new: true }
      );
    } catch (error) {
      logger.error("Error assigning role to user: " + error.message);
      throw new Error("Failed to assign role to user. Please verify the user and role details and try again");
    }
  }

  // Update only the user's role
  static async updateUserRole(userId, role_id) {
    try {
      return await UserModel.findByIdAndUpdate(
        userId,
        { $set: { roleId: role_id } },
        { new: true }
      );
    } catch (error) {
      logger.error("Error updating user role: " + error.message);
      throw new Error("Failed to update the user's role assignment. Please verify the details and try again");
    }
  }
}

export default UserService;
