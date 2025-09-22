import BidModel from "./bid.model.js";
import IdcodeServices from "../../idcode/idcode.service.js";


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
  static async getBidById(bid_id) {
    return await BidModel.findOne({ bid_id });
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
    const idname = "BID_ITEM";
    const idcode = "BITEM";
    await IdcodeServices.addIdCode(idname, idcode);

    const itemCodes = [];
    for (let i = 0; i < csvRows.length; i++) {
      const code = await IdcodeServices.generateCode(idname);
      if (!code) throw new Error("Failed to generate unique item_code");
      itemCodes.push(code);
    }

    const items = csvRows.map((row, idx) => {
      const quantity = Number(row.quantity);
      const base_rate = Number(row.base_rate);
      const q_rate = Number(row.q_rate);
      const n_rate = Number(row.n_rate);

      return {
        item_code: itemCodes[idx],
        item_name: row.item_name,
        description: row.description,
        unit: row.unit,
        quantity,
        base_rate,
        q_rate,
        n_rate,
        base_amount: quantity * base_rate,
        q_amount: quantity * q_rate,
        n_amount: quantity * n_rate,
        remarks: row.remarks
      };
    });

    let bid = await BidModel.findOne({ tender_id });

    if (bid) {
      // Append new items & update totals, etc.
      bid.items.push(...items);
      bid.total_quote_amount = bid.items.reduce((sum, i) => sum + (i.q_amount || 0), 0);
      bid.total_negotiated_amount = bid.items.reduce((sum, i) => sum + (i.n_amount || 0), 0);
      bid.phase = phase || bid.phase;
      bid.revision = parsedRevision || bid.revision;
      bid.prepared_by = prepared_by || bid.prepared_by;
      bid.approved_by = approved_by || bid.approved_by;
      bid.created_by_user = createdByUser || bid.created_by_user;
    } else {
      // New Bid
      const idNameBid = "BID";
      const idCodeBid = "BID";
      await IdcodeServices.addIdCode(idNameBid, idCodeBid);
      const bid_id = await IdcodeServices.generateCode(idNameBid);
      if (!bid_id) throw new Error("Failed to generate BID ID");

      bid = new BidModel({
        bid_id,
        tender_id,
        phase,
        revision: parsedRevision,
        items,
        total_quote_amount: items.reduce((sum, i) => sum + (i.q_amount || 0), 0),
        total_negotiated_amount: items.reduce((sum, i) => sum + (i.n_amount || 0), 0),
        prepared_by,
        approved_by,
        created_by_user: createdByUser,
        prepared_date: new Date(),
        approved_date: new Date()
      });
    }

    return await bid.save();
  }
}

export default BidService;
