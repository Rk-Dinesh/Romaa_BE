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
      const generateCode = await IdcodeServices.addIdCode(idname, idcode);
      const user_id = await IdcodeServices.generateCode(idname);
      if (!user_id) {
        throw new Error("Failed to generate user ID.");
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
      throw new Error("User registration failed.");
    }
  }
  static async getUserByEmailOrMobile(identifier) {
    try {
      const user = await UserModel.findOne({
        $or: [{ email: identifier }, { mobile: identifier }],
      });

      return user;
    } catch (error) {
      throw new Error("Error fetching user by email or mobile: " + error);
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
      throw new Error("Error updating user by Id: " + error);
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
      throw new Error("Error checking user existence: " + error);
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
      throw new Error("Error checking user existence: " + error);
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
      throw new Error(
        "Error updating refresh token: " +
          (error instanceof Error ? error.message : error)
      );
    }
  }

  static async revokeRefreshToken(userId) {
    try {
      const result = await UserModel.findByIdAndUpdate(userId, {
        refreshToken: null,
      });
      return result !== null;
    } catch (error) {
      throw new Error(
        "Error updating refresh token: " +
          (error instanceof Error ? error.message : error)
      );
    }
  }

  static async getUserById(id) {
    try {
      const user = await UserModel.findById(id);
      return user;
    } catch (error) {
      throw new Error("Error fetching users: " + error);
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
      throw new Error("Error checking user existence: " + error);
    }
  }

 static async getUsersByPage(pageData) {
  try {
    const { skip, limit, search, searchBy } = pageData;

  ;

    const [data, total] = await Promise.all([
      UserModel.find(search ? { [searchBy]: new RegExp(search, "i") } : {})
        .sort({ _id: 1 }) // Always ascending by _id
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
    throw new Error("Error fetching paginated users: " + error.message);
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
      throw new Error("Error checking user existence: " + error);
    }
  }

  static async updateUser(userData) {
    try {
      const query = { _id: userData.id };
      const update = { $set: { ...userData } };
      const result = await UserModel.updateOne(query, update);
      if (result.matchedCount === 0) {
        throw new Error("User not found");
      }
      return result;
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("Unknown error occurred while updating user.");
    }
  }

  static async deleteUser(id) {
    try {
      return await UserModel.findOneAndDelete(id);
    } catch (error) {
      throw new Error("Error deleting user: " + error);
    }
  }

  static async assignRoleToUser(userId, role_id) {
    try {
      // Assuming userId is Mongo _id
      return await UserModel.findByIdAndUpdate(
        userId,
        { $set: { roleId: role_id } },
        { new: true }
      );
    } catch (error) {
      throw new Error("Error assigning role to user: " + error.message);
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
      throw new Error("Error updating user role: " + error.message);
    }
  }
}

export default UserService;
