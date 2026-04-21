import ExcelJS from "exceljs";
import PurchaseBillService from "../purchasebill/purchasebill.service.js";
import PaymentVoucherService from "../paymentvoucher/paymentvoucher.service.js";
import ReceiptVoucherService from "../receiptvoucher/receiptvoucher.service.js";
import JournalEntryService from "../journalentry/journalentry.service.js";
import ExpenseVoucherService from "../expensevoucher/expensevoucher.service.js";
import CreditNoteService from "../creditnote/creditnote.service.js";
import DebitNoteService from "../debitnote/debitnote.service.js";
import ReportsService from "../reports/reports.service.js";

// ── Shared column definitions (used by both Excel and streaming CSV exports) ──
export const EXPORT_COLUMNS = {
  purchasebill: [
    { header: "Bill No",          key: "doc_id"          },
    { header: "Bill Date",        key: "doc_date"        },
    { header: "Invoice No",       key: "invoice_no"      },
    { header: "Invoice Date",     key: "invoice_date"    },
    { header: "Due Date",         key: "due_date"        },
    { header: "Vendor ID",        key: "vendor_id"       },
    { header: "Vendor Name",      key: "vendor_name"     },
    { header: "Vendor GSTIN",     key: "vendor_gstin"    },
    { header: "Tender ID",        key: "tender_id"       },
    { header: "Tender Name",      key: "tender_name"     },
    { header: "Tax Mode",         key: "tax_mode"        },
    { header: "Place of Supply",  key: "place_of_supply" },
    { header: "Grand Total",      key: "grand_total"     },
    { header: "Total Tax",        key: "total_tax"       },
    { header: "Round Off",        key: "round_off"       },
    { header: "Net Amount",       key: "net_amount"      },
    { header: "Status",           key: "status"          },
    { header: "Credit Days",      key: "credit_days"     },
  ],
  paymentvoucher: [
    { header: "PV No",            key: "pv_no"           },
    { header: "PV Date",          key: "pv_date"         },
    { header: "Supplier Type",    key: "supplier_type"   },
    { header: "Supplier ID",      key: "supplier_id"     },
    { header: "Supplier Name",    key: "supplier_name"   },
    { header: "Payment Mode",     key: "payment_mode"    },
    { header: "Bank Ref",         key: "bank_ref"        },
    { header: "Cheque No",        key: "cheque_no"       },
    { header: "Amount",           key: "amount"          },
    { header: "Gross Amount",     key: "gross_amount"    },
    { header: "TDS Section",      key: "tds_section"     },
    { header: "TDS %",            key: "tds_pct"         },
    { header: "Tender ID",        key: "tender_id"       },
    { header: "Tender Name",      key: "tender_name"     },
    { header: "Narration",        key: "narration"       },
    { header: "Status",           key: "status"          },
    { header: "Document Year",    key: "document_year"   },
  ],
  receiptvoucher: [
    { header: "RV No",            key: "rv_no"           },
    { header: "RV Date",          key: "rv_date"         },
    { header: "Supplier Type",    key: "supplier_type"   },
    { header: "Supplier ID",      key: "supplier_id"     },
    { header: "Supplier Name",    key: "supplier_name"   },
    { header: "Receipt Mode",     key: "receipt_mode"    },
    { header: "Bank Ref",         key: "bank_ref"        },
    { header: "Cheque No",        key: "cheque_no"       },
    { header: "Amount",           key: "amount"          },
    { header: "Tender ID",        key: "tender_id"       },
    { header: "Tender Name",      key: "tender_name"     },
    { header: "Against No",       key: "against_no"      },
    { header: "Narration",        key: "narration"       },
    { header: "Status",           key: "status"          },
    { header: "Document Year",    key: "document_year"   },
  ],
  journalentry: [
    { header: "JE No",            key: "je_no"           },
    { header: "JE Date",          key: "je_date"         },
    { header: "JE Type",          key: "je_type"         },
    { header: "Narration",        key: "narration"       },
    { header: "Tender ID",        key: "tender_id"       },
    { header: "Tender Name",      key: "tender_name"     },
    { header: "Source No",        key: "source_no"       },
    { header: "Source Type",      key: "source_type"     },
    { header: "Financial Year",   key: "financial_year"  },
    { header: "Status",           key: "status"          },
    { header: "Account Code",     key: "account_code"    },
    { header: "Account Name",     key: "account_name"    },
    { header: "Dr/Cr",            key: "dr_cr"           },
    { header: "Debit",            key: "debit_amt"       },
    { header: "Credit",           key: "credit_amt"      },
    { header: "Line Narration",   key: "line_narration"  },
  ],
  expensevoucher: [
    { header: "EV No",                key: "ev_no"                  },
    { header: "EV Date",              key: "ev_date"                },
    { header: "Payee Type",           key: "payee_type"             },
    { header: "Employee ID",          key: "employee_id"            },
    { header: "Payee Name",           key: "payee_name"             },
    { header: "Payment Mode",         key: "payment_mode"           },
    { header: "Bill No",              key: "bill_no"                },
    { header: "Tender ID",            key: "tender_id"              },
    { header: "Document Year",        key: "document_year"          },
    { header: "Total Amount",         key: "total_amount"           },
    { header: "Status",               key: "status"                 },
    { header: "Narration",            key: "narration"              },
    { header: "Expense Account Code", key: "expense_account_code"   },
    { header: "Expense Account Name", key: "expense_account_name"   },
    { header: "Description",          key: "description"            },
    { header: "Amount",               key: "line_amount"            },
    { header: "Line Tender ID",       key: "line_tender_id"         },
  ],
  creditnote: [
    { header: "CN No",            key: "cn_no"           },
    { header: "CN Date",          key: "cn_date"         },
    { header: "Supplier Type",    key: "supplier_type"   },
    { header: "Supplier ID",      key: "supplier_id"     },
    { header: "Supplier Name",    key: "supplier_name"   },
    { header: "Supplier GSTIN",   key: "supplier_gstin"  },
    { header: "Bill No",          key: "bill_no"         },
    { header: "Adj Type",         key: "adj_type"        },
    { header: "Tax Type",         key: "tax_type"        },
    { header: "Sales Type",       key: "sales_type"      },
    { header: "Taxable Amount",   key: "taxable_amount"  },
    { header: "CGST %",           key: "cgst_pct"        },
    { header: "SGST %",           key: "sgst_pct"        },
    { header: "IGST %",           key: "igst_pct"        },
    { header: "Amount",           key: "amount"          },
    { header: "Round Off",        key: "round_off"       },
    { header: "Tender ID",        key: "tender_id"       },
    { header: "Tender Name",      key: "tender_name"     },
    { header: "Narration",        key: "narration"       },
    { header: "Status",           key: "status"          },
    { header: "Document Year",    key: "document_year"   },
  ],
  debitnote: [
    { header: "DN No",            key: "dn_no"           },
    { header: "DN Date",          key: "dn_date"         },
    { header: "Supplier Type",    key: "supplier_type"   },
    { header: "Supplier ID",      key: "supplier_id"     },
    { header: "Supplier Name",    key: "supplier_name"   },
    { header: "Supplier GSTIN",   key: "supplier_gstin"  },
    { header: "Bill No",          key: "bill_no"         },
    { header: "Raised By",        key: "raised_by"       },
    { header: "Adj Type",         key: "adj_type"        },
    { header: "Tax Type",         key: "tax_type"        },
    { header: "Sales Type",       key: "sales_type"      },
    { header: "Taxable Amount",   key: "taxable_amount"  },
    { header: "CGST %",           key: "cgst_pct"        },
    { header: "SGST %",           key: "sgst_pct"        },
    { header: "IGST %",           key: "igst_pct"        },
    { header: "Amount",           key: "amount"          },
    { header: "Round Off",        key: "round_off"       },
    { header: "Tender ID",        key: "tender_id"       },
    { header: "Tender Name",      key: "tender_name"     },
    { header: "Narration",        key: "narration"       },
    { header: "Status",           key: "status"          },
    { header: "Document Year",    key: "document_year"   },
  ],
};

