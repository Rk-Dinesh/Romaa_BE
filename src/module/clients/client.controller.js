import logger from "../../config/logger.js";
import IdcodeServices from "../idcode/idcode.service.js";
import ClientService from "./client.service.js";

// Create Client
export const createClient = async (req, res) => {
  try {
    const { client_name, pan_no, cin_no, gstin, contact_email, contact_phone, address, status, created_by_user } = req.body;
    const idname = "ClientDetails";
    const idcode = "CLI";
    await IdcodeServices.addIdCode(idname, idcode);
    const client_id = await IdcodeServices.generateCode(idname);
    const clientData = {
      client_id,
      client_name,
      pan_no,
      cin_no,
      gstin,
      contact_email,
      contact_phone,
      address,
      status,
      created_by_user,
    };
    const result = await ClientService.addClient(clientData);
    res.status(200).json({
      status: true,
      message: "Client created successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`Error creating client: ${error.message}`);
    res.status(500).json({
      status: false,
      message: "Error creating client",
      error: error.message,
    });
  }
};

// Get by client_id
export const getClientById = async (req, res) => {
  const { client_id } = req.query;
  try {
    const client = await ClientService.getClientById(client_id);
    res.status(200).json({
      status: true,
      message: "Client fetched successfully",
      data: client,
    });
  } catch (error) {
    logger.error(`Error while getting client: ${error.message}`);
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get all clients
export const getAllClients = async (req, res) => {
  try {
    const clients = await ClientService.getAllClients();
    res.status(200).json({
      status: true,
      message: "All clients fetched successfully",
      data: clients,
    });
  } catch (error) {
    logger.error(`Error while getting all clients: ${error.message}`);
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update by client_id
export const updateClientById = async (req, res) => {
  const { client_id } = req.query;
  try {
    const update = req.body;
    const updated = await ClientService.updateClientById(client_id, update);
    res.status(200).json({
      status: true,
      message: "Client updated successfully",
      data: updated,
    });
  } catch (error) {
    logger.error(`Error while updating client: ${error.message}`);
    res.status(500).json({ status: false, message: error.message });
  }
};

// Delete by client_id
export const deleteClientById = async (req, res) => {
  const { client_id } = req.query;
  try {
    const deleted = await ClientService.deleteClientById(client_id);
    res.status(200).json({
      status: true,
      message: "Client deleted successfully",
      data: deleted,
    });
  } catch (error) {
    logger.error(`Error while deleting client: ${error.message}`);
    res.status(500).json({ status: false, message: error.message });
  }
};
