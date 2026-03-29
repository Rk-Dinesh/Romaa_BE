import ClientCNModel from "./clientcreditnote.model.js";
import BillingModel  from "../clientbilling/clientbilling.model.js";
import LedgerService from "../../ledger/ledger.service.js";

// ── FY helper ─────────────────────────────────────────────────────────────────
function currentFY() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

// ── Auto-generate ccn_no: CCN/<FY>/<seq> e.g. CCN/25-26/0001 ─────────────────
async function generateCCNNo() {
  const fy     = currentFY();
  const prefix = `CCN/${fy}/`;
  const last   = await ClientCNModel.findOne(
    { ccn_no: { $regex: `^${prefix}` } },
    { ccn_no: 1 }
  ).sort({ createdAt: -1 });

  const seq = last ? parseInt(last.ccn_no.split("/").pop(), 10) : 0;
  return `${prefix}${String(seq + 1).padStart(4, "0")}`;
}

// ── Post Cr entry to client ledger on approval ────────────────────────────────
// ClientCN = Cr entry: reduces what client owes Romaa (receivable decreases)
async function postToLedger(ccn) {
  await LedgerService.postEntry({
    supplier_type: "Client",
    supplier_id:   ccn.client_id,
    supplier_ref:  ccn.client_ref || null,
    supplier_name: ccn.client_name,
    vch_date:      ccn.ccn_date || new Date(),
    vch_no:        ccn.ccn_no,
    vch_type:      "ClientCN",
    vch_ref:       ccn._id,
    particulars:   `Client CN ${ccn.ccn_no} against Bill ${ccn.bill_id} — ${ccn.reason || "Credit note"}`,
    tender_id:     ccn.tender_id,
    tender_name:   ccn.tender_name || "",
    debit_amt:     0,
    credit_amt:    ccn.net_amount, // Cr: reduces client receivable
  });
}

// ── Service ───────────────────────────────────────────────────────────────────
class ClientCNService {

  // GET /clientcreditnote/list
  static async getList(filters = {}) {
    const query = {};
    if (filters.tender_id)  query.tender_id  = filters.tender_id;
    if (filters.client_id)  query.client_id  = filters.client_id;
    if (filters.bill_id)    query.bill_id    = filters.bill_id;
    if (filters.status)     query.status     = filters.status;

    if (filters.from_date || filters.to_date) {
      query.ccn_date = {};
      if (filters.from_date) query.ccn_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.ccn_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      ClientCNModel.find(query)
        .select("ccn_no ccn_date bill_id tender_id tender_name client_id client_name grand_total net_amount reason status createdAt")
        .sort({ ccn_date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ClientCNModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /clientcreditnote/:id
  static async getById(id) {
    const ccn = await ClientCNModel.findById(id).lean();
    if (!ccn) throw new Error("Client credit note not found");
    return ccn;
  }

  // POST /clientcreditnote/create
  static async createCCN(payload) {
    if (!payload.bill_ref && !payload.bill_id) {
      throw new Error("bill_ref or bill_id is required");
    }

    // Auto-fill client & tender details from the original bill
    const bill = await BillingModel.findOne(
      payload.bill_ref
        ? { _id: payload.bill_ref }
        : { bill_id: payload.bill_id }
    ).select("_id bill_id tender_id tender_name client_id client_name client_ref status").lean();

    if (!bill) throw new Error("Original bill not found");
    if (bill.status === "Draft" || bill.status === "Rejected") {
      throw new Error(`Cannot raise a credit note against a bill with status '${bill.status}'`);
    }

    const ccn_no = await generateCCNNo();

    const doc = {
      ccn_no,
      ccn_date:    payload.ccn_date ? new Date(payload.ccn_date) : new Date(),
      bill_ref:    bill._id,
      bill_id:     bill.bill_id,
      tender_id:   bill.tender_id,
      tender_name: bill.tender_name || "",
      client_id:   bill.client_id,
      client_name: bill.client_name || "",
      client_ref:  bill.client_ref  || null,

      items: (payload.items || []).map((i) => ({
        item_code:  i.item_code  || "",
        item_name:  i.item_name  || "",
        unit:       i.unit       || "",
        rate:       Number(i.rate)       || 0,
        return_qty: Number(i.return_qty) || 0,
      })),

      reason:          payload.reason          || "",
      tax_mode:        payload.tax_mode        || "instate",
      cgst_pct:        Number(payload.cgst_pct)  || 0,
      sgst_pct:        Number(payload.sgst_pct)  || 0,
      igst_pct:        Number(payload.igst_pct)  || 0,
      narration:       payload.narration       || "",
      created_by_user: payload.created_by_user || "",
      status:          "Draft",
    };

    return await ClientCNModel.create(doc);
  }

  // PATCH /clientcreditnote/update/:id
  static async updateCCN(id, payload) {
    const ccn = await ClientCNModel.findById(id);
    if (!ccn) throw new Error("Client credit note not found");
    if (ccn.status === "Approved") {
      throw new Error("Cannot edit an approved credit note");
    }

    const allowed = [
      "ccn_date", "items", "reason", "narration",
      "tax_mode", "cgst_pct", "sgst_pct", "igst_pct",
    ];
    for (const field of allowed) {
      if (payload[field] !== undefined) ccn[field] = payload[field];
    }

    await ccn.save();
    return ccn;
  }

  // DELETE /clientcreditnote/delete/:id
  static async deleteCCN(id) {
    const ccn = await ClientCNModel.findById(id);
    if (!ccn) throw new Error("Client credit note not found");
    if (ccn.status === "Approved") {
      throw new Error("Cannot delete an approved credit note");
    }
    await ccn.deleteOne();
    return { deleted: true, ccn_no: ccn.ccn_no };
  }

  // PATCH /clientcreditnote/approve/:id
  static async approveCCN(id) {
    const ccn = await ClientCNModel.findById(id);
    if (!ccn) throw new Error("Client credit note not found");
    if (ccn.status === "Approved") {
      throw new Error("Credit note is already approved");
    }
    if (ccn.status === "Rejected") {
      throw new Error("Rejected credit notes cannot be approved");
    }

    ccn.status = "Approved";
    await ccn.save();

    // Cr entry: reduces client receivable in ledger
    await postToLedger(ccn);

    return ccn;
  }

  // PATCH /clientcreditnote/status/:id
  static async updateStatus(id, newStatus) {
    const allowed = ["Draft", "Submitted", "Rejected"];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Use the approve endpoint for 'Approved'. Allowed here: ${allowed.join(", ")}`);
    }

    const ccn = await ClientCNModel.findById(id);
    if (!ccn) throw new Error("Client credit note not found");
    if (ccn.status === "Approved") {
      throw new Error("Cannot change status of an approved credit note");
    }

    ccn.status = newStatus;
    await ccn.save();
    return ccn;
  }
}

export default ClientCNService;
