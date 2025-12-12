import SiteOverheadService from "./siteoverhead.service.js";

export const getSiteOverhead = async (req, res) => {
    try {
        const siteOverhead = await SiteOverheadService.getSiteOverhead(req.params.tender_id);
        if (!siteOverhead) {
            return res.status(404).json({ message: "Site overhead not found" });
        }
        res.json(siteOverhead);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const updateSiteOverhead = async (req, res) => {
    try {
        const siteOverhead = await SiteOverheadService.updateSiteOverhead(req.params.tender_id, req.body);
        if (!siteOverhead) {
            return res.status(404).json({ message: "Site overhead not found" });
        }
        res.json(siteOverhead);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};
