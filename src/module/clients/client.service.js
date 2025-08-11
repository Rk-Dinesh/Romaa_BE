import ClientModel from "./client.model.js";
import IdcodeServices from "../idcode/idcode.service.js";

class ClientService {
  // Create
  static async addClient(clientData) {
    try {
      const idname = "CLIENT";
      const idcode = "CLI";
      await IdcodeServices.addIdCode(idname, idcode);
      const client_id = await IdcodeServices.generateCode(idname);
      if (!client_id) throw new Error("Failed to generate client ID");

      const newClient = new ClientModel({
        client_id,
        ...clientData,
      });
      return await newClient.save();
    } catch (error) {
      throw new Error("Error creating client: " + error.message);
    }
  }

  // Get by client_id
  static async getClientById(client_id) {
    try {
      return await ClientModel.findOne({ client_id });
    } catch (error) {
      throw new Error("Error fetching client: " + error.message);
    }
  }

  // Get all
  static async getAllClients() {
    try {
      return await ClientModel.find();
    } catch (error) {
      throw new Error("Error fetching clients: " + error.message);
    }
  }

  // Get active clients
  static async getActiveClients() {
    try {
      return await ClientModel.find({ status: "ACTIVE" });
    } catch (error) {
      throw new Error("Error fetching active clients: " + error.message);
    }
  }

  // Update by client_id
  static async updateClient(client_id, updateData) {
    try {
      return await ClientModel.findOneAndUpdate(
        { client_id },
        { $set: updateData },
        { new: true }
      );
    } catch (error) {
      throw new Error("Error updating client: " + error.message);
    }
  }

  // Delete by client_id
  static async deleteClient(client_id) {
    try {
      return await ClientModel.findOneAndDelete({ client_id });
    } catch (error) {
      throw new Error("Error deleting client: " + error.message);
    }
  }

  // Search
  static async searchClients(keyword) {
    try {
      return await ClientModel.find({
        $or: [
          { client_name: { $regex: keyword, $options: "i" } },
          { contact_email: { $regex: keyword, $options: "i" } },
          { contact_phone: { $regex: keyword, $options: "i" } },
        ],
      });
    } catch (error) {
      throw new Error("Error searching clients: " + error.message);
    }
  }
}

export default ClientService;
