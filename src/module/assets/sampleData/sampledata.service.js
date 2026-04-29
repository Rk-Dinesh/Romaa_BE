import mongoose from "mongoose";
import logger from "../../../config/logger.js";
import { AppError } from "../../../common/AppError.js";

import SampleDataManifestModel from "./sampledata.model.js";

import AssetCategoryMasterModel from "../../master/assetcategory/assetcategory.model.js";
import MachineryAsset            from "../machinery/machineryasset.model.js";
import TaggedAssetModel          from "../taggedasset/taggedasset.model.js";
import BulkInventoryModel        from "../bulkinventory/bulkinventory.model.js";
import BulkInventoryTransactionModel from "../bulkinventory/bulkinventorytxn.model.js";
import BulkInventoryService      from "../bulkinventory/bulkinventory.service.js";
import MachineDailyLog           from "../machinerylogs/machinerylogs.model.js";
import AssetIssuanceModel        from "../assetissuance/assetissuance.model.js";
import AssetCalibrationModel     from "../assetcalibration/assetcalibration.model.js";
import MaintenanceLog            from "../maintainencelog/maintainencelog.model.js";
import PmPlanModel               from "../preventiveMaintenance/pmplan.model.js";
import WorkOrderModel            from "../workorder/workorder.model.js";
import InspectionTemplateModel   from "../inspection/inspectiontemplate.model.js";
import AssetInspectionModel      from "../inspection/assetinspection.model.js";
import OperatorCertModel         from "../operatorcert/operatorcert.model.js";
import InsuranceClaimModel       from "../insuranceclaim/insuranceclaim.model.js";
import RentalAgreementModel      from "../rental/rentalagreement.model.js";
import RentalInvoiceModel        from "../rental/rentalinvoice.model.js";
import AssetKpiSnapshotModel     from "../kpi/assetkpisnapshot.model.js";
import AssetKpiService           from "../kpi/kpi.service.js";

const BATCH_ID = "asset-default-sample";
const oid = () => new mongoose.Types.ObjectId();
const daysAgo = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x; };

// Reverse-dependency order — wipe walks this from top to bottom so children
// die before parents. Seed walks the inverse.
const WIPE_ORDER = [
  "AssetKpiSnapshot",
  "AssetInspection",
  "InspectionTemplate",
  "MaintenanceLog",
  "WorkOrder",
  "PmPlan",
  "AssetCalibration",
  "AssetIssuance",
  "RentalInvoice",
  "RentalAgreement",
  "InsuranceClaim",
  "OperatorCertification",
  "MachineDailyLog",
  "BulkInventoryTransaction",
  "BulkInventory",
  "TaggedAsset",
  "MachineryAsset",
];

// Maps collection name → mongoose model (used by wipe)
const MODEL_BY_NAME = {
  AssetKpiSnapshot:          AssetKpiSnapshotModel,
  AssetInspection:           AssetInspectionModel,
  InspectionTemplate:        InspectionTemplateModel,
  MaintenanceLog:            MaintenanceLog,
  WorkOrder:                 WorkOrderModel,
  PmPlan:                    PmPlanModel,
  AssetCalibration:          AssetCalibrationModel,
  AssetIssuance:             AssetIssuanceModel,
  RentalInvoice:             RentalInvoiceModel,
  RentalAgreement:           RentalAgreementModel,
  InsuranceClaim:            InsuranceClaimModel,
  OperatorCertification:     OperatorCertModel,
  MachineDailyLog:           MachineDailyLog,
  BulkInventoryTransaction:  BulkInventoryTransactionModel,
  BulkInventory:             BulkInventoryModel,
  TaggedAsset:               TaggedAssetModel,
  MachineryAsset:            MachineryAsset,
};

class SampleDataService {

  // ── Status ──────────────────────────────────────────────────────────────
  static async getStatus() {
    const manifest = await SampleDataManifestModel.findOne({ batch_id: BATCH_ID }).lean();
    if (!manifest) return { loaded: false };
    return {
      loaded: true,
      batch_id: manifest.batch_id,
      seeded_at: manifest.seeded_at,
      counts: manifest.counts,
      total_docs: manifest.entries?.length || 0,
    };
  }

  // ── Wipe ────────────────────────────────────────────────────────────────
  static async wipeAll(userId) {
    const manifest = await SampleDataManifestModel.findOne({ batch_id: BATCH_ID });
    if (!manifest) {
      return { wiped: false, reason: "no sample data loaded", deleted: {} };
    }

    // Group entries by collection_name
    const byCollection = {};
    for (const e of manifest.entries) {
      if (!byCollection[e.collection_name]) byCollection[e.collection_name] = [];
      byCollection[e.collection_name].push(e.doc_id);
    }

    const deleted = {};
    for (const collectionName of WIPE_ORDER) {
      const ids = byCollection[collectionName];
      if (!ids || ids.length === 0) continue;
      const Model = MODEL_BY_NAME[collectionName];
      if (!Model) {
        logger.warn(`[asset-sample/wipe] unknown collection in manifest: ${collectionName}`);
        continue;
      }
      const result = await Model.deleteMany({ _id: { $in: ids } });
      deleted[collectionName] = result.deletedCount || 0;
    }

    await SampleDataManifestModel.deleteOne({ _id: manifest._id });

    logger.info(`[asset-sample] wiped: ${JSON.stringify(deleted)}`);
    return { wiped: true, deleted, by: String(userId || "system") };
  }

