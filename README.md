// services/s3Service.js
import dotenv from 'dotenv';
import AWS from 'aws-sdk';
import logger from '../../../config/logger.js';
dotenv.config();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,      // Use environment variables (no backslashes)
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

class S3Service {
  static async uploadFileToS3(file, bucketName) {
    try {
      const params = {
        Bucket: bucketName,
        Key: `${Date.now()}-${file.originalname}`, // unique file key
        Body: file.buffer,
        ContentType: file.mimetype,
      };
      const result = await s3.upload(params).promise();
      return result;
    } catch (error) {
      logger.error("Error uploading file to S3: " + error.message);
      throw new Error("Failed to upload file to S3");
    }
  }
}

export default S3Service;


{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "AllowRootAccess",
			"Effect": "Allow",
			"Principal": {
				"AWS": "arn:aws:iam::096863133185:root"
			},
			"Action": "s3:GetObject",
			"Resource": "arn:aws:s3:::romaafiles/*"
		}
	]
}