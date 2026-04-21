import RecurringVoucherModel from "./recurringvoucher.model.js";
import ExpenseVoucherService from "../expensevoucher/expensevoucher.service.js";
import FinanceCounterModel from "../FinanceCounter.model.js";

// ── Counter for template numbers (not FY-scoped — templates outlive years) ───
async function generateTemplateNo() {
  const counter = await FinanceCounterModel.findByIdAndUpdate(
    "RV-T",
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `RV-T/${String(counter.seq).padStart(4, "0")}`;
}

// ── Compute next run date from the current run ────────────────────────────────
//
// Rules:
//   weekly        → addDays(7 * interval)
//   monthly       → addMonths(interval), pinned to day_of_month if set
//   quarterly     → addMonths(3 * interval), pinned to day_of_month if set
//   yearly        → addYears(interval), preserve month+day
//   custom_days   → addDays(custom_days)
//
// "Pin to day_of_month": clamp to last-day-of-month if the month is shorter
// (e.g. Jan-31 + 1 month → Feb-28, not Mar-3).
function computeNextRunDate(currentRun, template) {
  const d = new Date(currentRun);
  const interval = Math.max(1, template.interval || 1);

  switch (template.frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7 * interval);
      return d;

    case "monthly":
    case "quarterly": {
      const monthsToAdd = template.frequency === "monthly" ? interval : 3 * interval;
      const targetMonth = d.getMonth() + monthsToAdd;
      const baseDay     = template.day_of_month > 0 ? template.day_of_month : d.getDate();
      d.setDate(1);                  // avoid month roll-over (e.g. Jan-31 + 1m)
      d.setMonth(targetMonth);
      const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(baseDay, daysInTarget));
      return d;
    }

    case "yearly":
      d.setFullYear(d.getFullYear() + interval);
      return d;

    case "custom_days":
      d.setDate(d.getDate() + (Number(template.custom_days) || 1));
      return d;

    default:
      throw new Error(`Unknown frequency '${template.frequency}'`);
  }
}

// ── Build a usable EV payload from the template ──────────────────────────────
// Sets ev_date to the run date; everything else is cloned verbatim.
function buildVoucherPayload(template, runDate) {
  const base = JSON.parse(JSON.stringify(template.template_payload || {}));
  base.ev_date = runDate;
  // Strip any fields a user shouldn't have stored
  delete base.ev_no;
  delete base.je_ref;
  delete base.je_no;
  delete base.status;
  return base;
}

// ── Service ──────────────────────────────────────────────────────────────────
class RecurringVoucherService {

  // POST /recurringvoucher/create
  static async create(payload) {
    if (!payload.template_name) throw new Error("template_name is required");
    if (!payload.frequency)     throw new Error("frequency is required");
    if (!payload.start_date)    throw new Error("start_date is required");
    if (!payload.template_payload || typeof payload.template_payload !== "object") {
      throw new Error("template_payload (the EV payload to clone) is required");
    }
    if (payload.frequency === "custom_days" && !(Number(payload.custom_days) > 0)) {
      throw new Error("custom_days must be > 0 when frequency is 'custom_days'");
    }

    const template_no = await generateTemplateNo();
    const start = new Date(payload.start_date);
    const doc = await RecurringVoucherModel.create({
      template_no,
      template_name:    payload.template_name,
      voucher_type:     payload.voucher_type    || "ExpenseVoucher",
      frequency:        payload.frequency,
      interval:         Number(payload.interval) || 1,
      custom_days:      Number(payload.custom_days) || 0,
      start_date:       start,
      end_date:         payload.end_date ? new Date(payload.end_date) : null,
      day_of_month:     Number(payload.day_of_month) || 0,
      next_run_date:    start,
      template_payload: payload.template_payload,
      narration:        payload.narration  || "",
      created_by:       payload.created_by || "",
    });
    return doc;
  }

