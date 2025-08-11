import { Router } from "express";
import {
  createClient,
  getClientById,
  getAllClients,
  getActiveClients,
  updateClient,
  deleteClient,
  searchClients
} from "./client.controller.js";

const clientRoute = Router();

// Create
clientRoute.post("/addclient", createClient);

// Read
clientRoute.get("/getclient/:client_id", getClientById);
clientRoute.get("/getallclients", getAllClients);
clientRoute.get("/getactiveclients", getActiveClients);

// Search
clientRoute.get("/searchclients", searchClients);

// Update
clientRoute.put("/updateclient/:client_id", updateClient);

// Delete
clientRoute.delete("/deleteclient/:client_id", deleteClient);

export default clientRoute;
