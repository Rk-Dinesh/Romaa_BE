import DebitNoteModel from "./debitnote.model.js";
import VendorModel from "../../purchase/vendor/vendor.model.js";
import ContractorModel from "../../hr/contractors/contractor.model.js";
import LedgerService from "../ledger/ledger.service.js";

// ── FY helper ─────────────────────────────────────────────────────────────────
function currentFY() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

// Validate that entries balance: sum of debits must equal sum of credits
function validateEntriesBalance(entries) {
  if (!entries || entries.length === 0) return; // entries are optional
  const totalDr = entries.reduce((s, e) => s + (Number(e.debit_amt)  || 0), 0);
  const totalCr = entries.reduce((s, e) => s + (Number(e.credit_amt) || 0), 0);
  if (Math.round((totalDr - totalCr) * 100) !== 0) {
    throw new Error(
      `Entry lines do not balance: total debits (${totalDr.toFixed(2)}) ≠ total credits (${totalCr.toFixed(2)})`
    );
  }
}

// ── Auto-fill supplier fields ─────────────────────────────────────────────────
async function resolveSupplier(supplier_type, supplier_id) {
  if (supplier_type === "Vendor") {
    const vendor = await VendorModel.findOne({ vendor_id: supplier_id }).lean();
    if (!vendor) throw new Error(`Vendor '${supplier_id}' not found`);
    return {
      supplier_ref:   vendor._id,
      supplier_name:  vendor.company_name,
      supplier_gstin: vendor.gstin || "",
    };
  }

  if (supplier_type === "Contractor") {
    const contractor = await ContractorModel.findOne({ contractor_id: supplier_id }).lean();
    if (!contractor) throw new Error(`Contractor '${supplier_id}' not found`);
    return {
      supplier_ref:   contractor._id,
      supplier_name:  contractor.contractor_name,
      supplier_gstin: contractor.gst_number || "",
    };
  }

  throw new Error(`Invalid supplier_type '${supplier_type}'. Must be Vendor or Contractor`);
}

