import mongoose from "mongoose";

// --- Sub-Schema: Detailed Bill Item ---
const ItemSchema = new mongoose.Schema(
  {
    // 1. Basic Item Details
    item_code: { type: String, required: true }, 
    item_name: { type: String, required: true },
    unit: { type: String, default: "Nos" },
    rate: { type: Number, required: true, default: 0 }, 
    
    // 2. Agreement Reference (Total Planned)
    agreement_qty: { type: Number, default: 0 },
    agreement_amount: { type: Number, default: 0 }, 
    
    // 3. Cumulative (Total work done from Day 1 to Now)
    upto_date_qty: { type: Number, default: 0 },
    upto_date_amount: { type: Number, default: 0 }, 
    
    // 4. Previous Bill (Total work paid in RA1 + RA2 + ... + RA(N-1))
    prev_bill_qty: { type: Number, default: 0 },
    prev_bill_amount: { type: Number, default: 0 },
    
    // 5. Current Bill (The actual claim for this specific bill)
    current_qty: { type: Number, default: 0 }, 
    current_amount: { type: Number, default: 0 }, 
    
    // 6. Excess & Balance (Calculated fields)
    excess_qty: { type: Number, default: 0 },
    excess_amount: { type: Number, default: 0 },
    excess_percentage: { type: Number, default: 0 },
    
    balance_qty: { type: Number, default: 0 },
    balance_amount: { type: Number, default: 0 },
    balance_percentage: { type: Number, default: 0 },
    
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
BillingSchema.pre('save', function(next) {
  let grandTotal = 0;
  let totalUpto = 0;
  let totalPrev = 0;

  if (this.items && this.items.length > 0) {
    this.items.forEach(item => {
      // Ensure values are numbers to prevent NaN
      const rate = Number(item.rate) || 0;
      const agreementQty = Number(item.agreement_qty) || 0;
      const currentQty = Number(item.current_qty) || 0;
      const prevQty = Number(item.prev_bill_qty) || 0;

      // 1. Basic Calculations (Amount = Qty * Rate)
      item.current_amount = currentQty * rate;
      item.prev_bill_amount = prevQty * rate;
      
      // 2. Current Bill Calculations
      item.upto_date_qty = currentQty + prevQty;
      item.upto_date_amount = item.upto_date_qty * rate;

      // 3. Excess vs Balance Logic
      // If work done (uptoQty) is greater than agreement, we have Excess.
      // If work done is less than agreement, we have Balance.
      if (item.upto_date_qty > agreementQty) {
        item.excess_qty = item.upto_date_qty - agreementQty;
        item.balance_qty = 0; // No balance left, we overshot
      } else {
        item.excess_qty = 0;
        item.balance_qty = agreementQty - item.upto_date_qty;
      }

      // 4. Calculate Amounts for Excess/Balance
      item.excess_amount = item.excess_qty * rate;
      item.balance_amount = item.balance_qty * rate;

      // 5. Calculate Percentages
      // Avoid division by zero
      if (agreementQty > 0) {
        item.excess_percentage = (item.excess_qty / agreementQty) * 100;
        item.balance_percentage = (item.balance_qty / agreementQty) * 100;
      } else {
        // If agreement is 0, percentage is undefined/0
        item.excess_percentage = 0;
        item.balance_percentage = 0;
      }

      // 6. Optional: Rounding (to 4 decimal places for precision in DB)
      // item.current_amount = Math.round(item.current_amount * 10000) / 10000;
      
      // 7. Sum up totals for the Bill Header
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