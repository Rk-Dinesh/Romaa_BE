// Backward-compat shim: canonical model moved to src/module/approval/.
// Kept so existing imports from finance/* still resolve.
export { default, APPROVER_STRATEGY } from "../../approval/approvalrule.model.js";
