import AssetIssuanceModel from "./assetissuance.model.js";
import TaggedAssetModel from "../taggedasset/taggedasset.model.js";
import BulkInventoryModel from "../bulkinventory/bulkinventory.model.js";
import BulkInventoryService from "../bulkinventory/bulkinventory.service.js";
import MachineryAssetModel from "../machinery/machineryasset.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";

class AssetIssuanceService {
  // Hydrates the asset_id_label and asset_name from the referenced collection,
  // and validates the asset exists and is issuable.
  static async _hydrateAsset({ asset_kind, asset_ref }) {
    if (!asset_kind || !asset_ref) throw new Error("asset_kind and asset_ref are required");

    if (asset_kind === "TAGGED") {
      const a = await TaggedAssetModel.findOne({ _id: asset_ref, is_deleted: { $ne: true } });
      if (!a) throw new Error("Tagged asset not found");
      if (a.status === "LOST" || a.status === "SCRAPPED")
        throw new Error(`Tagged asset is ${a.status} — cannot issue`);
      return { asset_id_label: a.asset_id, asset_name: a.asset_name, _doc: a };
    }
    if (asset_kind === "BULK") {
      const a = await BulkInventoryModel.findById(asset_ref);
      if (!a) throw new Error("Bulk inventory item not found");
      if (!a.is_active) throw new Error("Bulk inventory item is inactive");
      return { asset_id_label: a.item_id, asset_name: a.item_name, _doc: a };
    }
    if (asset_kind === "MACHINERY") {
      const a = await MachineryAssetModel.findById(asset_ref);
      if (!a) throw new Error("Machinery asset not found");
      if (a.currentStatus === "Scrapped")
        throw new Error("Machinery asset is scrapped — cannot issue");
      return { asset_id_label: a.assetId, asset_name: a.assetName, _doc: a };
    }
    throw new Error(`Unsupported asset_kind: ${asset_kind}`);
  }

  static async createIssuance(data, userId) {
    const { asset_id_label, asset_name, _doc } = await AssetIssuanceService._hydrateAsset(data);

    const issue_id = data.issue_id || (await IdcodeServices.generateCode("ASSET_ISSUANCE"));
    const exists = await AssetIssuanceModel.findOne({ issue_id });
    if (exists) throw new Error(`Issuance '${issue_id}' already exists`);

    const qty = data.asset_kind === "BULK" ? Number(data.quantity || 1) : 1;

    const issuance = new AssetIssuanceModel({
      ...data,
      issue_id,
      asset_id_label,
      asset_name,
      quantity: qty,
      status: "ISSUED",
      issued_by: userId,
    });
    await issuance.save();

    // Side effects on the underlying asset
    if (data.asset_kind === "TAGGED") {
      _doc.status = "ISSUED";
      _doc.assigned_to_employee_id = data.assigned_to_id;
      _doc.assigned_to_employee_name = data.assigned_to_name;
      _doc.current_location_type = "ASSIGNED";
      _doc.updated_by = userId;
      await _doc.save();
    } else if (data.asset_kind === "BULK") {
      // Post the matching stock movement so the ledger and rollup stay in sync
      await BulkInventoryService.issue(
        {
          item_ref: _doc._id,
          quantity: qty,
          from_location_type: data.from_location_type || "STORE",
          from_location_id: data.from_location_id || data.project_id || "MAIN_STORE",
          from_location_name: data.from_location_name || data.site_name || "Main Store",
          recipient_kind: data.assigned_to_kind,
          recipient_id: data.assigned_to_id,
          recipient_name: data.assigned_to_name,
          reference_type: "ISSUANCE",
          reference_number: issue_id,
          notes: data.notes,
        },
        userId
      );
    }

    return issuance;
  }

