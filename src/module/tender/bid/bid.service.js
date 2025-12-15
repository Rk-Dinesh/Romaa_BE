import BidModel from "./bid.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";
import DetailedEstimateModel from "../detailedestimate/detailedestimate.model.js";
import BoqModel from "../boq/boq.model.js";
import mongoose from "mongoose";


class BidService {
  // Create new Bid
  static async addBid(bidData) {
    const idname = "BID";
    const idcode = "BID";
    await IdcodeServices.addIdCode(idname, idcode);
    const bid_id = await IdcodeServices.generateCode(idname);
    if (!bid_id) throw new Error("Failed to generate BID ID");

    // Calculate total_quote_amount and total_negotiated_amount
    if (bidData.items && bidData.items.length > 0) {
      bidData.items = bidData.items.map(item => ({
        ...item,
        base_amount: item.quantity * (item.base_rate || 0),
        q_amount: item.quantity * (item.q_rate || 0),
        n_amount: item.quantity * (item.n_rate || 0),
      }));
      bidData.total_quote_amount = bidData.items.reduce(
        (sum, item) => sum + (item.q_amount || 0),
        0
      );
      bidData.total_negotiated_amount = bidData.items.reduce(
        (sum, item) => sum + (item.n_amount || 0),
        0
      );
    }

    const bid = new BidModel({ bid_id, ...bidData });
    const savedBid = await bid.save();
    return savedBid;
  }

  // Get all bids
  static async getAllBids() {
    return await BidModel.find();
  }

  // Get Bid by ID
  static async getBidById(tender_id) {
    return await BidModel.findOne({ tender_id });
  }

  // Update Bid
  static async updateBid(bid_id, updateData) {
    if (updateData.items && updateData.items.length > 0) {
      updateData.items = updateData.items.map(item => ({
        ...item,
        base_amount: item.quantity * (item.base_rate || 0),
        q_amount: item.quantity * (item.q_rate || 0),
        n_amount: item.quantity * (item.n_rate || 0),
      }));
      updateData.total_quote_amount = updateData.items.reduce(
        (sum, item) => sum + (item.q_amount || 0), 0
      );
      updateData.total_negotiated_amount = updateData.items.reduce(
        (sum, item) => sum + (item.n_amount || 0), 0
      );
    }
    return await BidModel.findOneAndUpdate({ bid_id }, { $set: updateData }, { new: true });
  }

  // Delete Bid
  static async deleteBid(bid_id) {
    return await BidModel.findOneAndDelete({ bid_id });
  }

  // Add single item to Bid
  static async addItemToBid(bid_id, item) {
    item.base_amount = item.quantity * (item.base_rate || 0);
    item.q_amount = item.quantity * (item.q_rate || 0);
    item.n_amount = item.quantity * (item.n_rate || 0);

    const bid = await BidModel.findOneAndUpdate(
      { bid_id },
      {
        $push: { items: item },
        $inc: {
          total_quote_amount: item.q_amount || 0,
          total_negotiated_amount: item.n_amount || 0
        }
      },
      { new: true }
    );
    if (!bid) throw new Error("Bid not found");
    return bid;
  }

  // Remove item by item_code
  static async removeItemFromBid(bid_id, item_code) {
    const bid = await BidModel.findOne({ bid_id });
    if (!bid) throw new Error("Bid not found");
    bid.items = bid.items.filter(item => item.item_code !== item_code);
    bid.total_quote_amount = bid.items.reduce(
      (sum, item) => sum + (item.q_amount || 0), 0
    );
    bid.total_negotiated_amount = bid.items.reduce(
      (sum, item) => sum + (item.n_amount || 0), 0
    );
    return await bid.save();
  }

  static async bulkInsert(
    csvRows,
    createdByUser,
    tender_id,
    phase = "",
    parsedRevision = 1,
    prepared_by = "",
    approved_by = ""
  ) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // ---------- Prepare BID items (no item_code) ----------
      const items = csvRows.map((row) => {
        const quantity = Number(row.quantity || 0);
        const base_rate = Number(row.base_rate || 0);
        const q_rate = Number(row.q_rate || 0);
        const n_rate = Number(row.n_rate || 0);

        const base_amount = Number((quantity * base_rate).toFixed(2));
        const q_amount = Number((quantity * q_rate).toFixed(2));
        const n_amount = Number((quantity * n_rate).toFixed(2));

        return {
          item_id: row.item_id,
          item_name: row.item_name,
          description: row.description,
          unit: row.unit,
          quantity,
          base_rate: Number(base_rate.toFixed(2)),
          q_rate: Number(q_rate.toFixed(2)),
          n_rate: Number(n_rate.toFixed(2)),
          base_amount,
          q_amount,
          n_amount,
          remarks: row.remarks,
        };
      });

