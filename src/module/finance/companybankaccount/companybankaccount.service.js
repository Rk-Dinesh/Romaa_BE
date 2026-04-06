import CompanyBankAccountModel from "./companybankaccount.model.js";
import AccountTreeModel from "../accounttree/accounttree.model.js";

class CompanyBankAccountService {

  // ── GET /companybankaccount/list ──────────────────────────────────────────
  static async getAll() {
    return await CompanyBankAccountModel.find({ is_deleted: false })
      .sort({ account_name: 1 })
      .lean();
  }

  // ── GET /companybankaccount/:id ───────────────────────────────────────────
  static async getById(id) {
    const rec = await CompanyBankAccountModel.findById(id).lean();
    if (!rec || rec.is_deleted) throw new Error("Company bank account not found. Please verify the account ID and try again");
    return rec;
  }

  // ── GET /companybankaccount/by-code/:code ─────────────────────────────────
  static async getByCode(account_code) {
    const rec = await CompanyBankAccountModel.findOne({ account_code, is_deleted: false }).lean();
    if (!rec) throw new Error(`Company bank account '${account_code}' not found. Please verify the account code and try again`);
    return rec;
  }

  // ── POST /companybankaccount/create ───────────────────────────────────────
  // Creates a CompanyBankAccount record AND the corresponding AccountTree leaf.
  // The AccountTree leaf is created under parent "1020" (Bank Accounts group).
  static async create(payload, created_by = "") {
    const { account_code, account_name, bank_name, account_number } = payload;

    if (!account_code)   throw new Error("Account code is required to register a company bank account");
    if (!account_name)   throw new Error("Account name is required to register a company bank account");
    if (!bank_name)      throw new Error("Bank name is required to register a company bank account");
    if (!account_number) throw new Error("Account number is required to register a company bank account");

    // Ensure no duplicate
    const existing = await CompanyBankAccountModel.findOne({ account_code, is_deleted: false });
    if (existing) throw new Error(`Company bank account with code '${account_code}' already exists. Please use a different account code`);

    // Create/ensure AccountTree leaf for this bank account
    const treeExists = await AccountTreeModel.findOne({ account_code, is_deleted: false });
    if (!treeExists) {
      await AccountTreeModel.create({
        account_code,
        account_name,
        description: `Company bank account: ${bank_name}`,
        account_type:    "Asset",
        account_subtype: "Current Asset",
        normal_balance:  "Dr",
        parent_code:     "1020",  // Bank Accounts group
        level:           2,
        is_group:         false,
        is_posting_account: true,
        is_bank_cash:    true,
        is_personal:     false,
        is_system:       false,
      });
    } else {
      // Ensure the existing tree node is flagged as bank/cash
      if (!treeExists.is_bank_cash) {
        await AccountTreeModel.findOneAndUpdate(
          { account_code },
          { $set: { is_bank_cash: true } }
        );
      }
    }

    return await CompanyBankAccountModel.create({ ...payload, created_by });
  }

  // ── PATCH /companybankaccount/update/:id ──────────────────────────────────
  static async update(id, payload) {
    const rec = await CompanyBankAccountModel.findById(id);
    if (!rec || rec.is_deleted) throw new Error("Company bank account not found. Please verify the account ID and try again");

    const allowed = [
      "account_name", "bank_name", "branch_name", "account_number", "ifsc_code",
      "bank_address", "account_holder_name", "account_type",
      "interest_pct", "credit_limit", "debit_limit", "discount_limit", "is_active",
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

  // ── DELETE /companybankaccount/delete/:id (soft delete) ──────────────────
  static async softDelete(id) {
    const rec = await CompanyBankAccountModel.findById(id);
    if (!rec)            throw new Error("Company bank account not found. Please verify the account ID and try again");
    if (rec.is_deleted)  throw new Error("Company bank account has already been deactivated");

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

export default CompanyBankAccountService;
