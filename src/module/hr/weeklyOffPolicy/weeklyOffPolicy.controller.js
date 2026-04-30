import WeeklyOffPolicyService from "./weeklyOffPolicy.service.js";

export const upsertPolicy = async (req, res) => {
  try {
    const data = await WeeklyOffPolicyService.upsert({
      ...req.body,
      actorId: req.user?._id,
    });
    res.status(200).json({ status: true, message: "Weekly-off policy saved", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const listPolicies = async (req, res) => {
  try {
    const { isActive, search, page, limit } = req.query;
    const result = await WeeklyOffPolicyService.list({ isActive, search, page, limit });
    res.status(200).json({
      status: true,
      currentPage: result.page,
      totalPages: Math.ceil(result.total / result.limit),
      totalCount: result.total,
      data: result.data,
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getPolicy = async (req, res) => {
  try {
    const data = await WeeklyOffPolicyService.getByDepartment(req.params.department);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const deletePolicy = async (req, res) => {
  try {
    await WeeklyOffPolicyService.deleteByDepartment(req.params.department);
    res.status(200).json({ status: true, message: "Policy deleted" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

// Preview which dates a policy declares off in a date range — for the
// calendar UI to grey out non-working days before any holiday is seeded.
export const previewPolicy = async (req, res) => {
  try {
    const { department, fromdate, todate } = req.query;
    if (!fromdate || !todate) {
      return res.status(400).json({ status: false, message: "fromdate and todate are required" });
    }
    const data = await WeeklyOffPolicyService.preview({ department, fromdate, todate });
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