      // ---------- DetailedEstimate update ----------
      const detailItems = csvRows.map((row) => ({
        item_id: row.item_id,
        item_name: row.item_name,
        unit: row.unit,
      }));

      const detail = await DetailedEstimateModel.findOne({ tender_id }).session(
        session
      );

      if (detail?.detailed_estimate?.length) {
        const bill = detail.detailed_estimate[0];

        if (!Array.isArray(bill.billofqty) || bill.billofqty.length === 0) {
          bill.billofqty = [...detailItems];
        } else {
          bill.billofqty = detailItems;
        }

        await detail.save({ session });
      }

      // ---------- BOQ creation / update ----------
      const boqItems = csvRows.map((row) => {
        const quantity = Number(row.quantity || 0);
        const n_rate = Number(row.n_rate || 0);
        const n_amount = Number((quantity * n_rate).toFixed(2));

        return {
          item_id: row.item_id,
          item_name: row.item_name,
          description: row.description,
          specifications: row.specifications,
          unit: row.unit,
          quantity,
          n_rate: Number(n_rate.toFixed(2)),
          n_amount,
          remarks: row.remarks,
        };
      });

      let boq = await BoqModel.findOne({ tender_id }).session(session);

      if (boq) {
        if (!Array.isArray(boq.items) || boq.items.length === 0) {
          boq.items = [...boqItems];
        } else {
          boq.items = boqItems;
        }
      } else {
        boq = new BoqModel({
          tender_id,
          status: "DRAFT",
          items: boqItems,
          created_by_user: createdByUser,
        });
      }

      // RESET ALL TOTAL FIELDS WHEN REPLACING
      boq.boq_total_amount = 0;
      boq.zero_cost_total_amount = 0;
      boq.variance_amount = 0;
      boq.variance_percentage = 0;
      boq.consumable_material = 0;
      boq.bulk_material = 0;
      boq.total_material_amount = 0;
      boq.machinery = 0;
      boq.fuel = 0;
      boq.total_machine_amount = 0;
      boq.contractor = 0;
      boq.nmr = 0;
      boq.total_labor_amount = 0;


      await boq.save({ session });

      // ---------- BID creation / update ----------
      let bid = await BidModel.findOne({ tender_id }).session(session);

      if (bid) {
        // replace existing items instead of pushing
        bid.items = items;

        bid.total_quote_amount = Number(
          items.reduce((sum, i) => sum + (i.q_amount || 0), 0).toFixed(2)
        );
        bid.total_negotiated_amount = Number(
          items.reduce((sum, i) => sum + (i.n_amount || 0), 0).toFixed(2)
        );
        bid.phase = phase || bid.phase;
        bid.revision = parsedRevision || bid.revision;
        bid.prepared_by = prepared_by || bid.prepared_by;
        bid.approved_by = approved_by || bid.approved_by;
        bid.created_by_user = createdByUser || bid.created_by_user;
      } else {
        const idNameBid = "BID";
        const idCodeBid = "BID";
        await IdcodeServices.addIdCode(idNameBid, idCodeBid);
        const bid_id = await IdcodeServices.generateCode(idNameBid);
        if (!bid_id) throw new Error("Failed to generate BID ID");

        const total_quote_amount = Number(
          items.reduce((sum, i) => sum + (i.q_amount || 0), 0).toFixed(2)
        );
        const total_negotiated_amount = Number(
          items.reduce((sum, i) => sum + (i.n_amount || 0), 0).toFixed(2)
        );

        bid = new BidModel({
          bid_id,
          tender_id,
          phase,
          revision: parsedRevision,
          items,
          total_quote_amount,
          total_negotiated_amount,
          prepared_by,
          approved_by,
          created_by_user: createdByUser,
          prepared_date: new Date(),
          approved_date: new Date(),
        });
      }

      await bid.save({ session });

      await session.commitTransaction();
      session.endSession();
      return bid;
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  }



}

export default BidService;
