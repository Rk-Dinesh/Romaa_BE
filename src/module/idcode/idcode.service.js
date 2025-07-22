import logger from "../../config/logger.js";
import IdcodeModel from "./idcode.mode.js";

class IdcodeServices {
  static async getCode(idname) {
    try {
      return await IdcodeModel.findOne({ idname });
    } catch (error) {
      logger.error("error while get a code" + error);
    }
  }
  static async updateCode(idname, codes) {
    try {
      var query = { idname: idname };
      var values = { $set: { codes: codes } };
      return await IdcodeModel.updateOne(query, values);
    } catch (error) {
      logger.error("error while updating a code" + error);
      console.log("Error in updating Code");
    }
  }
  static async generateCode(idname) {
    try {
      var id = "";
      var { idcode, codes } = await this.getCode(idname);
      codes = codes + 1;
      if (codes < 10) {
        id = idcode + "00" + codes;
      } else if (codes < 100) {
        id = idcode + "0" + codes;
      } else {
        id = idcode + codes;
      }
      console.log(id);
      await this.updateCode(idname, codes);
      return id;
    } catch (error) {
      logger.error("error while generating a code" + error);
      console.log("Error in generating Code");
    }
  }
  static async addIdCode(idname, idcode) {
    try {
      const existingCode = await IdcodeModel.findOne({ idname });
      if (existingCode) {
        logger.warn(`Id code with idname ${idname} already exists.`);
        return existingCode;
      }
      const newIdCode = new IdcodeModel({
        idname,
        idcode,
        codes: 0,
      });
      return await newIdCode.save();
    } catch (error) {
      logger.error("error while adding a new id code" + error);
      console.log("Error in adding Id Code");
    }
  }
}
export default IdcodeServices;
