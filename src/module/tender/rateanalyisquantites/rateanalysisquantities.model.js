import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema(
    {
        item_description: { type: String, default: "" },
        category: {
            type: String,
            enum: ["MY-M", "MY-F", "MP-C", "MP-NMR", "MT-CM", "MT-BL"],
            required: true,
        },
        unit: { type: String, default: "" },
        quantity: [{ type: Number, default: 0 }],
        total_item_quantity: { type: Number, default: 0 },
        unit_rate: { type: Number, default: 0 },
        tax_percent: { type: Number, default: 0 },
        escalation_percent: { type: Number, default: 0 },
        tax_amount: { type: Number, default: 0 },
        total_amount: { type: Number, default: 0 },
        final_amount: { type: Number, default: 0 },
        escalation_amount: { type: Number, default: 0 },
        percentage_value_of_material: { type: Number, default: 0 }
    },
    { _id: false }
);

const raQuantitySchema = new mongoose.Schema(
    {
        tender_id: { type: String, default: "" },
        quantites: {
            consumable_material: { type: [ItemSchema], default: [] },
            bulk_material: { type: [ItemSchema], default: [] },
            machinery: { type: [ItemSchema], default: [] },
            fuel: { type: [ItemSchema], default: [] },
            contractor: { type: [ItemSchema], default: [] },
            nmr: { type: [ItemSchema], default: [] },
        },
        created_by_user: { type: String, default: "ADMIN" },
    },
    { timestamps: true }
);

const RAQuantityModel = mongoose.model("RAQuantity", raQuantitySchema);

export default RAQuantityModel;