// ── Build document from payload ───────────────────────────────────────────────
function buildDoc(payload, dn_no) {
  return {
    dn_no,
    dn_date:        payload.dn_date        ? new Date(payload.dn_date)        : new Date(),
    document_year:  payload.document_year  || currentFY(),
    reference_no:   payload.reference_no   || "",
    reference_date: payload.reference_date ? new Date(payload.reference_date) : null,
    location:       payload.location       || "",
    sales_type:     payload.sales_type     || "Local",
    adj_type:       payload.adj_type       || "Against Bill",
    tax_type:       payload.tax_type       || "GST",
    rev_charge:     Boolean(payload.rev_charge),

    supplier_type:  payload.supplier_type,
    supplier_id:    payload.supplier_id,
    supplier_ref:   payload.supplier_ref   || null,
    supplier_name:  payload.supplier_name  || "",
    supplier_gstin: payload.supplier_gstin || "",

    tender_id:   payload.tender_id   || "",
    tender_ref:  payload.tender_ref  || null,
    tender_name: payload.tender_name || "",

    bill_ref: payload.bill_ref || null,
    bill_no:  payload.bill_no  || "",

    amount:      Number(payload.amount)      || 0,
    service_amt: Number(payload.service_amt) || 0,
    taxable_amount: Number(payload.taxable_amount) || Number(payload.amount) || 0,
    cgst_pct:  Number(payload.cgst_pct)  || 0,
    sgst_pct:  Number(payload.sgst_pct)  || 0,
    igst_pct:  Number(payload.igst_pct)  || 0,

    entries: (payload.entries || []).map((e) => ({
      dr_cr:        e.dr_cr,
      account_name: e.account_name || "",
      debit_amt:    Number(e.debit_amt)  || 0,
      credit_amt:   Number(e.credit_amt) || 0,
    })),

    narration: payload.narration || "",
    status:    payload.status    || "pending",
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

class DebitNoteService {

  // GET /debitnote/next-no
  static async getNextDnNo() {
    const fy     = currentFY();
    const prefix = `DN/${fy}/`;
    const last   = await DebitNoteModel.findOne(
      { dn_no: { $regex: `^${prefix}` } },
      { dn_no: 1 }
    ).sort({ createdAt: -1 });

    const seq   = last ? parseInt(last.dn_no.split("/").pop(), 10) : 0;
    const dn_no = `${prefix}${String(seq + 1).padStart(4, "0")}`;
    return { dn_no, is_first: !last };
  }

  // GET /debitnote/list
  static async getList(filters = {}) {
    const query = {};
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.tender_id)     query.tender_id     = filters.tender_id;
    if (filters.status)        query.status        = filters.status;
    if (filters.adj_type)      query.adj_type      = filters.adj_type;
    if (filters.tax_type)      query.tax_type      = filters.tax_type;
    if (filters.dn_no)         query.dn_no         = filters.dn_no;

    if (filters.from_date || filters.to_date) {
      query.dn_date = {};
      if (filters.from_date) query.dn_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.dn_date.$lte = to;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DebitNoteModel.find(query).sort({ dn_date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      DebitNoteModel.countDocuments(query),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /debitnote/by-supplier/:supplierId
  static async getBySupplier(supplierId, filters = {}) {
    const query = { supplier_id: supplierId };
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.status)        query.status        = filters.status;
    if (filters.from_date || filters.to_date) {
      query.dn_date = {};
      if (filters.from_date) query.dn_date.$gte = new Date(filters.from_date);
      if (filters.to_date) {
        const to = new Date(filters.to_date);
        to.setHours(23, 59, 59, 999);
        query.dn_date.$lte = to;
      }
    }
    return await DebitNoteModel.find(query).sort({ dn_date: -1 }).lean();
  }

  // GET /debitnote/by-tender/:tenderId
  static async getByTender(tenderId, filters = {}) {
    const query = { tender_id: tenderId };
    if (filters.supplier_id)   query.supplier_id   = filters.supplier_id;
    if (filters.supplier_type) query.supplier_type = filters.supplier_type;
    if (filters.status)        query.status        = filters.status;
    return await DebitNoteModel.find(query).sort({ dn_date: -1 }).lean();
  }

  // GET /debitnote/:id
  static async getById(id) {
    const doc = await DebitNoteModel.findById(id).lean();
    if (!doc) throw new Error("Debit note not found");
    return doc;
  }

  // POST /debitnote/create
  static async create(payload) {
    if (!payload.dn_no)         throw new Error("dn_no is required");
    if (!payload.supplier_id)   throw new Error("supplier_id is required");
    if (!payload.supplier_type) throw new Error("supplier_type is required");

    // Auto-fill supplier fields from master
    const supplierData = await resolveSupplier(payload.supplier_type, payload.supplier_id);
    Object.assign(payload, supplierData);

    validateEntriesBalance(payload.entries);

    const saved = await DebitNoteModel.create(buildDoc(payload, payload.dn_no));

    // Auto-post ledger entry if created directly as approved
    if (saved.status === "approved") {
      await LedgerService.postEntry({
        supplier_type: saved.supplier_type,
        supplier_id:   saved.supplier_id,
        supplier_ref:  saved.supplier_ref,
        supplier_name: saved.supplier_name,
        vch_date:      saved.dn_date,
        vch_no:        saved.dn_no,
        vch_type:      "DebitNote",
        vch_ref:       saved._id,
        particulars:   `Debit Note ${saved.dn_no}${saved.narration ? " - " + saved.narration : ""}`,
        tender_id:     saved.tender_id,
        tender_ref:    saved.tender_ref,
        tender_name:   saved.tender_name,
        debit_amt:     saved.amount,  // DN = Dr entry (reduces payable)
        credit_amt:    0,
      });
    }

    return saved;
  }

  // PATCH /debitnote/update/:id
  static async update(id, payload) {
    const dn = await DebitNoteModel.findById(id);
    if (!dn) throw new Error("Debit note not found");
    if (dn.status === "approved") throw new Error("Cannot edit an approved debit note");

    const allowed = [
      "dn_date", "document_year", "reference_no", "reference_date", "location",
      "sales_type", "adj_type", "tax_type", "rev_charge", "bill_ref", "bill_no",
      "amount", "service_amt", "entries", "narration", "tender_id", "tender_ref", "tender_name",
    ];
    for (const field of allowed) {
      if (payload[field] !== undefined) dn[field] = payload[field];
    }
    await dn.save();
    return dn;
  }

  // DELETE /debitnote/delete/:id
  static async deleteDraft(id) {
    const dn = await DebitNoteModel.findById(id);
    if (!dn) throw new Error("Debit note not found");
    if (dn.status === "approved") throw new Error("Cannot delete an approved debit note");
    await dn.deleteOne();
    return { deleted: true, dn_no: dn.dn_no };
  }

  // PATCH /debitnote/approve/:id
  static async approve(id) {
    const dn = await DebitNoteModel.findById(id);
    if (!dn)                      throw new Error("Debit note not found");
    if (dn.status === "approved") throw new Error("Already approved");

    dn.status = "approved";
    await dn.save();

    // Post to ledger on approval
    await LedgerService.postEntry({
      supplier_type: dn.supplier_type,
      supplier_id:   dn.supplier_id,
      supplier_ref:  dn.supplier_ref,
      supplier_name: dn.supplier_name,
      vch_date:      dn.dn_date,
      vch_no:        dn.dn_no,
      vch_type:      "DebitNote",
      vch_ref:       dn._id,
      particulars:   `Debit Note ${dn.dn_no}${dn.narration ? " - " + dn.narration : ""}`,
      tender_id:     dn.tender_id,
      tender_ref:    dn.tender_ref,
      tender_name:   dn.tender_name,
      debit_amt:     dn.amount,  // DN = Dr entry (reduces payable)
      credit_amt:    0,
    });

    return dn;
  }
}

export default DebitNoteService;
