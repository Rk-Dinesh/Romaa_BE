import mongoose from "mongoose";
import MaterialModel from "./material.model.js";
import MaterialTransactionModel from "./materialTransaction.model.js";
import PurchaseRequestModel from "../../purchase/purchaseorderReqIssue/purchaseReqIssue.model.js";

class MaterialService {

  /**
   * API 1: Receive Materials (Inward Entry)
   * Each received item is written to MaterialTransactionModel (separate collection).
   * Stock counters on the item subdoc are updated atomically via $inc (bulkWrite).
   * Session ensures the counter updates + transaction inserts are all-or-nothing.
   */
  static async addMaterialReceived(payload) {
    const { tender_id, requestId, received_items, received_by, invoice_no, site_name } = payload;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Read inside session for consistent snapshot
      const materialDoc = await MaterialModel.findOne({ tender_id }).session(session);
      if (!materialDoc) throw new Error(`Material inventory for Tender ${tender_id} has not been set up yet.`);

      const prDoc = await PurchaseRequestModel.findOne({ requestId }).session(session);
      if (!prDoc) throw new Error(`Purchase Request ${requestId} not found. Verify the request ID and try again.`);

      const vendorName = prDoc.selectedVendor?.vendorName || "";
      const vendorId   = prDoc.selectedVendor?.vendorId   || "";

      // Resolve approved quotation for quoted_rate lookup
      const approvedQuotation = prDoc.vendorQuotations?.find(
        (q) =>
          String(q._id) === String(prDoc.selectedVendor?.approvedQuotationId) ||
          (q.vendorId === vendorId && q.approvalStatus === "Approved")
      ) || null;

      // --- GRN BILL NO: TND023/26-27/0001 ---
      const now = new Date();
      const month = now.getMonth() + 1; // 1-12
      const year  = now.getFullYear();
      const fyStart = month >= 4 ? year : year - 1;
      const fyEnd   = (fyStart + 1).toString().slice(-2);
      const financialYear = `${fyStart.toString().slice(-2)}-${fyEnd}`;

      const fyStartDate = new Date(`${fyStart}-04-01T00:00:00.000Z`);
      const fyEndDate   = new Date(`${fyStart + 1}-03-31T23:59:59.999Z`);

      // Find last GRN bill for this tender in current FY and last party bill for this vendor+tender
      const [lastGrnDoc, lastPartyDoc] = await Promise.all([
        MaterialTransactionModel.findOne({
          tender_id,
          type: "IN",
          grn_bill_no: { $regex: `^${tender_id}/${financialYear}/` },
        }, { grn_bill_no: 1 }).sort({ createdAt: -1 }).session(session),
        MaterialTransactionModel.findOne({
          tender_id,
          vendor_id: vendorId,
          type: "IN",
          party_bill_no: { $regex: `^${vendorId}/${tender_id}/` },
        }, { party_bill_no: 1 }).sort({ createdAt: -1 }).session(session),
      ]);

      const lastGrnSeq   = lastGrnDoc
        ? parseInt(lastGrnDoc.grn_bill_no.split("/").pop(), 10)
        : 0;
      const lastPartySeq = lastPartyDoc
        ? parseInt(lastPartyDoc.party_bill_no.split("/").pop(), 10)
        : 0;

      const grnBillNo   = `${tender_id}/${financialYear}/${String(lastGrnSeq + 1).padStart(4, "0")}`;
      const partyBillNo = `${vendorId}/${tender_id}/${String(lastPartySeq + 1).padStart(3, "0")}`;

      const counterOps    = []; // $inc operations on stock counters (via bulkWrite)
      const hydrationOps  = []; // $set operations for empty metadata fields (via bulkWrite)
      const transactions  = []; // docs to insert into MaterialTransactionModel
      const processedItems = [];

      for (const entry of received_items) {
        const qty = Number(entry.received_quantity);
        if (qty <= 0) continue;

        const itemSubDoc = materialDoc.items.find(
          (i) => i.item_description === entry.item_description
        );
        if (!itemSubDoc) {
          throw new Error(`Material item '${entry.item_description}' was not found in the project inventory.`);
        }

        // --- HYDRATION: fill empty metadata fields from PR data ---
        const prMaterial = prDoc.materialsRequired.find(
          (m) => m.materialName === entry.item_description
        );
        if (prMaterial) {
          const setFields = {};
          const elemFilter = [{ "elem._id": itemSubDoc._id }];

          if (!itemSubDoc.hsnSac)         setFields["items.$[elem].hsnSac"]         = prMaterial.hsnSac;
          if (!itemSubDoc.type)           setFields["items.$[elem].type"]           = prMaterial.type;
          if (!itemSubDoc.shortDescription) setFields["items.$[elem].shortDescription"] = prMaterial.shortDescription;

          const ts   = itemSubDoc.taxStructure || {};
          const prTs = prMaterial.taxStructure || {};
          if (!ts.igst && prTs.igst) setFields["items.$[elem].taxStructure.igst"] = prTs.igst;
          if (!ts.cgst && prTs.cgst) setFields["items.$[elem].taxStructure.cgst"] = prTs.cgst;
          if (!ts.sgst && prTs.sgst) setFields["items.$[elem].taxStructure.sgst"] = prTs.sgst;
          if (!ts.cess && prTs.cess) setFields["items.$[elem].taxStructure.cess"] = prTs.cess;

          if (Object.keys(setFields).length > 0) {
            hydrationOps.push({
              updateOne: {
                filter: { _id: materialDoc._id },
                update: { $set: setFields },
                arrayFilters: elemFilter,
              },
            });
          }
        }

        // --- COUNTER UPDATE: atomically increment stock fields ---
        counterOps.push({
          updateOne: {
            filter: { _id: materialDoc._id, "items._id": itemSubDoc._id },
            update: {
              $inc: {
                "items.$.total_received_qty":      qty,
                "items.$.current_stock_on_hand":   qty,
                "items.$.pending_procurement_qty": -qty,
              },
            },
          },
        });

        // --- QUOTED RATE: match per item — by materialId first, then materialName ---
        const quoteItem = approvedQuotation?.quoteItems?.find(
          (qi) =>
            (entry.materialId && qi.materialId === entry.materialId) ||
            qi.materialName === entry.item_description
        );
        const quotedRate = quoteItem?.quotedUnitRate || 0;

        // --- TRANSACTION RECORD ---
        transactions.push({
          tender_id,
          item_id:              itemSubDoc._id,
          item_description:     itemSubDoc.item_description,
          unit:                 itemSubDoc.unit || "",
          taxStructure: {
            igst: itemSubDoc.taxStructure?.igst || 0,
            cgst: itemSubDoc.taxStructure?.cgst || 0,
            sgst: itemSubDoc.taxStructure?.sgst || 0,
            cess: itemSubDoc.taxStructure?.cess || 0,
          },
          type:                 "IN",
          quantity:             qty,
          date:                 new Date(entry.ordered_date || Date.now()),
          purchase_request_ref: requestId,
          site_name:            site_name  || "",
          vendor_name:          vendorName,
          vendor_id:            vendorId,
          quoted_rate:          quotedRate,
          grn_bill_no:          grnBillNo,
          party_bill_no:        partyBillNo,
          invoice_challan_no:   invoice_no || "",
          received_by:          received_by || "Admin",
          remarks:              `Received against ${requestId}`,
        });

        processedItems.push(itemSubDoc.item_description);
      }

      // Apply all writes atomically inside the session
      if (hydrationOps.length > 0) await MaterialModel.bulkWrite(hydrationOps, { session });
      if (counterOps.length > 0)   await MaterialModel.bulkWrite(counterOps,   { session });
      await MaterialTransactionModel.insertMany(transactions, { session });

      await session.commitTransaction();

      return {
        status: true,
        message: `Material stock updated and metadata synced for: ${processedItems.join(", ")}`,
        grn_bill_no:   grnBillNo,
        party_bill_no: partyBillNo,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * API 2: Issue Materials (Outward Entry)
   * Stock check uses the in-session snapshot (prevents lost-update race).
   * Counter decrement uses a conditional $elemMatch so the DB enforces the
   * stock guard even if two requests slip through simultaneously.
   */
  static async addMaterialIssued(payload) {
    const { tender_id, issued_items, issued_by } = payload;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const materialDoc = await MaterialModel.findOne({ tender_id }).session(session);
      if (!materialDoc) throw new Error(`Material inventory for Tender ${tender_id} has not been set up yet.`);

      const stockOps   = []; // conditional $inc (guard against race)
      const transactions = [];
      const issuedLog  = [];

      for (const entry of issued_items) {
        const itemSubDoc = materialDoc.items.find(
          (i) => i._id.toString() === entry.item_id || i.item_description === entry.item_description
        );
        if (!itemSubDoc) throw new Error(`Material item '${entry.item_description}' was not found in the project inventory.`);

        const qtyToIssue  = Number(entry.issued_quantity);
        const currentStock = itemSubDoc.current_stock_on_hand;

        if (currentStock < qtyToIssue) {
          throw new Error(
            `Insufficient stock for '${itemSubDoc.item_description}'. Available: ${currentStock}, Requested: ${qtyToIssue}. Please raise a new procurement request.`
          );
        }

        // Conditional update: only decrements if stock is still sufficient at write time.
        // If a concurrent transaction already consumed the stock, $elemMatch won't match
        // and modifiedCount will be < expected — caught below.
        stockOps.push({
          updateOne: {
            filter: {
              _id: materialDoc._id,
              items: { $elemMatch: { _id: itemSubDoc._id, current_stock_on_hand: { $gte: qtyToIssue } } },
            },
            update: {
              $inc: {
                "items.$.total_issued_qty":      qtyToIssue,
                "items.$.current_stock_on_hand": -qtyToIssue,
              },
            },
          },
        });

        transactions.push({
          tender_id,
          item_id:          itemSubDoc._id,
          item_description: itemSubDoc.item_description || entry.item_description,
          type:             "OUT",
          quantity:         qtyToIssue,
          date:             new Date(),
          issued_to:        entry.issued_to    || "",
          site_location:    entry.work_location || "",
          work_description: entry.purpose       || "",
          issued_by:        issued_by           || "Admin",
          priority_level:   entry.priority      || "Normal",
        });

        issuedLog.push(`${itemSubDoc.item_description}: -${qtyToIssue}`);
      }

      // Apply stock decrements
      const bulkResult = await MaterialModel.bulkWrite(stockOps, { session });

      // If any item's conditional filter didn't match, another request won the race
      if (bulkResult.modifiedCount !== stockOps.length) {
        throw new Error(
          "Stock update conflict: one or more items had insufficient stock at the time of processing. Please retry the material issuance request."
        );
      }

      await MaterialTransactionModel.insertMany(transactions, { session });

      await session.commitTransaction();

      return {
        status: true,
        message: "Materials issued successfully.",
        details: issuedLog,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * API 3: Get Dashboard / Stock Status
   * Reads directly from MaterialModel — counters are always current via $inc.
   */
  static async getMaterialStockStatus(tender_id, categoryFilter = null) {
    const materialDoc = await MaterialModel.findOne({ tender_id }).lean();
    if (!materialDoc) return { items: [] };

    let items = materialDoc.items;
    if (categoryFilter) {
      items = items.filter((i) => i.category === categoryFilter);
    }

    const stockReport = items.map((item) => ({
      item_id:            item._id,
      description:        item.item_description,
      unit:               item.unit,
      category:           item.category,
      budgeted_qty:       item.total_item_quantity,
      procurement_pending: item.pending_procurement_qty,
      opening_stock:      item.opening_stock,
      total_received:     item.total_received_qty,
      total_issued:       item.total_issued_qty,
      current_stock:      item.current_stock_on_hand,
      is_low_stock:       item.current_stock_on_hand < 10,
      is_over_budget:     item.total_received_qty > item.total_item_quantity,
    }));

    return { tender_id, total_items: stockReport.length, stock_data: stockReport };
  }

  /**
   * API 4: Get Detailed Item Ledger (combined IN + OUT timeline)
   * Queries MaterialTransactionModel — no document size limit.
   */
  static async getItemLedger(tender_id, item_id) {
    const materialDoc = await MaterialModel.findOne({ tender_id, "items._id": item_id }).lean();
    if (!materialDoc) throw new Error("Material item not found in the project inventory. Please verify the Tender ID and item ID.");

    const item = materialDoc.items.find((i) => i._id.toString() === item_id);

    const transactions = await MaterialTransactionModel.find({ tender_id, item_id })
      .sort({ date: -1 })
      .lean();

    const timeline = transactions.map((t) => ({
      ...t,
      quantity: t.type === "OUT" ? -t.quantity : t.quantity,
    }));

    return {
      item_name:     item.item_description,
      current_stock: item.current_stock_on_hand,
      history:       timeline,
    };
  }

  /**
   * API 5: Get Basic Material List (for dropdowns / PO creation)
   */
  static async getMaterialList(tender_id) {
    const materialDoc = await MaterialModel.findOne({ tender_id })
      .select(
        "items._id items.item_description items.category items.unit items.unit_rate " +
        "items.quantity items.total_item_quantity items.total_received_qty " +
        "items.total_issued_qty items.current_stock_on_hand items.pending_procurement_qty items.resourceGroup"
      )
      .lean();

    if (!materialDoc) return { items: [] };

    const simplifiedList = materialDoc.items.map((item) => ({
      item_id:                item._id,
      description:            item.item_description,
      category:               item.category,
      unit:                   item.unit,
      unit_rate:              item.unit_rate,
      total_budgeted_qty:     item.total_item_quantity,
      total_received_qty:     item.total_received_qty,
      total_issued_qty:       item.total_issued_qty,
      current_stock_on_hand:  item.current_stock_on_hand,
      pending_procurement_qty: item.pending_procurement_qty,
      resourceGroup:          item.resourceGroup,
    }));

    return { tender_id, count: simplifiedList.length, materials: simplifiedList };
  }

  /**
   * Fetch all inward transactions for a specific PO (Purchase Order / Request)
   */
  static async getPOReceivedHistory(tender_id, requestId) {
    // Get all IN transactions for this PO grouped by item
    const transactions = await MaterialTransactionModel.find({
      tender_id,
      type: "IN",
      purchase_request_ref: requestId,
    })
      .sort({ date: -1 })
      .lean();

    // Group by item_id
    const byItem = {};
    for (const t of transactions) {
      const key = t.item_id.toString();
      if (!byItem[key]) {
        byItem[key] = { item_id: t.item_id, item_description: t.item_description, unit: "", total_received_for_po: 0, history_logs: [] };
      }
      byItem[key].total_received_for_po += t.quantity;
      byItem[key].history_logs.push({ date: t.date, qty: t.quantity, invoice: t.invoice_challan_no });
    }

    // Attach unit from MaterialModel
    const materialDoc = await MaterialModel.findOne({ tender_id })
      .select("items._id items.unit")
      .lean();

    if (materialDoc) {
      for (const item of materialDoc.items) {
        const key = item._id.toString();
        if (byItem[key]) byItem[key].unit = item.unit;
      }
    }

    return { tender_id, requestId, materials: Object.values(byItem) };
  }

  /**
   * GET inward (received) history for a specific item
   */
  static async getMaterialInwardHistory(tender_id, item_id) {
    const materialDoc = await MaterialModel.findOne({ tender_id, "items._id": item_id }).lean();
    if (!materialDoc) throw new Error("Material inventory not found for the specified Tender ID.");

    const item = materialDoc.items.find((i) => i._id.toString() === item_id);
    if (!item) throw new Error("Material item not found in the project inventory.");

    const history = await MaterialTransactionModel.find({ tender_id, item_id, type: "IN" })
      .sort({ date: -1 })
      .lean();

    return {
      item_name:     item.item_description,
      unit:          item.unit,
      total_received: item.total_received_qty,
      current_stock:  item.current_stock_on_hand,
      history,
    };
  }

  /**
   * GET outward (issued) history for a specific item
   */
  static async getMaterialOutwardHistory(tender_id, item_id) {
    const materialDoc = await MaterialModel.findOne({ tender_id, "items._id": item_id }).lean();
    if (!materialDoc) throw new Error("Material inventory not found for the specified Tender ID.");

    const item = materialDoc.items.find((i) => i._id.toString() === item_id);
    if (!item) throw new Error("Material item not found in the project inventory.");

    const history = await MaterialTransactionModel.find({ tender_id, item_id, type: "OUT" })
      .sort({ date: -1 })
      .lean();

    return {
      item_name:    item.item_description,
      unit:         item.unit,
      total_issued:  item.total_issued_qty,
      current_stock: item.current_stock_on_hand,
      history,
    };
  }
  /**
   * API: Get all projects that have GRN entries
   * Returns tender_id, project_name, total_grn_entries per tender
   */
  static async getAllProjectsWithGRNSummary() {
    const summary = await MaterialTransactionModel.aggregate([
      { $match: { type: "IN" } },
      {
        $group: {
          _id: "$tender_id",
          total_grn_entries: { $sum: 1 },
          last_grn_date:     { $max: "$date" },
          vendors:           { $addToSet: "$vendor_name" },
        },
      },
      {
        $lookup: {
          from:         "tenders",
          localField:   "_id",
          foreignField: "tender_id",
          as:           "tenderInfo",
        },
      },
      {
        $project: {
          _id:               0,
          tender_id:         "$_id",
          project_name:      { $arrayElemAt: ["$tenderInfo.tender_project_name", 0] },
          tender_name:       { $arrayElemAt: ["$tenderInfo.tender_name", 0] },
          total_grn_entries: 1,
          last_grn_date:     1,
          vendors:           1,
        },
      },
      { $sort: { last_grn_date: -1 } },
    ]);

    return summary;
  }

  /**
   * API: Get all GRN (IN) entries for a tender with optional filters
   * Filters: from, to, vendor_id, vendor_name, grn_bill_no, party_bill_no,
   *          item_description, purchase_request_ref, invoice_challan_no
   */
  static async getGRNEntriesByTender(tender_id, filters = {}) {
    if (!tender_id) throw new Error("Tender ID is required.");

    const match = { tender_id, type: "IN" };

    // Date range
    if (filters.from || filters.to) {
      match.date = {};
      if (filters.from) match.date.$gte = new Date(filters.from);
      if (filters.to) {
        const end = new Date(filters.to);
        end.setUTCHours(23, 59, 59, 999);
        match.date.$lte = end;
      }
    }

    if (filters.vendor_id)            match.vendor_id            = filters.vendor_id;
    if (filters.vendor_name)          match.vendor_name          = { $regex: filters.vendor_name, $options: "i" };
    if (filters.grn_bill_no)          match.grn_bill_no          = { $regex: filters.grn_bill_no, $options: "i" };
    if (filters.party_bill_no)        match.party_bill_no        = { $regex: filters.party_bill_no, $options: "i" };
    if (filters.item_description)     match.item_description     = { $regex: filters.item_description, $options: "i" };
    if (filters.purchase_request_ref) match.purchase_request_ref = filters.purchase_request_ref;
    if (filters.invoice_challan_no)   match.invoice_challan_no   = { $regex: filters.invoice_challan_no, $options: "i" };

    const entries = await MaterialTransactionModel.find(match).sort({ date: -1 }).lean();

    return {
      tender_id,
      total: entries.length,
      entries,
    };
  }
  /**
   * API: Get GRN entries for billing — filtered by tender_id + vendor_id,
   * only type:IN and is_bill_generated:false
   */
  static async getGRNForBilling(tender_id, vendor_id) {
    if (!tender_id) throw new Error("Tender ID is required.");
    if (!vendor_id) throw new Error("Vendor ID is required.");

    const entries = await MaterialTransactionModel.find({
      tender_id,
      vendor_id,
      type: "IN",
      is_bill_generated: false,
    })
      .sort({ date: -1 })
      .lean();

    return { tender_id, vendor_id, total: entries.length, entries };
  }
}

export default MaterialService;
