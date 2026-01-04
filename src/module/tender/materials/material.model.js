import mongoose from "mongoose";

// --- 1. RECEIVED HISTORY (Inward Ledger) ---
// Tracks materials coming INTO the site (from Vendors/Purchase Requests)
const InwardTransactionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  quantity: { type: Number, required: true, default: 0 },
  
  // Traceability
  purchase_request_ref: { type: String, default: "" }, // Links to PurchaseRequestModel.requestId
  supplier_name: { type: String, default: "" },
  invoice_challan_no: { type: String, default: "" }, // For physical proof
  
  received_by: { type: String, default: "" },
  remarks: { type: String, default: "" }
}, { _id: true }); // Enable ID for editing specific logs

// --- 2. ISSUED HISTORY (Outward Ledger) ---
// Tracks materials going OUT to the labor/work (Consumption)
const OutwardTransactionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  quantity: { type: Number, required: true, default: 0 },
  
  // utilization details
  issued_to: { type: String, default: "" }, // Contractor or Foreman name
  site_location: { type: String, default: "" }, // e.g., "Block A, 1st Floor"
  work_description: { type: String, default: "" }, // e.g., "Plastering work"
  
  issued_by: { type: String, default: "" },
  priority_level: { type: String, enum: ["Normal", "Urgent"], default: "Normal" }
}, { _id: true });

// --- 3. MAIN ITEM SCHEMA ---
const MaterialItemSchema = new mongoose.Schema(
  {
    // ==========================================
    // SECTION A: REAL QUANTITIES (Budget/Estimates)
    // These fields are preserved EXACTLY as requested
    // ==========================================
    item_description: { type: String, default: "" },
    category: { type: String, default: "" },
    unit: { type: String, default: "" },
    
    // The breakdown of estimated quantities (e.g., per floor)
    quantity: [{ type: Number, default: 0 }], 
    
    // The Total Budgeted Quantity (Sum of 'quantity' array)
    total_item_quantity: { type: Number, default: 0 }, 
    
    unit_rate: { type: Number, default: 0 },
    
    // Budgeted Amount (total_item_quantity * unit_rate)
    total_amount: { type: Number, default: 0 },

    // ==========================================
    // SECTION B: INVENTORY TRACKING (Dynamic)
    // ==========================================
    
    // 1. Opening Stock (Carry over from previous project or initial existing stock)
    opening_stock: { type: Number, default: 0 },

    // 2. Transaction History Arrays
    inward_history: [InwardTransactionSchema],
    outward_history: [OutwardTransactionSchema],

    // 3. Calculated Aggregates (Auto-calculated via Middleware)
    total_received_qty: { type: Number, default: 0 }, // Sum of inward_history
    total_issued_qty: { type: Number, default: 0 },   // Sum of outward_history
    
    // 4. The Golden Number: Actual Stock currently physically at site
    // Formula: Opening Stock + Total Received - Total Issued
    current_stock_on_hand: { type: Number, default: 0 },

    // 5. Procurement Status
    // Formula: Total Budgeted (total_item_quantity) - (Opening + Total Received)
    pending_procurement_qty: { type: Number, default: 0 },
  },
  { _id: true } // We need IDs here to update specific items
);

const materialSchema = new mongoose.Schema(
  {
    tender_id: { type: String, default: "" },
    items: [MaterialItemSchema],
    created_by_user: { type: String, default: "ADMIN" },
  },
  { timestamps: true }
);

// --- MIDDLEWARE: AUTOMATIC CALCULATIONS ---
// This ensures that whenever you save, the totals are mathematically correct.
materialSchema.pre("save", function (next) {
  if (this.items && this.items.length > 0) {
    this.items.forEach((item) => {
      
      // 1. Ensure Total Item Quantity matches the quantity array (Budget)
      if (item.quantity && item.quantity.length > 0) {
        item.total_item_quantity = item.quantity.reduce((a, b) => a + b, 0);
      }
      
      // 2. Calculate Total Amount (Budget)
      item.total_amount = item.total_item_quantity * item.unit_rate;

      // 3. Sum up Inwards (Received)
      const receivedSum = item.inward_history.reduce((sum, record) => sum + record.quantity, 0);
      item.total_received_qty = receivedSum;

      // 4. Sum up Outwards (Issued)
      const issuedSum = item.outward_history.reduce((sum, record) => sum + record.quantity, 0);
      item.total_issued_qty = issuedSum;

      // 5. Calculate Current Physical Stock
      item.current_stock_on_hand = (item.opening_stock || 0) + receivedSum - issuedSum;

      // 6. Calculate Pending Procurement (How much more we need to buy to meet budget)
      // If we have bought more than budget, this stays 0 (or negative to show over-procurement)
      item.pending_procurement_qty = item.total_item_quantity - ((item.opening_stock || 0) + receivedSum);
    });
  }
  next();
});

const MaterialModel = mongoose.model("materials", materialSchema);

export default MaterialModel;