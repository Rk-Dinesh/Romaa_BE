import IdcodeServices from "../../idcode/idcode.service.js";
import TenderDocumentModel from "./tenderdocument.model.js";
import S3Service from "./tenderdocument.service.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";
dotenv.config();

// Initialize your S3 client with region and credentials
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// export const uploadDocument = async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ status: false, message: "No file uploaded" });
//   }
//   try {
//     const result = await S3Service.uploadFileToS3(req.file, process.env.AWS_S3_BUCKET);
//     res.status(201).json({
//       status: true,
//       message: "File uploaded to S3 successfully",
//       url: result.Location,
//       key: result.Key,
//     });
//   } catch (error) {
//     res.status(500).json({ status: false, message: error.message });
//   }
// };

export const uploadDocument = async (req, res) => {
  if (!req.file)
    return res.status(400).json({ status: false, message: "No file uploaded" });

  const { tender_id, uploaded_by, description } = req.body;
  if (!tender_id || !uploaded_by) {
    return res
      .status(400)
      .json({
        status: false,
        message: "tender_id and uploaded_by are required",
      });
  }

  try {
    const uploadResult = await S3Service.uploadFileToS3(
      req.file,
      process.env.AWS_S3_BUCKET
    );
    const fileUrl = `https://${uploadResult.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadResult.Key}`;
    const idname = "DOCUMENT";
    const idcode = "DOC";
    await IdcodeServices.addIdCode(idname, idcode);
    const uniqueCode = await IdcodeServices.generateCode("DOCUMENT");

    const newFileDocument = {
    code: uniqueCode,
      filename: req.file.originalname,
      file_url: fileUrl,
      key: uploadResult.Key, 
      type: req.file.mimetype,
      description: description || "",
      uploaded_by,
      uploaded_at: new Date(),
      version: 1,
      is_active: true,
    };

    const tenderDoc = await TenderDocumentModel.findOneAndUpdate(
      { tender_id },
      {
        $push: { documents: newFileDocument },
        $set: { updated_at: new Date() },
      },
      { new: true, upsert: true }
    );

    res.status(201).json({
      status: true,
      message: "File uploaded to S3 and metadata saved to DB successfully",
      file_url: fileUrl,
      tender_document: tenderDoc,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const uploadMultipleDocuments = async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res
      .status(400)
      .json({ status: false, message: "No files uploaded" });
  }

  const { tender_id, uploaded_by, description } = req.body;
  if (!tender_id || !uploaded_by) {
    return res
      .status(400)
      .json({
        status: false,
        message: "tender_id and uploaded_by are required",
      });
  }

  try {
    const uploadedDocs = [];

    for (const file of req.files) {
      const uploadResult = await S3Service.uploadFileToS3(
        file,
        process.env.AWS_S3_BUCKET
      );
      const fileUrl = `https://${uploadResult.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadResult.Key}`;

       const idname = "DOCUMENT";
    const idcode = "DOC";
    await IdcodeServices.addIdCode(idname, idcode);
    const uniqueCode = await IdcodeServices.generateCode("DOCUMENT");

      uploadedDocs.push({
        code: uniqueCode,
        filename: file.originalname,
        file_url: fileUrl,
        key: uploadResult.Key, 
        type: file.mimetype,
        description: description || "",
        uploaded_by,
        uploaded_at: new Date(),
        version: 1,
        is_active: true,
      });
    }

    // Add all uploaded documents to the tender document record
    const tenderDoc = await TenderDocumentModel.findOneAndUpdate(
      { tender_id },
      {
        $push: { documents: { $each: uploadedDocs } },
        $set: { updated_at: new Date() },
      },
      { new: true, upsert: true }
    );

    res.status(201).json({
      status: true,
      message: "Files uploaded to S3 and saved to DB successfully",
      tender_document: tenderDoc,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getTenderDocument = async (req, res) => {
  const { tender_id } = req.params;

  try {
    const tenderDoc = await S3Service.getTenderDocumentByTenderId(
      tender_id
    );
    if (!tenderDoc) {
      return res
        .status(404)
        .json({ status: false, message: "Tender document not found" });
    }
    res.status(200).json({ status: true, tender_document: tenderDoc });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const getDocumentByTenderIdAndCode = async (req, res) => {
  const { tender_id, code } = req.params;

  try {
    // Find the tender document with given tender_id and matching document code inside documents array
    const tenderDoc = await TenderDocumentModel.findOne(
      { tender_id, 'documents.code': code },
      { 'documents.$': 1, tender_id: 1 } // Project only the matching document in documents array
    );

    if (!tenderDoc || !tenderDoc.documents.length) {
      return res.status(404).json({ status: false, message: "Document not found" });
    }

    res.status(200).json({
      status: true,
      tender_id: tenderDoc.tender_id,
      document: tenderDoc.documents[0],
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getDocumentByTenderIdAndCodeaws = async (req, res) => {
  const { tender_id, code } = req.params;

  try {
    // Find tender document with matching tender_id and document code
    const tenderDoc = await TenderDocumentModel.findOne(
      { tender_id, 'documents.code': code },
      { 'documents.$': 1, tender_id: 1 }
    );

    if (!tenderDoc || !tenderDoc.documents.length) {
      return res.status(404).json({ status: false, message: "Document not found" });
    }

    const document = tenderDoc.documents[0];

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: document.key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour expiry

    // Return document info along with secure access URL
    res.status(200).json({
      status: true,
      tender_id: tenderDoc.tender_id,
      document: {
        ...document.toObject(), 
        presigned_url: presignedUrl,
      },
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
