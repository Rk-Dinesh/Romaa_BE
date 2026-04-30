import LeavePolicyService from "./leavePolicy.service.js";

export const upsertPolicy = async (req, res) => {
  try {
    const data = await LeavePolicyService.upsert({ ...req.body, actorId: req.user?._id });
    res.status(200).json({ status: true, message: "Leave policy saved", data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const listPolicies = async (req, res) => {
  try {
    const result = await LeavePolicyService.list(req.query);
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
    const data = await LeavePolicyService.getById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const deletePolicy = async (req, res) => {
  try {
    await LeavePolicyService.deleteById(req.params.id);
    res.status(200).json({ status: true, message: "Policy deleted" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

// Preview the resolved rule set an employee would currently be governed by
// — useful for the leave-application form to pre-flight-check entitlement,
// notice, blackout, etc., before the user fills it in.
export const previewForEmployee = async (req, res) => {
  try {
    const EmployeeModel = (await import("../employee/employee.model.js")).default;
    const empId = req.query.employeeId || req.user._id;
    const emp = await EmployeeModel.findById(empId).select("department dateOfJoining hrStatus").lean();
    if (!emp) return res.status(404).json({ status: false, message: "Employee not found" });
    const policy = await LeavePolicyService.resolveForEmployee(emp);
    const resolvedRules = {};
    for (const t of ["CL","SL","PL","Maternity","Paternity","Bereavement","CompOff","Permission","LWP"]) {
      const rule = LeavePolicyService.getRule(policy, t);
      if (rule) {
        resolvedRules[t] = {
          ...rule,
          effectiveEntitlement: LeavePolicyService.getEntitlement(rule, emp),
        };
      }
    }
    res.status(200).json({
      status: true,
      data: {
        scope: policy?.scope || "FALLBACK",
        policyName: policy?.policyName || "Hardcoded fallback",
        rules: resolvedRules,
      },
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
