import { Router } from "express";
import multer from "multer";
import { addMaterialissued, addMaterialreceived, createMaterial, getMaterialsByTender, getRecievedMaterialByTender, updateRequestedQuantity, uploadMaterialCSV } from "./material.controller.js";


const materialrouter = Router();
const upload = multer({ dest: "uploads/" });


materialrouter.post("/create", createMaterial);
materialrouter.post("/addreceived", addMaterialreceived);
materialrouter.post("/addissued", addMaterialissued);
materialrouter.get("/getall/:tender_id", getMaterialsByTender);
materialrouter.post("/uploadcsv", upload.single("file"), uploadMaterialCSV);
materialrouter.get('/received/:tender_id/:item_description', getRecievedMaterialByTender);
materialrouter.put('/updaterequestquantity/:tender_id/:item_description', updateRequestedQuantity);



export default materialrouter;