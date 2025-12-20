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

  // Helper: Converts a number to letters (1->A, 26->Z, 27->AA)
  static toAlphabeticSequence(num) {
    if (num <= 0) return "";
    let letters = "";
    while (num > 0) {
      num--; // Adjust to 0-indexed for modulo calculation
      letters = String.fromCharCode(65 + (num % 26)) + letters;
      num = Math.floor(num / 26);
    }
    return letters;
  }

  static async generateCode(idname) {
    try {
      // 1. Get current count
      var { idcode, codes } = await this.getCode(idname);
      
      // 2. Increment count for the new item
      codes = codes + 1;

      // 3. Calculate Logic
      // The cycle length is 999 (001 to 999)
      const CYCLE_LIMIT = 999;

      // Calculate the numeric part (1 to 999)
      // We subtract 1 before modulo and add 1 after to handle the 999th item correctly
      let numPart = ((codes - 1) % CYCLE_LIMIT) + 1;

      // Calculate which letter cycle we are in (0=None, 1=A, 2=B...)
      let alphaCycle = Math.floor((codes - 1) / CYCLE_LIMIT);

      // Generate the letter string
      let alphaString = this.toAlphabeticSequence(alphaCycle);

      // Format the number to always be 3 digits (e.g., 1 -> "001")
      let numString = numPart.toString().padStart(3, "0");

      // 4. Construct Final ID (e.g., WBS + A + 001)
      var id = idcode + alphaString + numString;

      // 5. Update DB
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