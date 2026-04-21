import FinanceAttachmentService from "./financeattachment.service.js";

export const upload = async (req, res) => {
  try {
    const files = req.files && req.files.length ? req.files : (req.file ? [req.file] : []);
    if (!files.length) {
      return res.status(400).json({ status: false, message: "No files attached. Use form-field name 'files'." });
    }

    const data = await FinanceAttachmentService.upload({
      files,
      meta: {
        source_type:      req.body.source_type,
        source_ref:       req.body.source_ref || null,
        source_no:        req.body.source_no  || "",
        tender_id:        req.body.tender_id  || "",
        category:         req.body.category   || "Other",
        description:      req.body.description || "",
        tags:             req.body.tags,
        uploaded_by:      req.user?._id?.toString() || "",
        uploaded_by_name: req.user
          ? `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim() || req.user.emp_id || ""
          : "",
      },
    });

    res.status(201).json({
      status: true,
      message: `${data.count} file(s) uploaded`,
      data,
    });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const listForSource = async (req, res) => {
  try {
    const { source_type, source_ref, source_no, include_deleted } = req.query;
    const data = await FinanceAttachmentService.listForSource({
      source_type,
      source_ref,
      source_no,
      include_deleted: include_deleted === "true",
    });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const list = async (req, res) => {
  try {
    const data = await FinanceAttachmentService.list(req.query);
    res.status(200).json({ status: true, ...data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getById = async (req, res) => {
  try {
    const data = await FinanceAttachmentService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const getDownloadUrl = async (req, res) => {
  try {
    const data = await FinanceAttachmentService.getDownloadUrl(req.params.id, {
      expires_seconds: Number(req.query.expires_seconds) || 3600,
    });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

export const updateMeta = async (req, res) => {
  try {
    const data = await FinanceAttachmentService.updateMeta(req.params.id, req.body);
    res.status(200).json({ status: true, message: "Updated", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const deleteOne = async (req, res) => {
  try {
    const data = await FinanceAttachmentService.deleteOne(req.params.id, {
      deleted_by: req.user?._id?.toString() || "",
      reason:     req.body?.reason || req.query?.reason || "",
      hard_delete: (req.query?.hard_delete === "true"),
    });
    res.status(200).json({ status: true, message: data.hard_deleted ? "Permanently deleted" : "Deleted", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const restore = async (req, res) => {
  try {
    const data = await FinanceAttachmentService.restore(req.params.id);
    res.status(200).json({ status: true, message: "Restored", data });
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};

export const stats = async (req, res) => {
  try {
    const data = await FinanceAttachmentService.stats(req.query);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
