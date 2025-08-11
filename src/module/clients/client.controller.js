import ClientService from "./client.service.js";

// Create
export const createClient = async (req, res) => {
  try {
    const result = await ClientService.addClient(req.body);
    res.status(201).json({ status: true, message: "Client created", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get by client_id
export const getClientById = async (req, res) => {
  try {
    const client = await ClientService.getClientById(req.params.client_id);
    if (!client) return res.status(404).json({ status: false, message: "Client not found" });
    res.status(200).json({ status: true, data: client });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get all
export const getAllClients = async (req, res) => {
  try {
    const clients = await ClientService.getAllClients();
    res.status(200).json({ status: true, data: clients });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Get active clients
export const getActiveClients = async (req, res) => {
  try {
    const clients = await ClientService.getActiveClients();
    res.status(200).json({ status: true, data: clients });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Update
export const updateClient = async (req, res) => {
  try {
    const updated = await ClientService.updateClient(req.params.client_id, req.body);
    if (!updated) return res.status(404).json({ status: false, message: "Client not found" });
    res.status(200).json({ status: true, message: "Client updated", data: updated });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Delete
export const deleteClient = async (req, res) => {
  try {
    const deleted = await ClientService.deleteClient(req.params.client_id);
    if (!deleted) return res.status(404).json({ status: false, message: "Client not found" });
    res.status(200).json({ status: true, message: "Client deleted", data: deleted });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Search
export const searchClients = async (req, res) => {
  try {
    const result = await ClientService.searchClients(req.query.q || "");
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
