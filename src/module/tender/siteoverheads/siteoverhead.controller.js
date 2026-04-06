import SiteOverheadService from "./siteoverhead.service.js";

export const getSiteOverhead = async (req, res) => {
    try {
        const siteOverhead = await SiteOverheadService.getSiteOverhead(req.params.tender_id);
        if (!siteOverhead) {
            return res.status(404).json({ status: false, message: "Site overhead record not found for this tender. Please verify the Tender ID and try again." });
        }
        res.status(200).json({ status: true, data: siteOverhead });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
};

export const updateSiteOverhead = async (req, res) => {
    try {
        const siteOverhead = await SiteOverheadService.updateSiteOverhead(req.params.tender_id, req.body);
        if (!siteOverhead) {
            return res.status(404).json({ status: false, message: "Site overhead record not found for this tender. Update could not be completed." });
        }
        res.status(200).json({ status: true, message: "Site overhead details updated successfully.", data: siteOverhead });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
};
