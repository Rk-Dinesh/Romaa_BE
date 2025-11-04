import mongoose, { Schema } from "mongoose";

const WorkOrderRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true },
    projectId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    siteDetails: {
      siteName: String,
      location: String,
      siteIncharge: String,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

    // Vendor quotations section with custom quotation ID
    vendorQuotations: [
      new mongoose.Schema(
        {
          quotationId: {
            type: String,
            default: function () {
              // Generate a short readable quotation code (for example: QT-<5 random chars>)
              return `QT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
            },
            unique: false,
          },
          vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
          vendorName: String,
          contact: String,
          quotationDate: { type: Date, default: Date.now },
          quoteItems: [
            {
              materialName: String,
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
            enum: ['Pending', 'Approved', 'Rejected'],
            default: 'Pending',
          },
        },
        { _id: true }
      ),
    ],

    // Selected vendor with reference to approved quotation
    selectedVendor: {
      vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
      vendorName: String,
      approvedQuotationId: { type: Schema.Types.ObjectId },
    },

    // Work order details
    workOrder: {
      workOrderNumber: { type: String, unique: true },
      issueDate: Date,
      approvedAmount: Number,
      termsAndConditions: String,
      startDate: Date,
      expectedCompletionDate: Date,
      progressStatus: {
        type: String,
        enum: ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Cancelled'],
        default: 'Not Started',
      },
      remarks: String,
    },

    // Workflow status
    status: {
      type: String,
      enum: [
        'Request Raised',
        'Quotation Requested',
        'Quotation Received',
        'Vendor Approved',
        'Work Order Issued',
        'Completed',
      ],
      default: 'Request Raised',
    },
  },
  { timestamps: true }
);

const WorkOrderRequestModel = mongoose.model("WorkOrderRequest", WorkOrderRequestSchema);

export default WorkOrderRequestModel;