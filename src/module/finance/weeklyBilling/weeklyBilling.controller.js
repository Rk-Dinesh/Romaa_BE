import service from "./weeklyBilling.service.js";

const ok   = (res, data, msg = "Success", code = 200) =>
  res.status(code).json({ status: true, message: msg, data });

const fail = (res, msg = "Error", code = 500) =>
  res.status(code).json({ status: false, message: msg });

// ── GET /weeklyBilling/api/list/:tenderId ─────────────────────────────────────
export const getBillingList = async (req, res) => {
  try {
    const { tenderId } = req.params;
    if (!tenderId) return fail(res, "tenderId is required", 400);

    const { page, limit } = req.query;
    const result = await service.getBillingList(tenderId, { page, limit });
    return res.status(200).json({ status: true, ...result });
  } catch (err) {
    return fail(res, err.message, err.statusCode || 500);
  }
};

// ── GET /weeklyBilling/api/detail/:billNo ─────────────────────────────────────
// Returns the bill header + all line-item transactions
export const getBillDetail = async (req, res) => {
  try {
    const { billNo } = req.params;
    if (!billNo) return fail(res, "billNo is required", 400);

    const data = await service.getBillDetail(decodeURIComponent(billNo));
    if (!data) return fail(res, "Bill not found", 404);

    return ok(res, data);
  } catch (err) {
    return fail(res, err.message, err.statusCode || 500);
  }
};

// ── GET /weeklyBilling/api/sub-bill/:subBillNo ────────────────────────────────
// Returns all line-item transactions for a single sub-bill
export const getSubBillTransactions = async (req, res) => {
  try {
    const { subBillNo } = req.params;
    if (!subBillNo) return fail(res, "subBillNo is required", 400);

    const data = await service.getSubBillTransactions(decodeURIComponent(subBillNo));
    return ok(res, data);
  } catch (err) {
    return fail(res, err.message, err.statusCode || 500);
  }
};

// ── GET /weeklyBilling/api/contractor-summary/:tenderId?fromDate=&toDate= ──────────
// Returns work-done records grouped by contractor → work_order, ready for the
// "Generate Bill" modal.
export const getContractorSummary = async (req, res) => {
  try {
    const { tenderId }         = req.params;
    const { fromDate, toDate } = req.query;

    if (!tenderId)            return fail(res, "tenderId is required", 400);
    if (!fromDate || !toDate) return fail(res, "fromDate and toDate are required", 400);
    if (new Date(fromDate) > new Date(toDate))
      return fail(res, "fromDate must be before toDate", 400);

    const data = await service.getContractorSummary(tenderId, fromDate, toDate);
    return ok(res, data);
  } catch (err) {
    return fail(res, err.message, err.statusCode || 500);
  }
};

// ── POST /weeklyBilling/api/generate ──────────────────────────────────────────
// Body:
// {
//   tender_id, vendor_id, vendor_name, from_date, to_date, gst_pct,
//   sub_bills: [
//     {
//       work_order_id,
//       work_done_ids: [],
//       items: [{ work_order_id, work_done_id, item_description, description,
//                 quantity, unit, quoted_rate, amount }],
//       sub_base_amount  // optional
//     }
//   ],
//   created_by
// }
export const generateBill = async (req, res) => {
  try {
    const {
      tender_id,
      contractor_id,
      contractor_name,
      from_date,
      to_date,
      gst_pct,
      sub_bills,
      created_by,
    } = req.body;

    if (!tender_id)   return fail(res, "tender_id is required",   400);
    if (!contractor_id)   return fail(res, "contractor_id is required",   400);
    if (!contractor_name) return fail(res, "contractor_name is required", 400);
    if (!from_date)   return fail(res, "from_date is required",   400);
    if (!to_date)     return fail(res, "to_date is required",     400);
    if (new Date(from_date) > new Date(to_date))
      return fail(res, "from_date must be before to_date", 400);
    if (!Array.isArray(sub_bills) || sub_bills.length === 0)
      return fail(res, "sub_bills must be a non-empty array", 400);

    const bill = await service.generateBill({
      tender_id, contractor_id, contractor_name,
      from_date, to_date, gst_pct,
      sub_bills, created_by,
    });

    return ok(res, bill, "Bill generated successfully", 201);
  } catch (err) {
    return fail(res, err.message, err.statusCode || 500);
  }
};

// ── PATCH /weeklyBilling/api/approve/:billId ─────────────────────────────────
// Approves a bill: Generated or Pending → Approved + posts to ledger.
export const approveBill = async (req, res) => {
  try {
    const { billId } = req.params;
    const approvedBy = req.user?._id || null;

    const updated = await service.approveBill(billId, approvedBy);
    return ok(res, updated, "Bill approved and posted to ledger");
  } catch (err) {
    return fail(res, err.message, err.statusCode || 500);
  }
};

// ── PATCH /weeklyBilling/api/status/:billId ───────────────────────────────────
// Updates bill status and syncs all child transactions.
export const updateStatus = async (req, res) => {
  try {
    const { billId } = req.params;
    const { status } = req.body;

    if (!status) return fail(res, "status is required", 400);

    const updated = await service.updateBillStatus(billId, status);
    if (!updated) return fail(res, "Bill not found", 404);

    return ok(res, updated, `Bill status updated to ${status}`);
  } catch (err) {
    return fail(res, err.message, err.statusCode || 500);
  }
};
