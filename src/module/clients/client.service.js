import ClientModel from "./client.model.js";
import IdcodeServices from "../idcode/idcode.service.js";
import AccountTreeService from "../finance/accounttree/accounttree.service.js";

class ClientService {
  // ✅ Create
  static async addClient(clientData) {
    try {
      const idname = "CLIENT";
      const idcode = "CLI";
      await IdcodeServices.addIdCode(idname, idcode);
      const client_id = await IdcodeServices.generateCode(idname);
      if (!client_id) throw new Error("Unable to generate client ID. Please contact system administrator");

      const newClient = new ClientModel({ client_id, ...clientData });
      const saved = await newClient.save();

      AccountTreeService.autoCreatePersonalLedger({
        supplier_id: saved.client_id,
        supplier_type: "Client",
        supplier_name: saved.client_name,
        supplier_ref: saved._id,
      }).catch(() => {});

      return saved;
    } catch (error) {
      throw new Error("Unable to register client. " + error.message);
    }
  }

  // ✅ Get by ID
  static async getClientById(client_id) {
    return ClientModel.findOne({ client_id });
  }

  // ✅ Get All
  static async getAllClients() {
    return ClientModel.find();
  }

  static async getAllClientsIDNAME() {
    return ClientModel.find().select("client_id client_name contact_person contact_email contact_phone");
  }

  

  // ✅ Get Active
  static async getActiveClients() {
    return ClientModel.find({ status: "ACTIVE" });
  }

// 📌 Paginated, Search, and Date Filtered Service
static async getClientsPaginated(page, limit, search, fromdate, todate) {
  const query = {};

  // Keyword Search
  if (search) {
    query.$or = [
      { client_name: { $regex: search, $options: "i" } },
      { contact_email: { $regex: search, $options: "i" } },
      { contact_phone: { $regex: search, $options: "i" } },
      { "contact_persons.name": { $regex: search, $options: "i" } },
      { "contact_persons.phone": { $regex: search, $options: "i" } },
    ];
  }

  // Date Filtering
  if (fromdate || todate) {
    query.createdAt = {};
    if (fromdate) query.createdAt.$gte = new Date(fromdate);
    if (todate) {
      const endOfDay = new Date(todate);
      endOfDay.setUTCHours(23, 59, 59, 999); // Include entire to-date day
      query.createdAt.$lte = endOfDay;
    }
  }

  const total = await ClientModel.countDocuments(query);
  const clients = await ClientModel.find(query)
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: -1 });

  return { total, clients };
}



  // ✅ Update
  static async updateClient(client_id, updateData) {
    return ClientModel.findOneAndUpdate({ client_id }, { $set: updateData }, { new: true });
  }

  // ✅ Delete
  static async deleteClient(client_id) {
    return ClientModel.findOneAndDelete({ client_id });
  }

  // ✅ Search (legacy)
  static async searchClients(keyword) {
    return ClientModel.find({
      $or: [
        { client_name: { $regex: keyword, $options: "i" } },
        { contact_email: { $regex: keyword, $options: "i" } },
        { contact_phone: { $regex: keyword, $options: "i" } },
        { "contact_persons.name": { $regex: keyword, $options: "i" } },
        { "contact_persons.phone": { $regex: keyword, $options: "i" } }
      ]
    });
  }
}

export default ClientService;
