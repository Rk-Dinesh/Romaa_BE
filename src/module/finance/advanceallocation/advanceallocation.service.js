import PaymentVoucherModel  from "../paymentvoucher/paymentvoucher.model.js";
import ReceiptVoucherModel  from "../receiptvoucher/receiptvoucher.model.js";
import PurchaseBillModel    from "../purchasebill/purchasebill.model.js";
import WeeklyBillingModel   from "../weeklyBilling/WeeklyBilling.model.js";
import ClientBillingModel   from "../clientbilling/clientbilling/clientbilling.model.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ── Advance Allocation Service ────────────────────────────────────────────────
//
// An "advance" is a PaymentVoucher (money we paid a vendor/contractor) OR a
// ReceiptVoucher (money we received from a client) whose `bill_refs` array
// either is empty ("On Account") or sums to LESS than its `amount`. The
// unallocated remainder sits as an open advance on that party's ledger.
//
// No new model: allocations live inside PV.bill_refs / RV.bill_refs, which
// already exist. Allocating is a reclassification — the GL was already
// Dr/Cr'd when the voucher was approved, so no new JE is posted. Instead:
//   • PV.bill_refs gets a new entry (bill_type, bill_ref, bill_no, settled_amt)
//   • PurchaseBill.amount_paid (or WB.amount_paid, CB.amount_received) goes up
//   • The bill's pre-save hook recomputes balance_due
//
// Un-allocating reverses the same two sides.

// Helpers ─────────────────────────────────────────────────────────────────────
function voucherModelFor(type) {
  if (type === "PaymentVoucher") return PaymentVoucherModel;
  if (type === "ReceiptVoucher") return ReceiptVoucherModel;
  throw new Error(`Unsupported voucher_type '${type}' (expected 'PaymentVoucher' or 'ReceiptVoucher')`);
}

function billModelFor(type) {
  if (type === "PurchaseBill")  return PurchaseBillModel;
  if (type === "WeeklyBilling") return WeeklyBillingModel;
  if (type === "ClientBilling") return ClientBillingModel;
  throw new Error(`Unsupported bill_type '${type}'`);
}

// Sum of already-allocated settlements inside a voucher
function sumAllocated(voucher) {
  return r2((voucher.bill_refs || []).reduce((s, r) => s + (Number(r.settled_amt) || 0), 0));
}

// Voucher amount available to allocate = amount − sum of existing allocations
function unallocatedBalance(voucher) {
  return r2((Number(voucher.amount) || 0) - sumAllocated(voucher));
}

// PV <-> bill type compatibility:
//   PaymentVoucher pays Vendor bills  (PurchaseBill)  or Contractor bills (WeeklyBilling)
//   ReceiptVoucher receives against Client bills      (ClientBilling)
function assertCompatibility(voucher_type, bill_type) {
  if (voucher_type === "PaymentVoucher" && (bill_type === "PurchaseBill" || bill_type === "WeeklyBilling")) return;
  if (voucher_type === "ReceiptVoucher" && bill_type === "ClientBilling") return;
  throw new Error(`Cannot allocate ${voucher_type} to ${bill_type}`);
}

// Field on the bill that tracks cumulative settlement:
function paidFieldFor(bill_type) {
  return bill_type === "ClientBilling" ? "amount_received" : "amount_paid";
}

// ── Service ──────────────────────────────────────────────────────────────────
class AdvanceAllocationService {

