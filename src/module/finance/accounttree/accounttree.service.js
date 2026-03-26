import AccountTreeModel from "./accounttree.model.js";
import DEFAULT_ACCOUNTS from "./accounttree.seed.js";

class AccountTreeService {

  // ── GET /accounttree/list ─────────────────────────────────────────────────
  // All accounts. Filters: account_type, account_subtype, is_group,
  //   is_posting_account, tax_type, is_bank_cash, is_personal, is_active
  static async getAll(filters = {}) {
    const query = { is_deleted: false };

    if (filters.account_type)        query.account_type        = filters.account_type;
    if (filters.account_subtype)     query.account_subtype     = filters.account_subtype;
    if (filters.parent_code)         query.parent_code         = filters.parent_code;
    if (filters.tax_type)            query.tax_type            = filters.tax_type;
    if (filters.is_group     !== undefined) query.is_group     = filters.is_group === "true" || filters.is_group === true;
    if (filters.is_posting_account !== undefined) query.is_posting_account = filters.is_posting_account === "true" || filters.is_posting_account === true;
    if (filters.is_bank_cash !== undefined) query.is_bank_cash = filters.is_bank_cash === "true" || filters.is_bank_cash === true;
    if (filters.is_personal  !== undefined) query.is_personal  = filters.is_personal  === "true" || filters.is_personal  === true;
    if (filters.is_active    !== undefined) query.is_active    = filters.is_active    === "true" || filters.is_active    === true;

    return await AccountTreeModel.find(query)
      .sort({ account_code: 1 })
      .lean();
  }

  // ── Apply Dr/Cr movements to available_balance for a set of lines ───────
  // Shared utility called by JournalEntry, PaymentVoucher, ReceiptVoucher on
  // approval so that AccountTree.available_balance stays as a live running balance.
  //
  // lines: Array of { account_code, debit_amt, credit_amt }
  //
  // For every unique account_code in lines:
  //   net = Σ debit_amt − Σ credit_amt  (positive = net Dr movement)
  //   signed_current = available_balance_type==="Dr" ? +ab : -ab
  //   signed_new     = signed_current + net
  //   available_balance_type = signed_new >= 0 ? "Dr" : "Cr"
  //   available_balance      = |signed_new|
  static async applyBalanceLines(lines = []) {
    const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

    // Accumulate net Dr-Cr per account_code
    const netMap = {};
    for (const line of lines) {
      if (!line.account_code) continue;
      const net = (Number(line.debit_amt) || 0) - (Number(line.credit_amt) || 0);
      netMap[line.account_code] = r2((netMap[line.account_code] || 0) + net);
    }

    const codes = Object.keys(netMap);
    if (!codes.length) return;

    const nodes = await AccountTreeModel
      .find({ account_code: { $in: codes }, is_deleted: false })
      .select("account_code available_balance available_balance_type")
      .lean();

    if (!nodes.length) return;

    const bulkOps = nodes.map((node) => {
      const net    = netMap[node.account_code] || 0;
      const ab     = node.available_balance      || 0;
      const abType = node.available_balance_type || "Dr";
      const signed = abType === "Dr" ? ab : -ab;
      const newSig = r2(signed + net);
      return {
        updateOne: {
          filter: { account_code: node.account_code },
          update: {
            $set: {
              available_balance:      Math.abs(newSig),
              available_balance_type: newSig >= 0 ? "Dr" : "Cr",
            },
          },
        },
      };
    });

    await AccountTreeModel.bulkWrite(bulkOps);
  }

  // ── GET /accounttree/posting-accounts ────────────────────────────────────
  // Only leaf accounts that can receive transactions — used in voucher dropdowns
  static async getPostingAccounts(filters = {}) {
    const query = { is_deleted: false, is_group: false, is_posting_account: true };
    if (filters.account_type) query.account_type = filters.account_type;
    if (filters.is_bank_cash !== undefined) query.is_bank_cash = filters.is_bank_cash === "true" || filters.is_bank_cash === true;
    if (filters.tax_type)     query.tax_type     = filters.tax_type;

    return await AccountTreeModel.find(query)
      .sort({ account_code: 1 })
      .select("account_code account_name account_type account_subtype normal_balance description available_balance available_balance_type")
      .lean();
  }

