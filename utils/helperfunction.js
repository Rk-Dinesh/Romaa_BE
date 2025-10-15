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

// Utility functions for date ranges
export const getCurrentWeekRange = () => {
  const curr = new Date();
  const first = curr.getDate() - curr.getDay();
  const last = first + 6;
  return {
    start: new Date(curr.setDate(first)),
    end: new Date(curr.setDate(last)),
  };
}

export const getCurrentMonthRange = ()=> {
  const curr = new Date();
  return {
    start: new Date(curr.getFullYear(), curr.getMonth(), 1),
    end: new Date(curr.getFullYear(), curr.getMonth() + 1, 0),
  };
}

export const getCurrentYearRange = () => {
  const curr = new Date();
  return {
    start: new Date(curr.getFullYear(), 0, 1),
    end: new Date(curr.getFullYear(), 11, 31),
  };
}


export const monthsMap = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

export const getWeekRangeOfMonth = (weekName, year, monthIndex) => {
  let start, end;
  switch (weekName) {
    case "firstWeek":
      start = new Date(year, monthIndex, 1);
      end = new Date(year, monthIndex, 7);
      break;
    case "secondWeek":
      start = new Date(year, monthIndex, 8);
      end = new Date(year, monthIndex, 14);
      break;
    case "thirdWeek":
      start = new Date(year, monthIndex, 15);
      end = new Date(year, monthIndex, 21);
      break;
    case "fourthWeek":
      start = new Date(year, monthIndex, 22);
      end = new Date(year, monthIndex + 1, 0); // last day of month
      break;
    default:
      start = new Date(year, monthIndex, 1);
      end = new Date(year, monthIndex + 1, 0);
  }
  return { start, end };
};