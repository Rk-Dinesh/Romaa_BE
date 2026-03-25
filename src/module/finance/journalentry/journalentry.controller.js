import JournalEntryService from "./journalentry.service.js";

// GET /journalentry/next-no
export const getNextJeNo = async (_req, res) => {
  try {
    const data = await JournalEntryService.getNextJeNo();
    res.status(200).json({ status: true, ...data });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /journalentry/list
// ?je_type=&status=&tender_id=&financial_year=&is_reversal=&je_no=&account_code=&from_date=&to_date=&page=&limit=
export const getList = async (req, res) => {
  try {
    const {
      je_type, status, tender_id, financial_year,
      is_reversal, je_no, account_code, from_date, to_date, page, limit,
    } = req.query;
    const result = await JournalEntryService.getList({
      je_type, status, tender_id, financial_year,
      is_reversal, je_no, account_code, from_date, to_date, page, limit,
    });
    res.status(200).json({ status: true, ...result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// GET /journalentry/:id
export const getById = async (req, res) => {
  try {
    const data = await JournalEntryService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (error) {
    const code = error.message.includes("not found") ? 404 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /journalentry/create
export const create = async (req, res) => {
  try {
    const data = await JournalEntryService.create(req.body);
    res.status(201).json({ status: true, message: "Journal entry created", data });
  } catch (error) {
    const code = error.message.includes("required") ||
                 error.message.includes("not found") ||
                 error.message.includes("balance") ||
                 error.message.includes("group account") ||
                 error.message.includes("posting account") ||
                 error.message.includes("debit_amt") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// PATCH /journalentry/approve/:id
export const approve = async (req, res) => {
  try {
    const approvedBy = req.user?._id || null;
    const data = await JournalEntryService.approve(req.params.id, approvedBy);
    res.status(200).json({ status: true, message: "Journal entry approved and posted", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Already") ||
                 error.message.includes("Cannot approve") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /journalentry/reverse/:id
export const reverse = async (req, res) => {
  try {
    const data = await JournalEntryService.reverse(req.params.id, req.body);
    res.status(201).json({ status: true, message: "Reversal journal entry created and posted", data });
  } catch (error) {
    const code = error.message.includes("not found") ||
                 error.message.includes("Only approved") ||
                 error.message.includes("cannot itself") ||
                 error.message.includes("Already reversed") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// POST /journalentry/process-auto-reversals  ← called by cron or admin
export const processAutoReversals = async (_req, res) => {
  try {
    const results = await JournalEntryService.processAutoReversals();
    res.status(200).json({ status: true, results });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// PATCH /journalentry/update/:id
export const update = async (req, res) => {
  try {
    const data = await JournalEntryService.update(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Journal entry updated", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot edit") ||
                 error.message.includes("balance") || error.message.includes("group account") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};

// DELETE /journalentry/delete/:id
export const deleteDraft = async (req, res) => {
  try {
    const data = await JournalEntryService.deleteDraft(req.params.id);
    res.status(200).json({ status: true, message: "Journal entry deleted", data });
  } catch (error) {
    const code = error.message.includes("not found") || error.message.includes("Cannot delete") ? 400 : 500;
    res.status(code).json({ status: false, message: error.message });
  }
};
