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