  // ── Outstanding advances PAID (PV unallocated balance) ───────────────────
  //
  // Returns approved PVs where (amount − Σ bill_refs.settled_amt) > 0.
  // Filters: party_type, party_id, tender_id.
  static async getOutstandingPaid({ party_type, party_id, tender_id } = {}) {
    const filter = { status: "approved", is_deleted: { $ne: true } };
    if (party_type) filter.supplier_type = party_type;
    if (party_id)   filter.supplier_id   = party_id;
    if (tender_id)  filter.tender_id     = tender_id;

    const pvs = await PaymentVoucherModel.find(filter)
      .select("pv_no pv_date supplier_type supplier_id supplier_name tender_id tender_name amount bill_refs")
      .sort({ pv_date: 1 })
      .lean();

    const rows = [];
    for (const pv of pvs) {
      const allocated   = sumAllocated(pv);
      const outstanding = r2((Number(pv.amount) || 0) - allocated);
      if (outstanding <= 0.01) continue;

      rows.push({
        voucher_type:  "PaymentVoucher",
        voucher_id:    pv._id,
        voucher_no:    pv.pv_no,
        voucher_date:  pv.pv_date,
        party_type:    pv.supplier_type,
        party_id:      pv.supplier_id,
        party_name:    pv.supplier_name,
        tender_id:     pv.tender_id || "",
        tender_name:   pv.tender_name || "",
        amount:        r2(pv.amount || 0),
        allocated:     allocated,
        outstanding,
        allocations:   pv.bill_refs || [],
      });
    }

    return {
      filter: { party_type: party_type || null, party_id: party_id || null, tender_id: tender_id || null },
      count:        rows.length,
      total_amount: r2(rows.reduce((s, r) => s + r.amount, 0)),
      total_outstanding: r2(rows.reduce((s, r) => s + r.outstanding, 0)),
      rows,
    };
  }

  // ── Outstanding advances RECEIVED (RV unallocated balance) ───────────────
  static async getOutstandingReceived({ party_type = "Client", party_id, tender_id } = {}) {
    const filter = { status: "approved", supplier_type: party_type, is_deleted: { $ne: true } };
    if (party_id)  filter.supplier_id = party_id;
    if (tender_id) filter.tender_id   = tender_id;

    const rvs = await ReceiptVoucherModel.find(filter)
      .select("rv_no rv_date supplier_type supplier_id supplier_name tender_id tender_name amount bill_refs")
      .sort({ rv_date: 1 })
      .lean();

    const rows = [];
    for (const rv of rvs) {
      const allocated   = sumAllocated(rv);
      const outstanding = r2((Number(rv.amount) || 0) - allocated);
      if (outstanding <= 0.01) continue;

      rows.push({
        voucher_type:  "ReceiptVoucher",
        voucher_id:    rv._id,
        voucher_no:    rv.rv_no,
        voucher_date:  rv.rv_date,
        party_type:    rv.supplier_type,
        party_id:      rv.supplier_id,
        party_name:    rv.supplier_name,
        tender_id:     rv.tender_id || "",
        tender_name:   rv.tender_name || "",
        amount:        r2(rv.amount || 0),
        allocated:     allocated,
        outstanding,
        allocations:   rv.bill_refs || [],
      });
    }

    return {
      filter: { party_type, party_id: party_id || null, tender_id: tender_id || null },
      count:        rows.length,
      total_amount: r2(rows.reduce((s, r) => s + r.amount, 0)),
      total_outstanding: r2(rows.reduce((s, r) => s + r.outstanding, 0)),
      rows,
    };
  }

  // ── Per-party summary ────────────────────────────────────────────────────
  // Collapses outstanding advances to one row per (party_type, party_id).
  static async getSummaryByParty({ side = "paid", tender_id } = {}) {
    const data = side === "received"
      ? await AdvanceAllocationService.getOutstandingReceived({ tender_id })
      : await AdvanceAllocationService.getOutstandingPaid({ tender_id });

    const map = {};
    for (const r of data.rows) {
      const key = `${r.party_type}|${r.party_id}`;
      if (!map[key]) map[key] = {
        party_type:  r.party_type,
        party_id:    r.party_id,
        party_name:  r.party_name,
        voucher_count: 0,
        total_amount:  0,
        total_outstanding: 0,
        oldest_date: r.voucher_date,
      };
      map[key].voucher_count += 1;
      map[key].total_amount      += r.amount;
      map[key].total_outstanding += r.outstanding;
      if (new Date(r.voucher_date) < new Date(map[key].oldest_date)) {
        map[key].oldest_date = r.voucher_date;
      }
    }

    const rows = Object.values(map).map(r => ({
      ...r,
      total_amount:      r2(r.total_amount),
      total_outstanding: r2(r.total_outstanding),
    })).sort((a, b) => b.total_outstanding - a.total_outstanding);

    return {
      side,
      filter: { tender_id: tender_id || null },
      rows,
      totals: {
        party_count:       rows.length,
        total_outstanding: r2(rows.reduce((s, r) => s + r.total_outstanding, 0)),
      },
    };
  }

