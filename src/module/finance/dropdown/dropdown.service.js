import PurchaseBillModel      from "../purchasebill/purchasebill.model.js";
import WeeklyBillingModel     from "../weeklyBilling/WeeklyBilling.model.js";
import CompanyBankAccountModel from "../companybankaccount/companybankaccount.model.js";
import CompanyCashAccountModel from "../companycashaccount/companycashaccount.model.js";
import AccountTreeModel       from "../accounttree/accounttree.model.js";
import VendorPermittedModel   from "../../tender/vendorpermitted/vendorpermitted.mode.js";
import TenderModel            from "../../tender/tender/tender.model.js";
import VendorModel            from "../../purchase/vendor/vendor.model.js";
import ContractorModel        from "../../hr/contractors/contractor.model.js";
import ClientModel            from "../../clients/client.model.js";

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────

class DropdownService {

  // ── 1. Company bank + cash accounts with current balance ──────────────────
  // GET /finance-dropdown/bank-accounts
  //       ?type=bank          (optional — "bank" | "cash", omit for both)
  //
  // current_balance = AccountTree.opening_balance (live running balance).
  // opening_balance is updated in-place by AccountTreeService.applyBalanceLines()
  // on every approval: JournalEntry, PaymentVoucher, ReceiptVoucher.
  static async getBankAccounts(type) {
    const results = [];

    const fetchBank = !type || type === "bank";
    const fetchCash = !type || type === "cash";

    // ── Bank Accounts ───────────────────────────────────────────────────
    if (fetchBank) {
      const banks = await CompanyBankAccountModel
        .find({ is_deleted: false, is_active: true })
        .select("account_code account_name bank_name branch_name account_number ifsc_code account_type credit_limit")
        .sort({ account_name: 1 })
        .lean();

      for (const a of banks) {
        results.push({
          _id:              a._id,
          account_category: "bank",
          account_code:     a.account_code,
          account_name:     a.account_name,
          bank_name:        a.bank_name        || "",
          branch_name:      a.branch_name      || "",
          account_number:   a.account_number   || "",
          ifsc_code:        a.ifsc_code        || "",
          account_type:     a.account_type     || "",
          credit_limit:     a.credit_limit     || 0,
          custodian_name:   "",
          location:         "",
          cash_limit:       0,
        });
      }
    }

    // ── Cash Accounts ───────────────────────────────────────────────────
    if (fetchCash) {
      const cashAccounts = await CompanyCashAccountModel
        .find({ is_deleted: false, is_active: true })
        .select("account_code account_name custodian_name location cash_limit")
        .sort({ account_name: 1 })
        .lean();

      for (const c of cashAccounts) {
        results.push({
          _id:              c._id,
          account_category: "cash",
          account_code:     c.account_code,
          account_name:     c.account_name,
          bank_name:        "",
          branch_name:      "",
          account_number:   "",
          ifsc_code:        "",
          account_type:     "Cash",
          credit_limit:     0,
          custodian_name:   c.custodian_name || "",
          location:         c.location       || "",
          cash_limit:       c.cash_limit     || 0,
        });
      }
    }

    if (!results.length) return [];

    // ── Fetch live balances from AccountTree ─────────────────────────────
    const codes = results.map((r) => r.account_code);

    const treeNodes = await AccountTreeModel
      .find({ account_code: { $in: codes }, is_deleted: false })
      .select("account_code opening_balance opening_balance_type")
      .lean();

    const balMap = {};
    for (const n of treeNodes) {
      const ob  = n.opening_balance      || 0;
      const typ = n.opening_balance_type || "Dr";
      balMap[n.account_code] = {
        opening_balance:      ob,
        opening_balance_type: typ,
        current_balance:      r2(typ === "Dr" ? ob : -ob),
      };
    }

    return results.map((r) => {
      const bal = balMap[r.account_code] || { opening_balance: 0, opening_balance_type: "Dr", current_balance: 0 };
      return {
        ...r,
        opening_balance:      bal.opening_balance,
        opening_balance_type: bal.opening_balance_type,
        current_balance:      bal.current_balance,
      };
    });
  }

