import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import logger from "../src/config/logger.js";
import dotenv from "dotenv";
dotenv.config();

export const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const uploadFileToS3 = async (file, bucketName) => {
  try {
    const params = {
      Bucket: bucketName,
      Key: `${Date.now()}-${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };
    const command = new PutObjectCommand(params);
    const result = await s3Client.send(command);
    // result here contains ETag, and other info but no Location property (no automatic URL)
    // For URL, construct manually or configure bucket for public access or presigned URL

    return {
      Key: params.Key,
      Bucket: params.Bucket,
    };
  } catch (error) {
    logger.error("Error uploading file to S3: " + error.message);
    throw new Error("Failed to upload file to S3");
  }
};

export const uploadMultiFilesToS3 = async (files, bucketName) => {
  const uploadResults = [];
  for (const file of files) {
    const params = {
      Bucket: bucketName,
      Key: `${Date.now()}_${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };
    await s3Client.send(new PutObjectCommand(params));
    uploadResults.push({
      Bucket: bucketName,
      Key: params.Key,
      originalname: file.originalname,
    });
  }
  return uploadResults;
};
