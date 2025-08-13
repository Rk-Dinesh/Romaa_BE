import BoqService from "./boq.service.js";

export const createBoq = async (req, res) => {
  try {
    const result = await BoqService.addBoq(req.body);
    res.status(201).json({ status: true, message: "BOQ created successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const addOrUpdateBoqItem = async (req, res) => {
  try {
    const result = await BoqService.addOrUpdateBoqItem(req.body);
    res.status(200).json({
      status: true,
      message: "BOQ item(s) added/updated successfully",
      data: result,
    });
  } catch (error) {
    console.log(error.message);
    
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const getAllBoqs = async (req, res) => {
  try {
    const result = await BoqService.getAllBoqs();
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getBoqById = async (req, res) => {
  try {
    const result = await BoqService.getBoqById(req.params.boq_id);
    if (!result) return res.status(404).json({ status: false, message: "BOQ not found" });
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateBoq = async (req, res) => {
  try {
    const result = await BoqService.updateBoq(req.params.boq_id, req.body);
    res.status(200).json({ status: true, message: "BOQ updated successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const addItemToBoq = async (req, res) => {
  try {
    const result = await BoqService.addItemToBoq(req.params.boq_id, req.body);
    res.status(200).json({ status: true, message: "Item added to BOQ", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const removeItemFromBoq = async (req, res) => {
  try {
    const result = await BoqService.removeItemFromBoq(req.params.boq_id, req.params.item_code);
    res.status(200).json({ status: true, message: "Item removed from BOQ", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const deleteBoq = async (req, res) => {
  try {
    const result = await BoqService.deleteBoq(req.params.boq_id);
    res.status(200).json({ status: true, message: "BOQ deleted successfully", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};


export const getBoqItemsPaginated = async (req, res) => {
  try {
    const tender_id = req.params.tender_id;  // from URL
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const data = await BoqService.getBoqItemsPaginated(
      tender_id,
      page,
      limit,
      search
    );

    res.status(200).json({
      status: true,
      currentPage: page,
      totalPages: Math.ceil(data.total / limit),
      totalRecords: data.total,
      data: data.items
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getBoqByTenderId = async (req, res) => {
  try {
    const boq = await BoqService.findBoqByTenderId(req.params.tender_id);
   if (!boq) {
      return res.status(200).json({
        status: true,
        data: {} 
      });
    }
    res.status(200).json({ status: true, data: boq });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};