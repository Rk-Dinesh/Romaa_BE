import TenderModel from "../tender/tender/tender.model.js";
import BidModel from "../tender/bid/bid.model.js";
import BoqModel from "../tender/boq/boq.model.js";
import PenaltyModel from "../tender/penalties/penalities.model.js";
import MaterialModel from "../tender/materials/material.model.js";
import Machinery from "../assets/machinery/machineryasset.model.js";
import MachineryLogsModel from "../assets/machinerylogs/machinerylogs.model.js";
import EmployeeModel from "../hr/employee/employee.model.js";
import ContractorModel from "../hr/contractors/contractor.model.js";
import ContractEmployeeModel from "../hr/contractemployee/contractemployee.model.js";
import LeaveModel from "../hr/leave/leaverequest.model.js";
import VendorModel from "../purchase/vendor/vendor.model.js";
import PurchaseRequestModel from "../purchase/purchaseorderReqIssue/purchaseReqIssue.model.js";
import WorkDoneModel from "../site/workdone/workdone.model.js";
import WorkOrderDoneModel from "../site/workorderdone/workorderdone.model.js";
import PurchaseBillModel from "../finance/purchasebill/purchasebill.model.js";
import ClientBillingModel from "../finance/clientbilling/clientbilling/clientbilling.model.js";
import WeeklyBillingModel from "../finance/weeklyBilling/WeeklyBilling.model.js";
import WorkOrderRequestModel from "../project/workorderReqIssue/workorderReqIssue.model.js";
import ScheduleLiteModel from "../project/scheduleNew/schedulelite/schedulelite.model.js";
import { getGeminiModel } from "../../config/geminiClient.js";
import logger from "../../config/logger.js";

// ── Constants ──────────────────────────────────────────────────────────────────
const RATE_LIMIT_RPM    = parseInt(process.env.AI_CHAT_RATE_LIMIT || "20", 10);
const MAX_PROMPT_LENGTH = 800;
const FETCH_LIMIT       = 30; 

// ── Per-user rate limiter ─────────────────────────────────────────────────────
const userCallMap = new Map();

function checkUserRateLimit(userId) {
  const now = Date.now();
  const timestamps = (userCallMap.get(userId) || []).filter((t) => now - t < 60_000);
  if (timestamps.length >= RATE_LIMIT_RPM) {
    throw Object.assign(
      new Error("AI rate limit reached. Please try again in a moment."),
      { statusCode: 429 }
    );
  }
  timestamps.push(now);
  userCallMap.set(userId, timestamps);
}

// ── Permission guard ──────────────────────────────────────────────────────────
function canAccess(role, module, subModule) {
  if (!role?.permissions) return false;
  const p = role.permissions;
  if (!p[module]) return false;
  if (!subModule) return true;
  return p[module][subModule]?.read === true;
}

// ── Strip sensitive fields ────────────────────────────────────────────────────
const BLOCKED_FIELDS = new Set([
  "_id", "__v", "password", "refreshToken", "createdAt", "updatedAt",
  "idProof", "bankDetails", "aadharNumber", "panNumber",
]);

function stripInternal(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripInternal);
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => !BLOCKED_FIELDS.has(k))
      .map(([k, v]) => [k, stripInternal(v)])
  );
}

// ── Audit log ─────────────────────────────────────────────────────────────────
function auditLog(userId, promptLength, modulesQueried, tokenUsage) {
  logger.info(
    `AI-AUDIT | user:${userId} | promptLen:${promptLength} | modules:[${modulesQueried.join(",")}] | tokens:${JSON.stringify(tokenUsage)}`
  );
}

