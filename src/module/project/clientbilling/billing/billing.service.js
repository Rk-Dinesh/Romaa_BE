import BillingModel from "./billing.model.js";
import BidModel from "../../../tender/bid/bid.model.js";

class BillingService {

static async createBill({ tender_id, bill_sequence, bill_id, items, abstract_name }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // --- 1. Fetch The Bid (Agreement Data) ---
        const bidDoc = await BidModel.findOne({ tender_id: tender_id })
            .sort({ createdAt: -1 })
            .select("items")
            .session(session);

        if (!bidDoc) {
            throw new Error(`No Bid found for Tender ID: ${tender_id}`);
        }

        // --- 2. Fetch Previous Bill (if sequence > 1) ---
        const prevBillItemsMap = new Map();

        if (bill_sequence > 1) {
            const prevBill = await BillingModel.findOne({
                tender_id: tender_id,
                bill_sequence: bill_sequence - 1
            }).session(session);

            if (prevBill && prevBill.items) {
                // Map: item_code -> Item Object (to get cumulative prev qty)
                prevBill.items.forEach(item => prevBillItemsMap.set(item.item_code, item));
            }
        }

        // --- 3. Aggregate Payload Quantities ---
        // Sum up quantities from the CSV payload (e.g. sum multiple days for same item)
        const payloadMap = new Map();
        const payloadRefMap = new Map();

        items.forEach((item) => {
            const code = item.item_code;
            const qty = Number(item.quantity) || 0;

            if (payloadMap.has(code)) {
                payloadMap.set(code, payloadMap.get(code) + qty);
            } else {
                payloadMap.set(code, qty);
                payloadRefMap.set(code, {
                    mb_book_ref: item.mb_book_ref || ""
                });
            }
        });

        // --- 4. Construct Final Bill Items ---
        // Map against the BID to ensure all agreement items are present
        const processedItems = bidDoc.items.map((bidItem) => {
            const itemCode = bidItem.item_id;

            // A. Agreement Data
            const agreementQty = bidItem.quantity || 0;
            const agreementAmount = bidItem.n_amount || 0;
            const rate = bidItem.n_rate || 0;

            // B. Current Bill Data (from Payload)
            const currentQty = payloadMap.get(itemCode) || 0;
            const payloadMeta = payloadRefMap.get(itemCode) || {};

            // C. Previous Bill Data
            const prevItem = prevBillItemsMap.get(itemCode);
            const prevQty = prevItem ? (prevItem.upto_date_qty || 0) : 0;

            return {
                item_code: itemCode,
                item_name: bidItem.item_name,
                description: bidItem.description,
                unit: bidItem.unit,
                rate: rate,
                mb_book_ref: payloadMeta.mb_book_ref || "",

                // Core Quantities
                agreement_qty: agreementQty,
                agreement_amount: agreementAmount,
                current_qty: currentQty,
                prev_bill_qty: prevQty,
                previous_bill_id: prevItem ? prevItem._id : null,
            };
        });

        // --- 5. Create or Update Logic ---
        let savedBill;

        // Check if a bill already exists for this Sequence
        const existingBill = await BillingModel.findOne({ 
            tender_id: tender_id, 
            bill_sequence: bill_sequence 
        }).session(session);

        if (existingBill) {
            // === UPDATE EXISTING ===
            // If "Abstract Estimate" is re-uploaded, we simply update the calculations
            existingBill.items = processedItems;
            
            // Optionally update bill_id if it changed (rare)
            if (bill_id) existingBill.bill_id = bill_id;

            await existingBill.save({ session });
            savedBill = existingBill;
        } else {
            // === CREATE NEW ===
            const billPayload = {
                bill_id: bill_id,
                tender_id: tender_id,
                bill_sequence: bill_sequence,
                items: processedItems,
                bill_type: "RA Bill",
                status: "Draft",
                created_by_user: "ADMIN"
            };

            const newBill = new BillingModel(billPayload);
            await newBill.save({ session });
            savedBill = newBill;
        }

        await session.commitTransaction();
        session.endSession();

        return savedBill;

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error processing bill:", error);
        throw new Error(`Failed to process Bill: ${error.message}`);
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