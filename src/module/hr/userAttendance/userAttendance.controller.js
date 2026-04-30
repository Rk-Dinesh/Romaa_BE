import { uploadFileToS3 } from "../../../../utils/awsBucket.js";
import UserAttendanceService from "./userAttendance.service.js";
import AppError from "../../../common/AppError.js";

export const performPunch = async (req, res) => {
  try {
    const data = await UserAttendanceService.performPunch(req.body);
    res
      .status(200)
      .json({ success: true, message: "Check-In Successful", data });
  } catch (err) {
    res
      .status(err.statusCode || 500)
      .json({ success: false, message: err.message });
  }
};

export const uploadDocument = async (req, res) => {
  if (!req.file)
    return res.status(400).json({ status: false, message: "No file uploaded" });

  const size = req.file.size;
  const maxSize = 1 * 1024 * 1024; // 1MB
  if (size > maxSize) {
    return res
      .status(400)
      .json({ status: false, message: "File size exceeds the 1MB limit. Please upload a smaller file" });
  }
  try {
    const uploadResult = await uploadFileToS3(
      req.file,
      process.env.AWS_S3_BUCKET,
    );
    const fileUrl = `https://${uploadResult.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadResult.Key}`;
    return res
      .status(200)
      .json({ status: true, message: "File uploaded successfully", fileUrl });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

//  Employee Applies for Regularization
export const applyRegularization = async (req, res) => {
  try {
    const result = await UserAttendanceService.applyRegularization(req.user.employeeId, req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

//  Manager Approves/Rejects
export const actionRegularization = async (req, res) => {
  try {
    // Pass admin ID from token, and body contains action details
    const result = await UserAttendanceService.actionRegularization(req.user.employeeId, req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

//  Get Smart Data (Single Employee - Calendar)
export const getMyAttendanceStats = async (req, res) => {
  try {
    const { month, year, userId } = req.query;
    // If Admin passes userId, view that user. Else view self.
    const targetId = userId || req.user._id;
    const result = await UserAttendanceService.getEmployeeMonthlyStats(targetId, parseInt(month), parseInt(year));
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//  Get Daily Report (All Employees)
export const getDailyReport = async (req, res) => {
  try {
    const { date, fromdate, todate, page, limit, search } = req.query;
    const result = await UserAttendanceService.getDailyReport({ date, fromdate, todate, page, limit, search });
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

export const getMonthlyReport = async (req, res) => {
  try {
    const { month, year, fromdate, todate, page, limit, search } = req.query;
    const result = await UserAttendanceService.getMonthlyAttendanceReport({ fromdate, todate, month, year, page, limit, search });
    res.status(200).json({
      status: true,
      currentPage: result.page,
      totalPages: Math.ceil(result.total / result.limit),
      totalCount: result.total,
      data: result.data,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const getRegularizationList = async (req, res) => {
  try {
    const { page, limit, search, fromdate, todate } = req.query;
    const result = await UserAttendanceService.getRegularizationList({ page, limit, search, fromdate, todate });
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

export const getTodaySummary = async (_req, res) => {
  try {
    const data = await UserAttendanceService.getTodaySummary();
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

export const getRegularizationById = async (req, res) => {
  try {
    const data = await UserAttendanceService.getRegularizationById(req.params.id);
    res.status(200).json({ status: true, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ status: false, message: err.message });
  }
};

export const getLateReport = async (req, res) => {
  try {
    const result = await UserAttendanceService.getLateReport(req.query);
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

export const getAbsenteeReport = async (req, res) => {
  try {
    const result = await UserAttendanceService.getAbsenteeReport(req.query);
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

export const getOvertimeReport = async (req, res) => {
  try {
    const result = await UserAttendanceService.getOvertimeReport(req.query);
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

export const getAttendanceByDateAndEmployeeId = async (req, res) => {
  try {
    const { date, employeeId } = req.query;
    const result = await UserAttendanceService.getAttendanceByDateAndEmployeeId(date, employeeId);
    res.status(200).json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};