// Fetch one page of records for a given module
async function fetchModulePage(module, filters, page, limit) {
  switch (module) {
    case "purchasebill":
      return (await PurchaseBillService.getBills({ ...filters, page, limit }))?.data || [];
    case "paymentvoucher":
      return (await PaymentVoucherService.getList({ ...filters, page, limit }))?.data || [];
    case "receiptvoucher":
      return (await ReceiptVoucherService.getList({ ...filters, page, limit }))?.data || [];
    case "journalentry": {
      const r = await JournalEntryService.getList({ ...filters, page, limit });
      // Flatten JE lines just like the Excel export does
      return (r?.data || []).flatMap((je) =>
        (je.lines || []).length === 0
          ? [{ ...je, account_code: "", account_name: "", dr_cr: "", debit_amt: 0, credit_amt: 0, line_narration: "" }]
          : (je.lines || []).map((l) => ({ ...je, account_code: l.account_code || "", account_name: l.account_name || "", dr_cr: l.dr_cr || "", debit_amt: l.debit_amt ?? 0, credit_amt: l.credit_amt ?? 0, line_narration: l.narration || "" }))
      );
    }
    case "expensevoucher": {
      const r = await ExpenseVoucherService.getList({ ...filters, page, limit });
      // Flatten expense lines
      return (r?.data || []).flatMap((ev) =>
        (ev.lines || []).length === 0
          ? [{ ...ev, expense_account_code: "", expense_account_name: "", description: "", line_amount: 0, line_tender_id: "" }]
          : (ev.lines || []).map((l) => ({ ...ev, expense_account_code: l.expense_account_code || "", expense_account_name: l.expense_account_name || "", description: l.description || "", line_amount: l.amount ?? 0, line_tender_id: l.tender_id || "" }))
      );
    }
    case "creditnote":
      return (await CreditNoteService.getList({ ...filters, page, limit }))?.data || [];
    case "debitnote":
      return (await DebitNoteService.getList({ ...filters, page, limit }))?.data || [];
    default:
      return [];
  }
}

// Streaming CSV generator — yields rows as strings
// Used for large exports that would OOM with ExcelJS buffer
export async function* streamModuleExport(module, filters) {
  const columnDefs = EXPORT_COLUMNS[module];
  if (!columnDefs) throw new Error(`No column definition for module: ${module}`);

  // Yield CSV header
  yield columnDefs.map((c) => `"${c.header}"`).join(",") + "\n";

  let page = 1;
  const CHUNK = 500;
  while (true) {
    const rows = await fetchModulePage(module, filters, page, CHUNK);
    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      yield columnDefs.map((col) => {
        const val = row[col.key] ?? "";
        const str = String(val).replace(/"/g, '""'); // escape quotes
        return `"${str}"`;
      }).join(",") + "\n";
    }
    if (rows.length < CHUNK) break;
    page++;
  }
}