  // ── GET /accounttree/tree ─────────────────────────────────────────────────
  // Returns the full hierarchical tree. Optionally scoped to a parent_code.
  // Each node contains a `children` array (recursive nesting).
  static async getTree(rootCode = null) {
    const all = await AccountTreeModel.find({ is_deleted: false })
      .sort({ account_code: 1 })
      .lean();

    // Build lookup map
    const map = {};
    for (const acc of all) map[acc.account_code] = { ...acc, children: [] };

    const roots = [];
    for (const acc of all) {
      if (acc.parent_code && map[acc.parent_code]) {
        map[acc.parent_code].children.push(map[acc.account_code]);
      } else if (!acc.parent_code) {
        roots.push(map[acc.account_code]);
      }
    }

    if (rootCode) {
      return map[rootCode] ? [map[rootCode]] : [];
    }
    return roots;
  }

  // ── GET /accounttree/:id ──────────────────────────────────────────────────
  static async getById(id) {
    const acc = await AccountTreeModel.findById(id).lean();
    if (!acc || acc.is_deleted) throw new Error(`Account not found`);
    return acc;
  }

  // ── GET /accounttree/by-code/:code ───────────────────────────────────────
  static async getByCode(code) {
    const acc = await AccountTreeModel.findOne({ account_code: code, is_deleted: false }).lean();
    if (!acc) throw new Error(`Account '${code}' not found`);
    return acc;
  }

  // ── GET /accounttree/search?q= ───────────────────────────────────────────
  // Search by account_name or account_code (partial match, case-insensitive)
  static async search(q) {
    if (!q || q.trim().length < 1) return [];
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex   = new RegExp(escaped, "i");

    return await AccountTreeModel.find({
      is_deleted: false,
      $or: [
        { account_name: regex },
        { account_code: regex },
        { description:  regex },
      ],
    })
      .sort({ account_code: 1 })
      .lean();
  }

  // ── GET /accounttree/by-supplier/:supplierId ─────────────────────────────
  // Get the personal ledger account linked to a specific vendor/contractor/client
  static async getBySupplier(supplierId, supplierType) {
    const query = { linked_supplier_id: supplierId, is_deleted: false };
    if (supplierType) query.linked_supplier_type = supplierType;
    return await AccountTreeModel.findOne(query).lean();
  }

  // ── POST /accounttree/create ──────────────────────────────────────────────
  static async create(payload) {
    if (!payload.account_code) throw new Error("account_code is required");
    if (!payload.account_name) throw new Error("account_name is required");
    if (!payload.account_type) throw new Error("account_type is required");

    // Auto-set normal_balance from account_type if not provided
    if (!payload.normal_balance) {
      payload.normal_balance = ["Asset", "Expense"].includes(payload.account_type) ? "Dr" : "Cr";
    }

    // Group accounts cannot receive postings
    if (payload.is_group) {
      payload.is_posting_account = false;
    }

    // Initialize available_balance from opening_balance if not explicitly set
    if (payload.available_balance === undefined) {
      payload.available_balance      = payload.opening_balance      || 0;
      payload.available_balance_type = payload.opening_balance_type || "";
    }

    return await AccountTreeModel.create(payload);
  }

  // ── PATCH /accounttree/update/:id ─────────────────────────────────────────
  static async update(id, payload) {
    const acc = await AccountTreeModel.findById(id);
    if (!acc) throw new Error("Account not found");

    // Protect system accounts from structural changes
    if (acc.is_system) {
      const blocked = ["account_code", "account_type", "normal_balance", "is_system"];
      for (const field of blocked) {
        if (payload[field] !== undefined && payload[field] !== acc[field]) {
          throw new Error(`Cannot change '${field}' on a system account`);
        }
      }
    }

    const allowed = [
      "account_name", "description", "account_subtype", "parent_code",
      "is_group", "is_posting_account", "is_bank_cash", "is_active",
      "tax_type", "opening_balance", "opening_balance_type", "opening_balance_date",
      "available_balance", "available_balance_type",
    ];
    for (const field of allowed) {
      if (payload[field] !== undefined) acc[field] = payload[field];
    }

    // When opening_balance is reset (migration adjustment), also reset available_balance
    // unless the caller explicitly provided a new available_balance value.
    if (payload.opening_balance !== undefined && payload.available_balance === undefined) {
      acc.available_balance      = payload.opening_balance      || 0;
      acc.available_balance_type = payload.opening_balance_type || acc.opening_balance_type || "";
    }

    // Keep in sync
    if (acc.is_group) acc.is_posting_account = false;

    await acc.save();
    return acc;
  }

