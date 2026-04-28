import mongoose, { Schema } from "mongoose";
import { auditPlugin } from "../../audit/auditlog.plugin.js";

const WorkOrderRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true },
    projectId: { type: String, required: true },
    tender_name: { type: String, default: "" },
    tender_project_name: { type: String, default: "" },
    title: { type: String, required: true },
    description: { type: String, required: true },
    siteDetails: {
      siteName: String,
      location: String,
      siteIncharge: String,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    requestDate: { type: Date, default: Date.now },
    requiredByDate: Date,

    // Material requirements
    materialsRequired: [
      {
        materialName: String,
        detailedDescription: String,
        boqDescription: { type: String, default: "" },
        quantity: Number,
        unit: String,
        ex_quantity: Number,
      },
    ],

     permittedContractor: [
      {
        contractorId: String,
        contractorName: String,
        contractorContact: String,
        contractorAddress: String,
      },
    ],

    // Contractor quotations section with custom quotation ID // contractorId default , delivery period,
    contractorQuotations: [
      new mongoose.Schema(
        {
          quotationId: {
            type: String,
            default: function () {
              // Generate a short readable quotation code (for example: QT-<5 random chars>)
              return `QT-${Math.random()
                .toString(36)
                .substring(2, 7)
                .toUpperCase()}`;
            },
            unique: false,
          },
          contractorId: String,
          contractorName: String,
          contact: String,
          address: String,
          quotationDate: { type: Date, default: Date.now },
          quoteItems: [
            {
              materialName: String,
              detailedDescription: String,
              unit: String,
              quotedUnitRate: Number,
              quantity: Number,
              totalAmount: Number,
            },
          ],
          totalQuotedValue: Number,
          paymentTerms: String,
          deliveryPeriod: String,
          remarks: String,
          approvalStatus: {
            type: String,
            enum: ["Pending", "Approved", "Rejected"],
            default: "Pending",
          },
        },
        { _id: true }
      ),
    ],

    // Selected contractor with reference to approved quotation
    selectedContractor: {
      contractorId: String,
      contractorName: String,
      approvedQuotationId: { type: Schema.Types.ObjectId },
    },

    // Work order details
    workOrder: {
      issueDate: Date,
      approvedAmount: Number,
      termsAndConditions: String,
      startDate: Date,
      expectedCompletionDate: Date,
      progressStatus: {
        type: String,
        enum: [
          "Not Started",
          "In Progress",
          "Completed",
          "On Hold",
          "Cancelled",
        ],
        default: "Not Started",
      },
      remarks: String,
    },

    // Workflow status
    status: {
      type: String,
      enum: [
        "Request Raised",
        "Quotation Requested",
        "Quotation Received",
        "Contractor Approved",
        "Work Order Issued",
        "Completed",
      ],
      default: "Request Raised",
    },
  },
  { timestamps: true }
);

WorkOrderRequestSchema.plugin(auditPlugin, { entity_type: "WorkOrderRequest", entity_no_field: "requestId" });

const WorkOrderRequestModel = mongoose.model(
  "WorkOrderRequest",
  WorkOrderRequestSchema
);

export default WorkOrderRequestModel;