// ── Shared formatting helpers ─────────────────────────────────────────────────

const fmtDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN");
};

const fmtNum = (val) => (val == null ? 0 : Number(val) || 0);

// Style header row: bold + light-blue background + centered
const styleHeader = (row) => {
  row.font      = { bold: true, color: { argb: "FF1F3864" } };
  row.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6E4F0" } };
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  row.height    = 22;
  row.eachCell((cell) => {
    cell.border = {
      top:    { style: "thin" },
      left:   { style: "thin" },
      bottom: { style: "thin" },
      right:  { style: "thin" },
    };
  });
};

// Auto-fit column widths based on header and cell values
const autoFitColumns = (worksheet) => {
  worksheet.columns.forEach((col) => {
    let maxLen = col.header ? String(col.header).length : 10;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 40);
  });
};

// ── Streaming workbook builder — for large datasets ───────────────────────────
// Uses ExcelJS streaming API to avoid loading all data into RAM at once.
// rowIterator: async generator yielding plain objects whose keys match column keys
// Returns a Buffer built by collecting the stream.
async function _buildWorkbookStream(sheetName, columns, rowIterator) {
  const { Readable } = await import("stream");
  const ExcelJSMod   = (await import("exceljs")).default;

  const wb = new ExcelJSMod.stream.xlsx.WorkbookWriter({ useStyles: true });
  const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: 20 }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font      = { bold: true, color: { argb: "FF1F3864" } };
  headerRow.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6E4F0" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  headerRow.height    = 22;
  headerRow.commit();

  for await (const row of rowIterator) {
    const added = ws.addRow(row);
    added.alignment = { vertical: "middle" };
    added.commit();
  }
  await ws.commit();

  // Collect stream into buffer
  const chunks = [];
  return new Promise((resolve, reject) => {
    wb.stream.on("data",  (chunk) => chunks.push(chunk));
    wb.stream.on("end",   ()      => resolve(Buffer.concat(chunks)));
    wb.stream.on("error", reject);
    wb.commit();
  });
}

// ── Generic workbook builder (used for bounded report exports) ────────────────
// columns: [{ header: string, key: string }]
// rows:    array of plain objects whose keys match column keys
function _buildWorkbook(sheetName, columns, rows) {
  const wb       = new ExcelJS.Workbook();
  wb.creator     = "Romaa Finance";
  wb.created     = new Date();
  wb.modified    = new Date();

  const ws       = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns     = columns.map((c) => ({ header: c.header, key: c.key, width: 18 }));

  styleHeader(ws.getRow(1));

  rows.forEach((rowData) => {
    const added = ws.addRow(rowData);
    added.alignment = { vertical: "middle" };
  });

  autoFitColumns(ws);
  return wb;
}

// ── Export service ────────────────────────────────────────────────────────────

export default class BulkExportService {

  // ── Purchase Bills ──────────────────────────────────────────────────────────
  static async exportPurchaseBills(filters = {}) {
    const columns = [
      { header: "Bill No",          key: "doc_id"         },
      { header: "Bill Date",        key: "doc_date"       },
      { header: "Invoice No",       key: "invoice_no"     },
      { header: "Invoice Date",     key: "invoice_date"   },
      { header: "Due Date",         key: "due_date"       },
      { header: "Vendor ID",        key: "vendor_id"      },
      { header: "Vendor Name",      key: "vendor_name"    },
      { header: "Vendor GSTIN",     key: "vendor_gstin"   },
      { header: "Tender ID",        key: "tender_id"      },
      { header: "Tender Name",      key: "tender_name"    },
      { header: "Tax Mode",         key: "tax_mode"       },
      { header: "Place of Supply",  key: "place_of_supply"},
      { header: "Grand Total",      key: "grand_total"    },
      { header: "Total Tax",        key: "total_tax"      },
      { header: "Round Off",        key: "round_off"      },
      { header: "Net Amount",       key: "net_amount"     },
      { header: "Status",           key: "status"         },
      { header: "Credit Days",      key: "credit_days"    },
    ];

    async function* rowIterator() {
      let page = 1;
      const CHUNK = 500;
      while (true) {
        const { data } = await PurchaseBillService.getBills({ ...filters, page, limit: CHUNK });
        if (!data?.length) break;
        for (const b of data) yield {
          doc_id:          b.doc_id          || "",
          doc_date:        fmtDate(b.doc_date),
          invoice_no:      b.invoice_no      || "",
          invoice_date:    fmtDate(b.invoice_date),
          due_date:        fmtDate(b.due_date),
          vendor_id:       b.vendor_id       || "",
          vendor_name:     b.vendor_name     || "",
          vendor_gstin:    b.vendor_gstin    || "",
          tender_id:       b.tender_id       || "",
          tender_name:     b.tender_name     || "",
          tax_mode:        b.tax_mode        || "",
          place_of_supply: b.place_of_supply || "",
          grand_total:     fmtNum(b.grand_total),
          total_tax:       fmtNum(b.total_tax),
          round_off:       fmtNum(b.round_off),
          net_amount:      fmtNum(b.net_amount),
          status:          b.status          || "",
          credit_days:     fmtNum(b.credit_days),
        };
        if (data.length < CHUNK) break;
        page++;
      }
    }

    return _buildWorkbookStream("Purchase Bills", columns, rowIterator());
  }

