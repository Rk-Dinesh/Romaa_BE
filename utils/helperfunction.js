import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});


export const uploadFileToS3 = async (file, bucketName) => {
  const params = {
    Bucket: bucketName,
    Key: `${Date.now()}_${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  await s3Client.send(new PutObjectCommand(params));
  return { Bucket: bucketName, Key: params.Key };
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
    uploadResults.push({ Bucket: bucketName, Key: params.Key, originalname: file.originalname });
  }
  return uploadResults;
};

