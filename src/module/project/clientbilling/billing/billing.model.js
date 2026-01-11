import mongoose from "mongoose";

// --- Sub-Schema: Detailed Bill Item ---
const ItemSchema = new mongoose.Schema(
  {
    // 1. Basic Item Details
    s_no: { type: String, required: true }, 
    description: { type: String, required: true },
    unit: { type: String, default: "Nos" },
    rate: { type: Number, required: true, default: 0 }, 
    // 2. Agreement Reference (Total Planned)
    agreement_qty: { type: Number, default: 0 }, 
    // 3. Cumulative (Total work done from Day 1 to Now)
    upto_date_qty: { type: Number, default: 0 },
    upto_date_amount: { type: Number, default: 0 }, 
    // 4. Previous Bill (Total work paid in RA1 + RA2 + ... + RA(N-1))
    // IMPORTANT: For RA3, this must equal RA2's 'upto_date_qty'
    prev_bill_qty: { type: Number, default: 0 },
    prev_bill_amount: { type: Number, default: 0 },
    // 5. Current Bill (The actual claim for this specific bill)
    // Calculated as: (Upto Date) - (Previous)
    current_qty: { type: Number, default: 0 }, 
    current_amount: { type: Number, default: 0 }, 
    excess_qty: { type: Number, default: 0 },
    mb_book_ref: { type: String, default: "" }, 
  },
  { _id: false }
);

// --- Main Schema: The Bill Document ---
const BillingSchema = new mongoose.Schema(
  {
    // Unique ID (e.g., "RA-001", "RA-002")
    bill_id: { 
      type: String, 
      unique: true, 
      required: true 
    },

    tender_id: { 
      type: String, 
      required: true,
      index: true 
    }, 
    
    bill_date: { 
      type: Date, 
      default: Date.now,
      required: true 
    },

    // --- Sequence Tracking ---
    // 1 = RA1, 2 = RA2, 3 = RA3, etc.
    bill_sequence: { 
      type: Number, 
      required: true,
      index: true 
    }, 

    // Type of bill
    bill_type: { 
      type: String, 
      enum: ["RA Bill", "Advance Bill", "Final Bill"],
      default: "RA Bill" 
    },

    // Optional: Link to the previous bill ID for audit trails
    // e.g., If this is RA2, this field stores the _id of RA1
    previous_bill_id: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "billing",
      default: null
    },

    items: [ItemSchema],  
    
    // --- Aggregates ---
    total_upto_date_amount: { type: Number, default: 0 }, 
    total_prev_bill_amount: { type: Number, default: 0 }, 
    grand_total: { type: Number, default: 0 }, // The amount to be paid
    
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Checked", "Approved", "Paid", "Rejected"],
      default: "Draft"
    },

    created_by_user: { type: String, default: "ADMIN" },    
  },
  { timestamps: true }
);

// --- Automation Hook ---
// Automatically calculates the 'Current' column based on 'Upto Date' - 'Previous'
BillingSchema.pre('save', function(next) {
  let grandTotal = 0;
  let totalUpto = 0;
  let totalPrev = 0;

  if (this.items && this.items.length > 0) {
    this.items.forEach(item => {
      // 1. Calculate Amounts based on Rate
      item.upto_date_amount = item.upto_date_qty * item.rate;
      item.prev_bill_amount = item.prev_bill_qty * item.rate;
      
      // 2. Logic: Current = Cumulative - Previous
      item.current_qty = item.upto_date_qty - item.prev_bill_qty;
      item.current_amount = item.current_qty * item.rate;

      // 3. Sum up totals
      totalUpto += item.upto_date_amount;
      totalPrev += item.prev_bill_amount;
      grandTotal += item.current_amount;
    });
  }

  this.total_upto_date_amount = totalUpto;
  this.total_prev_bill_amount = totalPrev;
  this.grand_total = grandTotal;

  next();
});

const BillingModel = mongoose.model("billing", BillingSchema);
export default BillingModel;