import mongoose, { Schema } from "mongoose";

const PurchaseRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String},
    projectId: { type: String, required: true },
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
        quantity: Number,
        unit: String,
      },
    ],

    permittedVendor: [
      {
        vendorId: String,
        vendorName: String,
        vendorContact: String,
        vendorAddress: String,
      },
    ],

    // Vendor quotations section with custom quotation ID // vendorId default , delivery period,
    vendorQuotations: [
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
          vendorId: String,
          vendorName: String,
          contact: String,
          address: String,
          quotationDate: { type: Date, default: Date.now },
          quoteItems: [
            {
              materialName: String,
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

    // Selected vendor with reference to approved quotation
    selectedVendor: {
      vendorId: String,
      vendorName: String,
      approvedQuotationId: { type: Schema.Types.ObjectId },
    },

    //  details
    purchaseOrder: {
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
        "Vendor Approved",
        "Purchase Order Issued",
        "Completed",
      ],
      default: "Request Raised",
    },
  },
  { timestamps: true }
);

const PurchaseRequestModel = mongoose.model(
  "PurchaseRequest",
  PurchaseRequestSchema
);

export default PurchaseRequestModel;