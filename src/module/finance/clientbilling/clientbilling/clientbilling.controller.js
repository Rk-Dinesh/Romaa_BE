import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import BillingService from "./clientbilling.service.js";
import { parseFileToJson } from "../../../../utils/parseFileToJson.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const send = (res, code, payload) => res.status(code).json(payload);

const errCode = (msg) =>
  msg.includes("not found")                    ? 404
  : msg.includes("already") || msg.includes("Cannot") || msg.includes("cannot") ? 400
  : 500;

export const getNextBillId = async (req, res) => {
  try {
    const data = await BillingService.getNextBillId();
    send(res, 200, { status: true, data });
  } catch (e) {
    send(res, 500, { status: false, message: e.message });
  }
};

export const getList = async (req, res) => {
  try {
    const data = await BillingService.getList(req.query);
    send(res, 200, { status: true, ...data });
  } catch (e) {
    send(res, 500, { status: false, message: e.message });
  }
};

export const getHistory = async (req, res) => {
  try {
    const data = await BillingService.getBillHistory(req.params.tender_id);
    send(res, 200, { status: true, count: data.length, data });
  } catch (e) {
    send(res, 500, { status: false, message: e.message });
  }
};

export const getBillById = async (req, res) => {
  try {
    const data = await BillingService.getBillById(req.params.id);
    send(res, 200, { status: true, data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const getDetails = async (req, res) => {
  try {
    const { tender_id, bill_id } = req.params;
    const data = await BillingService.getBillDetails(tender_id, bill_id);
    send(res, 200, { status: true, data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const createBill = async (req, res) => {
  try {
    if (!req.body.tender_id) return send(res, 400, { status: false, message: "tender_id is required" });
    const data = await BillingService.createBill(req.body);
    send(res, 201, { status: true, message: `Bill ${data.bill_id} created`, data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const updateBill = async (req, res) => {
  try {
    const data = await BillingService.updateBill(req.params.id, req.body);
    send(res, 200, { status: true, message: "Bill updated", data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const deleteBill = async (req, res) => {
  try {
    const data = await BillingService.deleteBill(req.params.id);
    send(res, 200, { status: true, message: "Bill deleted", data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const approveBill = async (req, res) => {
  try {
    const data = await BillingService.approveBill(req.params.id);
    send(res, 200, { status: true, message: "Bill approved", data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return send(res, 400, { status: false, message: "status is required" });
    const data = await BillingService.updateStatus(req.params.id, status);
    send(res, 200, { status: true, message: `Status updated to ${data.status}`, data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const uploadBillCSV = async (req, res) => {
  let filePath = null;
  try {
    if (!req.file) return send(res, 400, { status: false, message: "No file uploaded" });
    if (!req.body.tender_id) return send(res, 400, { status: false, message: "tender_id is required" });

    filePath = path.join(__dirname, "../../../../uploads", req.file.filename);
    const rows = await parseFileToJson(filePath, req.file.originalname);

    if (!rows.length) return send(res, 400, { status: false, message: "File is empty" });

    const items = rows.map((r) => ({
      item_code:     r.item_code     || "",
      item_name:     r.item_name     || "",
      unit:          r.unit          || "",
      rate:          Number(r.rate)  || 0,
      mb_book_ref:   r.mb_book_ref   || "",
      agreement_qty: Number(r.agreement_qty) || 0,
      current_qty:   Number(r.current_qty)   || 0,
      prev_bill_qty: Number(r.prev_bill_qty)  || 0,
    }));

    const payload = { ...req.body, items };
    const data = await BillingService.createBill(payload);
    send(res, 201, { status: true, message: `Bill ${data.bill_id} created from CSV`, data });

  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  }
};