  // ── DELETE /accounttree/delete/:id (soft delete) ─────────────────────────
  static async softDelete(id) {
    const acc = await AccountTreeModel.findById(id);
    if (!acc)            throw new Error("Account not found");
    if (acc.is_system)   throw new Error("Cannot delete a system account");
    if (acc.is_deleted)  throw new Error("Already deleted");

    // Block if this account has children
    const childCount = await AccountTreeModel.countDocuments({
      parent_code: acc.account_code,
      is_deleted: false,
    });
    if (childCount > 0) {
      throw new Error(`Cannot delete '${acc.account_code}' — it has ${childCount} child account(s)`);
    }

    acc.is_deleted = true;
    acc.is_active  = false;
    await acc.save();
    return acc;
  }

  // ── POST /accounttree/seed ────────────────────────────────────────────────
  // Idempotent seed: inserts only accounts that don't exist yet.
  // Safe to call multiple times — skips existing codes.
  static async seedDefaultAccounts() {
    const existing = await AccountTreeModel.distinct("account_code");
    const existingSet = new Set(existing);

    const toInsert = DEFAULT_ACCOUNTS.filter(
      (a) => !existingSet.has(a.account_code)
    );

    if (toInsert.length === 0) {
      return { inserted: 0, skipped: existing.length, message: "All default accounts already present" };
    }

    await AccountTreeModel.insertMany(toInsert, { ordered: false });
    return {
      inserted: toInsert.length,
      skipped:  existing.length,
      message:  `Seeded ${toInsert.length} accounts (${existing.length} already existed)`,
    };
  }

  // ── POST /accounttree/migrate-available-balance ───────────────────────────
  // One-time migration: copies opening_balance → available_balance for all
  // accounts that still have available_balance = 0 (i.e., pre-existing data).
  // Safe to call multiple times — skips accounts where available_balance != 0.
  static async migrateAvailableBalance() {
    const accounts = await AccountTreeModel
      .find({ is_deleted: false, available_balance: 0 })
      .select("account_code opening_balance opening_balance_type")
      .lean();

    if (!accounts.length) {
      return { migrated: 0, message: "No accounts need migration" };
    }

    const bulkOps = accounts.map((acc) => ({
      updateOne: {
        filter: { account_code: acc.account_code },
        update: {
          $set: {
            available_balance:      acc.opening_balance      || 0,
            available_balance_type: acc.opening_balance_type || "",
          },
        },
      },
    }));

    await AccountTreeModel.bulkWrite(bulkOps);
    return { migrated: accounts.length, message: `Migrated ${accounts.length} accounts` };
  }

  // ── Internal: auto-create personal ledger for a new vendor/contractor ─────
  // Called by vendor/contractor service when a new party is created.
  // Creates a leaf account under the appropriate group (2010 for Vendor, 2020 for Contractor).
  static async autoCreatePersonalLedger({ supplier_id, supplier_type, supplier_name, supplier_ref }) {
    if (!supplier_id || !supplier_type || !supplier_name) {
      throw new Error("autoCreatePersonalLedger: supplier_id, supplier_type, and supplier_name are required");
    }

    const existing = await AccountTreeModel.findOne({ linked_supplier_id: supplier_id, is_deleted: false }).lean();
    if (existing) return existing; // already created

    let parent_code, account_type, account_subtype, normal_balance, description;

    if (supplier_type === "Vendor") {
      parent_code     = "2010";
      account_type    = "Liability";
      account_subtype = "Current Liability";
      normal_balance  = "Cr";
      description     = `Payable to vendor: ${supplier_name}`;
    } else if (supplier_type === "Contractor") {
      parent_code     = "2020";
      account_type    = "Liability";
      account_subtype = "Current Liability";
      normal_balance  = "Cr";
      description     = `Payable to contractor: ${supplier_name}`;
    } else if (supplier_type === "Client") {
      parent_code     = "1050";
      account_type    = "Asset";
      account_subtype = "Current Asset";   // receivables are assets, not liabilities
      normal_balance  = "Dr";
      description     = `Receivable from client: ${supplier_name}`;
    } else {
      throw new Error(`autoCreatePersonalLedger: unknown supplier_type '${supplier_type}'`);
    }

    const account_code = `${parent_code}-${supplier_id}`;
    const label        = supplier_type === "Client" ? "Receivable" : "Payable";

    return await AccountTreeModel.create({
      account_code,
      account_name:         `${supplier_name} — ${label}`,
      description,
      account_type,
      account_subtype,
      normal_balance,
      parent_code,
      level:                3,
      is_group:             false,
      is_posting_account:   true,
      is_personal:          true,
      linked_supplier_id:   supplier_id,
      linked_supplier_type: supplier_type,
      linked_supplier_ref:  supplier_ref || null,
      is_system:            false,
    });
  }
}

export default AccountTreeService;
