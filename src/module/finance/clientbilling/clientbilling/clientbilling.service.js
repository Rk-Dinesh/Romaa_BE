import BillingModel from "./clientbilling.model.js";
import BidModel from "../../../tender/bid/bid.model.js";
import TenderModel from "../../../tender/tender/tender.model.js";
import ClientModel from "../../../clients/client.model.js";
import LedgerService from "../../ledger/ledger.service.js";
import JournalEntryService from "../../journalentry/journalentry.service.js";
import FinanceCounterModel from "../../FinanceCounter.model.js";
import mongoose from "mongoose";
import NotificationService from "../../../notifications/notification.service.js";
import SteelEstimateModel from "../../../project/CBEstimates/steelestimate/steelEstimate.model.js";
import BillingEstimateModel from "../../../project/CBEstimates/estimate/billingestimate.model.js";

class BillingService {
  static getLevelFromCode(code) {
    if (!code) return 0;
    const sCode = code.toString().trim();
    // Matches: RA-01, 1.01, ITEM001, 101
    if (/^[A-Z0-9.\-_]+$/i.test(sCode)) return 1;
    return 0;
  }

  static async bulkInsert(csvRows, tender_id, meta = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const getValue = (row, key) =>
        (row[key] || row[key.toLowerCase()] || row[key.toUpperCase()] || "")
          .toString()
          .trim();

      const safeParseFloat = (val) => {
        if (!val || val === "-" || val === "" || val === ".") return 0;
        // Remove commas for numbers like "1,200.50"
        const num = Number(val.toString().replace(/,/g, ""));
        return isNaN(num) ? 0 : num;
      };

      const itemsMap = new Map();
      let currentParentCode = null;

      for (const row of csvRows) {
        const code = getValue(row, "Code");
        const desc = getValue(row, "Description");
        const qty = safeParseFloat(getValue(row, "Quantity"));
        const mb = getValue(row, "Mbook");

        if (!code && !desc && qty === 0) continue; // Skip empty rows

        const level = this.getLevelFromCode(code);

        if (level === 1 && code !== "") {
          // This is a new Root Item
          currentParentCode = code;

          if (!itemsMap.has(code)) {
            itemsMap.set(code, {
              item_code: code,
              item_name: desc,
              unit: getValue(row, "Unit"),
              quantity: qty, // Initial qty from the main row
              mb_book_ref: mb || "",
            });
          } else {
            // If code repeats, aggregate
            itemsMap.get(code).quantity += qty;
          }
        } else if (currentParentCode) {
          // This is a measurement row (Level 0) belonging to the last Level 1
          const parent = itemsMap.get(currentParentCode);
          parent.quantity += qty;
          if (!parent.mb_book_ref && mb) parent.mb_book_ref = mb;
        }
      }

      const processedCSVItems = Array.from(itemsMap.values());

      if (processedCSVItems.length === 0) {
        throw new Error(
          "Zero items extracted. Check CSV headers (Code, Quantity, Description).",
        );
      }

      // Block upload if any bill for this tender is not yet Approved or Paid
      const pendingBill = await BillingModel.findOne({
        tender_id,
        status: { $nin: ["Approved", "Paid"] },
      })
        .select("bill_id status")
        .session(session);
      if (pendingBill) {
        throw new Error(
          `Bill ${pendingBill.bill_id} is in "${pendingBill.status}" status. All previous bills must be Approved or Paid before uploading a new bill.`,
        );
      }

      // Call existing createBill logic
      const savedBill = await this.createBill({
        tender_id,
        bill_id: meta.bill_id,
        items: processedCSVItems,
        bill_date: meta.bill_date,
        tax_mode: meta.tax_mode,
        cgst_pct: meta.cgst_pct,
        sgst_pct: meta.sgst_pct,
        igst_pct: meta.igst_pct,
        retention_pct: meta.retention_pct,
        deductions: meta.deductions,
        created_by_user: meta.created_by_user,
        _session: session,
      });

      await session.commitTransaction();
      return savedBill;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  static async updateBillByCSV(csvRows, bill_id, meta = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const getValue = (row, key) =>
        (row[key] || row[key.toLowerCase()] || row[key.toUpperCase()] || "")
          .toString()
          .trim();
      const safeParseFloat = (val) => {
        if (!val || val === "-" || val === "" || val === ".") return 0;
        const num = Number(val.toString().replace(/,/g, ""));
        return isNaN(num) ? 0 : num;
      };

      // Find the existing bill
      const bill = await BillingModel.findOne({ bill_id }).session(session);
      if (!bill) throw new Error(`Bill ${bill_id} not found`);
      if (bill.status === "Approved")
        throw new Error(
          `Bill "${bill_id}" is Approved — approved bills cannot be edited`,
        );
      if (bill.status !== "Draft")
        throw new Error(
          `Bill ${bill_id} is "${bill.status}" — only Draft bills can be edited`,
        );

      const tender_id = bill.tender_id;

      // Parse CSV rows into item map
      const itemsMap = new Map();
      let currentParentCode = null;

      for (const row of csvRows) {
        const code = getValue(row, "Code");
        const desc = getValue(row, "Description");
        const qty = safeParseFloat(getValue(row, "Quantity"));
        const mb = getValue(row, "Mbook");

        if (!code && !desc && qty === 0) continue;

        const level = this.getLevelFromCode(code);
        if (level === 1 && code !== "") {
          currentParentCode = code;
          if (!itemsMap.has(code)) {
            itemsMap.set(code, {
              item_code: code,
              item_name: desc,
              unit: getValue(row, "Unit"),
              quantity: qty,
              mb_book_ref: mb || "",
            });
          } else {
            itemsMap.get(code).quantity += qty;
          }
        } else if (currentParentCode) {
          const parent = itemsMap.get(currentParentCode);
          parent.quantity += qty;
          if (!parent.mb_book_ref && mb) parent.mb_book_ref = mb;
        }
      }

      const processedCSVItems = Array.from(itemsMap.values());
      if (processedCSVItems.length === 0)
        throw new Error(
          "Zero items extracted. Check CSV headers (Code, Quantity, Description).",
        );

      // Fetch bid for rates
      const bidDoc = await BidModel.findOne({ tender_id }).session(session);
      if (!bidDoc)
        throw new Error(`Agreement (Bid) not found for Tender: ${tender_id}`);

      // Fetch previous bill (most recent) for cumulative quantities
      const prevBill = await BillingModel.findOne({
        tender_id,
        _id: { $ne: bill._id },
      })
        .sort({ createdAt: -1 })
        .session(session);
      const prevMap = new Map();
      if (prevBill) {
        prevBill.items.forEach((i) =>
          prevMap.set(
            i.item_code.toString().trim().toUpperCase(),
            i.upto_date_qty || 0,
          ),
        );
      }

      // Re-map items from bid + CSV
      const finalItems = bidDoc.items.map((bidItem) => {
        const bidCode = bidItem.item_id.toString().trim().toUpperCase();
        const csvMatch = processedCSVItems.find(
          (i) => i.item_code?.toString().trim().toUpperCase() === bidCode,
        );
        return {
          item_code: bidItem.item_id,
          item_name: bidItem.item_name,
          unit: bidItem.unit,
          rate: bidItem.n_rate || 0,
          agreement_qty: bidItem.quantity || 0,
          current_qty: csvMatch ? Number(csvMatch.quantity) : 0,
          prev_bill_qty: prevMap.get(bidCode) || 0,
          mb_book_ref: csvMatch ? csvMatch.mb_book_ref : "",
        };
      });

      // Apply updates
      bill.items = finalItems;
      bill.bill_date = meta.bill_date || bill.bill_date;
      bill.tax_mode = meta.tax_mode || bill.tax_mode;
      bill.cgst_pct = meta.cgst_pct ?? bill.cgst_pct;
      bill.sgst_pct = meta.sgst_pct ?? bill.sgst_pct;
      bill.igst_pct = meta.igst_pct ?? bill.igst_pct;
      bill.retention_pct = meta.retention_pct ?? bill.retention_pct;
      bill.deductions = meta.deductions || bill.deductions;

      const saved = await bill.save({ session });
      await session.commitTransaction();
      return saved;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // Returns financial year string like "25-26" for any date in Apr-2025 → Mar-2026
  static getFY(date = new Date()) {
    const y = date.getFullYear();
    const m = date.getMonth(); // 0-based; March = 2
    const startYear = m >= 3 ? y : y - 1; // FY starts April (month 3)
    return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
  }

  // Generates next bill_id atomically: CB/<FY>/<seq>  e.g. CB/25-26/0001
  static async generateBillId(_session) {
    const fy      = this.getFY();
    const counter = await FinanceCounterModel.findByIdAndUpdate(
      `CB/${fy}`,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    return `CB/${fy}/${String(counter.seq).padStart(4, "0")}`;
  }

  static async createBill(data) {
    const { tender_id, items, _session } = data;

    // 1. Fetch Tender Data
    const tenderDoc = await TenderModel.findOne({ tender_id }).session(
      _session,
    );
    if (!tenderDoc)
      throw new Error(`Tender details not found for ID: ${tender_id}`);

    // 2. Fetch Agreement/Bid Data (For the Rates)
    const bidDoc = await BidModel.findOne({ tender_id }).session(_session);
    if (!bidDoc)
      throw new Error(`Agreement (Bid) not found for Tender: ${tender_id}`);

    // 3. Fetch Previous Bill (most recent) for cumulative quantities
    const prevBill = await BillingModel.findOne({ tender_id })
      .sort({ createdAt: -1 })
      .session(_session);

    const prevMap = new Map();
    if (prevBill) {
      prevBill.items.forEach((i) => {
        const cleanCode = i.item_code.toString().trim().toUpperCase();
        prevMap.set(cleanCode, i.upto_date_qty || 0);
      });
    }

    // 4. Map Items with Fuzzy Matching
    const finalItems = bidDoc.items.map((bidItem) => {
      const bidCode = bidItem.item_id.toString().trim().toUpperCase();

      // Find match in CSV payload
      const csvMatch = items.find(
        (i) => i.item_code?.toString().trim().toUpperCase() === bidCode,
      );

      const currentQty = csvMatch ? Number(csvMatch.quantity) : 0;
      const prevQty = prevMap.get(bidCode) || 0;

      return {
        item_code: bidItem.item_id,
        item_name: bidItem.item_name,
        unit: bidItem.unit,
        rate: bidItem.n_rate || 0,
        agreement_qty: bidItem.quantity || 0,
        current_qty: currentQty,
        prev_bill_qty: prevQty,
        mb_book_ref: csvMatch ? csvMatch.mb_book_ref : "",
      };
    });

    // 5. Snapshot GSTIN + state from Clients master (for GSTR-1 classification)
    let clientGstin = "";
    let clientState = "";
    if (tenderDoc.client_id) {
      const clientDoc = await ClientModel.findOne({ client_id: tenderDoc.client_id })
        .select("gstin address")
        .session(_session || null)
        .lean();
      if (clientDoc) {
        clientGstin = clientDoc.gstin || "";
        clientState = clientDoc.address?.state || "";
      }
    }

    // 6. Build the Final Payload with Tender + Client Data
    const billPayload = {
      ...data,
      // Mapping fields from TenderModel + ClientModel
      tender_name:  tenderDoc.tender_name || "",
      client_id:    tenderDoc.client_id   || "",
      client_name:  tenderDoc.client_name || "",
      client_gstin: data.client_gstin ?? clientGstin,
      client_state: data.client_state ?? clientState,
      narration: data.narration || `RA Bill - ${tenderDoc.tender_name}`,
      items: finalItems,
      bill_id: data.bill_id || (await BillingService.generateBillId(_session)),
    };

    const newBill = new BillingModel(billPayload);

    // This triggers the pre-save hook to calculate totals
    return await newBill.save({ session: _session });
  }

  // --- Approve Bill — posts a receivable entry to the client ledger ---
  // Allowed transitions: Draft/Submitted/Checked → Approved
  static async approveBill(id) {
    const bill = await BillingModel.findById(id);
    if (!bill) throw new Error("Client bill record not found. Please verify the bill ID and try again");
    if (bill.status === "Approved" || bill.status === "Paid") {
      throw new Error(`Client bill is already ${bill.status} and cannot be approved again`);
    }
    if (bill.status === "Rejected") {
      throw new Error("Rejected client bills cannot be approved. Please create a new bill");
    }

    // Look up tender for client details
    const tender = await TenderModel.findOne({ tender_id: bill.tender_id })
      .select("client_id client_name ")
      .lean();
    if (!tender || !tender.client_id) {
      throw new Error(`No client linked to tender ${bill.tender_id}`);
    }

    bill.status = "Approved";
    const saved = await bill.save();

    // Post Cr entry: client owes us (receivable increases)
    // Net Payable = grand_total + total_tax - retention_amount - total_deductions
    await LedgerService.postEntry({
      supplier_type: "Client",
      supplier_id: tender.client_id,
      supplier_name: tender.client_name || tender.client_id,
      vch_date: bill.bill_date || new Date(),
      vch_no: bill.bill_id,
      vch_type: "ClientBill",
      vch_ref: bill._id,
      particulars: `Client Bill ${bill.bill_id} for ${bill.tender_id}`,
      tender_id: bill.tender_id,
      credit_amt: bill.net_amount,
      debit_amt: 0,
    });

    // ── Auto Journal Entry: Dr Receivable / Cr Revenue + GST Output ──────────
    const clientAccCode = await JournalEntryService.getSupplierAccountCode("Client", tender.client_id);
    const projectAccCode = `4010-${bill.tender_id}`;

    if (clientAccCode) {
      const jeLines = [
        // Dr: Client Receivable (net amount the client will pay)
        { account_code: clientAccCode, dr_cr: "Dr", debit_amt: bill.net_amount, credit_amt: 0, narration: "Client receivable" },
        // Cr: Project Revenue (full base amount)
        { account_code: projectAccCode, dr_cr: "Cr", debit_amt: 0, credit_amt: bill.grand_total, narration: "Project revenue" },
      ];

      // Cr: GST Output accounts
      if (bill.cgst_amt > 0) jeLines.push({ account_code: "2110", dr_cr: "Cr", debit_amt: 0, credit_amt: bill.cgst_amt, narration: "CGST Output" });
      if (bill.sgst_amt > 0) jeLines.push({ account_code: "2120", dr_cr: "Cr", debit_amt: 0, credit_amt: bill.sgst_amt, narration: "SGST Output" });
      if (bill.igst_amt > 0) jeLines.push({ account_code: "2130", dr_cr: "Cr", debit_amt: 0, credit_amt: bill.igst_amt, narration: "IGST Output" });

      // Dr: Retention Money Receivable (withheld by client — released after DLP)
      if (bill.retention_amount > 0) jeLines.push({ account_code: "1060", dr_cr: "Dr", debit_amt: bill.retention_amount, credit_amt: 0, narration: "Retention withheld by client" });

      // Dr: TDS Receivable (deducted by client — adjustable against tax)
      if (bill.total_deductions > 0) jeLines.push({ account_code: "1070", dr_cr: "Dr", debit_amt: bill.total_deductions, credit_amt: 0, narration: "TDS / deductions by client" });

      const je = await JournalEntryService.createFromVoucher(jeLines, {
        je_type: "Client Bill",
        je_date: bill.bill_date || new Date(),
        narration: `Client Bill ${bill.bill_id} — ${bill.tender_name || bill.tender_id} — ${tender.client_name || tender.client_id}`,
        tender_id: bill.tender_id,
        tender_name: bill.tender_name || "",
        source_ref: bill._id,
        source_type: "clientbilling",
        source_no: bill.bill_id,
      });
      if (je?._id) {
        await BillingModel.findByIdAndUpdate(bill._id, { je_ref: je._id, je_no: je.je_no });
      }
    }

    // Notify finance team
    const financeRoles = await NotificationService.getRoleIdsByPermission(
      "finance",
      "clientbilling",
      "read",
    );
    if (financeRoles.length > 0) {
      NotificationService.notify({
        title: "Client Bill Approved",
        message: `Bill ${bill.bill_id} for tender ${bill.tender_id} (${bill.client_name || bill.client_id}) has been approved. Net Payable: ₹${bill.net_amount?.toLocaleString("en-IN")}`,
        audienceType: "role",
        roles: financeRoles.map(String),
        category: "approval",
        priority: "critical",
        module: "finance",
        reference: { model: "clientbilling", documentId: bill._id },
        actionUrl: `/finance/client-billing`,
        actionLabel: "View Bill",
      });
    }

    return saved;
  }

  // --- Get History (Timeline View) ---
  static async getBillHistory(tender_id) {
    return await BillingModel.find({ tender_id })
      .sort({ createdAt: 1 })
      .select(
        "bill_id bill_date tender_id tender_name client_id client_name " +
          "grand_total total_upto_date_amount total_prev_bill_amount " +
          "total_tax cgst_amt sgst_amt igst_amt " +
          "retention_amount total_deductions net_amount " +
          "amount_received balance_due paid_status status " +
          "createdAt",
      )
      .lean();
  }

  // --- Get Full Details of One Bill ---
  static async getBillDetails(tender_id, bill_id) {
    return await BillingModel.findOne({ tender_id, bill_id });
  }

  // Get bill by tender_id + bill_id, excluding items with no current quantity
  static async getBillById(tender_id, bill_id) {
    const bill = await BillingModel.findOne({ tender_id, bill_id }).lean();
    if (!bill) return null;
    bill.items = (bill.items || []).filter((i) => (i.current_qty ?? 0) !== 0);
    return bill;
  }

  // --- Delete Bill — only Draft bills can be deleted ---
  // Also deletes associated steel estimate and billing estimate with the same bill_id
  static async deleteBill(bill_id) {
    const bill = await BillingModel.findOne({ bill_id });
    if (!bill) throw new Error(`Bill ${bill_id} not found`);
    if (bill.status === "Approved")
      throw new Error(
        `Bill "${bill_id}" is Approved — approved bills cannot be deleted`,
      );
    if (bill.status !== "Draft") {
      throw new Error(
        `Bill "${bill_id}" is in "${bill.status}" status — only Draft bills can be deleted`,
      );
    }

    const [steelResult, estimateResult] = await Promise.all([
      SteelEstimateModel.deleteMany({ bill_id }),
      BillingEstimateModel.deleteMany({ bill_id }),
    ]);

    await BillingModel.deleteOne({ bill_id });

    return {
      bill_id,
      steel_estimates_deleted: steelResult.deletedCount,
      billing_estimates_deleted: estimateResult.deletedCount,
    };
  }
}

export default BillingService;
