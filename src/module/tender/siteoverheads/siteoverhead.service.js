import WorkItemModel from "../rateAnalysis/rateanalysis.model.js";
import WorkItemService from "../rateAnalysis/rateanalysis.service.js";
import SiteOverheads from "./siteoverhead.model.js";

class SiteOverheadService {
    static async getSiteOverhead(tender_id) {
       
        const siteOverhead = await SiteOverheads.findOne({ tenderId: tender_id });
        const rateAnalysis = await WorkItemModel.findOne({ tender_id });
        const freeze = rateAnalysis.freeze;
        return {siteOverhead,freeze};
    }
    static async updateSiteOverhead(tender_id, siteOverhead) {
        // Update SiteOverheads document
        const result = await SiteOverheads.findOneAndUpdate(
            { tenderId: tender_id },
            siteOverhead,
            { new: true, upsert: true } // Return updated document
        );

        // Recalculate summary in WorkItemModel
        if (result) {
            await WorkItemService.updateSummaryAfterSiteOverhead(tender_id);
        }

        return result;
    }

}

export default SiteOverheadService;