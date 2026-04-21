import GstMatcherService from "./gstmatcher.service.js";
import { paginatedResponse } from "../../../common/App.helperFunction.js";

export const upload = async (req, res) => {
  try {
    const data = await GstMatcherService.upload({
      ...req.body,
      uploaded_by: req.user?._id || null,
    });
    res.status(201).json({
      status: true,
      message: `${data.source} uploaded for ${data.return_period} (${data.summary.entry_count} entries)`,
      data,
    });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const list = async (req, res) => {
  try {
    const result = await GstMatcherService.list(req.query);
    return paginatedResponse(res, {
      data:  result.data,
      page:  result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getById = async (req, res) => {
  try {
    const data = await GstMatcherService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const runMatch = async (req, res) => {
  try {
    const { return_period, source } = req.body || {};
    const data = await GstMatcherService.runMatch({ return_period, source });
    res.status(200).json({ status: true, data });
  } catch (err) {
    const code = err.message.includes("required") || err.message.includes("No active") ? 400 : 500;
    res.status(code).json({ status: false, message: err.message });
  }
};

export const manualLink = async (req, res) => {
  try {
    const data = await GstMatcherService.manualLink({
      upload_id:   req.params.id,
      entry_index: Number(req.body.entry_index),
      bill_id:     req.body.bill_id,
    });
    res.status(200).json({ status: true, message: "Linked", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const manualUnlink = async (req, res) => {
  try {
    const data = await GstMatcherService.manualUnlink({
      upload_id:   req.params.id,
      entry_index: Number(req.body.entry_index),
    });
    res.status(200).json({ status: true, message: "Unlinked", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const deleteUpload = async (req, res) => {
  try {
    const data = await GstMatcherService.deleteUpload(req.params.id);
    res.status(200).json({ status: true, message: "Deleted", data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};
