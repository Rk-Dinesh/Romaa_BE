import ClientModel from "./client.model.js";
import logger from "../../config/logger.js";

class ClientService {
  static async addClient(clientDetails) {
    try {
      const newClient = new ClientModel(clientDetails);
      return await newClient.save();
    } catch (error) {
      logger.error("Error while adding a client: " + error);
      throw error;
    }
  }

  static async getClientById(clientId) {
    try {
      return await ClientModel.findOne({ client_id: clientId });
    } catch (error) {
      logger.error("Error while getting client by id: " + error);
      throw error;
    }
  }

  static async getAllClients() {
    try {
      return await ClientModel.find();
    } catch (error) {
      logger.error("Error while getting all clients: " + error);
      throw error;
    }
  }

  static async updateClientById(client_id, updatedData) {
    try {
      return await ClientModel.findOneAndUpdate(
        { client_id: client_id },
        { $set: updatedData },
        { new: true }
      );
    } catch (error) {
      logger.error("Error while updating client: " + error);
      throw error;
    }
  }

  static async deleteClientById(client_id) {
    try {
      return await ClientModel.findOneAndDelete({ client_id: client_id });
    } catch (error) {
      logger.error("Error while deleting client: " + error);
      throw error;
    }
  }
}

export default ClientService;