  // ── Payment Vouchers ────────────────────────────────────────────────────────
  static async exportPaymentVouchers(filters = {}) {
    const columns = [
      { header: "PV No",            key: "pv_no"           },
      { header: "PV Date",          key: "pv_date"         },
      { header: "Supplier Type",    key: "supplier_type"   },
      { header: "Supplier ID",      key: "supplier_id"     },
      { header: "Supplier Name",    key: "supplier_name"   },
      { header: "Payment Mode",     key: "payment_mode"    },
      { header: "Bank Ref",         key: "bank_ref"        },
      { header: "Cheque No",        key: "cheque_no"       },
      { header: "Amount",           key: "amount"          },
      { header: "Gross Amount",     key: "gross_amount"    },
      { header: "TDS Section",      key: "tds_section"     },
      { header: "TDS %",            key: "tds_pct"         },
      { header: "Tender ID",        key: "tender_id"       },
      { header: "Tender Name",      key: "tender_name"     },
      { header: "Narration",        key: "narration"       },
      { header: "Status",           key: "status"          },
      { header: "Document Year",    key: "document_year"   },
    ];

    async function* rowIterator() {
      let page = 1;
      const CHUNK = 500;
      while (true) {
        const { data } = await PaymentVoucherService.getList({ ...filters, page, limit: CHUNK });
        if (!data?.length) break;
        for (const p of data) yield {
          pv_no:          p.pv_no          || "",
          pv_date:        fmtDate(p.pv_date),
          supplier_type:  p.supplier_type  || "",
          supplier_id:    p.supplier_id    || "",
          supplier_name:  p.supplier_name  || "",
          payment_mode:   p.payment_mode   || "",
          bank_ref:       p.bank_ref       || "",
          cheque_no:      p.cheque_no      || "",
          amount:         fmtNum(p.amount),
          gross_amount:   fmtNum(p.gross_amount),
          tds_section:    p.tds_section    || "",
          tds_pct:        fmtNum(p.tds_pct),
          tender_id:      p.tender_id      || "",
          tender_name:    p.tender_name    || "",
          narration:      p.narration      || "",
          status:         p.status         || "",
          document_year:  p.document_year  || "",
        };
        if (data.length < CHUNK) break;
        page++;
      }
    }

    return _buildWorkbookStream("Payment Vouchers", columns, rowIterator());
  }

  // ── Receipt Vouchers ────────────────────────────────────────────────────────
  static async exportReceiptVouchers(filters = {}) {
    const columns = [
      { header: "RV No",            key: "rv_no"           },
      { header: "RV Date",          key: "rv_date"         },
      { header: "Supplier Type",    key: "supplier_type"   },
      { header: "Supplier ID",      key: "supplier_id"     },
      { header: "Supplier Name",    key: "supplier_name"   },
      { header: "Receipt Mode",     key: "receipt_mode"    },
      { header: "Bank Ref",         key: "bank_ref"        },
      { header: "Cheque No",        key: "cheque_no"       },
      { header: "Amount",           key: "amount"          },
      { header: "Tender ID",        key: "tender_id"       },
      { header: "Tender Name",      key: "tender_name"     },
      { header: "Against No",       key: "against_no"      },
      { header: "Narration",        key: "narration"       },
      { header: "Status",           key: "status"          },
      { header: "Document Year",    key: "document_year"   },
    ];

    async function* rowIterator() {
      let page = 1;
      const CHUNK = 500;
      while (true) {
        const { data } = await ReceiptVoucherService.getList({ ...filters, page, limit: CHUNK });
        if (!data?.length) break;
        for (const r of data) yield {
          rv_no:         r.rv_no         || "",
          rv_date:       fmtDate(r.rv_date),
          supplier_type: r.supplier_type || "",
          supplier_id:   r.supplier_id   || "",
          supplier_name: r.supplier_name || "",
          receipt_mode:  r.receipt_mode  || "",
          bank_ref:      r.bank_ref      || "",
          cheque_no:     r.cheque_no     || "",
          amount:        fmtNum(r.amount),
          tender_id:     r.tender_id     || "",
          tender_name:   r.tender_name   || "",
          against_no:    r.against_no    || "",
          narration:     r.narration     || "",
          status:        r.status        || "",
          document_year: r.document_year || "",
        };
        if (data.length < CHUNK) break;
        page++;
      }
    }

    return _buildWorkbookStream("Receipt Vouchers", columns, rowIterator());
  }

