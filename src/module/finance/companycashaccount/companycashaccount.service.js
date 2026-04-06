import CompanyCashAccountModel from "./companycashaccount.model.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";

class CompanyCashAccountService {

  // ── GET /companycashaccount/list ────────────────────────────────────────
  static async getAll() {
    return await CompanyCashAccountModel.find({ is_deleted: false })
      .sort({ account_name: 1 })
      .lean();
  }

  // ── GET /companycashaccount/:id ─────────────────────────────────────────
  static async getById(id) {
    const rec = await CompanyCashAccountModel.findById(id).lean();
    if (!rec || rec.is_deleted) throw new Error("Company cash account not found. Please verify the account ID and try again");
    return rec;
  }

  // ── GET /companycashaccount/by-code/:code ───────────────────────────────
  static async getByCode(account_code) {
    const rec = await CompanyCashAccountModel.findOne({ account_code, is_deleted: false }).lean();
    if (!rec) throw new Error(`Company cash account '${account_code}' not found. Please verify the account code and try again`);
    return rec;
  }

  // ── POST /companycashaccount/create ─────────────────────────────────────
  // Creates a CompanyCashAccount record AND the corresponding AccountTree leaf
  // under parent "1010" (Cash / Petty Cash group).
  // If "1010" is still a leaf (from seed), it is converted to a group first.
  static async create(payload, created_by = "") {
    const { account_code, account_name } = payload;

    if (!account_code)  throw new Error("Account code is required to register a company cash account");
    if (!account_name)  throw new Error("Account name is required to register a company cash account");

    // Ensure no duplicate
    const existing = await CompanyCashAccountModel.findOne({ account_code, is_deleted: false });
    if (existing) throw new Error(`Company cash account with code '${account_code}' already exists. Please use a different account code`);

    // Ensure parent "1010" exists and is a group (convert from leaf if needed)
    const parent = await AccountTreeModel.findOne({ account_code: "1010", is_deleted: false });
    if (parent && !parent.is_group) {
      await AccountTreeModel.findOneAndUpdate(
        { account_code: "1010" },
        { $set: { is_group: true, is_posting_account: false } }
      );
    }

    // Create/ensure AccountTree leaf for this cash account
    const treeExists = await AccountTreeModel.findOne({ account_code, is_deleted: false });
    if (!treeExists) {
      await AccountTreeModel.create({
        account_code,
        account_name,
        description: `Company cash account: ${account_name}`,
        account_type:    "Asset",
        account_subtype: "Current Asset",
        normal_balance:  "Dr",
        parent_code:     "1010",   // Cash / Petty Cash group
        level:           2,
        is_group:         false,
        is_posting_account: true,
        is_bank_cash:    true,
        is_personal:     false,
        is_system:       false,
      });
    } else {
      // Ensure existing node is flagged as bank/cash
      if (!treeExists.is_bank_cash) {
        await AccountTreeModel.findOneAndUpdate(
          { account_code },
          { $set: { is_bank_cash: true } }
        );
      }
    }

    return await CompanyCashAccountModel.create({ ...payload, created_by });
  }

  // ── PATCH /companycashaccount/update/:id ────────────────────────────────
  static async update(id, payload) {
    const rec = await CompanyCashAccountModel.findById(id);
    if (!rec || rec.is_deleted) throw new Error("Company cash account not found. Please verify the account ID and try again");

    const allowed = [
      "account_name", "custodian_name", "location", "cash_limit", "is_active",
    ];

    for (const field of allowed) {
      if (payload[field] !== undefined) rec[field] = payload[field];
    }

    // Sync account_name change to AccountTree
    if (payload.account_name) {
      await AccountTreeModel.findOneAndUpdate(
        { account_code: rec.account_code },
        { $set: { account_name: payload.account_name } }
      );
    }

    await rec.save();
    return rec;
  }

  // ── DELETE /companycashaccount/delete/:id (soft delete) ─────────────────
  static async softDelete(id) {
    const rec = await CompanyCashAccountModel.findById(id);
    if (!rec)            throw new Error("Company cash account not found. Please verify the account ID and try again");
    if (rec.is_deleted)  throw new Error("Company cash account has already been deactivated");

    rec.is_deleted = true;
    rec.is_active  = false;
    await rec.save();

    // Deactivate the corresponding AccountTree leaf
    await AccountTreeModel.findOneAndUpdate(
      { account_code: rec.account_code },
      { $set: { is_active: false } }
    );

    return rec;
  }
}

export default CompanyCashAccountService;
