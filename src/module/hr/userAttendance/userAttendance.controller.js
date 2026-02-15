import { uploadFileToS3 } from "../../../../utils/awsBucket.js";
import UserAttendanceService from "./userAttendance.service.js";

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
      .json({ status: false, message: "File size exceeds limit" });
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
    console.log(targetId);
     
    
    const result = await UserAttendanceService.getEmployeeMonthlyStats(targetId, parseInt(month), parseInt(year));
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//  Get Daily Report (All Employees)
export const getDailyReport = async (req, res) => {
  try {
    const { date } = req.query; // Format: "2023-10-25"
    const result = await UserAttendanceService.getDailyReport(date);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getMonthlyReport = async (req, res) => {
  try {
    const { month, year } = req.query; // e.g., month=10, year=2023
    
    if(!month || !year) throw { statusCode: 400, message: "Month and Year required" };

    const result = await UserAttendanceService.getMonthlyAttendanceReport(month, year);
    res.status(200).json({
      success: true,
      data: result,
      meta: {
        month,
        year,
        generatedAt: new Date()
      }
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};