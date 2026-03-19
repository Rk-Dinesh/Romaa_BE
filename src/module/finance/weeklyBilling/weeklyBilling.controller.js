import service from "./weeklyBilling.service.js";

// ── Helper ─────────────────────────────────────────────────────────────────────
 const ok  = (res, data, msg = "Success", code = 200) =>
  res.status(code).json({ status: true, message: msg, data });

const fail = (res, msg = "Error", code = 500) =>
  res.status(code).json({ status: false, error: msg });

// ── GET /weeklyBilling/api/list/:tenderId ──────────────────────────────────────
// Returns all generated bills for the given tender, newest first
export const getBillingList = async (req, res) => {
  try {
    const { tenderId } = req.params;
    if (!tenderId) return fail(res, "tenderId is required", 400);

    const data = await service.getBillingList(tenderId);
    return ok(res, data);
  } catch (err) {
    console.error("[WeeklyBilling] getBillingList:", err.message);
    return fail(res, err.message, err.statusCode || 500);
  }
};

// ── GET /weeklyBilling/api/vendor-summary/:tenderId?fromDate=&toDate= ──────────
// Returns work-done records grouped by vendor with totals for the date range.
// Used to populate the "Generate Bill" modal.
export const getVendorSummary = async (req, res) => {
  try {
    const { tenderId }         = req.params;
    const { fromDate, toDate } = req.query;

    if (!tenderId)            return fail(res, "tenderId is required", 400);
    if (!fromDate || !toDate) return fail(res, "fromDate and toDate are required", 400);
    if (new Date(fromDate) > new Date(toDate))
      return fail(res, "fromDate must be before toDate", 400);

    const data = await service.getVendorSummary(tenderId, fromDate, toDate);
    return ok(res, data);
  } catch (err) {
    console.error("[WeeklyBilling] getVendorSummary:", err.message);
    return fail(res, err.message, err.statusCode || 500);
  }
};

// ── POST /weeklyBilling/api/generate ──────────────────────────────────────────
// Validates payload, checks for duplicates, saves the bill.
export const generateBill = async (req, res) => {
  try {
    const {
      tender_id,
      vendor_name,
      from_date,
      to_date,
      base_amount,
      gst_pct,
      gst_amount,
      total_amount,
      work_order_ids,
      work_done_ids,
      items,
      created_by,
    } = req.body;

    // Required field validation
    if (!tender_id)   return fail(res, "tender_id is required",   400);
    if (!vendor_name) return fail(res, "vendor_name is required", 400);
    if (!from_date)   return fail(res, "from_date is required",   400);
    if (!to_date)     return fail(res, "to_date is required",     400);

    if (new Date(from_date) > new Date(to_date))
      return fail(res, "from_date must be before to_date", 400);

    if (!items || items.length === 0)
      return fail(res, "Bill must have at least one item", 400);

    if (gst_pct < 0 || gst_pct > 100)
      return fail(res, "gst_pct must be between 0 and 100", 400);

    const bill = await service.generateBill({
      tender_id,
      vendor_name,
      from_date,
      to_date,
      base_amount,
      gst_pct,
      gst_amount,
      total_amount,
      work_order_ids,
      work_done_ids,
      items,
      created_by,
    });

    return ok(res, bill, "Bill generated successfully", 201);
  } catch (err) {
    console.error("[WeeklyBilling] generateBill:", err.message);
    return fail(res, err.message, err.statusCode || 500);
  }
};

// ── PATCH /weeklyBilling/api/status/:billId ────────────────────────────────────
// Update status: Generated → Pending → Paid | Cancelled
export const updateStatus = async (req, res) => {
  try {
    const { billId }  = req.params;
    const { status }  = req.body;

    if (!status) return fail(res, "status is required", 400);

    const updated = await service.updateBillStatus(billId, status);
    if (!updated) return fail(res, "Bill not found", 404);

    return ok(res, updated, `Bill status updated to ${status}`);
  } catch (err) {
    console.error("[WeeklyBilling] updateStatus:", err.message);
    return fail(res, err.message, err.statusCode || 500);
  }
};


