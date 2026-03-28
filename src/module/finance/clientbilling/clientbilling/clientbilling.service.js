import BillingModel from "./clientbilling.model.js";
import TenderModel from "../../../tender/tender/tender.model.js";
import LedgerService from "../../ledger/ledger.service.js";

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── FY helper ─────────────────────────────────────────────────────────────────
function currentFY() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

// ── Auto-generate bill_id: CB/<FY>/<seq> e.g. CB/25-26/0001 ──────────────────
async function generateBillId() {
  const fy     = currentFY();
  const prefix = `CB/${fy}/`;
  const last   = await BillingModel.findOne(
    { bill_id: { $regex: `^${prefix}` } },
    { bill_id: 1 }
  ).sort({ createdAt: -1 });

  const seq = last ? parseInt(last.bill_id.split("/").pop(), 10) : 0;
  return `${prefix}${String(seq + 1).padStart(4, "0")}`;
}

// ── Post Dr entry to client ledger on approval ────────────────────────────────
// ClientBill = Dr entry: client owes Romaa (receivable increases)
// balance = Cr - Dr in ledger; for AR: Dr balance = client owes us (positive receivable)
async function postToLedger(bill) {
  await LedgerService.postEntry({
    supplier_type: "Client",
    supplier_id:   bill.client_id,
    supplier_ref:  bill.client_ref || null,
    supplier_name: bill.client_name,
    vch_date:      bill.bill_date || new Date(),
    vch_no:        bill.bill_id,
    vch_type:      "ClientBill",
    vch_ref:       bill._id,
    particulars:   `Client Bill ${bill.bill_id} for ${bill.tender_id}`,
    tender_id:     bill.tender_id,
    tender_name:   bill.tender_name || "",
    debit_amt:     bill.net_amount,  // Dr: client owes Romaa (receivable)
    credit_amt:    0,
  });
}

// ── Service ───────────────────────────────────────────────────────────────────

class BillingService {

  // GET /clientbilling/next-id
  static async getNextBillId() {
    const bill_id  = await generateBillId();
    return { bill_id };
  }

