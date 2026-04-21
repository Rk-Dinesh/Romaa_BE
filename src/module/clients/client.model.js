import mongoose from "mongoose";

const clientSchema = new mongoose.Schema(
  {
    client_id: String,
    client_name: String,
    pan_no: String,
    tan_no: String,
    cin_no: String,
    gstin: String,
    contact_person: String,
    contact_email: String,
    contact_phone: String,
    contact_persons: [
      {
        name: String,
        phone: String,
      },
    ],
    address: {
      city: String,
      state: String,
      country: String,
      pincode: String,
    },
    status: String,
    created_by_user: String,
  },
  { timestamps: true }
);

const ClientModel = mongoose.model("Clients", clientSchema);

export default ClientModel;
