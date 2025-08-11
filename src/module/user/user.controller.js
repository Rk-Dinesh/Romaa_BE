import UserService from "./user.service.js";

export const register = async (req, res) => {
  try {
    const user = await UserService.register(req.body);
    res.status(201).json({ status: true, message: "User registered successfully", data: user });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getUserByEmailOrMobile = async (req, res) => {
  try {
    const user = await UserService.getUserByEmailOrMobile(req.params.identifier);
    if (!user) return res.status(404).json({ status: false, message: "User not found" });
    res.status(200).json({ status: true, data: user });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const updateUserById = async (req, res) => {
  try {
    const updatedUser = await UserService.updateUserById(req.params.id, req.body);
    if (!updatedUser) return res.status(404).json({ status: false, message: "User not found" });
    res.status(200).json({ status: true, message: "User updated successfully", data: updatedUser });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const checkIfUserExistsByMail = async (req, res) => {
  try {
    const exists = await UserService.checkIfUserExistsByMail(req.params.email);
    res.status(200).json({ status: true, available: exists });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const checkIfUserExistsByMobile = async (req, res) => {
  try {
    const exists = await UserService.checkIfUserExistsByMobile(req.params.mobile);
    res.status(200).json({ status: true, available: exists });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const addRefreshToken = async (req, res) => {
  try {
    const success = await UserService.addRefreshToken(req.body.refreshToken, req.params.id);
    res.status(200).json({ status: true, updated: success });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const revokeRefreshToken = async (req, res) => {
  try {
    const success = await UserService.revokeRefreshToken(req.params.id);
    res.status(200).json({ status: true, revoked: success });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getUserById = async (req, res) => {
  try {
    const user = await UserService.getUserById(req.params.id);
    if (!user) return res.status(404).json({ status: false, message: "User not found" });
    res.status(200).json({ status: true, data: user });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getUserByMail = async (req, res) => {
  try {
    const user = await UserService.getUserByMail(req.params.email);
    if (!user) return res.status(404).json({ status: false, message: "User not found" });
    res.status(200).json({ status: true, data: user });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const getUsersByPage = async (req, res) => {
  try {
    const pageData = {
      skip: parseInt(req.query.skip) || 0,
      limit: parseInt(req.query.limit) || 10,
      search: req.query.search || "",
      searchBy: req.query.searchBy || "",
    };

    const users = await UserService.getUsersByPage(pageData);
    res.status(200).json({ status: true, data: users });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};



export const getUserByMobile = async (req, res) => {
  try {
    const user = await UserService.getUserByMobile(req.params.mobile);
    if (!user) return res.status(404).json({ status: false, message: "User not found" });
    res.status(200).json({ status: true, data: user });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const result = await UserService.updateUser(req.body);
    res.status(200).json({ status: true, message: "User updated", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const deleteUser = async (req, res) => {
  try {
    const deleted = await UserService.deleteUser(req.params.id);
    if (!deleted) return res.status(404).json({ status: false, message: "User not found" });
    res.status(200).json({ status: true, message: "User deleted", data: deleted });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const assignRoleToUser = async (req, res) => {
  try {
    const { userId, role_id } = req.body; // userId = user record _id, role_id = from Roles collection
    const updatedUser = await UserService.assignRoleToUser(userId, role_id);

    if (!updatedUser) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    res.status(200).json({
      status: true,
      message: "Role assigned successfully",
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const updateUserRole = async (req, res) => {
  try {
    const { userId, role_id } = req.body;
    const updatedUser = await UserService.updateUserRole(userId, role_id);

    if (!updatedUser) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    res.status(200).json({
      status: true,
      message: "User role updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