  // GET /clientbilling/list
  static async getList(filters = {}) {
    const query = {};
    if (filters.tender_id)  query.tender_id  = filters.tender_id;
    if (filters.client_id)  query.client_id  = filters.client_id;
    if (filters.status)     query.status     = filters.status;
    if (filters.paid_status) query.paid_status = filters.paid_status;

    if (filters.from_date || filters.to_date) {
      query.bill_date = {};
      if (filters.from_date) query.bill_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.bill_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      BillingModel.find(query)
        .select("bill_id bill_date tender_id tender_name client_id client_name grand_total net_amount amount_received balance_due paid_status status createdAt")
        .sort({ bill_date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BillingModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /clientbilling/history/:tender_id
  static async getBillHistory(tender_id) {
    return await BillingModel.find({ tender_id })
      .sort({ createdAt: 1 })
      .select("bill_id bill_date grand_total net_amount amount_received balance_due paid_status status")
      .lean();
  }

  // GET /clientbilling/:id
  static async getBillById(id) {
    const bill = await BillingModel.findById(id).lean();
    if (!bill) throw new Error("Bill not found");
    return bill;
  }

  // GET /clientbilling/details/:tender_id/:bill_id
  static async getBillDetails(tender_id, bill_id) {
    const bill = await BillingModel.findOne({ tender_id, bill_id }).lean();
    if (!bill) throw new Error("Bill not found");
    return bill;
  }

  // POST /clientbilling/create
  static async createBill(payload) {
    if (!payload.tender_id) throw new Error("tender_id is required");

    // Auto-fill client details from Tender
    const tender = await TenderModel.findOne({ tender_id: payload.tender_id })
      .select("client_id client_name tender_name")
      .lean();
    if (!tender) throw new Error(`Tender '${payload.tender_id}' not found`);
    if (!tender.client_id) throw new Error(`No client linked to tender ${payload.tender_id}`);

    const bill_id = await generateBillId();

    // Fetch previous bill for cumulative qty tracking
    const prevBill = await BillingModel.findOne({ tender_id: payload.tender_id })
      .sort({ createdAt: -1 })
      .select("_id");
    const previousBillId = prevBill ? prevBill._id : null;

    const doc = {
      bill_id,
      tender_id:    payload.tender_id,
      tender_name:  tender.tender_name  || "",
      bill_date:    payload.bill_date   ? new Date(payload.bill_date) : new Date(),

      client_id:   tender.client_id,
      client_name: tender.client_name || "",

      previous_bill_id: previousBillId,

      items: (payload.items || []).map((i) => ({
        item_code:     i.item_code     || "",
        item_name:     i.item_name     || "",
        unit:          i.unit          || "",
        rate:          Number(i.rate)  || 0,
        mb_book_ref:   i.mb_book_ref   || "",
        agreement_qty: Number(i.agreement_qty) || 0,
        current_qty:   Number(i.current_qty)   || 0,
        prev_bill_qty: Number(i.prev_bill_qty)  || 0,
      })),

      deductions:    payload.deductions     || [],

      tax_mode:      payload.tax_mode      || "instate",
      cgst_pct:      Number(payload.cgst_pct)  || 0,
      sgst_pct:      Number(payload.sgst_pct)  || 0,
      igst_pct:      Number(payload.igst_pct)  || 0,
      retention_pct: Number(payload.retention_pct) || 0,

      narration:       payload.narration       || "",
      created_by_user: payload.created_by_user || "",
      status:          "Draft",
    };

    const saved = await BillingModel.create(doc);
    return saved;
  }

  // PATCH /clientbilling/update/:id
  static async updateBill(id, payload) {
    const bill = await BillingModel.findById(id);
    if (!bill) throw new Error("Bill not found");
    if (bill.status === "Approved" || bill.status === "Paid") {
      throw new Error(`Cannot edit a bill with status '${bill.status}'`);
    }

    const allowed = [
      "bill_date", "items", "deductions", "narration",
      "tax_mode", "cgst_pct", "sgst_pct", "igst_pct", "retention_pct",
    ];
    for (const field of allowed) {
      if (payload[field] !== undefined) bill[field] = payload[field];
    }

    await bill.save();
    return bill;
  }

  // DELETE /clientbilling/delete/:id
  static async deleteBill(id) {
    const bill = await BillingModel.findById(id);
    if (!bill) throw new Error("Bill not found");
    if (bill.status === "Approved" || bill.status === "Paid") {
      throw new Error("Cannot delete an approved or paid bill");
    }
    await bill.deleteOne();
    return { deleted: true, bill_id: bill.bill_id };
  }

  // PATCH /clientbilling/approve/:id
  static async approveBill(id) {
    const bill = await BillingModel.findById(id);
    if (!bill) throw new Error("Bill not found");
    if (bill.status === "Approved" || bill.status === "Paid") {
      throw new Error(`Bill is already ${bill.status}`);
    }
    if (bill.status === "Rejected") {
      throw new Error("Rejected bills cannot be approved");
    }
    if (!bill.client_id) throw new Error(`No client linked to bill ${bill.bill_id}`);

    bill.status = "Approved";
    await bill.save();

    // Dr entry: client owes Romaa (AR — receivable increases)
    await postToLedger(bill);

    return bill;
  }

  // PATCH /clientbilling/status/:id  — for Submitted / Checked / Rejected transitions
  static async updateStatus(id, newStatus) {
    const allowed = ["Draft", "Submitted", "Checked", "Rejected"];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Use the approve endpoint for 'Approved'. Allowed here: ${allowed.join(", ")}`);
    }

    const bill = await BillingModel.findById(id);
    if (!bill) throw new Error("Bill not found");
    if (bill.status === "Approved" || bill.status === "Paid") {
      throw new Error(`Cannot change status of a ${bill.status} bill`);
    }

    bill.status = newStatus;
    await bill.save();
    return bill;
  }
}

export default BillingService;