  // ── Allocate part of an advance to a specific bill ───────────────────────
  //
  // Pushes a bill_ref entry into voucher.bill_refs and increments the bill's
  // amount_paid / amount_received by the same figure. No new JE is posted —
  // the ledger entries already exist from the PV/RV approval.
  //
  // Validations:
  //   - voucher must be approved
  //   - voucher_type <-> bill_type compatibility
  //   - if voucher.supplier_id is set, must equal the bill's vendor/contractor/client id
  //   - amount must be > 0 and <= min(voucher unallocated balance, bill balance_due)
  //
  // Body: { voucher_type, voucher_id, bill_type, bill_id, amount, note? }
  static async allocate({ voucher_type, voucher_id, bill_type, bill_id, amount, note = "" }) {
    if (!voucher_type || !voucher_id) throw new Error("voucher_type and voucher_id are required");
    if (!bill_type    || !bill_id)    throw new Error("bill_type and bill_id are required");
    const amt = r2(amount);
    if (!(amt > 0)) throw new Error("amount must be > 0");

    assertCompatibility(voucher_type, bill_type);

    const VoucherModel = voucherModelFor(voucher_type);
    const BillModel    = billModelFor(bill_type);

    const voucher = await VoucherModel.findById(voucher_id);
    if (!voucher) throw new Error(`${voucher_type} not found`);
    if (voucher.status !== "approved") throw new Error(`${voucher_type} must be approved before allocation`);

    const bill = await BillModel.findById(bill_id);
    if (!bill) throw new Error(`${bill_type} not found`);

    // Party match — defence against wrong allocation
    if (voucher.supplier_type && voucher.supplier_id) {
      const billPartyId = bill.vendor_id || bill.contractor_id || bill.client_id;
      if (billPartyId && voucher.supplier_id && billPartyId !== voucher.supplier_id) {
        throw new Error(`Party mismatch: voucher is for ${voucher.supplier_type} '${voucher.supplier_id}' but bill is for '${billPartyId}'`);
      }
    }

    // Already-linked check — reject duplicate entry
    const alreadyLinked = (voucher.bill_refs || []).find(r => String(r.bill_ref) === String(bill._id));
    if (alreadyLinked) {
      throw new Error(`Voucher is already allocated to bill ${alreadyLinked.bill_no}. Use un-allocate then re-allocate if you need to change the amount.`);
    }

    const vAvail = unallocatedBalance(voucher);
    const bDue   = r2(Number(bill.balance_due) || 0);
    if (amt > vAvail + 0.01) {
      throw new Error(`Amount ${amt} exceeds voucher unallocated balance ${vAvail}`);
    }
    if (amt > bDue + 0.01) {
      throw new Error(`Amount ${amt} exceeds bill balance due ${bDue}`);
    }

    // 1. Push ref into voucher
    voucher.bill_refs.push({
      bill_type,
      bill_ref:    bill._id,
      bill_no:     bill.doc_id || bill.bill_no || bill.bill_id || "",
      settled_amt: amt,
    });
    await voucher.save();

    // 2. Update bill's paid field — pre-save hook recomputes balance_due
    const paidField = paidFieldFor(bill_type);
    bill[paidField] = r2((Number(bill[paidField]) || 0) + amt);
    await bill.save();

    return {
      voucher_type,
      voucher_id:   voucher._id,
      voucher_no:   voucher.pv_no || voucher.rv_no,
      bill_type,
      bill_id:      bill._id,
      bill_no:      bill.doc_id || bill.bill_no || bill.bill_id || "",
      allocated:    amt,
      voucher_unallocated_balance: unallocatedBalance(voucher),
      bill_balance_due:            r2(Number(bill.balance_due) || 0),
      note,
    };
  }

