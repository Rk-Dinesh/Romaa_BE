import PurchaseBillService from "../purchasebill/purchasebill.service.js";
import PaymentVoucherService from "../paymentvoucher/paymentvoucher.service.js";
import ReceiptVoucherService from "../receiptvoucher/receiptvoucher.service.js";
import JournalEntryService from "../journalentry/journalentry.service.js";
import ExpenseVoucherService from "../expensevoucher/expensevoucher.service.js";
import CreditNoteService from "../creditnote/creditnote.service.js";
import DebitNoteService from "../debitnote/debitnote.service.js";
import { processBatch, toNum, toDate, toBool, groupRowsBy } from "./bulk.utils.js";

export default class BulkImportService {

  // ── Purchase Bills ────────────────────────────────────────────────────────
  // Groups rows by invoice_no — each group = one bill with multiple line items.
  // createPurchaseBill expects: vendor_id, invoice_no, invoice_date, doc_date,
  //   credit_days, narration, tender_id, place_of_supply/tax_mode,
  //   line_items[{ item_description, unit, accepted_qty, unit_price, gross_amt,
  //               cgst_pct, sgst_pct, igst_pct }]
  static async importPurchaseBills(rows, importedBy) {
    const billGroups = groupRowsBy(rows, "invoice_no");
    const bills = [];

    for (const [invoice_no, lines] of billGroups) {
      const first = lines[0];
      const place_of_supply =
        (first.tax_mode || "").toLowerCase() === "otherstate" ? "OutState" : "InState";

      bills.push({
        vendor_id:      first.vendor_id,
        invoice_no,
        invoice_date:   toDate(first.invoice_date),
        doc_date:       toDate(first.bill_date),
        credit_days:    toNum(first.credit_days),
        narration:      first.narration || "",
        tender_id:      first.tender_id || "",
        place_of_supply,
        // tax_mode is derived from place_of_supply inside createPurchaseBill
        tds_applicable: toBool(first.tds_applicable),
        tds_section:    first.tds_section || "",
        tds_rate:       toNum(first.tds_rate),
        currency:       first.currency || "INR",
        exchange_rate:  toNum(first.exchange_rate, 1),
        created_by:     importedBy,
        line_items: lines.map((l) => ({
          item_description: l.item_description || "",
          unit:             l.item_unit || "",
          accepted_qty:     toNum(l.item_qty),
          unit_price:       toNum(l.item_rate),
          gross_amt:        toNum(l.item_qty) * toNum(l.item_rate),
          cgst_pct:         toNum(l.cgst_pct),
          sgst_pct:         toNum(l.sgst_pct),
          igst_pct:         toNum(l.igst_pct),
        })),
      });
    }

    return processBatch(bills, (bill) => PurchaseBillService.createPurchaseBill(bill));
  }

  // ── Payment Vouchers ──────────────────────────────────────────────────────
  // create() expects: supplier_id, supplier_type, pv_date, payment_mode,
  //   bank_ref, amount, narration, tender_id, bill_refs (optional)
  static async importPaymentVouchers(rows, importedBy) {
    return processBatch(rows, (row) =>
      PaymentVoucherService.create({
        supplier_id:   row.supplier_id   || row.vendor_id,
        supplier_type: row.supplier_type || "Vendor",
        pv_date:       toDate(row.pv_date),
        payment_mode:  row.payment_mode  || "NEFT",
        bank_ref:      row.bank_ref      || "",
        amount:        toNum(row.amount),
        narration:     row.narration     || "",
        // bill_no → bill_refs not set here; association can be done post-import
        tender_id:     row.tender_id     || "",
        document_year: row.fin_year      || "",
        currency:      row.currency      || "INR",
        exchange_rate: toNum(row.exchange_rate, 1),
        created_by:    importedBy,
      })
    );
  }

  // ── Receipt Vouchers ──────────────────────────────────────────────────────
  // create() expects: supplier_id, supplier_type, rv_date, receipt_mode,
  //   bank_ref, amount, narration, tender_id
  static async importReceiptVouchers(rows, importedBy) {
    return processBatch(rows, (row) =>
      ReceiptVoucherService.create({
        supplier_id:   row.supplier_id   || row.client_id,
        supplier_type: row.supplier_type || "Client",
        rv_date:       toDate(row.rv_date),
        receipt_mode:  row.receipt_mode  || row.payment_mode || "NEFT",
        bank_ref:      row.bank_ref      || "",
        amount:        toNum(row.amount),
        narration:     row.narration     || "",
        tender_id:     row.tender_id     || "",
        document_year: row.fin_year      || "",
        currency:      row.currency      || "INR",
        exchange_rate: toNum(row.exchange_rate, 1),
        created_by:    importedBy,
      })
    );
  }

