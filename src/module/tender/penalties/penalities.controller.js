import PenaltyService from "./penalities.service.js";


/**
 * Add a penalty
 */
export const addPenalty = async (req, res) => {
  try {
    const penaltyData = req.body; // expects tender_id and penalty details
    const result = await PenaltyService.addPenalty(penaltyData);
    res.status(201).json({
      status: true,
      message: "Penalty added successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

/**
 * Get penalties by tender_id
 */
export const getPenalties = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const result = await PenaltyService.getPenaltiesByTender(tender_id);
    if (!result) {
      return res.status(404).json({ status: false, message: "No penalties found" });
    }
    res.status(200).json({ status: true, data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

/**
 * Update a penalty by penalty_id
 */
export const updatePenalty = async (req, res) => {
  try {
    const { tender_id, penalty_id } = req.params;
    const updateData = req.body;
    const result = await PenaltyService.updatePenalty(tender_id, penalty_id, updateData);
    res.status(200).json({ status: true, message: "Penalty updated", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

/**
 * Remove a penalty by penalty_id
 */
export const removePenalty = async (req, res) => {
  try {
    const { tender_id, penalty_id } = req.params;
    const result = await PenaltyService.removePenalty(tender_id, penalty_id);
    res.status(200).json({ status: true, message: "Penalty removed", data: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

/**
 * Get paginated penalties with optional search
 */
export const getPaginatedPenalties = async (req, res) => {
  try {
    const { tender_id } = req.params;
    const { page = 1, limit = 10, search = "" } = req.query;

    const result = await PenaltyService.getPenaltiesPaginated(
      tender_id,
      parseInt(page),
      parseInt(limit),
      search
    );

    res.json({
      status: true,
      total: result.total,
      data: result.penalties,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server Error" });
  }
};