// ── RESOLVER TABLE ────────────────────────────────────────────────────────────
const RESOLVERS = [
  {
    keywords: ["tender", "l1", "l2", "l3", "agreement", "contract award", "project status", "tender status"],
    key: "tenders",
    perm: ["tender", "tenders"],
    fetch: () => TenderModel.find().select("tender_id tender_name tender_value tender_status client_name agreement_value start_date end_date").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["bid", "bidding", "quote", "quotation", "negotiated", "bid ranking"],
    key: "bids",
    perm: ["tender", "tenders"],
    fetch: () => BidModel.find({ deleted: { $ne: true } }).select("bid_id tender_id tender_name phase status total_quote_amount total_negotiated_amount prepared_by").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["boq", "bill of quantities", "quantities", "schedule of rates", "boq total", "cost estimate"],
    key: "boq",
    perm: ["project", "boq_cost"],
    fetch: () => BoqModel.find().select("tender_id boq_total_amount total_material_amount total_machine_amount total_labor_amount variance_percentage").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["penalty", "fine", "liquidated", "ld clause", "delay penalty", "project penalty"],
    key: "penalties",
    perm: ["tender", "project_penalty"],
    fetch: () => PenaltyModel.find().select("penalty_id tender_id penalty_type amount status description").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["material", "stock", "inventory", "procurement material", "material quantity", "low stock"],
    key: "materials",
    perm: ["project", "material_quantity"],
    fetch: () => MaterialModel.find().select("tender_id items.item_description items.category items.unit items.unit_rate items.current_stock_on_hand items.pending_procurement_qty").sort({ createdAt: -1 }).limit(20).lean(),
  },
  {
    keywords: ["machine", "equipment", "plant", "machinery", "asset", "excavator", "crane", "loader"],
    key: "machinery",
    perm: ["project", "assets"],
    fetch: () => Machinery.find().select("name asset_code status fuel_level location last_service_date ownership_type").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["machinery log", "fuel log", "equipment usage", "machine hours", "fuel consumed"],
    key: "machineryLogs",
    perm: ["project", "assets"],
    fetch: () => MachineryLogsModel.find().select("projectId logDate netUsage fuelConsumed fuelIssued vendorName").sort({ logDate: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["employee", "staff", "workforce", "headcount", "worker", "hr", "manpower"],
    key: "employees",
    perm: ["hr", "employee"],
    fetch: () => EmployeeModel.find({ status: "Active" }).select("employee_id name designation department userType accessMode shiftType").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["contractor", "subcontractor", "contracting company", "sub-contractor"],
    key: "contractors",
    perm: ["hr", "contract_nmr"],
    fetch: () => ContractorModel.find().select("contractor_id company_name contact_person phone specialization status").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["contract worker", "contract labour", "nmr", "daily labour", "contract employee"],
    key: "contractEmployees",
    perm: ["hr", "contract_nmr"],
    fetch: () => ContractEmployeeModel.find().select("name contractor_id category daily_wage status").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["leave", "absent", "leave request", "leave balance", "leave approval"],
    key: "leaves",
    perm: ["hr", "leave"],
    fetch: () => LeaveModel.find().select("employee_id leave_type from_date to_date status days_count reason").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["vendor", "supplier", "vendor list", "approved vendor"],
    key: "vendors",
    perm: ["purchase", "vendor_supplier"],
    fetch: () => VendorModel.find().select("vendor_name vendor_id contact_person gstin status specialization").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["purchase order", "po ", "purchase request", "procurement order", "quotation", "material procurement"],
    key: "purchaseOrders",
    perm: ["purchase", "order"],
    fetch: () => PurchaseRequestModel.find().select("requestId title projectId tender_name status requestDate requiredByDate").sort({ requestDate: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["work done", "site work", "progress", "workdone", "site progress", "daily work"],
    key: "workDone",
    perm: ["site", "work_done"],
    fetch: () => WorkDoneModel.find().select("tender_id work_date work_description quantity unit report_date project_id contractor_id").sort({ report_date: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["work order done", "workorder done", "subcontractor work", "work order completion"],
    key: "workOrderDone",
    perm: ["site", "workorder_done"],
    fetch: () => WorkOrderDoneModel.find().select("tender_id work_date work_items contractor_details").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["weekly billing", "contractor billing", "weekly bill", "contractor payment", "labour bill"],
    key: "weeklyBilling",
    perm: ["site", "weekly_billing"],
    fetch: () => WeeklyBillingModel.find().select("bill_no bill_date tender_id contractor_id base_amount total_amount status").sort({ bill_date: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["purchase bill", "invoice", "bill", "grn", "vendor invoice", "goods receipt"],
    key: "purchaseBills",
    perm: ["finance", "purchase_bill"],
    fetch: () => PurchaseBillModel.find().select("bill_number vendor_name bill_amount status bill_date payment_status").sort({ bill_date: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["client billing", "ra bill", "running account", "client invoice", "measurement book", "mb"],
    key: "clientBilling",
    perm: ["finance", "client_billing"],
    fetch: () => ClientBillingModel.find().select("bill_no bill_date tender_id client_name total_bill_amount status").sort({ bill_date: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["work order", "wo ", "work order request", "issue work order", "subcontract issue"],
    key: "workOrders",
    perm: ["project", "wo_issuance"],
    fetch: () => WorkOrderRequestModel.find().select("requestId title projectId tender_name status requestDate requiredByDate").sort({ requestDate: -1 }).limit(FETCH_LIMIT).lean(),
  },
  {
    keywords: ["schedule", "task", "milestone", "timeline", "project plan", "wbs", "baseline"],
    key: "schedule",
    perm: ["project", "schedule"],
    fetch: () => ScheduleLiteModel.find().select("tender_id schedule_name status start_date end_date completion_percentage").sort({ createdAt: -1 }).limit(FETCH_LIMIT).lean(),
  },
];

// ── SYSTEM PROMPT ────────────────────────────────────────────────────────────
function buildSystemPrompt(contextData, prompt, userName, globalStats) {
  const modulesLoaded = Object.keys(contextData);

  return `You are ROMAA ERP Assistant — an expert construction consultant and data analyst.

Domain expertise you must use:
- Construction contracts follow BOQ-based payment; always compare BOQ total vs agreement value.
- RA Bills are issued to clients based on measurement book entries.
- Weekly Billing pays subcontractors/NMR labour based on work done.
- DLP (Defect Liability Period) starts after project handover.
- Purchase Bills are GRN-linked; payment only after goods receipt confirmation.
- Materials: track current_stock_on_hand vs pending_procurement_qty.

User: ${userName}

--- GLOBAL ERP SUMMARY ---
${JSON.stringify(globalStats, null, 2)}

--- DETAILED MODULE DATA ---
${modulesLoaded.length > 0 ? JSON.stringify(contextData, null, 2) : "No specific details matched for this query."}

Instructions:
1. Use GLOBAL ERP SUMMARY for "How many", "Total", or "Summary" questions.
2. Use DETAILED MODULE DATA for "Which", "List", or "Specific" questions.
3. Keep answers "Swiss-style": Data-dense, direct, and zero fluff.
4. Flag any financial variance >5% as a "Risk" immediately.
5. NEVER reveal passwords, tokens, API keys, or any credential.
6. If data is missing, recommend checking the specific sidebar module.`;
}

// ── handleGlobalQuery (UPGRADED) ─────────────────────────────────────────────
export const handleGlobalQuery = async (req, res) => {
  try {
    const { prompt } = req.body;
    const userId = req.user._id.toString();
    const userName = req.user.name || "User";
    const userRole = req.user.role;

    // 1. Validation & Rate Limiting
    checkUserRateLimit(userId);
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ status: false, message: "Prompt is required." });
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({ status: false, message: `Prompt too long. Maximum ${MAX_PROMPT_LENGTH} characters allowed.` });
    }

    const lowerPrompt = prompt.toLowerCase();
    const contextData = {};
    const modulesQueried = [];

    // 2. PROACTIVE GLOBAL STATS (Fast Counts)
    const globalStats = {};
    const statTasks = [
      canAccess(userRole, "tender", "tenders") && TenderModel.countDocuments().then(c => globalStats.total_tenders = c),
      canAccess(userRole, "project", "assets") && Machinery.countDocuments().then(c => globalStats.total_machinery = c),
      canAccess(userRole, "hr", "employee") && EmployeeModel.countDocuments({ status: "Active" }).then(c => globalStats.active_staff = c),
      canAccess(userRole, "finance", "purchase_bill") && PurchaseBillModel.countDocuments({ status: "Pending" }).then(c => globalStats.pending_bills = c),
    ].filter(Boolean);

    await Promise.all(statTasks);

    // 3. INTELLIGENT RESOLVER ROUTING
    const fetches = RESOLVERS.filter((r) => {
      const keywordMatch = r.keywords.some((kw) => lowerPrompt.includes(kw));
      const permitted = canAccess(userRole, r.perm[0], r.perm[1]);
      return keywordMatch && permitted;
    }).map(async (r) => {
      if (contextData[r.key] !== undefined) return;
      const data = await r.fetch();
      
      // Token Safety: Clean data and truncate
      const cleanedData = stripInternal(data);
      contextData[r.key] = JSON.stringify(cleanedData).slice(0, 3000); 
      modulesQueried.push(r.key);
    });

    await Promise.all(fetches);

    // 4. CORE AI CALL
    const systemPrompt = buildSystemPrompt(contextData, prompt, userName, globalStats);
    const model = getGeminiModel();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let answer;
    try {
      const result = await model.generateContent(systemPrompt);
      clearTimeout(timeoutId);
      answer = result.response.text();

      const usage = result.response.usageMetadata;
      auditLog(userId, prompt.length, modulesQueried, usage || {});
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        return res.status(504).json({ status: false, message: "AI service timed out. Please try again." });
      }
      throw err; // Caught by outer catch
    }

    res.status(200).json({ status: true, answer });

  } catch (error) {
      // Check both statusCode and the message string for 429
      if (error.statusCode === 429 || error.message?.includes("429")) {
        return res.status(429).json({ 
          status: false, 
          message: "AI Quota Exceeded. Please try again later." 
        });
      }
      logger.error(`AI insight query error | user:${req.user?._id} | ${error.message}`);
      res.status(500).json({ status: false, message: "AI insight query failed." });
    }
};

// ── handleInsightQuery (PROACTIVE) ───────────────────────────────────────────
export const handleInsightQuery = async (req, res) => {
  try {
    const userId   = req.user._id.toString();
    const userName = req.user.name || "User";
    const userRole = req.user.role;

    checkUserRateLimit(userId);

    const alerts = {};
    const checks = [
      canAccess(userRole, "hr", "leave") && (async () => {
        const pending = await LeaveModel.find({ status: "Pending" }).select("employee_id leave_type from_date to_date days_count").limit(20).lean();
        if (pending.length > 0) alerts.pendingLeaves = stripInternal(pending);
      })(),
      canAccess(userRole, "finance", "purchase_bill") && (async () => {
        const pending = await PurchaseBillModel.find({ status: { $in: ["Pending", "Unpaid", "Draft"] } }).select("bill_number vendor_name bill_amount bill_date").limit(20).lean();
        if (pending.length > 0) alerts.pendingPurchaseBills = stripInternal(pending);
      })(),
      canAccess(userRole, "tender", "tenders") && (async () => {
        const active = await TenderModel.find({ tender_status: { $in: ["Active", "In Progress", "Bidding"] } }).select("tender_id tender_name tender_value tender_status client_name").limit(15).lean();
        if (active.length > 0) alerts.activeTenders = stripInternal(active);
      })(),
      canAccess(userRole, "project", "assets") && (async () => {
        const flagged = await Machinery.find({ status: { $in: ["Under Repair", "Breakdown", "Inactive"] } }).select("name asset_code status location last_service_date").limit(15).lean();
        if (flagged.length > 0) alerts.machineryAlerts = stripInternal(flagged);
      })(),
      canAccess(userRole, "purchase", "order") && (async () => {
        const pending = await PurchaseRequestModel.find({ status: { $in: ["Pending", "Draft", "Open"] } }).select("requestId title tender_name requiredByDate").limit(15).lean();
        if (pending.length > 0) alerts.pendingPurchaseRequests = stripInternal(pending);
      })(),
      canAccess(userRole, "project", "wo_issuance") && (async () => {
        const pending = await WorkOrderRequestModel.find({ status: { $in: ["Pending", "Draft", "Open"] } }).select("requestId title tender_name requiredByDate").limit(15).lean();
        if (pending.length > 0) alerts.pendingWorkOrders = stripInternal(pending);
      })(),
      canAccess(userRole, "site", "weekly_billing") && (async () => {
        const unpaid = await WeeklyBillingModel.find({ status: { $in: ["Pending", "Unpaid", "Draft"] } }).select("bill_no bill_date tender_id total_amount status").limit(15).lean();
        if (unpaid.length > 0) alerts.unpaidWeeklyBills = stripInternal(unpaid);
      })(),
      canAccess(userRole, "finance", "client_billing") && (async () => {
        const pending = await ClientBillingModel.find({ status: { $in: ["Pending", "Draft", "Submitted"] } }).select("bill_no bill_date tender_id total_bill_amount status").limit(15).lean();
        if (pending.length > 0) alerts.pendingClientBills = stripInternal(pending);
      })(),
    ].filter(Boolean);

    await Promise.all(checks);

    if (Object.keys(alerts).length === 0) {
      return res.status(200).json({ status: true, answer: "No pending alerts found across your accessible modules. Everything looks up to date." });
    }

    const insightPrompt = `You are ROMAA ERP Assistant.
User: ${userName}

Below is the current pending/alert data across accessible ERP modules:
${JSON.stringify(alerts, null, 2)}

Generate a concise, actionable insight report. Format:
## Today's Action Items
List top priority actions based on data.
## Risk Alerts
Flag critical risks.
## Recommendations
Provide 2-3 construction-domain best-practice suggestions relevant to the pending items.

Keep it specific (use actual names/amounts) and under 400 words.`;

    const model = getGeminiModel();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let answer;
    try {
      const result = await model.generateContent(insightPrompt);
      clearTimeout(timeoutId);
      answer = result.response.text();
      auditLog(userId, 0, Object.keys(alerts), result.response.usageMetadata || {});
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") return res.status(504).json({ status: false, message: "AI service timed out." });
      throw err;
    }

    res.status(200).json({ status: true, answer, alertModules: Object.keys(alerts) });
  } // ... inside handleInsightQuery and handleGlobalQuery ...
    catch (error) {
      // Check both statusCode and the message string for 429
      if (error.statusCode === 429 || error.message?.includes("429")) {
        return res.status(429).json({ 
          status: false, 
          message: "AI Quota Exceeded. Please try again later." 
        });
      }
      logger.error(`AI insight query error | user:${req.user?._id} | ${error.message}`);
      res.status(500).json({ status: false, message: "AI insight query failed." });
    }
};