  // ── Journal Entries ─────────────────────────────────────────────────────────
  // Flattens JE lines: one spreadsheet row per JE line, repeating header fields.
  static async exportJournalEntries(filters = {}) {
    const columns = [
      { header: "JE No",            key: "je_no"           },
      { header: "JE Date",          key: "je_date"         },
      { header: "JE Type",          key: "je_type"         },
      { header: "Narration",        key: "narration"       },
      { header: "Tender ID",        key: "tender_id"       },
      { header: "Tender Name",      key: "tender_name"     },
      { header: "Source No",        key: "source_no"       },
      { header: "Source Type",      key: "source_type"     },
      { header: "Financial Year",   key: "financial_year"  },
      { header: "Status",           key: "status"          },
      { header: "Account Code",     key: "account_code"    },
      { header: "Account Name",     key: "account_name"    },
      { header: "Dr/Cr",            key: "dr_cr"           },
      { header: "Debit",            key: "debit_amt"       },
      { header: "Credit",           key: "credit_amt"      },
      { header: "Line Narration",   key: "line_narration"  },
    ];

    async function* rowIterator() {
      let page = 1;
      const CHUNK = 500;
      while (true) {
        const { data } = await JournalEntryService.getList({ ...filters, page, limit: CHUNK });
        if (!data?.length) break;
        for (const je of data) {
          const lines = je.lines || [];
          if (lines.length === 0) {
            yield {
              je_no: je.je_no || "", je_date: fmtDate(je.je_date), je_type: je.je_type || "",
              narration: je.narration || "", tender_id: je.tender_id || "", tender_name: je.tender_name || "",
              source_no: je.source_no || "", source_type: je.source_type || "",
              financial_year: je.financial_year || "", status: je.status || "",
              account_code: "", account_name: "", dr_cr: "", debit_amt: 0, credit_amt: 0, line_narration: "",
            };
          } else {
            for (const line of lines) {
              yield {
                je_no: je.je_no || "", je_date: fmtDate(je.je_date), je_type: je.je_type || "",
                narration: je.narration || "", tender_id: je.tender_id || "", tender_name: je.tender_name || "",
                source_no: je.source_no || "", source_type: je.source_type || "",
                financial_year: je.financial_year || "", status: je.status || "",
                account_code: line.account_code || "", account_name: line.account_name || "",
                dr_cr: line.dr_cr || "", debit_amt: fmtNum(line.debit_amt),
                credit_amt: fmtNum(line.credit_amt), line_narration: line.narration || "",
              };
            }
          }
        }
        if (data.length < CHUNK) break;
        page++;
      }
    }

    return _buildWorkbookStream("Journal Entries", columns, rowIterator());
  }

  // ── Expense Vouchers ────────────────────────────────────────────────────────
  // Flattens expense lines: one row per expense line item.
  static async exportExpenseVouchers(filters = {}) {
    const columns = [
      { header: "EV No",                key: "ev_no"                  },
      { header: "EV Date",              key: "ev_date"                },
      { header: "Payee Type",           key: "payee_type"             },
      { header: "Employee ID",          key: "employee_id"            },
      { header: "Payee Name",           key: "payee_name"             },
      { header: "Payment Mode",         key: "payment_mode"           },
      { header: "Bill No",              key: "bill_no"                },
      { header: "Tender ID",            key: "tender_id"              },
      { header: "Document Year",        key: "document_year"          },
      { header: "Total Amount",         key: "total_amount"           },
      { header: "Status",               key: "status"                 },
      { header: "Narration",            key: "narration"              },
      { header: "Expense Account Code", key: "expense_account_code"   },
      { header: "Expense Account Name", key: "expense_account_name"   },
      { header: "Description",          key: "description"            },
      { header: "Amount",               key: "line_amount"            },
      { header: "Line Tender ID",       key: "line_tender_id"         },
    ];

    async function* rowIterator() {
      let page = 1;
      const CHUNK = 500;
      while (true) {
        const { data } = await ExpenseVoucherService.getList({ ...filters, page, limit: CHUNK });
        if (!data?.length) break;
        for (const ev of data) {
          const lines = ev.lines || [];
          const base = {
            ev_no: ev.ev_no || "", ev_date: fmtDate(ev.ev_date), payee_type: ev.payee_type || "",
            employee_id: ev.employee_id || "", payee_name: ev.payee_name || "",
            payment_mode: ev.payment_mode || "", bill_no: ev.bill_no || "",
            tender_id: ev.tender_id || "", document_year: ev.document_year || "",
            total_amount: fmtNum(ev.total_amount), status: ev.status || "", narration: ev.narration || "",
          };
          if (lines.length === 0) {
            yield { ...base, expense_account_code: "", expense_account_name: "", description: "", line_amount: 0, line_tender_id: "" };
          } else {
            for (const line of lines) {
              yield { ...base, expense_account_code: line.expense_account_code || "", expense_account_name: line.expense_account_name || "", description: line.description || "", line_amount: fmtNum(line.amount), line_tender_id: line.tender_id || "" };
            }
          }
        }
        if (data.length < CHUNK) break;
        page++;
      }
    }

    return _buildWorkbookStream("Expense Vouchers", columns, rowIterator());
  }

