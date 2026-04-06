import ClientCNService from "./clientcreditnote.service.js";

const send = (res, code, payload) => res.status(code).json(payload);

const errCode = (msg) =>
  msg.includes("not found")                                          ? 404
  : msg.includes("already") || msg.includes("Cannot") || msg.includes("cannot") ? 400
  : 500;

export const getList = async (req, res) => {
  try {
    const data = await ClientCNService.getList(req.query);
    send(res, 200, { status: true, ...data });
  } catch (e) {
    send(res, 500, { status: false, message: e.message });
  }
};

export const getById = async (req, res) => {
  try {
    const data = await ClientCNService.getById(req.params.id);
    send(res, 200, { status: true, data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const createCCN = async (req, res) => {
  try {
    const data = await ClientCNService.createCCN(req.body);
    send(res, 201, { status: true, message: `Client credit note ${data.ccn_no} created successfully`, data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const updateCCN = async (req, res) => {
  try {
    const data = await ClientCNService.updateCCN(req.params.id, req.body);
    send(res, 200, { status: true, message: "Client credit note updated successfully", data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const deleteCCN = async (req, res) => {
  try {
    const data = await ClientCNService.deleteCCN(req.params.id);
    send(res, 200, { status: true, message: "Client credit note draft removed successfully", data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const approveCCN = async (req, res) => {
  try {
    const data = await ClientCNService.approveCCN(req.params.id);
    send(res, 200, { status: true, message: "Client credit note approved and posted to ledger successfully", data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return send(res, 400, { status: false, message: "status is required" });
    const data = await ClientCNService.updateStatus(req.params.id, status);
    send(res, 200, { status: true, message: `Status updated to ${data.status}`, data });
  } catch (e) {
    send(res, errCode(e.message), { status: false, message: e.message });
  }
};