  // GET /recurringvoucher/list
  static async getList(filters = {}) {
    const query = { is_deleted: { $ne: true } };
    if (filters.status)        query.status        = filters.status;
    if (filters.voucher_type)  query.voucher_type  = filters.voucher_type;
    if (filters.template_no)   query.template_no   = filters.template_no;
    if (filters.search) {
      const s = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.template_name = { $regex: s, $options: "i" };
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filters.limit) || 20));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      RecurringVoucherModel.find(query)
        .select("template_no template_name voucher_type frequency interval start_date end_date next_run_date last_run_date run_count status createdAt")
        .sort({ next_run_date: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RecurringVoucherModel.countDocuments(query),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // GET /recurringvoucher/:id
  static async getById(id) {
    const doc = await RecurringVoucherModel.findById(id).lean();
    if (!doc) throw new Error("Recurring voucher template not found");
    return doc;
  }

  // PATCH /recurringvoucher/update/:id
  static async update(id, payload) {
    const doc = await RecurringVoucherModel.findById(id);
    if (!doc) throw new Error("Recurring voucher template not found");
    if (doc.status === "ended") throw new Error("Cannot edit an ended template");

    const allowed = [
      "template_name", "frequency", "interval", "custom_days",
      "start_date", "end_date", "day_of_month",
      "template_payload", "narration",
    ];
    for (const f of allowed) {
      if (payload[f] !== undefined) doc[f] = payload[f];
    }

    // If schedule fields changed and template hasn't fired yet, re-anchor next_run_date
    if (doc.run_count === 0 && payload.start_date) {
      doc.next_run_date = new Date(payload.start_date);
    }

    await doc.save();
    return doc;
  }

  // PATCH /recurringvoucher/:id/pause
  static async pause(id) {
    const doc = await RecurringVoucherModel.findById(id);
    if (!doc) throw new Error("Recurring voucher template not found");
    if (doc.status === "ended") throw new Error("Cannot pause an ended template");
    doc.status = "paused";
    await doc.save();
    return doc;
  }

  // PATCH /recurringvoucher/:id/resume
  static async resume(id) {
    const doc = await RecurringVoucherModel.findById(id);
    if (!doc) throw new Error("Recurring voucher template not found");
    if (doc.status !== "paused") throw new Error("Only paused templates can be resumed");
    doc.status = "active";
    // If next_run_date is in the past, advance to today
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (doc.next_run_date < today) doc.next_run_date = today;
    await doc.save();
    return doc;
  }

  // PATCH /recurringvoucher/:id/end
  static async endTemplate(id) {
    const doc = await RecurringVoucherModel.findById(id);
    if (!doc) throw new Error("Recurring voucher template not found");
    doc.status = "ended";
    await doc.save();
    return doc;
  }

  // DELETE /recurringvoucher/:id
  static async remove(id) {
    const doc = await RecurringVoucherModel.findById(id);
    if (!doc) throw new Error("Recurring voucher template not found");
    if (doc.run_count > 0) {
      throw new Error("Cannot delete a template that has already generated vouchers — pause or end it instead");
    }
    await doc.deleteOne();
    return { deleted: true, template_no: doc.template_no };
  }

  // POST /recurringvoucher/:id/run-now
  // Force-fire a single run regardless of next_run_date.
  static async runNow(id) {
    const doc = await RecurringVoucherModel.findById(id);
    if (!doc) throw new Error("Recurring voucher template not found");
    if (doc.status !== "active") throw new Error(`Template is ${doc.status}; cannot run`);
    return await this.#fireOne(doc, new Date());
  }

  // ── Cron entry point ────────────────────────────────────────────────────────
  // POST /recurringvoucher/run-due
  // Picks every active template whose next_run_date <= now (or as_of) and fires
  // one voucher per template. Returns a per-template summary.
  static async runDue(asOf = new Date()) {
    const due = await RecurringVoucherModel.find({
      status: "active",
      next_run_date: { $lte: asOf },
      is_deleted: { $ne: true },
    });

    const results = [];
    for (const tmpl of due) {
      try {
        const r = await this.#fireOne(tmpl, asOf);
        results.push({ template_no: tmpl.template_no, success: true, ...r });
      } catch (err) {
        // Record failure on the template but keep next_run_date as-is so the
        // user can fix the template and retry.
        tmpl.generated_vouchers.push({
          voucher_type: tmpl.voucher_type,
          voucher_no:   "",
          generated_at: new Date(),
          failed:       true,
          error_message: err.message,
        });
        await tmpl.save();
        results.push({ template_no: tmpl.template_no, success: false, error: err.message });
      }
    }
    return { fired: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results };
  }

  // ── Internal: create one voucher from a template + advance schedule ─────────
  static async #fireOne(tmpl, runDate) {
    let saved;
    if (tmpl.voucher_type === "ExpenseVoucher") {
      saved = await ExpenseVoucherService.create(buildVoucherPayload(tmpl, runDate));
    } else {
      throw new Error(`voucher_type '${tmpl.voucher_type}' is not supported yet`);
    }

    tmpl.generated_vouchers.push({
      voucher_type: tmpl.voucher_type,
      voucher_ref:  saved._id,
      voucher_no:   saved.ev_no || saved.pv_no || "",
      generated_at: new Date(),
    });
    tmpl.last_run_date = runDate;
    tmpl.run_count    += 1;

    // Advance next_run_date; auto-end if past end_date
    const next = computeNextRunDate(tmpl.next_run_date, tmpl);
    if (tmpl.end_date && next > tmpl.end_date) {
      tmpl.status = "ended";
    } else {
      tmpl.next_run_date = next;
    }
    await tmpl.save();

    return {
      voucher_no:    saved.ev_no || saved.pv_no || "",
      voucher_ref:   saved._id,
      next_run_date: tmpl.status === "ended" ? null : tmpl.next_run_date,
      ended:         tmpl.status === "ended",
    };
  }
}

export default RecurringVoucherService;