  // ── Credit Notes ────────────────────────────────────────────────────────────
  static async exportCreditNotes(filters = {}) {
    const columns = [
      { header: "CN No",            key: "cn_no"           },
      { header: "CN Date",          key: "cn_date"         },
      { header: "Supplier Type",    key: "supplier_type"   },
      { header: "Supplier ID",      key: "supplier_id"     },
      { header: "Supplier Name",    key: "supplier_name"   },
      { header: "Supplier GSTIN",   key: "supplier_gstin"  },
      { header: "Bill No",          key: "bill_no"         },
      { header: "Adj Type",         key: "adj_type"        },
      { header: "Tax Type",         key: "tax_type"        },
      { header: "Sales Type",       key: "sales_type"      },
      { header: "Taxable Amount",   key: "taxable_amount"  },
      { header: "CGST %",           key: "cgst_pct"        },
      { header: "SGST %",           key: "sgst_pct"        },
      { header: "IGST %",           key: "igst_pct"        },
      { header: "Amount",           key: "amount"          },
      { header: "Round Off",        key: "round_off"       },
      { header: "Tender ID",        key: "tender_id"       },
      { header: "Tender Name",      key: "tender_name"     },
      { header: "Narration",        key: "narration"       },
      { header: "Status",           key: "status"          },
      { header: "Document Year",    key: "document_year"   },
    ];

    async function* rowIterator() {
      let page = 1;
      const CHUNK = 500;
      while (true) {
        const { data } = await CreditNoteService.getList({ ...filters, page, limit: CHUNK });
        if (!data?.length) break;
        for (const cn of data) yield {
          cn_no: cn.cn_no || "", cn_date: fmtDate(cn.cn_date), supplier_type: cn.supplier_type || "",
          supplier_id: cn.supplier_id || "", supplier_name: cn.supplier_name || "",
          supplier_gstin: cn.supplier_gstin || "", bill_no: cn.bill_no || "",
          adj_type: cn.adj_type || "", tax_type: cn.tax_type || "", sales_type: cn.sales_type || "",
          taxable_amount: fmtNum(cn.taxable_amount), cgst_pct: fmtNum(cn.cgst_pct),
          sgst_pct: fmtNum(cn.sgst_pct), igst_pct: fmtNum(cn.igst_pct),
          amount: fmtNum(cn.amount), round_off: fmtNum(cn.round_off),
          tender_id: cn.tender_id || "", tender_name: cn.tender_name || "",
          narration: cn.narration || "", status: cn.status || "", document_year: cn.document_year || "",
        };
        if (data.length < CHUNK) break;
        page++;
      }
    }

    return _buildWorkbookStream("Credit Notes", columns, rowIterator());
  }

  // ── Debit Notes ─────────────────────────────────────────────────────────────
  static async exportDebitNotes(filters = {}) {
    const columns = [
      { header: "DN No",            key: "dn_no"           },
      { header: "DN Date",          key: "dn_date"         },
      { header: "Supplier Type",    key: "supplier_type"   },
      { header: "Supplier ID",      key: "supplier_id"     },
      { header: "Supplier Name",    key: "supplier_name"   },
      { header: "Supplier GSTIN",   key: "supplier_gstin"  },
      { header: "Bill No",          key: "bill_no"         },
      { header: "Raised By",        key: "raised_by"       },
      { header: "Adj Type",         key: "adj_type"        },
      { header: "Tax Type",         key: "tax_type"        },
      { header: "Sales Type",       key: "sales_type"      },
      { header: "Taxable Amount",   key: "taxable_amount"  },
      { header: "CGST %",           key: "cgst_pct"        },
      { header: "SGST %",           key: "sgst_pct"        },
      { header: "IGST %",           key: "igst_pct"        },
      { header: "Amount",           key: "amount"          },
      { header: "Round Off",        key: "round_off"       },
      { header: "Tender ID",        key: "tender_id"       },
      { header: "Tender Name",      key: "tender_name"     },
      { header: "Narration",        key: "narration"       },
      { header: "Status",           key: "status"          },
      { header: "Document Year",    key: "document_year"   },
    ];

    async function* rowIterator() {
      let page = 1;
      const CHUNK = 500;
      while (true) {
        const { data } = await DebitNoteService.getList({ ...filters, page, limit: CHUNK });
        if (!data?.length) break;
        for (const dn of data) yield {
          dn_no: dn.dn_no || "", dn_date: fmtDate(dn.dn_date), supplier_type: dn.supplier_type || "",
          supplier_id: dn.supplier_id || "", supplier_name: dn.supplier_name || "",
          supplier_gstin: dn.supplier_gstin || "", bill_no: dn.bill_no || "",
          raised_by: dn.raised_by || "", adj_type: dn.adj_type || "", tax_type: dn.tax_type || "",
          sales_type: dn.sales_type || "", taxable_amount: fmtNum(dn.taxable_amount),
          cgst_pct: fmtNum(dn.cgst_pct), sgst_pct: fmtNum(dn.sgst_pct), igst_pct: fmtNum(dn.igst_pct),
          amount: fmtNum(dn.amount), round_off: fmtNum(dn.round_off),
          tender_id: dn.tender_id || "", tender_name: dn.tender_name || "",
          narration: dn.narration || "", status: dn.status || "", document_year: dn.document_year || "",
        };
        if (data.length < CHUNK) break;
        page++;
      }
    }

    return _buildWorkbookStream("Debit Notes", columns, rowIterator());
  }