  static async getAll(query = {}) {
    const {
      page = 1,
      limit = 20,
      search = "",
      status,
      asset_kind,
      assigned_to_id,
      project_id,
      overdue,
    } = query;

    const skip = (Number(page) - 1) * Number(limit);
    const filter = {};
    if (status) filter.status = status;
    if (asset_kind) filter.asset_kind = asset_kind;
    if (assigned_to_id) filter.assigned_to_id = assigned_to_id;
    if (project_id) filter.project_id = project_id;

    if (overdue === "true") {
      filter.status = "ISSUED";
      filter.expected_return_date = { $lt: new Date() };
    }

    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { issue_id: { $regex: safe, $options: "i" } },
        { asset_id_label: { $regex: safe, $options: "i" } },
        { asset_name: { $regex: safe, $options: "i" } },
        { assigned_to_name: { $regex: safe, $options: "i" } },
      ];
    }

    const [data, total] = await Promise.all([
      AssetIssuanceModel.find(filter).sort({ issue_date: -1 }).skip(skip).limit(Number(limit)),
      AssetIssuanceModel.countDocuments(filter),
    ]);
    return {
      data,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  static async getById(issue_id) {
    const record = await AssetIssuanceModel.findOne({ issue_id });
    if (!record) throw new Error("Issuance not found");
    return record;
  }

  // Records a return. For BULK supports partial returns (quantity_returning ≤ open balance).
  static async recordReturn(issue_id, returnData, userId) {
    const issuance = await AssetIssuanceModel.findOne({ issue_id });
    if (!issuance) throw new Error("Issuance not found");
    if (issuance.status === "RETURNED") throw new Error("Issuance is already fully returned");
    if (issuance.status === "LOST") throw new Error("Issuance was marked LOST — cannot return");

    const openBalance = issuance.quantity - (issuance.quantity_returned || 0);
    const qtyReturning =
      issuance.asset_kind === "BULK" ? Number(returnData.quantity || openBalance) : openBalance;

    if (qtyReturning <= 0) throw new Error("Nothing to return");
    if (qtyReturning > openBalance)
      throw new Error(`Cannot return ${qtyReturning}; only ${openBalance} outstanding`);

    issuance.quantity_returned = (issuance.quantity_returned || 0) + qtyReturning;
    issuance.actual_return_date = returnData.actual_return_date || new Date();
    issuance.condition_on_return = returnData.condition_on_return || "GOOD";
    issuance.damage_charge = returnData.damage_charge || 0;
    issuance.return_signature_url = returnData.return_signature_url || issuance.return_signature_url;
    issuance.return_photo_url = returnData.return_photo_url || issuance.return_photo_url;
    issuance.received_by = userId;

    issuance.status =
      issuance.quantity_returned >= issuance.quantity ? "RETURNED" : "PARTIALLY_RETURNED";
    if (returnData.condition_on_return === "DAMAGED") issuance.status = "DAMAGED";

    await issuance.save();

    // Side effects on the underlying asset
    if (issuance.asset_kind === "TAGGED" && issuance.status === "RETURNED") {
      const a = await TaggedAssetModel.findById(issuance.asset_ref);
      if (a) {
        a.status = "IN_STORE";
        a.condition = returnData.condition_on_return || a.condition;
        a.assigned_to_employee_id = null;
        a.assigned_to_employee_name = null;
        a.current_location_type = "STORE";
        a.updated_by = userId;
        await a.save();
      }
    } else if (issuance.asset_kind === "BULK") {
      await BulkInventoryService.receiveReturn(
        {
          item_ref: issuance.asset_ref,
          quantity: qtyReturning,
          to_location_type: returnData.to_location_type || "STORE",
          to_location_id: returnData.to_location_id || issuance.project_id || "MAIN_STORE",
          to_location_name: returnData.to_location_name || issuance.site_name || "Main Store",
          recipient_kind: issuance.assigned_to_kind,
          recipient_id: issuance.assigned_to_id,
          recipient_name: issuance.assigned_to_name,
          reference_type: "RETURN",
          reference_number: issue_id,
          notes: returnData.notes,
        },
        userId
      );

      // If the return brought damaged stock, also post a DAMAGE movement
      if (returnData.condition_on_return === "DAMAGED" && qtyReturning > 0) {
        await BulkInventoryService.markDamaged(
          {
            item_ref: issuance.asset_ref,
            quantity: qtyReturning,
            from_location_type: returnData.to_location_type || "STORE",
            from_location_id: returnData.to_location_id || issuance.project_id || "MAIN_STORE",
            from_location_name: returnData.to_location_name || issuance.site_name || "Main Store",
            reference_type: "RETURN_DAMAGE",
            reference_number: issue_id,
            notes: "Auto-marked damaged on return",
          },
          userId
        );
      }
    }

    return issuance;
  }

  static async markLost(issue_id, notes, userId) {
    const issuance = await AssetIssuanceModel.findOneAndUpdate(
      { issue_id },
      { status: "LOST", notes, received_by: userId },
      { new: true }
    );
    if (!issuance) throw new Error("Issuance not found");

    if (issuance.asset_kind === "TAGGED") {
      await TaggedAssetModel.findByIdAndUpdate(issuance.asset_ref, {
        status: "LOST",
        updated_by: userId,
      });
    }
    return issuance;
  }

  static async getOverdue() {
    return await AssetIssuanceModel.find({
      status: "ISSUED",
      expected_return_date: { $lt: new Date() },
    }).sort({ expected_return_date: 1 });
  }

  // Sweep — set status from ISSUED → OVERDUE for items past their expected return.
  // Safe to run from a daily cron.
  static async markOverdue() {
    const result = await AssetIssuanceModel.updateMany(
      { status: "ISSUED", expected_return_date: { $lt: new Date() } },
      { status: "OVERDUE" }
    );
    return { modified: result.modifiedCount || 0 };
  }
}

export default AssetIssuanceService;