  // ── 2. Payable bill entries for payment voucher selection ─────────────────
  // GET /finance-dropdown/payable-bills
  //       ?supplier_id=VND-001
  //       &supplier_type=Vendor          (Vendor | Contractor)
  //       &tender_id=TND-001
  //
  // Returns unpaid and partially-paid approved bills from both
  // PurchaseBill (vendor) and WeeklyBilling (contractor) combined,
  // ready to be listed in the "Bills being settled" table on a PV form.
  // Each row includes balance_due so the front-end can pre-fill settled_amt.
  static async getPayableBills(filters = {}) {
    const { supplier_id, supplier_type, tender_id } = filters;
    const rows = [];

    // ── Purchase Bills (Vendor) ───────────────────────────────────────────
    const fetchPB = !supplier_type || supplier_type === "Vendor";
    if (fetchPB) {
      const q = { status: "approved", paid_status: { $ne: "paid" } };
      if (supplier_id) q.vendor_id  = supplier_id;
      if (tender_id)   q.tender_id  = tender_id;

      const bills = await PurchaseBillModel
        .find(q)
        .select(
          "doc_id doc_date invoice_no due_date " +
          "vendor_id vendor_name " +
          "tender_id tender_name " +
          "net_amount amount_paid paid_status"
        )
        .sort({ due_date: 1, doc_date: 1 })
        .lean();

      for (const b of bills) {
        rows.push({
          _id:           b._id,
          bill_type:     "PurchaseBill",
          bill_no:       b.doc_id,
          bill_date:     b.doc_date,
          ref_no:        b.invoice_no,          // vendor's own invoice number
          due_date:      b.due_date,
          supplier_type: "Vendor",
          supplier_id:   b.vendor_id,
          supplier_name: b.vendor_name,
          tender_id:     b.tender_id,
          tender_name:   b.tender_name,
          bill_amount:   b.net_amount,
          amount_paid:   b.amount_paid   || 0,
          balance_due:   r2(b.net_amount - (b.amount_paid || 0)),
          paid_status:   b.paid_status,
        });
      }
    }

    // ── Weekly Bills (Contractor) ─────────────────────────────────────────
    const fetchWB = !supplier_type || supplier_type === "Contractor";
    if (fetchWB) {
      const q = { status: "Approved", paid_status: { $ne: "paid" } };
      if (supplier_id) q.contractor_id = supplier_id;
      if (tender_id)   q.tender_id     = tender_id;

      const bills = await WeeklyBillingModel
        .find(q)
        .select(
          "bill_no bill_date from_date to_date " +
          "contractor_id contractor_name " +
          "tender_id " +
          "net_payable total_amount amount_paid paid_status"
        )
        .sort({ bill_date: 1 })
        .lean();

      for (const b of bills) {
        const billAmt = b.net_payable || b.total_amount;
        rows.push({
          _id:           b._id,
          bill_type:     "WeeklyBilling",
          bill_no:       b.bill_no,
          bill_date:     b.bill_date,
          ref_no:        `${b.from_date?.toISOString().slice(0, 10)} – ${b.to_date?.toISOString().slice(0, 10)}`,
          due_date:      null,
          supplier_type: "Contractor",
          supplier_id:   b.contractor_id,
          supplier_name: b.contractor_name,
          tender_id:     b.tender_id,
          tender_name:   "",
          bill_amount:   billAmt,
          amount_paid:   b.amount_paid || 0,
          balance_due:   r2(billAmt - (b.amount_paid || 0)),
          paid_status:   b.paid_status,
        });
      }
    }

    // Sort: overdue first (due_date ASC, nulls last), then by bill_date
    rows.sort((a, b) => {
      if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
      if (a.due_date)  return -1;
      if (b.due_date)  return  1;
      return new Date(a.bill_date) - new Date(b.bill_date);
    });

    return rows;
  }

  // ── 3. Vendors / Contractors / Client linked to a tender ─────────────────
  // GET /finance-dropdown/parties/:tenderId?type=vendor|contractor|client
  //
  // type omitted → returns all three groups merged under a "party_type" key.
  // Used for the Supplier selector on Payment Voucher / Credit-Debit Note forms.
  static async getPartiesByTender(tender_id, type) {
    if (!tender_id) throw new Error("tender_id is required");

    const fetchVendor     = !type || type === "vendor";
    const fetchContractor = !type || type === "contractor";
    const fetchClient     = !type || type === "client";

    const result = [];

    // ── Vendors ────────────────────────────────────────────────────────────
    if (fetchVendor) {
      const permitted = await VendorPermittedModel.findOne({ tender_id }).lean();
      const ids = (permitted?.listOfPermittedVendors || [])
        .map((v) => v.vendor_id)
        .filter(Boolean);

      if (ids.length) {
        const vendors = await VendorModel
          .find({ vendor_id: { $in: ids } })
          .select("vendor_id company_name gstin contact_phone contact_email type place_of_supply")
          .lean();

        for (const v of vendors) {
          result.push({
            party_type:    "Vendor",
            supplier_type: "Vendor",
            id:            v.vendor_id,
            name:          v.company_name,
            gstin:         v.gstin         || "",
            contact_phone: v.contact_phone || "",
            contact_email: v.contact_email || "",
            sub_type:      v.type          || "",
            place_of_supply: v.place_of_supply || "InState",
          });
        }
      }
    }

    // ── Contractors ────────────────────────────────────────────────────────
    // Uses the same query as GET /contractor/getbytender/:tender_id
    if (fetchContractor) {
      const contractors = await ContractorModel
        .find({
          isDeleted: { $ne: true },
          "assigned_projects.tender_id": tender_id,
        })
        .select("contractor_id contractor_name gst_number contact_phone contact_email business_type place_of_supply")
        .lean();

      for (const c of contractors) {
        result.push({
          party_type:    "Contractor",
          supplier_type: "Contractor",
          id:            c.contractor_id,
          name:          c.contractor_name,
          gstin:         c.gst_number    || "",
          contact_phone: c.contact_phone || "",
          contact_email: c.contact_email || "",
          sub_type:      c.business_type || "",
          place_of_supply: c.place_of_supply || "InState",
        });
      }
    }

    // ── Client ─────────────────────────────────────────────────────────────
    if (fetchClient) {
      const tender = await TenderModel
        .findOne({ tender_id })
        .select("client_id client_name")
        .lean();

      if (tender?.client_id) {
        const client = await ClientModel
          .findOne({ client_id: tender.client_id })
          .select("client_id client_name gstin contact_phone contact_email")
          .lean();

        if (client) {
          result.push({
            party_type:    "Client",
            supplier_type: "Client",
            id:            client.client_id,
            name:          client.client_name,
            gstin:         client.gstin         || "",
            contact_phone: client.contact_phone || "",
            contact_email: client.contact_email || "",
            sub_type:      "",
            place_of_supply: "InState",
          });
        }
      }
    }

    return result;
  }
}

export default DropdownService;
