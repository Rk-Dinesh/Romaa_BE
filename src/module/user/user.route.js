import { Router } from "express";
import {
  register,
  getUserByEmailOrMobile,
  updateUserById,
  checkIfUserExistsByMail,
  checkIfUserExistsByMobile,
  addRefreshToken,
  revokeRefreshToken,
  getUserById,
  getUserByMail,
  getUsersByPage,
  getUserByMobile,
  updateUser,
  deleteUser,
  assignRoleToUser,
  updateUserRole
} from "./user.controller.js";

const userRoute = Router();

// REGISTER
userRoute.post("/adduser", register);

// GET by email or mobile
userRoute.get("/getbyemailormobile/:identifier", getUserByEmailOrMobile);

// UPDATE by ID
userRoute.put("/updatebyid/:id", updateUserById);

// CHECK existence
userRoute.get("/checkemail/:email", checkIfUserExistsByMail);
userRoute.get("/checkmobile/:mobile", checkIfUserExistsByMobile);

// TOKEN actions
userRoute.put("/addrefreshtoken/:id", addRefreshToken);
userRoute.put("/revokerefreshtoken/:id", revokeRefreshToken);

// GET by ID / email / mobile
userRoute.get("/getbyid/:id", getUserById);
userRoute.get("/getbymail/:email", getUserByMail);
userRoute.get("/getbymobile/:mobile", getUserByMobile);

// PAGINATED list
userRoute.get("/getusersbypage", getUsersByPage);

// GENERIC update (expects full object with id in body)
userRoute.put("/updateuser", updateUser);

// DELETE
userRoute.delete("/deleteuser/:id", deleteUser);

// Assign a new role to user
userRoute.put("/assignrole", assignRoleToUser);

// Update user's role
userRoute.put("/updaterole", updateUserRole);

export default userRoute;
