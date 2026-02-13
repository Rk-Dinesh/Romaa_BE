import IdcodeServices from "../../idcode/idcode.service.js";
import {  GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";
import S3Service from "../tenderdocuments/tenderdocument.service.js";
import WorkOrderDocumentModel from "./workorderdoc.model.js";
import WorkerOrderDocumentService from "./workerorderdoc.service.js";
import { s3Client, uploadFileToS3 } from "../../../../utils/awsBucket.js";
dotenv.config();



export const uploadDocument = async (req, res) => {
  if (!req.file)
    return res.status(400).json({ status: false, message: "No file uploaded" });

  const { tender_id, workOrder_id, uploaded_by, description } = req.body;
  if (!tender_id || !workOrder_id || !uploaded_by) {
    return res.status(400).json({
      status: false,
      message: "tender_id, workOrder_id and uploaded_by are required",
    });
  }

  try {
    const uploadResult = await uploadFileToS3(
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
      workOrder_id,
    };

    const tenderDoc = await WorkOrderDocumentModel.findOneAndUpdate(
      { tender_id, workOrder_id },
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

  const { tender_id, workOrder_id, uploaded_by, description } = req.body;
  if (!tender_id || !workOrder_id || !uploaded_by) {
    return res.status(400).json({
      status: false,
      message: "tender_id, workOrder_id and uploaded_by are required",
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
        workOrder_id,
      });
    }

    // Add all uploaded documents to the tender document record scoped by tender_id and workOrder_id
    const tenderDoc = await WorkOrderDocumentModel.findOneAndUpdate(
      { tender_id, workOrder_id },
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

export const getWorkOrderDocument = async (req, res) => {
  const { tender_id, workOrder_id } = req.params;

  try {
    const tenderDoc = await WorkerOrderDocumentService.getWorkOrderDocumentByTenderId(
      tender_id,
      workOrder_id
    );
    if (!tenderDoc) {
      return res.status(404).json({
        status: false,
        message: "Tender document not found",
      });
    }
    res.status(200).json({ status: true, tender_document: tenderDoc });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getDocumentByTenderIdAndCodeAndWorkOrder = async (req, res) => {
  const { tender_id, workOrder_id, code } = req.params;

  try {
    // Find the tender document scoped by tender_id and workOrder_id and document code in documents array
    const tenderDoc = await WorkOrderDocumentModel.findOne(
      { tender_id, workOrder_id, "documents.code": code },
      { "documents.$": 1, tender_id: 1, workOrder_id: 1 }
    );

    if (!tenderDoc || !tenderDoc.documents.length) {
      return res.status(404).json({ status: false, message: "Document not found" });
    }

    res.status(200).json({
      status: true,
      tender_id: tenderDoc.tender_id,
      workOrder_id: tenderDoc.workOrder_id,
      document: tenderDoc.documents[0],
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getDocumentByTenderIdAndCodeAndWorkOrderaws = async (req, res) => {
  const { tender_id, workOrder_id, code } = req.params;

  try {
    // Find tender document scoped by tender_id and workOrder_id with document code
    const tenderDoc = await WorkOrderDocumentModel.findOne(
      { tender_id, workOrder_id, "documents.code": code },
      { "documents.$": 1, tender_id: 1, workOrder_id: 1 }
    );

    if (!tenderDoc || !tenderDoc.documents.length) {
      return res.status(404).json({
        status: false,
        message: "Document not found",
      });
    }

    const document = tenderDoc.documents[0];

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: document.key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    }); // 1 hour expiry

    // Return document info along with secure access URL
    res.status(200).json({
      status: true,
      tender_id: tenderDoc.tender_id,
      workOrder_id: tenderDoc.workOrder_id,
      document: {
        ...document.toObject(),
        presigned_url: presignedUrl,
      },
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
