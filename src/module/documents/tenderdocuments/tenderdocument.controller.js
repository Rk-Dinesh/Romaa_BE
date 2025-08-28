import S3Service from "./tenderdocument.service.js";
import dotenv from 'dotenv';
dotenv.config();

export const uploadDocument = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: false, message: "No file uploaded" });
  }
  try {
    const result = await S3Service.uploadFileToS3(req.file, process.env.AWS_S3_BUCKET);
    res.status(201).json({
      status: true,
      message: "File uploaded to S3 successfully",
      url: result.Location,
      key: result.Key,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