  // ── Seed ────────────────────────────────────────────────────────────────
  static async seedAll(userId) {
    if (process.env.ASSET_SAMPLE_DATA_ENABLED === "false") {
      throw new AppError("Sample data seeding is disabled in this environment", 403, "DISABLED");
    }

    const exists = await SampleDataManifestModel.findOne({ batch_id: BATCH_ID }).select("_id");
    if (exists) {
      throw new AppError(
        "Sample data is already loaded. Wipe first via POST /asset-sample/wipe.",
        409,
        "ALREADY_LOADED"
      );
    }

    const manifest = new SampleDataManifestModel({
      batch_id: BATCH_ID,
      description: "Default asset-module sample dataset",
      seeded_by: userId || null,
      entries: [],
      counts: {},
    });

    try {
      const machinery = await SampleDataService._seedMachinery(manifest);
      const tagged    = await SampleDataService._seedTagged(manifest);
      const bulk      = await SampleDataService._seedBulk(manifest);
      await SampleDataService._seedBulkReceipts(manifest, bulk, userId);
      await SampleDataService._seedDailyLogs(manifest, machinery);
      const plans     = await SampleDataService._seedPmPlans(manifest, machinery);
      await SampleDataService._seedWorkOrders(manifest, machinery, plans);
      const templates = await SampleDataService._seedInspectionTemplates(manifest);
      await SampleDataService._seedInspections(manifest, machinery, templates);
      await SampleDataService._seedOperatorCerts(manifest);
      await SampleDataService._seedCalibrations(manifest, tagged);
      await SampleDataService._seedMaintenanceLogs(manifest, machinery);
      await SampleDataService._seedIssuances(manifest, machinery, tagged, bulk, userId);
      await SampleDataService._seedInsuranceClaims(manifest, machinery);
      await SampleDataService._seedRentals(manifest, machinery, tagged);

      // Tally counts for status display
      const counts = {};
      for (const e of manifest.entries) {
        counts[e.collection_name] = (counts[e.collection_name] || 0) + 1;
      }
      manifest.counts = counts;

      await manifest.save();

      // Compute KPI snapshots so the reliability dashboard has data
      try {
        const kpiStats = await AssetKpiService.computeAll({ period_kind: "DAY" });
        // KPI snapshots are tracked separately — mark them by querying assets we just seeded
        const assetIds = machinery.map((m) => m._id);
        const kpiDocs = await AssetKpiSnapshotModel.find({ asset_ref: { $in: assetIds } })
          .select("_id")
          .lean();
        const kpiEntries = kpiDocs.map((d) => ({
          collection_name: "AssetKpiSnapshot",
          doc_id: d._id,
        }));
        if (kpiEntries.length) {
          await SampleDataManifestModel.updateOne(
            { _id: manifest._id },
            {
              $push: { entries: { $each: kpiEntries } },
              $set: { "counts.AssetKpiSnapshot": kpiEntries.length },
            }
          );
        }
        manifest.counts.AssetKpiSnapshot = kpiEntries.length;
        logger.info(`[asset-sample] KPI compute: ${JSON.stringify(kpiStats)}`);
      } catch (err) {
        logger.warn(`[asset-sample] KPI compute skipped: ${err.message}`);
      }

      logger.info(`[asset-sample] seeded: ${JSON.stringify(manifest.counts)}`);
      return {
        seeded: true,
        batch_id: BATCH_ID,
        counts: manifest.counts,
        total_docs: manifest.entries.length,
      };
    } catch (err) {
      // Best-effort cleanup of whatever did insert before the failure
      logger.error(`[asset-sample] seed failed mid-flight: ${err.message}; rolling back`);
      try {
        await SampleDataService._rollback(manifest);
      } catch (rollbackErr) {
        logger.error(`[asset-sample] rollback failed: ${rollbackErr.message}`);
      }
      throw err;
    }
  }

