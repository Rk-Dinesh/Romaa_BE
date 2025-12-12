import SiteOverheads from "./siteoverhead.model.js";

class SiteOverheadService {
    static async getSiteOverhead(tender_id) {
        console.log(tender_id);
        return await SiteOverheads.findOne({ tenderId : tender_id});
    }
    static async  updateSiteOverhead(tender_id, siteOverhead) {
        return await SiteOverheads.findOneAndUpdate({ tenderId : tender_id}, siteOverhead);
    }   
}

export default SiteOverheadService;