  // ── Trial Balance ───────────────────────────────────────────────────────────
  // Returns one row per posting leaf account with opening, period movement, and closing.
  static async exportTrialBalance(filters = {}) {
    const result = await ReportsService.trialBalance({
      as_of_date:   filters.to_date || filters.as_of_date,
      include_zero: false,
    });

    const columns = [
      { header: "Account Code",          key: "account_code"          },
      { header: "Account Name",          key: "account_name"          },
      { header: "Account Type",          key: "account_type"          },
      { header: "Account Subtype",       key: "account_subtype"       },
      { header: "Normal Balance",        key: "normal_balance"        },
      { header: "Opening Balance",       key: "opening_balance"       },
      { header: "Opening Balance Type",  key: "opening_balance_type"  },
      { header: "Period Debit",          key: "period_debit"          },
      { header: "Period Credit",         key: "period_credit"         },
      { header: "Closing Balance",       key: "closing_balance"       },
      { header: "Closing Balance Type",  key: "closing_balance_type"  },
    ];

    const rows = (result.rows || []).map((r) => ({
      account_code:         r.account_code         || "",
      account_name:         r.account_name         || "",
      account_type:         r.account_type         || "",
      account_subtype:      r.account_subtype       || "",
      normal_balance:       r.normal_balance        || "",
      opening_balance:      fmtNum(r.opening_balance),
      opening_balance_type: r.opening_balance_type  || "",
      period_debit:         fmtNum(r.period_debit),
      period_credit:        fmtNum(r.period_credit),
      closing_balance:      fmtNum(r.closing_balance),
      closing_balance_type: r.closing_balance_type  || "",
    }));

    // Append totals row
    rows.push({
      account_code:         "TOTAL",
      account_name:         "Grand Total",
      account_type:         "",
      account_subtype:      "",
      normal_balance:       "",
      opening_balance:      "",
      opening_balance_type: "",
      period_debit:         fmtNum(result.total_debit),
      period_credit:        fmtNum(result.total_credit),
      closing_balance:      "",
      closing_balance_type: result.is_balanced ? "Balanced" : `Diff: ${result.difference}`,
    });

    const wb = _buildWorkbook("Trial Balance", columns, rows);

    // Bold + shade the totals row
    const totalsRow = wb.getWorksheet("Trial Balance").lastRow;
    if (totalsRow) {
      totalsRow.font = { bold: true };
      totalsRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE0B2" } };
    }

    return wb.xlsx.writeBuffer();
  }