  static async _rollback(manifest) {
    const byCollection = {};
    for (const e of manifest.entries) {
      if (!byCollection[e.collection_name]) byCollection[e.collection_name] = [];
      byCollection[e.collection_name].push(e.doc_id);
    }
    for (const c of WIPE_ORDER) {
      const ids = byCollection[c];
      if (!ids?.length) continue;
      const Model = MODEL_BY_NAME[c];
      if (Model) await Model.deleteMany({ _id: { $in: ids } });
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  static _track(manifest, collectionName, doc, businessId) {
    manifest.entries.push({
      collection_name: collectionName,
      doc_id: doc._id,
      business_id: businessId || doc[Object.keys(doc.toObject ? doc.toObject() : doc).find((k) => /id|_id$/i.test(k))] || null,
    });
  }

  static async _resolveCategory({ category, subCategory }) {
    const cat = await AssetCategoryMasterModel.findOne({ category, subCategory });
    if (!cat) {
      throw new AppError(
        `Asset category '${category} / ${subCategory}' not found in master. ` +
          `Run the category seed first (POST /assetcategory/seed).`,
        400,
        "MISSING_CATEGORY"
      );
    }
    return cat;
  }

  // ── Machinery ───────────────────────────────────────────────────────────
  static async _seedMachinery(manifest) {
    const specs = [
      { id: "EX-S01", name: "Hitachi Zaxis 220 (Sample)", cat: "Earthmoving", sub: "Excavator",
        type: "OWN ASSET", trackingMode: "HOURS", fuelTank: 410, lastReading: 1240 },
      { id: "DM-S01", name: "Tata Tipper 6-wheel (Sample)", cat: "Transport", sub: "Tipper",
        type: "OWN ASSET", trackingMode: "KILOMETERS", fuelTank: 250, lastReading: 48230 },
      { id: "TM-S01", name: "Schwing-Stetter Transit Mixer (Sample)", cat: "Concrete Equipment",
        sub: "Transit Mixer", type: "RENTAL ASSET", trackingMode: "KILOMETERS",
        fuelTank: 200, lastReading: 32100, vendorId: "VEN-S001", vendorName: "ABC Equipment Rentals" },
      { id: "MC-S01", name: "Liebherr LTM 1100 Mobile Crane (Sample)", cat: "Lifting",
        sub: "Mobile Crane", type: "RENTAL ASSET", trackingMode: "HOURS", fuelTank: 600,
        lastReading: 4520, vendorId: "VEN-S002", vendorName: "Lifting Solutions Pvt Ltd" },
      { id: "LD-S01", name: "Caterpillar 950 Wheel Loader (Sample)", cat: "Earthmoving",
        sub: "Wheel Loader", type: "OWN ASSET", trackingMode: "HOURS", fuelTank: 320,
        lastReading: 2870 },
    ];

    const out = [];
    for (const s of specs) {
      const cat = await SampleDataService._resolveCategory({ category: s.cat, subCategory: s.sub });
      const doc = await MachineryAsset.create({
        assetId: s.id,
        assetName: s.name,
        assetCategory: s.sub,
        assetCategoryRef: cat._id,
        assetType: s.type,
        vendorId: s.vendorId,
        vendorName: s.vendorName,
        serialNumber: `SN-${s.id}`,
        modelNumber: s.name.split("(")[0].trim(),
        chassisNumber: `CH-${s.id}`,
        engineNumber: `EN-${s.id}`,
        manufacturingYear: 2023,
        fuelType: "Diesel",
        fuelTankCapacity: s.fuelTank,
        trackingMode: s.trackingMode,
        currentSite: "ARIYALUR",
        projectId: "TND-S001",
        currentStatus: "Active",
        lastReading: s.lastReading,
        lastReadingDate: new Date(),
        gps: { isInstalled: true, deviceId: `IMEI-${s.id}`, provider: "Diztek" },
        compliance: {
          insurancePolicyNo: `POL-${s.id}-2025`,
          insuranceExpiry: daysAgo(-180),
          fitnessCertExpiry: daysAgo(-220),
          pollutionCertExpiry: daysAgo(-90),
          roadTaxExpiry: daysAgo(-330),
          permitExpiry: daysAgo(-150),
        },
        purchaseDate: daysAgo(720),
        purchaseCost: 5_500_000,
        supplierName: "OEM Direct",
        invoiceNumber: `INV-${s.id}`,
      });
      manifest.entries.push({ collection_name: "MachineryAsset", doc_id: doc._id, business_id: doc.assetId });
      out.push(doc);
    }
    return out;
  }

  // ── Tagged ──────────────────────────────────────────────────────────────
  static async _seedTagged(manifest) {
    const specs = [
      { id: "TGA-S01", name: "Dell Latitude 5440 (Sample)", cat: "Computing", sub: "Laptop", class: "IT", serial: "DL-5440-S01" },
      { id: "TGA-S02", name: "Dell Latitude 5440 (Sample)", cat: "Computing", sub: "Laptop", class: "IT", serial: "DL-5440-S02" },
      { id: "TGA-S03", name: "Leica TS06 Total Station (Sample)", cat: "Survey Instruments", sub: "Total Station", class: "Survey", serial: "LE-TS06-S01", needsCal: true },
      { id: "TGA-S04", name: "Bosch GBM 13 RE Drill (Sample)", cat: "Power Tools", sub: "Drill Machine", class: "Tool", serial: "BS-D13-S01" },
      { id: "TGA-S05", name: "Bosch GWS 600 Grinder (Sample)", cat: "Power Tools", sub: "Grinder", class: "Tool", serial: "BS-G600-S01" },
      { id: "TGA-S06", name: "DJI Mavic 3 Drone (Sample)", cat: "Survey Instruments", sub: "Drone", class: "Survey", serial: "DJI-M3-S01", needsCal: true },
    ];
    const out = [];
    for (const s of specs) {
      const cat = await SampleDataService._resolveCategory({ category: s.cat, subCategory: s.sub });
      const doc = await TaggedAssetModel.create({
        asset_id: s.id,
        asset_name: s.name,
        asset_category_ref: cat._id,
        asset_class: s.class,
        category: s.cat,
        sub_category: s.sub,
        ownership: "OWNED",
        serial_number: s.serial,
        manufacturer: s.name.split(" ")[0],
        manufacturing_year: 2024,
        purchase_date: daysAgo(180),
        purchase_cost: s.class === "Survey" ? 250000 : s.class === "IT" ? 75000 : 12000,
        supplier_name: "Authorized Dealer",
        current_location_type: "STORE",
        current_store_name: "Main Store",
        status: "IN_STORE",
        condition: "GOOD",
        compliance: { requires_calibration: !!s.needsCal },
        qr_code: `QR-${s.id}`,
      });
      manifest.entries.push({ collection_name: "TaggedAsset", doc_id: doc._id, business_id: doc.asset_id });
      out.push(doc);
    }
    return out;
  }

  // ── Bulk Inventory ──────────────────────────────────────────────────────
  static async _seedBulk(manifest) {
    const specs = [
      { id: "BLK-S01", name: "Safety Helmet (Yellow) (Sample)", cat: "PPE", sub: "Helmet", class: "SafetyEquipment", uom: "Nos", min: 50, reorder: 200 },
      { id: "BLK-S02", name: "Safety Shoes Size-9 (Sample)", cat: "PPE", sub: "Safety Shoes", class: "SafetyEquipment", uom: "Pair", min: 30, reorder: 100 },
      { id: "BLK-S03", name: "Full-Body Harness (Sample)", cat: "Fall Arrest", sub: "Harness", class: "SafetyEquipment", uom: "Nos", min: 20, reorder: 50 },
      { id: "BLK-S04", name: "Steel Shuttering Plate 2x1 (Sample)", cat: "Shuttering", sub: "Steel Shuttering Plate", class: "Formwork", uom: "Nos", min: 100, reorder: 500 },
      { id: "BLK-S05", name: "Plywood Sheet 8x4 (Sample)", cat: "Shuttering", sub: "Plywood Sheet", class: "Formwork", uom: "Nos", min: 50, reorder: 200 },
      { id: "BLK-S06", name: "Site Fencing GI Mesh (Sample)", cat: "Security", sub: "Site Fencing", class: "SiteInfra", uom: "Mtr", min: 100, reorder: 500 },
    ];
    const out = [];
    for (const s of specs) {
      const cat = await SampleDataService._resolveCategory({ category: s.cat, subCategory: s.sub });
      const doc = await BulkInventoryModel.create({
        item_id: s.id,
        item_name: s.name,
        asset_category_ref: cat._id,
        asset_class: s.class,
        category: s.cat,
        sub_category: s.sub,
        unit_of_measure: s.uom,
        stock_locations: [],
        total_qty_available: 0,
        total_qty_in_use: 0,
        total_qty_damaged: 0,
        min_stock_level: s.min,
        reorder_qty: s.reorder,
        is_active: true,
      });
      manifest.entries.push({ collection_name: "BulkInventory", doc_id: doc._id, business_id: doc.item_id });
      out.push(doc);
    }
    return out;
  }

  // ── Bulk RECEIPT transactions (give each item opening stock) ────────────
  static async _seedBulkReceipts(manifest, bulkItems, userId) {
    const qtyMap = {
      "BLK-S01": 250,
      "BLK-S02": 80,
      "BLK-S03": 40,
      "BLK-S04": 600,
      "BLK-S05": 180,
      "BLK-S06": 800,
    };
    for (const item of bulkItems) {
      const qty = qtyMap[item.item_id] || 50;
      // Create txn directly (avoid IdcodeServices counter consumption)
      const txnId = `BIT-S-${item.item_id.split("-")[1]}-001`;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          item.stock_locations = [
            { location_type: "STORE", location_id: "MAIN_STORE", location_name: "Main Store",
              qty_available: qty, qty_in_use: 0, qty_damaged: 0 },
          ];
          item.total_qty_available = qty;
          await item.save({ session });

          const [txn] = await BulkInventoryTransactionModel.create([{
            txn_id: txnId,
            item_ref: item._id,
            item_id_label: item.item_id,
            item_name: item.item_name,
            txn_type: "RECEIPT",
            quantity: qty,
            to_location_type: "STORE",
            to_location_id: "MAIN_STORE",
            to_location_name: "Main Store",
            reference_type: "PO",
            reference_number: `PO-S-${item.item_id}`,
            unit_cost: 100,
            total_cost: qty * 100,
            performed_by: userId,
          }], { session });
          manifest.entries.push({
            collection_name: "BulkInventoryTransaction",
            doc_id: txn._id,
            business_id: txn.txn_id,
          });
        });
      } finally {
        await session.endSession();
      }
    }
  }

  // ── Daily Logs (5 machines × 6 days) ────────────────────────────────────
  static async _seedDailyLogs(manifest, machinery) {
    const fakeBidId = oid(); // bid_id is required ObjectId; one fake satisfies all
    for (const m of machinery) {
      let reading = m.lastReading - 6 * 8; // step back to seed 6 days
      for (let d = 6; d >= 1; d--) {
        const start = reading;
        const end = reading + (m.trackingMode === "KILOMETERS" ? 80 + Math.floor(Math.random() * 40) : 7 + Math.floor(Math.random() * 3));
        const doc = await MachineDailyLog.create({
          assetId: m._id,
          projectId: "TND-S001",
          bid_id: fakeBidId,
          vendorId: m.vendorId || "VEN-S000-OWN",
          vendorName: m.vendorName || "OWN",
          item_id: "BOQ-S001",
          operatorId: "EMP-SAMPLE-01",
          logDate: daysAgo(d),
          startReading: start,
          endReading: end,
          netUsage: end - start,
          fuelOpening: 200,
          fuelIssued: 80,
          fuelClosing: 230,
          fuelConsumed: 50,
          length: m.trackingMode === "HOURS" ? 5 : 0,
          breadth: m.trackingMode === "HOURS" ? 4 : 0,
          depth: m.trackingMode === "HOURS" ? 1.5 : 0,
          unit: m.trackingMode === "HOURS" ? "Cum" : "Trips",
          quantity: m.trackingMode === "HOURS" ? 30 : 8,
          rent: m.assetType === "RENTAL ASSET" ? 12000 : 0,
          remarks: "Sample log",
        });
        manifest.entries.push({ collection_name: "MachineDailyLog", doc_id: doc._id });
        reading = end;
      }
    }
  }

  // ── PM Plans (1 per machine) ────────────────────────────────────────────
  static async _seedPmPlans(manifest, machinery) {
    const out = [];
    for (let i = 0; i < machinery.length; i++) {
      const m = machinery[i];
      const isHours = m.trackingMode === "HOURS";
      const doc = await PmPlanModel.create({
        pm_plan_id: `PMP-S${String(i + 1).padStart(3, "0")}`,
        asset_ref: m._id,
        assetId: m.assetId,
        asset_name: m.assetName,
        asset_class: m.assetCategory,
        name: isHours ? "250-hr Engine Oil & Filter" : "5000-km Service",
        description: "Routine preventive maintenance",
        triggerType: "BOTH",
        intervalReading: isHours ? 250 : 5000,
        intervalDays: 90,
        leadTimeDays: 7,
        leadTimeReading: 25,
        nextDueAt: daysAgo(-30),
        nextDueAtReading: m.lastReading + (isHours ? 250 : 5000),
        estimated_cost: 5500,
        estimated_downtime_hours: 3,
        parts: [],
        checklist: [
          "Drain old oil",
          "Replace filter",
          "Refill engine oil",
          "Run engine, check for leaks",
        ],
        priority: "MEDIUM",
        is_active: true,
      });
      manifest.entries.push({ collection_name: "PmPlan", doc_id: doc._id, business_id: doc.pm_plan_id });
      out.push(doc);
    }
    return out;
  }

  // ── Work Orders (4 in various states) ───────────────────────────────────
  static async _seedWorkOrders(manifest, machinery, plans) {
    const woSpecs = [
      { idx: 0, kind: "PM",         status: "DRAFT",       title: "250-hr engine oil change due", priority: "MEDIUM", planIdx: 0 },
      { idx: 1, kind: "CORRECTIVE", status: "IN_PROGRESS", title: "Hydraulic boom slow",          priority: "HIGH" },
      { idx: 2, kind: "CORRECTIVE", status: "COMPLETED",   title: "Air filter replacement",       priority: "LOW" },
      { idx: 3, kind: "PM",         status: "APPROVED",    title: "Annual fitness pre-check",     priority: "MEDIUM", planIdx: 3 },
    ];
    for (let i = 0; i < woSpecs.length; i++) {
      const s = woSpecs[i];
      const m = machinery[s.idx];
      const plan = s.planIdx != null ? plans[s.planIdx] : null;
      const now = new Date();
      const doc = await WorkOrderModel.create({
        work_order_no: `WO-S${String(i + 1).padStart(3, "0")}`,
        asset_ref: m._id,
        assetId: m.assetId,
        asset_name: m.assetName,
        projectId: m.projectId,
        kind: s.kind,
        title: s.title,
        description: `Sample ${s.kind} work order`,
        priority: s.priority,
        pm_plan_ref: plan?._id || null,
        status: s.status,
        statusHistory: [{ from_status: null, to_status: "DRAFT", at: daysAgo(5), notes: "Created" }],
        raised_at: daysAgo(5),
        ...(s.status !== "DRAFT" && { approved_at: daysAgo(4) }),
        ...(["IN_PROGRESS", "COMPLETED"].includes(s.status) && {
          started_at: daysAgo(3), reading_at_start: m.lastReading - 5,
        }),
        ...(s.status === "COMPLETED" && {
          completed_at: daysAgo(2), reading_at_end: m.lastReading - 1, downtime_hours: 4,
        }),
        parts: [],
        labor: [{ technician_name: "Service Engineer", role: "Mechanic", hours: 4, rate_per_hour: 500, total_cost: 2000 }],
        labor_total: 2000,
        actual_cost: 2000,
        estimated_cost: 5500,
      });
      manifest.entries.push({ collection_name: "WorkOrder", doc_id: doc._id, business_id: doc.work_order_no });
    }
  }

  // ── Inspection Templates + Submissions ──────────────────────────────────
  static async _seedInspectionTemplates(manifest) {
    const templates = [
      {
        template_id: "ITP-S001",
        title: "Excavator Pre-Shift Walk-around (Sample)",
        asset_class: "Machinery",
        asset_category: "Earthmoving",
        asset_sub_category: "Excavator",
        frequency: "PRE_SHIFT",
        items: [
          { item_no: 1, section: "Engine", question: "Engine oil level OK?", response_type: "PASS_FAIL", is_critical: true },
          { item_no: 2, section: "Hydraulics", question: "Visible hydraulic leaks?", response_type: "YES_NO", is_critical: true },
          { item_no: 3, section: "Hydraulics", question: "Boom + bucket pin condition?", response_type: "PASS_FAIL", is_critical: false },
          { item_no: 4, section: "Lights", question: "All work lights functional?", response_type: "PASS_FAIL", is_critical: false },
          { item_no: 5, section: "Cabin", question: "Seatbelt + horn working?", response_type: "PASS_FAIL", is_critical: true },
        ],
      },
      {
        template_id: "ITP-S002",
        title: "Vehicle Weekly Inspection (Sample)",
        asset_class: "Vehicle",
        frequency: "WEEKLY",
        items: [
          { item_no: 1, section: "Tyres", question: "All tyres tread depth >= 2mm?", response_type: "PASS_FAIL", is_critical: true },
          { item_no: 2, section: "Brakes", question: "Brake response normal?", response_type: "PASS_FAIL", is_critical: true },
          { item_no: 3, section: "Documents", question: "RC + Insurance + PUC valid?", response_type: "YES_NO", is_critical: true },
        ],
      },
    ];
    const out = [];
    for (const t of templates) {
      const doc = await InspectionTemplateModel.create({ ...t, is_active: true });
      manifest.entries.push({ collection_name: "InspectionTemplate", doc_id: doc._id, business_id: doc.template_id });
      out.push(doc);
    }
    return out;
  }

  static async _seedInspections(manifest, machinery, templates) {
    const inspections = [
      { idx: 0, templateIdx: 0, result: "PASS" },
      { idx: 1, templateIdx: 1, result: "PASS" },
      { idx: 4, templateIdx: 0, result: "FAIL_NON_CRITICAL" },
    ];
    for (let i = 0; i < inspections.length; i++) {
      const insp = inspections[i];
      const m = machinery[insp.idx];
      const t = templates[insp.templateIdx];
      const responses = t.items.map((item, idx) => {
        const failThis = insp.result === "FAIL_NON_CRITICAL" && !item.is_critical && idx === 2;
        return {
          item_no: item.item_no,
          question: item.question,
          is_critical: item.is_critical,
          response_value: failThis ? "FAIL" : "PASS",
          result: failThis ? "FAIL" : "PASS",
        };
      });
      const failedCrit = responses.filter((r) => r.is_critical && r.result === "FAIL").length;
      const failedNon  = responses.filter((r) => !r.is_critical && r.result === "FAIL").length;
      const overall = failedCrit > 0 ? "FAIL_CRITICAL" : failedNon > 0 ? "FAIL_NON_CRITICAL" : "PASS";

      const doc = await AssetInspectionModel.create({
        inspection_id: `INS-S${String(i + 1).padStart(3, "0")}`,
        asset_ref: m._id,
        assetId: m.assetId,
        asset_name: m.assetName,
        projectId: m.projectId,
        template_ref: t._id,
        template_title: t.title,
        frequency: t.frequency,
        inspected_at: daysAgo(i + 1),
        inspected_by_employee_id: "EMP-SAMPLE-01",
        inspected_by_employee_name: "Sample Operator",
        operatorId: "EMP-SAMPLE-01",
        reading: m.lastReading - 10,
        responses,
        overall_result: overall,
        failed_critical_count: failedCrit,
        failed_non_critical_count: failedNon,
      });
      manifest.entries.push({ collection_name: "AssetInspection", doc_id: doc._id, business_id: doc.inspection_id });
    }
  }

  // ── Operator Certifications ─────────────────────────────────────────────
  static async _seedOperatorCerts(manifest) {
    const specs = [
      { id: "OPC-S001", emp: "EMP-SAMPLE-01", name: "Sample Operator 1", type: "EXCAVATOR OPERATOR",
        license: "EXC-2024-1001", auth: "DGFASLI", class: "Machinery", category: "Earthmoving" },
      { id: "OPC-S002", emp: "EMP-SAMPLE-02", name: "Sample Operator 2", type: "HV LICENSE",
        license: "HV-TN-2024-1002", auth: "RTO Tamil Nadu", class: "Vehicle", category: "Transport" },
      { id: "OPC-S003", emp: "EMP-SAMPLE-03", name: "Sample Operator 3", type: "MOBILE CRANE OP CLASS-1",
        license: "MCO-2023-1003", auth: "DGFASLI", class: "Machinery", category: "Lifting" },
      { id: "OPC-S004", emp: "EMP-SAMPLE-04", name: "Sample Operator 4", type: "FORKLIFT",
        license: "FK-2025-1004", auth: "DGFASLI", class: "Machinery", category: "Lifting" },
      { id: "OPC-S005", emp: "EMP-SAMPLE-05", name: "Sample Operator 5", type: "WELDER 3G",
        license: "WLD-2024-1005", auth: "Welding Society of India", class: "StationaryPlant", category: "Fabrication" },
    ];
    for (const s of specs) {
      const doc = await OperatorCertModel.create({
        cert_id: s.id,
        employee_id: s.emp,
        employee_name: s.name,
        cert_type: s.type,
        license_number: s.license,
        issuing_authority: s.auth,
        asset_class: s.class,
        asset_category: s.category,
        issue_date: daysAgo(400),
        expiry_date: daysAgo(-300),
        status: "ACTIVE",
      });
      manifest.entries.push({ collection_name: "OperatorCertification", doc_id: doc._id, business_id: doc.cert_id });
    }
  }

  // ── Calibrations (only Survey items) ────────────────────────────────────
  static async _seedCalibrations(manifest, tagged) {
    const surveyItems = tagged.filter((t) => t.compliance?.requires_calibration);
    for (let i = 0; i < surveyItems.length; i++) {
      const a = surveyItems[i];
      const doc = await AssetCalibrationModel.create({
        calibration_id: `CAL-S${String(i + 1).padStart(3, "0")}`,
        asset_ref: a._id,
        asset_id_label: a.asset_id,
        asset_name: a.asset_name,
        asset_class: a.asset_class,
        calibration_date: daysAgo(60),
        next_due_date: daysAgo(-305),
        agency_name: "TUV India Pvt Ltd",
        agency_accreditation: "NABL",
        certificate_number: `TUV-${a.asset_id}-2026`,
        certificate_url: `https://files.romaa/sample/cert/${a.asset_id}.pdf`,
        result: "PASS",
        measurements: [
          { parameter: "Angular accuracy", expected: "±2\"", actual: "±1.5\"", within_tolerance: true },
        ],
        cost: 5000,
        invoice_number: `TUV/INV/${a.asset_id}`,
        performed_by: "K. Iyer",
      });
      manifest.entries.push({ collection_name: "AssetCalibration", doc_id: doc._id, business_id: doc.calibration_id });

      // Also write back the compliance summary on the tagged asset (manual,
      // since we bypass the service)
      a.compliance = {
        ...a.compliance,
        requires_calibration: true,
        last_calibration_date: doc.calibration_date,
        next_calibration_due: doc.next_due_date,
        last_certificate_number: doc.certificate_number,
        last_certificate_url: doc.certificate_url,
      };
      await a.save();
    }
  }

  // ── Maintenance Logs (2 historical entries) ─────────────────────────────
  static async _seedMaintenanceLogs(manifest, machinery) {
    const specs = [
      { mIdx: 0, id: "MNT-S001", category: "Scheduled Service", desc: "Engine oil + filter change",
        amount: 4500, parts_total: 3000, labor_total: 1500, downtime_hours: 2 },
      { mIdx: 1, id: "MNT-S002", category: "Breakdown Repair", desc: "Front axle bearing replacement",
        amount: 18500, parts_total: 12000, labor_total: 6500, downtime_hours: 12 },
    ];
    for (const s of specs) {
      const m = machinery[s.mIdx];
      const doc = await MaintenanceLog.create({
        maintenance_id: s.id,
        assetId: m.assetId,
        projectId: m.projectId,
        date: daysAgo(45),
        category: s.category,
        description: s.desc,
        vendorName: "Authorized Service Centre",
        parts: [],
        labor: [],
        parts_total: s.parts_total,
        labor_total: s.labor_total,
        amount: s.amount,
        invoiceNumber: `INV-MNT-${s.id}`,
        downtime_hours: s.downtime_hours,
        meterReadingAtService: m.lastReading - 100,
      });
      manifest.entries.push({ collection_name: "MaintenanceLog", doc_id: doc._id, business_id: doc.maintenance_id });
    }
  }

  // ── Issuances (5 mixed) ─────────────────────────────────────────────────
  static async _seedIssuances(manifest, machinery, tagged, bulk, userId) {
    const specs = [
      { id: "ISS-S001", kind: "TAGGED",    refIdx: 0, name: "TGA-S01 → EMP-SAMPLE-01", recipient: { kind: "EMPLOYEE", id: "EMP-SAMPLE-01", name: "Sample Operator 1" }, status: "ISSUED" },
      { id: "ISS-S002", kind: "TAGGED",    refIdx: 2, name: "TGA-S03 (Total Station) → EMP-SAMPLE-02", recipient: { kind: "EMPLOYEE", id: "EMP-SAMPLE-02", name: "Sample Operator 2" }, status: "ISSUED" },
      { id: "ISS-S003", kind: "MACHINERY", refIdx: 0, name: "EX-S01 → EMP-SAMPLE-01", recipient: { kind: "EMPLOYEE", id: "EMP-SAMPLE-01", name: "Sample Operator 1" }, status: "ISSUED" },
      { id: "ISS-S004", kind: "BULK",      refIdx: 0, qty: 25, name: "Helmets ×25 → CON-S001", recipient: { kind: "CONTRACTOR", id: "CON-S001", name: "Sample Contractor" }, status: "ISSUED" },
      { id: "ISS-S005", kind: "BULK",      refIdx: 4, qty: 10, name: "Plywood ×10 → site", recipient: { kind: "SITE", id: "TND-S001", name: "Ariyalur Site" }, status: "RETURNED" },
    ];
    for (const s of specs) {
      let assetRef, assetIdLabel, assetName;
      if (s.kind === "TAGGED")    { const a = tagged[s.refIdx];    assetRef = a._id; assetIdLabel = a.asset_id;  assetName = a.asset_name; }
      if (s.kind === "BULK")      { const b = bulk[s.refIdx];      assetRef = b._id; assetIdLabel = b.item_id;  assetName = b.item_name; }
      if (s.kind === "MACHINERY") { const m = machinery[s.refIdx]; assetRef = m._id; assetIdLabel = m.assetId;  assetName = m.assetName; }

      const doc = await AssetIssuanceModel.create({
        issue_id: s.id,
        asset_kind: s.kind,
        asset_ref: assetRef,
        asset_id_label: assetIdLabel,
        asset_name: assetName,
        assigned_to_kind: s.recipient.kind,
        assigned_to_id: s.recipient.id,
        assigned_to_name: s.recipient.name,
        project_id: "TND-S001",
        site_name: "Ariyalur",
        quantity: s.qty || 1,
        issue_date: daysAgo(10),
        expected_return_date: daysAgo(-30),
        condition_on_issue: "GOOD",
        status: s.status,
        ...(s.status === "RETURNED" && {
          actual_return_date: daysAgo(2),
          condition_on_return: "GOOD",
          quantity_returned: s.qty || 1,
        }),
        purpose: "Sample issuance",
        issued_by: userId,
      });
      manifest.entries.push({ collection_name: "AssetIssuance", doc_id: doc._id, business_id: doc.issue_id });

      // For BULK ISSUED, post the matching stock movement so the rollup is accurate
      if (s.kind === "BULK" && s.status === "ISSUED") {
        const item = bulk[s.refIdx];
        const txnId = `BIT-S-${item.item_id.split("-")[1]}-${s.id.split("-")[1]}`;
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const fresh = await BulkInventoryModel.findById(item._id).session(session);
            const loc = fresh.stock_locations.find((l) => l.location_id === "MAIN_STORE");
            if (loc && loc.qty_available >= s.qty) {
              loc.qty_available -= s.qty;
              loc.qty_in_use += s.qty;
              fresh.total_qty_available -= s.qty;
              fresh.total_qty_in_use += s.qty;
              await fresh.save({ session });

              const [txn] = await BulkInventoryTransactionModel.create([{
                txn_id: txnId,
                item_ref: fresh._id,
                item_id_label: fresh.item_id,
                item_name: fresh.item_name,
                txn_type: "ISSUE",
                quantity: s.qty,
                from_location_type: "STORE",
                from_location_id: "MAIN_STORE",
                from_location_name: "Main Store",
                recipient_kind: s.recipient.kind,
                recipient_id: s.recipient.id,
                recipient_name: s.recipient.name,
                reference_type: "ISSUANCE",
                reference_number: s.id,
                performed_by: userId,
              }], { session });
              manifest.entries.push({
                collection_name: "BulkInventoryTransaction",
                doc_id: txn._id,
                business_id: txn.txn_id,
              });
            }
          });
        } finally {
          await session.endSession();
        }
      }
    }
  }

  // ── Insurance Claims (2) ────────────────────────────────────────────────
  static async _seedInsuranceClaims(manifest, machinery) {
    const specs = [
      { id: "ICL-S001", mIdx: 1, type: "ACCIDENT", claimed: 250000, status: "SURVEY",
        desc: "Side-on collision at NH-44 junction" },
      { id: "ICL-S002", mIdx: 0, type: "ENGINE_FAILURE", claimed: 480000, status: "APPROVED",
        approved: 380000, desc: "Hydraulic failure during operation" },
    ];
    for (const s of specs) {
      const m = machinery[s.mIdx];
      const doc = await InsuranceClaimModel.create({
        claim_id: s.id,
        asset_ref: m._id,
        assetId: m.assetId,
        asset_name: m.assetName,
        insurer_name: "ICICI Lombard",
        insurance_policy_no: m.compliance?.insurancePolicyNo || `POL-${m.assetId}`,
        policy_start: daysAgo(330),
        policy_end: daysAgo(-30),
        incident_type: s.type,
        incident_date: daysAgo(40),
        incident_location: "Ariyalur Site / NH-44",
        description: s.desc,
        fir_filed: s.type === "ACCIDENT",
        fir_number: s.type === "ACCIDENT" ? "FIR-S001/2026" : undefined,
        police_station: s.type === "ACCIDENT" ? "Anantapur" : undefined,
        surveyor_name: "P. Krishnan",
        surveyor_contact: "+91-9000000000",
        survey_date: daysAgo(35),
        claimed_amount: s.claimed,
        approved_amount: s.approved || 0,
        status: s.status,
      });
      manifest.entries.push({ collection_name: "InsuranceClaim", doc_id: doc._id, business_id: doc.claim_id });
    }
  }

  // ── Rentals (2 agreements + 2 invoices) ─────────────────────────────────
  static async _seedRentals(manifest, machinery, tagged) {
    const agreements = [
      { id: "RNT-S001", direction: "INCOMING", asset_kind: "MACHINERY", aRef: machinery[2],
        cpKind: "VENDOR", cpId: "VEN-S001", cpName: "ABC Equipment Rentals",
        basis: "PER_HOUR", rate: 1200, free: 200, ot: 1500, gst: 18 },
      { id: "RNT-S002", direction: "OUTGOING", asset_kind: "MACHINERY", aRef: machinery[4],
        cpKind: "CLIENT", cpId: "CLI-S001", cpName: "Sample Client Builders",
        basis: "PER_DAY", rate: 18000, gst: 18 },
    ];
    const created = [];
    for (const a of agreements) {
      const doc = await RentalAgreementModel.create({
        agreement_id: a.id,
        direction: a.direction,
        asset_kind: a.asset_kind,
        asset_ref: a.aRef._id,
        asset_id_label: a.aRef.assetId || a.aRef.asset_id,
        asset_name: a.aRef.assetName || a.aRef.asset_name,
        counterparty_kind: a.cpKind,
        counterparty_id: a.cpId,
        counterparty_name: a.cpName,
        projectId: "TND-S001",
        start_date: daysAgo(60),
        end_date: daysAgo(-120),
        pricing_basis: a.basis,
        rate: a.rate,
        currency: "INR",
        minimum_per_month: 0,
        free_hours_per_month: a.free || 0,
        overtime_rate: a.ot || 0,
        gst_pct: a.gst,
        fuel_borne_by: "LESSEE",
        operator_borne_by: "LESSEE",
        maintenance_borne_by: "LESSOR",
        status: "ACTIVE",
      });
      manifest.entries.push({ collection_name: "RentalAgreement", doc_id: doc._id, business_id: doc.agreement_id });
      created.push(doc);
    }

    // One invoice per agreement
    for (let i = 0; i < created.length; i++) {
      const ag = created[i];
      const periodStart = new Date(); periodStart.setDate(1); periodStart.setMonth(periodStart.getMonth() - 1);
      const periodEnd   = new Date(periodStart); periodEnd.setMonth(periodEnd.getMonth() + 1); periodEnd.setDate(0);
      const periodLabel = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`;
      const baseAmount = ag.pricing_basis === "PER_DAY" ? ag.rate * 30 : ag.rate * 200;
      const gstAmount  = (baseAmount * ag.gst_pct) / 100;
      const total = baseAmount + gstAmount;

      const inv = await RentalInvoiceModel.create({
        invoice_id: `RIV-S${String(i + 1).padStart(3, "0")}`,
        agreement_ref: ag._id,
        agreement_no: ag.agreement_id,
        direction: ag.direction,
        asset_id_label: ag.asset_id_label,
        asset_name: ag.asset_name,
        counterparty_id: ag.counterparty_id,
        counterparty_name: ag.counterparty_name,
        projectId: ag.projectId,
        period_start: periodStart,
        period_end: periodEnd,
        period_label: periodLabel,
        days_used: 30,
        hours_used: ag.pricing_basis === "PER_HOUR" ? 200 : 0,
        base_amount: baseAmount,
        taxable_amount: baseAmount,
        gst_amount: gstAmount,
        total_amount: total,
        status: "DRAFT",
      });
      manifest.entries.push({ collection_name: "RentalInvoice", doc_id: inv._id, business_id: inv.invoice_id });
    }
  }
}

export default SampleDataService;
