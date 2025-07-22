import { UserLevel } from "../../common/App.const.js";
import { getUserFullDto, getUserToUserTokenDto } from "../../common/App.helperFunction.js";
import { ErrorMessage } from "../../common/App.message.js";
import { pagination } from "../../common/App.pagination.js";
import logger from "../../config/logger.js";
import UserService from "./user.service.js";

export const register = async (req, res) => {
  try {
    const userData = req.body;
    // Check if user already exists
    const userExist = await UserService.checkIfUserExistsByMail(userData.email);
    if (!userExist) {
      logger.error(`Registration failed: Email already exist - ${userData.email}`);
      res.status(409).json({ message: 'User email already exists' }); // Use 409 Conflict
      return;
    }
    await UserService.register(userData);
    logger.info(`User registered successfully: ${userData.email}`);
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    logger.error(`Error in register: ${error.message}`);
  }
};

export const getAllUser = async (req, res) => {
  try {
    const level = req?.user?.level ?? UserLevel.ADMIN;
    // In req.query,page,limit,sortBy,order,searchBy,search
    const pageParam = pagination(req.query);
    console.log("Page Parameters:", pageParam);
    
    const usersData = await UserService.getUsersByPage(
      pageParam,
      level,
    );
    res.status(200).json(usersData);
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`);
    res.status(500).json({ message: 'Error fetching users' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const userData = req.body;
    const { id: userId } = req.params;
    const userDecode = req?.user;

    if (!userDecode) {
      res.status(400).json({ message: ErrorMessage.INVALID_TOKEN });
    }

    if (
      (userDecode?.level === UserLevel.USER && userData.id !== userDecode?.id) ||
      (userDecode?.level === UserLevel.ADMIN &&
        userData.organizationId !== userDecode?.organizationId)
    ) {
      res.status(401).json({ message: ErrorMessage.UNAUTHORIZED_ACCESS });
      return;
    }
    const dataSet = {
      ...userData,
    };
    await UserService.updateUserById(userId, dataSet);
    logger.info(
      `User updated successfully: ${userData.name} (Email: ${userData.email}, Id: ${userId})`,
    );
    res.status(200).json({ message: 'User updated successfully' });
  } catch (error) {
    logger.error(`Error updating user: ${error.message}`);
    res.status(500).json({ message: 'Error updating user' });
  }
};

export const getUserDetail = async (req, res) => {
  try {
    const userId = req.params.id;
    const userDecode = req?.user;
    
    if (!userDecode) {
      res.status(400).json({ message: ErrorMessage.INVALID_TOKEN });
    }
    const user = await UserService.getUserById(userId);
  
    
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (
      (userDecode?.level !== UserLevel.ADMIN )
    ) {
      res.status(401).json({ message: ErrorMessage.UNAUTHORIZED_ACCESS });
      return;
    }
    const userDetail = user.toObject ? getUserFullDto(user.toObject()) : {};
    res.status(200).json(userDetail);
  } catch (error) {
    logger.error('Error while Getting User Details' + error);
    res.status(500).json('Error while Getting User Details' + error.message);
  }
};

export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const userDecode = req?.user;

    if (!userDecode) {
      res.status(400).json({ message: ErrorMessage.INVALID_TOKEN });
    }

    const user = await UserService.getUserById(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (
      (userDecode?.level === UserLevel.USER && userId !== userDecode?.id) ||
      (userDecode?.level === UserLevel.ADMIN && user.organizationId !== userDecode?.organizationId)
    ) {
      res.status(401).json({ message: ErrorMessage.UNAUTHORIZED_ACCESS });
      return;
    }
    await UserService.deleteUser(userId);
    logger.info(`User deleted successfully: ${userId}`);
    res.status(200).json({ message: `User deleted successfully ${userId}` });
  } catch (error) {
    logger.error(`Error deleting user ${JSON.stringify(req.params.id)}: ${error.message}`);
    res.status(500).json({ message: `Error deleting user: ${error.message}` });
  }
};