  // ── Profit & Loss ───────────────────────────────────────────────────────────
  // Two-section layout: Income rows then Expense rows, each grouped by subtype.
  static async exportProfitLoss(filters = {}) {
    const result = await ReportsService.profitLoss({
      from_date: filters.from_date,
      to_date:   filters.to_date,
      tender_id: filters.tender_id,
    });

    const columns = [
      { header: "Section",          key: "section"         },
      { header: "Subtype",          key: "subtype"         },
      { header: "Account Code",     key: "account_code"    },
      { header: "Account Name",     key: "account_name"    },
      { header: "Amount (INR)",     key: "amount"          },
    ];

    const rows = [];

    // Income section
    for (const group of (result.income?.groups || [])) {
      for (const line of (group.lines || [])) {
        rows.push({
          section:      "Income",
          subtype:      group.subtype      || "",
          account_code: line.account_code  || "",
          account_name: line.account_name  || "",
          amount:       fmtNum(line.amount),
        });
      }
      rows.push({
        section:      "Income Subtotal",
        subtype:      group.subtype || "",
        account_code: "",
        account_name: `Subtotal — ${group.subtype || "Other"}`,
        amount:       fmtNum(group.subtotal),
      });
    }

    rows.push({
      section:      "TOTAL INCOME",
      subtype:      "",
      account_code: "",
      account_name: "Total Income",
      amount:       fmtNum(result.income?.total),
    });

    rows.push({ section: "", subtype: "", account_code: "", account_name: "", amount: "" });

    // Expense section
    for (const group of (result.expense?.groups || [])) {
      for (const line of (group.lines || [])) {
        rows.push({
          section:      "Expense",
          subtype:      group.subtype      || "",
          account_code: line.account_code  || "",
          account_name: line.account_name  || "",
          amount:       fmtNum(line.amount),
        });
      }
      rows.push({
        section:      "Expense Subtotal",
        subtype:      group.subtype || "",
        account_code: "",
        account_name: `Subtotal — ${group.subtype || "Other"}`,
        amount:       fmtNum(group.subtotal),
      });
    }

    rows.push({
      section:      "TOTAL EXPENSE",
      subtype:      "",
      account_code: "",
      account_name: "Total Expense",
      amount:       fmtNum(result.expense?.total),
    });

    rows.push({ section: "", subtype: "", account_code: "", account_name: "", amount: "" });

    rows.push({
      section:      "NET PROFIT / LOSS",
      subtype:      "",
      account_code: "",
      account_name: result.net_profit_type || "Net Profit",
      amount:       fmtNum(result.net_profit),
    });

    const wb = _buildWorkbook("Profit & Loss", columns, rows);

    // Bold the total/subtotal rows
    const ws = wb.getWorksheet("Profit & Loss");
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const sectionCell = row.getCell("section");
      const val = sectionCell.value ? String(sectionCell.value) : "";
      if (val.startsWith("TOTAL") || val === "NET PROFIT / LOSS" || val.includes("Subtotal")) {
        row.font = { bold: true };
      }
    });

    return wb.xlsx.writeBuffer();
  }

  // ── General Ledger (account-level) ─────────────────────────────────────────
  // Returns all JE lines for a given account_code in chronological order with
  // running balance. Requires filters.account_code.
  static async exportLedger(filters = {}) {
    const result = await ReportsService.generalLedger({
      account_code: filters.account_code,
      from_date:    filters.from_date,
      to_date:      filters.to_date,
      page:         1,
      limit:        99999,
    });

    const columns = [
      { header: "Date",             key: "je_date"     },
      { header: "JE No",            key: "je_no"       },
      { header: "JE Type",          key: "je_type"     },
      { header: "Source No",        key: "source_no"   },
      { header: "Source Type",      key: "source_type" },
      { header: "Narration",        key: "narration"   },
      { header: "Tender ID",        key: "tender_id"   },
      { header: "Debit",            key: "debit"       },
      { header: "Credit",           key: "credit"      },
      { header: "Balance",          key: "balance"     },
      { header: "Balance Type",     key: "balance_type"},
    ];

    // Opening balance row
    const rows = [];
    if (result.opening) {
      rows.push({
        je_date:      fmtDate(filters.from_date || new Date()),
        je_no:        "",
        je_type:      "",
        source_no:    "",
        source_type:  "",
        narration:    "Opening Balance B/F",
        tender_id:    "",
        debit:        result.opening.balance_type === "Dr" ? fmtNum(result.opening.balance) : 0,
        credit:       result.opening.balance_type === "Cr" ? fmtNum(result.opening.balance) : 0,
        balance:      fmtNum(result.opening.balance),
        balance_type: result.opening.balance_type || "",
      });
    }

    for (const e of (result.entries || [])) {
      rows.push({
        je_date:      fmtDate(e.je_date),
        je_no:        e.je_no        || "",
        je_type:      e.je_type      || "",
        source_no:    e.source_no    || "",
        source_type:  e.source_type  || "",
        narration:    e.narration    || "",
        tender_id:    e.tender_id    || "",
        debit:        fmtNum(e.debit),
        credit:       fmtNum(e.credit),
        balance:      fmtNum(e.balance),
        balance_type: e.balance_type || "",
      });
    }

    // Account info in sheet tab name
    const sheetName = result.account
      ? `Ledger-${result.account.account_code}`
      : "General Ledger";

    const wb = _buildWorkbook(sheetName.slice(0, 31), columns, rows);
    return wb.xlsx.writeBuffer();
  }

  // ── Aged Payables ───────────────────────────────────────────────────────────
  // Groups unpaid / partial purchase bills by vendor, buckets by age (days overdue).
  // Buckets: 0-30, 31-60, 61-90, 90+
  static async exportAgedPayables(filters = {}) {
    // Fetch all unpaid / partial bills matching the given filters
    const { data } = await PurchaseBillService.getBills({
      ...filters,
      limit: 99999,
      page:  1,
    });

    // Filter to outstanding bills only
    const now = new Date();
    const outstanding = (data || []).filter(
      (b) => b.status === "approved" && b.net_amount > 0
    );

    // Group by vendor_id
    const vendorMap = new Map();
    for (const bill of outstanding) {
      const key = bill.vendor_id || "UNKNOWN";
      if (!vendorMap.has(key)) {
        vendorMap.set(key, {
          vendor_id:   bill.vendor_id   || "",
          vendor_name: bill.vendor_name || "",
          b0_30:  0,
          b31_60: 0,
          b61_90: 0,
          b90p:   0,
        });
      }
      const entry = vendorMap.get(key);

      // Amount still outstanding on this bill
      const outstanding_amt = Math.max(
        0,
        fmtNum(bill.net_amount) - fmtNum(bill.amount_paid || 0)
      );

      // Age = days since due_date (or doc_date if no due_date)
      const refDate = bill.due_date ? new Date(bill.due_date) : new Date(bill.doc_date);
      const ageDays = Math.max(0, Math.floor((now - refDate) / (1000 * 60 * 60 * 24)));

      if (ageDays <= 30)       entry.b0_30  += outstanding_amt;
      else if (ageDays <= 60)  entry.b31_60 += outstanding_amt;
      else if (ageDays <= 90)  entry.b61_90 += outstanding_amt;
      else                     entry.b90p   += outstanding_amt;
    }

    const columns = [
      { header: "Vendor ID",      key: "vendor_id"    },
      { header: "Vendor Name",    key: "vendor_name"  },
      { header: "0-30 Days",      key: "b0_30"        },
      { header: "31-60 Days",     key: "b31_60"       },
      { header: "61-90 Days",     key: "b61_90"       },
      { header: "90+ Days",       key: "b90p"         },
      { header: "Total",          key: "total"        },
    ];

    const rows = [];
    let grand0_30 = 0, grand31_60 = 0, grand61_90 = 0, grand90p = 0;

    for (const v of vendorMap.values()) {
      const total = Math.round((v.b0_30 + v.b31_60 + v.b61_90 + v.b90p) * 100) / 100;
      rows.push({
        vendor_id:   v.vendor_id,
        vendor_name: v.vendor_name,
        b0_30:       Math.round(v.b0_30  * 100) / 100,
        b31_60:      Math.round(v.b31_60 * 100) / 100,
        b61_90:      Math.round(v.b61_90 * 100) / 100,
        b90p:        Math.round(v.b90p   * 100) / 100,
        total,
      });
      grand0_30  += v.b0_30;
      grand31_60 += v.b31_60;
      grand61_90 += v.b61_90;
      grand90p   += v.b90p;
    }

    // Sort by total descending
    rows.sort((a, b) => b.total - a.total);

    // Totals row
    rows.push({
      vendor_id:   "TOTAL",
      vendor_name: "Grand Total",
      b0_30:       Math.round(grand0_30  * 100) / 100,
      b31_60:      Math.round(grand31_60 * 100) / 100,
      b61_90:      Math.round(grand61_90 * 100) / 100,
      b90p:        Math.round(grand90p   * 100) / 100,
      total:       Math.round((grand0_30 + grand31_60 + grand61_90 + grand90p) * 100) / 100,
    });

    const wb = _buildWorkbook("Aged Payables", columns, rows);

    // Bold + shade totals row
    const ws = wb.getWorksheet("Aged Payables");
    const lastRow = ws.lastRow;
    if (lastRow) {
      lastRow.font = { bold: true };
      lastRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE0B2" } };
    }

    return wb.xlsx.writeBuffer();
  }
}
