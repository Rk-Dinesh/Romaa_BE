import bcrypt from "bcrypt";
import logger from "../../config/logger.js";
import UserModel from "./user.model.js";

class UserService {
  static async register(userData) {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Create and save user in DB
      const createUser = new UserModel({
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
      throw new Error('Error fetching user by email or mobile: ' + error);
    }
  }
  static async updateUserById(userId, updateData) {
    try {
      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { $set: updateData, $inc: { __v: 1 } },
        { new: true },
      );
      return updatedUser;
    } catch (error) {
      throw new Error('Error updating user by Id: ' + error);
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

  static async getUsersByPage(pageData, level) {
    try {
      const { skip, limit, sortBy, order, search, searchBy } = pageData;
      const filter = getFilterQueryForAdmin(search, searchBy, level);
      const [data, total] = await Promise.all([
        UserModel.find(filter).sort(sortOption).skip(skip).limit(limit),
        UserModel.countDocuments(filter),
      ]);
      const dataSet = {
        data,
        total,
        limit,
        sortBy,
        order,
        search,
        searchBy,
        totalPages: Math.ceil(total / limit),
      };
      return dataSet;
    } catch (error) {
      throw new Error("Error checking user existence: " + error);
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
}

export default UserService;
