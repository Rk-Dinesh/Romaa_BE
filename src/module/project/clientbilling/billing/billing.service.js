import BillingModel from "./billing.model.js";
import IdcodeServices from "../../../idcode/idcode.service.js"; 

class BillingService {
  
  // --- Create a New Bill (RA1, RA2, etc.) ---
  static async createBill(payload) {
    const { tender_id, items } = payload;

    // 1. Determine Sequence (RA1, RA2...)
    // Count existing bills for this tender to find the next number
    const count = await BillingModel.countDocuments({ tender_id });
    const nextSequence = count + 1;

    // 2. Generate ID (e.g., RA-1001)
    const idname = "Billing";
    const idcode = "RA";
    try { await IdcodeServices.addIdCode(idname, idcode); } catch(e) {}
    const generatedBillId = await IdcodeServices.generateCode(idname);

    // 3. Find Previous Bill (to auto-fill 'Previous Qty')
    let previousBillItems = [];
    if (nextSequence > 1) {
      const prevBill = await BillingModel.findOne({ tender_id, bill_sequence: nextSequence - 1 });
      if (prevBill) {
        previousBillItems = prevBill.items;
      }
    }

    // 4. Process Items (Auto-fill Previous Qty Logic)
    const processedItems = items.map(newItem => {
      // Find matching item from previous bill
      const prevItem = previousBillItems.find(p => p.s_no === newItem.s_no);
      
      // If RA1, prev is 0. If RA2, prev is RA1's 'upto_date_qty'
      const prevQty = prevItem ? prevItem.upto_date_qty : 0;

      return {
        ...newItem,
        prev_bill_qty: prevQty, // Auto-set previous
        // Schema pre-save hook will calculate: Current = UptoDate - Prev
      };
    });

    // 5. Create Document
    const newBill = new BillingModel({
      bill_id: generatedBillId,
      tender_id,
      bill_sequence: nextSequence,
      items: processedItems,
      bill_type: payload.bill_type || "RA Bill",
      mb_book_ref: payload.mb_book_ref,
      created_by_user: payload.created_by_user || "ADMIN"
    });

    return await newBill.save();
  }

  // --- Get History (Timeline View) ---
  static async getBillHistory(tender_id) {
    return await BillingModel.find({ tender_id })
      .sort({ bill_sequence: 1 }) // Sort 1 (RA1), 2 (RA2), 3 (RA3)...
      .select("bill_id bill_date bill_sequence grand_total total_upto_date_amount status"); 
      // Returns a summary list
  }

  // --- Get Full Details of One Bill ---
  static async getBillDetails(bill_id) {
    return await BillingModel.findOne({ bill_id });
  }
}

export default BillingService;