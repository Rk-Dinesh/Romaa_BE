import DepartmentService from "./department.service.js";

export const upsertDepartment = async (req, res) => {
  try {
    const data = await DepartmentService.upsert({ ...req.body, actorId: req.user?._id });
    res.status(200).json({ status: true, message: "Department saved", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const listDepartments = async (req, res) => {
  try {
    const result = await DepartmentService.list(req.query);
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

export const getDepartment = async (req, res) => {
  try {
    const data = await DepartmentService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const deleteDepartment = async (req, res) => {
  try {
    await DepartmentService.deleteById(req.params.id);
    res.status(200).json({ status: true, message: "Department deleted" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};
