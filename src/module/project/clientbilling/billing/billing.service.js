import BillingModel from "./billing.model.js";
import BidModel from "../../../tender/bid/bid.model.js";

class BillingService {

static async createBill({tender_id, bill_sequence, bill_id, items}) {
    try { 
      // --- 1. Fetch The Bid (Agreement Data) ---
      // We need the Bid to get the base Agreement Quantity and Negotiated Rate (n_rate)
      const bidDoc = await BidModel.findOne({ tender_id: tender_id })
        .sort({ createdAt: -1 }) // Get latest if multiple exist
        .select("items");

      if (!bidDoc) {
        throw new Error(`No Bid found for Tender ID: ${tender_id}`);
      }

      // --- 2. Fetch Previous Bill (if sequence > 1) ---
      // We need this to get 'prev_bill_qty'
      const prevBillItemsMap = new Map();
      
      if (bill_sequence > 1) {
        const prevBill = await BillingModel.findOne({ 
          tender_id: tender_id, 
          bill_sequence: bill_sequence - 1 
        });        

        if (prevBill && prevBill.items) {
          // Map: item_code (s_no) -> Item Object
          prevBill.items.forEach(item => prevBillItemsMap.set(item.item_code, item));
        }
      }

      // --- 3. Aggregate Payload Quantities (Sum Duplicates) ---
      // The payload might have multiple rows for "ID001" (Day 1, Day 2...). 
      // We sum them up to get the total "Upto Date Qty".
      const payloadMap = new Map();
      const payloadRefMap = new Map(); // To store auxiliary data like mb_book_ref

      items.forEach((item) => {
        const code = item.item_code;
        const qty = Number(item.quantity) || 0;

        // Sum quantities if code exists, else set new
        if (payloadMap.has(code)) {
          payloadMap.set(code, payloadMap.get(code) + qty);
        } else {
          payloadMap.set(code, qty);
          // Store first occurrence of metadata
          payloadRefMap.set(code, {
            mb_book_ref: item.mb_book_ref || ""
          });
        }
      });

      // --- 4. Construct Final Bill Items (Based on BID Items) ---
      // We iterate over BID items ensures all agreement items are present, even if quantity is 0
      const processedItems = bidDoc.items.map((bidItem) => {
        const itemCode = bidItem.item_id; // Mapping Bid item_id -> Billing item_code

        // A. Get Agreement Data (From Bid)
        const agreementQty = bidItem.quantity || 0;
        const agreementAmount = bidItem.n_amount || 0;
        const rate = bidItem.n_rate || 0; 

        // B. Get Upto Date Quantity (From Aggregated Payload)
        // If not in payload, defaults to 0
        const currentQty = payloadMap.get(itemCode) || 0;
        const payloadMeta = payloadRefMap.get(itemCode) || {};

        // C. Get Previous Bill Quantity (From Previous Bill Map)
        const prevItem = prevBillItemsMap.get(itemCode);
        const prevQty = prevItem ? (prevItem.upto_date_qty || 0) : 0;

        return {
          item_code: itemCode,           // Redundant but safe
          item_name: bidItem.item_name,  // Work Classification Code
          description: bidItem.description,
          unit: bidItem.unit,
          rate: rate,                    // n_rate from Bid
          
          mb_book_ref: payloadMeta.mb_book_ref || "",

          // --- The Core Columns ---
          agreement_qty: agreementQty,
          agreement_amount: agreementAmount,
          current_qty: currentQty,
          prev_bill_qty: prevQty,
          previous_bill_id: prevItem ? prevItem._id : null,

          // Note: 'current_qty', 'upto_date_amount', 'prev_bill_amount', 'current_amount'
          // will be calculated automatically by the BillingModel's pre('save') hook.
        };
      });

      // --- 5. Create or Update the Document ---
      const billPayload = {
        bill_id: bill_id,
        tender_id: tender_id,
        bill_sequence: bill_sequence,
        items: processedItems,
        bill_type: "RA Bill",
        status: "Draft",
        created_by_user: "ADMIN"
      };

      // Upsert: Update if exists, Create if new
      const savedBill = await BillingModel.findOneAndUpdate(
        { tender_id: tender_id, bill_sequence: bill_sequence },
        { $set: billPayload },
        { new: true, upsert: true, runValidators: true }
      );

      // Trigger Mongoose Pre-Save Hook for Calculations
      await savedBill.save();

      return savedBill;

    } catch (error) {
      console.error("Error creating bill:", error);
      throw new Error(`Failed to create Bill: ${error.message}`);
    }
  }

  // --- Get History (Timeline View) ---
  static async getBillHistory(tender_id) {
    return await BillingModel.find({ tender_id })
      .sort({ bill_sequence: 1 }) // Sort 1 (RA1), 2 (RA2), 3 (RA3)...
      .select("bill_id bill_date bill_sequence grand_total total_upto_date_amount status tender_id");
    // Returns a summary list
  }

  // --- Get Full Details of One Bill ---
  static async getBillDetails(tender_id, bill_id) {
    return await BillingModel.findOne({ tender_id, bill_id });
  }
}

export default BillingService;