  // ── Journal Entries ───────────────────────────────────────────────────────
  // Groups rows by je_no (required). create() expects:
  //   je_no (required), narration, je_date, lines[{ account_code,
  //   debit_amt, credit_amt, dr_cr, narration }]
  static async importJournalEntries(rows, importedBy) {
    // Group rows by je_no — je_no is required; rows missing it get their own auto key
    const jeGroups = new Map();
    let autoIdx = 0;
    for (const row of rows) {
      const key = row.je_no?.trim()
        ? row.je_no.trim()
        : `AUTO_${++autoIdx}`;
      if (!jeGroups.has(key)) jeGroups.set(key, []);
      jeGroups.get(key).push(row);
    }

    const entries = [];
    for (const [key, lines] of jeGroups) {
      const first = lines[0];
      entries.push({
        je_no:         key.startsWith("AUTO_") ? undefined : key, // will fail service validation if blank
        je_date:       toDate(first.je_date),
        narration:     first.narration || "",
        je_type:       "Adjustment",
        currency:      first.currency  || "INR",
        exchange_rate: toNum(first.exchange_rate, 1),
        tender_id:     first.tender_id || "",
        document_year: first.fin_year  || "",
        created_by:    importedBy,
        lines: lines.map((l) => {
          const dr = toNum(l.debit_amt);
          const cr = toNum(l.credit_amt);
          // If only entry_type column was used (Dr/Cr) with a single amount column
          const amount = toNum(l.amount);
          let debit_amt  = dr  || (l.entry_type === "Dr" ? amount : 0);
          let credit_amt = cr  || (l.entry_type === "Cr" ? amount : 0);
          return {
            account_code: l.account_code,
            dr_cr:        l.entry_type || (debit_amt > 0 ? "Dr" : "Cr"),
            debit_amt,
            credit_amt,
            narration:    l.narration || first.narration || "",
            tender_id:    l.cost_center || "",
          };
        }),
      });
    }

    return processBatch(entries, (je) => JournalEntryService.create(je));
  }

  // ── Expense Vouchers ──────────────────────────────────────────────────────
  // create() expects: lines[{ expense_account_code, description, amount }],
  //   ev_date, employee_id, payment_mode, paid_from_account_code, narration, tender_id
  // Note: paid_from_account_code is required only when status = approved.
  // Bulk import creates as "pending" so it is optional here.
  static async importExpenseVouchers(rows, importedBy) {
    return processBatch(rows, (row) =>
      ExpenseVoucherService.create({
        ev_date:       toDate(row.ev_date),
        employee_id:   row.employee_id        || "",
        payment_mode:  row.payment_mode        || "Cash",
        reference_no:  row.bill_ref || row.bill_no || "",
        bill_no:       row.bill_no             || row.bill_ref || "",
        narration:     row.description         || "",
        tender_id:     row.tender_id           || "",
        document_year: row.fin_year            || "",
        currency:      row.currency            || "INR",
        exchange_rate: toNum(row.exchange_rate, 1),
        created_by:    importedBy,
        status:        "pending",
        lines: [{
          expense_account_code: row.expense_account_code || row.account_code,
          description:          row.description || "",
          amount:               toNum(row.amount),
          tender_id:            row.tender_id || "",
        }],
      })
    );
  }

  // ── Credit Notes ──────────────────────────────────────────────────────────
  // create() expects: supplier_id, supplier_type, cn_date, bill_no,
  //   amount, narration, cgst_pct, sgst_pct, igst_pct, tender_id
  static async importCreditNotes(rows, importedBy) {
    return processBatch(rows, (row) =>
      CreditNoteService.create({
        supplier_id:   row.supplier_id   || row.vendor_id,
        supplier_type: row.supplier_type || "Vendor",
        cn_date:       toDate(row.cn_date),
        bill_no:       row.against_bill_no || "",
        amount:        toNum(row.amount),
        narration:     row.reason         || row.narration || "",
        cgst_pct:      toNum(row.cgst_pct),
        sgst_pct:      toNum(row.sgst_pct),
        igst_pct:      toNum(row.igst_pct),
        sales_type:    (row.tax_mode || "").toLowerCase() === "otherstate"
          ? "Interstate" : "Local",
        adj_type:      row.against_bill_no ? "Against Bill" : "Standalone",
        tender_id:     row.tender_id     || "",
        document_year: row.fin_year      || "",
        currency:      row.currency      || "INR",
        exchange_rate: toNum(row.exchange_rate, 1),
        created_by:    importedBy,
      })
    );
  }

  // ── Debit Notes ───────────────────────────────────────────────────────────
  // create() expects: supplier_id, supplier_type, dn_date, bill_no,
  //   amount, narration, cgst_pct, sgst_pct, igst_pct, raised_by, tender_id
  static async importDebitNotes(rows, importedBy) {
    return processBatch(rows, (row) =>
      DebitNoteService.create({
        supplier_id:   row.supplier_id   || row.vendor_id,
        supplier_type: row.supplier_type || "Vendor",
        dn_date:       toDate(row.dn_date),
        bill_no:       row.against_bill_no || "",
        amount:        toNum(row.amount),
        narration:     row.reason         || row.narration || "",
        raised_by:     row.raised_by      || "Company",
        cgst_pct:      toNum(row.cgst_pct),
        sgst_pct:      toNum(row.sgst_pct),
        igst_pct:      toNum(row.igst_pct),
        sales_type:    (row.tax_mode || "").toLowerCase() === "otherstate"
          ? "Interstate" : "Local",
        adj_type:      row.against_bill_no ? "Against Bill" : "Standalone",
        tender_id:     row.tender_id     || "",
        document_year: row.fin_year      || "",
        currency:      row.currency      || "INR",
        exchange_rate: toNum(row.exchange_rate, 1),
        created_by:    importedBy,
      })
    );
  }
}