  // ── Un-allocate an advance from a bill ───────────────────────────────────
  //
  // Removes the matching bill_ref entry from voucher.bill_refs and rolls back
  // the bill's amount_paid / amount_received by the same figure.
  //
  // Body: { voucher_type, voucher_id, bill_type, bill_id }
  // If the same voucher has been allocated to the bill more than once (which
  // allocate() prevents, but admin edits may introduce), ALL matching refs
  // are removed and the total rolled back.
  static async unallocate({ voucher_type, voucher_id, bill_type, bill_id }) {
    if (!voucher_type || !voucher_id) throw new Error("voucher_type and voucher_id are required");
    if (!bill_type    || !bill_id)    throw new Error("bill_type and bill_id are required");

    assertCompatibility(voucher_type, bill_type);

    const VoucherModel = voucherModelFor(voucher_type);
    const BillModel    = billModelFor(bill_type);

    const voucher = await VoucherModel.findById(voucher_id);
    if (!voucher) throw new Error(`${voucher_type} not found`);

    const bill = await BillModel.findById(bill_id);
    if (!bill) throw new Error(`${bill_type} not found`);

    // Find matching refs
    const matches = (voucher.bill_refs || []).filter(r => String(r.bill_ref) === String(bill._id));
    if (matches.length === 0) {
      throw new Error(`No allocation found on voucher for bill ${bill.doc_id || bill.bill_no || bill.bill_id || bill_id}`);
    }
    const totalReversed = r2(matches.reduce((s, r) => s + (Number(r.settled_amt) || 0), 0));

    // 1. Remove matching refs from voucher
    voucher.bill_refs = voucher.bill_refs.filter(r => String(r.bill_ref) !== String(bill._id));
    await voucher.save();

    // 2. Roll back bill's paid field (floor at 0)
    const paidField = paidFieldFor(bill_type);
    const newPaid = Math.max(0, r2((Number(bill[paidField]) || 0) - totalReversed));
    bill[paidField] = newPaid;
    await bill.save();

    return {
      voucher_type,
      voucher_id:        voucher._id,
      voucher_no:        voucher.pv_no || voucher.rv_no,
      bill_type,
      bill_id:           bill._id,
      reversed_amount:   totalReversed,
      voucher_unallocated_balance: unallocatedBalance(voucher),
      bill_balance_due:            r2(Number(bill.balance_due) || 0),
    };
  }

  // ── Allocation history for a specific voucher ────────────────────────────
  static async getVoucherAllocations(voucher_type, voucher_id) {
    const VoucherModel = voucherModelFor(voucher_type);
    const voucher = await VoucherModel.findById(voucher_id)
      .select("pv_no rv_no amount bill_refs supplier_type supplier_id supplier_name")
      .lean();
    if (!voucher) throw new Error(`${voucher_type} not found`);

    return {
      voucher_type,
      voucher_id,
      voucher_no:   voucher.pv_no || voucher.rv_no,
      party_type:   voucher.supplier_type,
      party_id:     voucher.supplier_id,
      party_name:   voucher.supplier_name,
      amount:       r2(Number(voucher.amount) || 0),
      allocated:    sumAllocated(voucher),
      outstanding:  unallocatedBalance(voucher),
      allocations:  voucher.bill_refs || [],
    };
  }

  // ── For a given bill, list every voucher that has settled part of it ─────
  static async getBillSettlements(bill_type, bill_id) {
    const BillModel = billModelFor(bill_type);
    const bill = await BillModel.findById(bill_id).lean();
    if (!bill) throw new Error(`${bill_type} not found`);

    const VoucherModel = bill_type === "ClientBilling" ? ReceiptVoucherModel : PaymentVoucherModel;

    const vouchers = await VoucherModel.find({
      status: "approved",
      "bill_refs.bill_ref": bill._id,
    }).select("pv_no rv_no pv_date rv_date bill_refs amount").lean();

    const rows = vouchers.map(v => {
      const ref = (v.bill_refs || []).find(r => String(r.bill_ref) === String(bill._id));
      return {
        voucher_type:  bill_type === "ClientBilling" ? "ReceiptVoucher" : "PaymentVoucher",
        voucher_id:    v._id,
        voucher_no:    v.pv_no || v.rv_no,
        voucher_date:  v.pv_date || v.rv_date,
        voucher_amount: r2(Number(v.amount) || 0),
        settled_amt:   r2(Number(ref?.settled_amt) || 0),
      };
    });

    return {
      bill_type,
      bill_id: bill._id,
      bill_no: bill.doc_id || bill.bill_no || bill.bill_id || "",
      net_amount:      r2(Number(bill.net_amount) || 0),
      amount_paid:     r2(Number(bill.amount_paid || bill.amount_received) || 0),
      balance_due:     r2(Number(bill.balance_due) || 0),
      settlement_count: rows.length,
      settlements:     rows.sort((a, b) => new Date(a.voucher_date) - new Date(b.voucher_date)),
    };
  }
}

export default AdvanceAllocationService;
