import { Router } from "express";
import multer from "multer";
import { addMaterialissued, addMaterialreceived, createMaterial, getMaterialsByTender, uploadMaterialCSV } from "./material.controller.js";


const materialrouter = Router();
const upload = multer({ dest: "uploads/" });


materialrouter.post("/create", createMaterial);
materialrouter.post("/addreceived", addMaterialreceived);
materialrouter.post("/addissued", addMaterialissued);
materialrouter.get("/getall/:tender_id", getMaterialsByTender);
materialrouter.post("/uploadcsv", upload.single("file"), uploadMaterialCSV);



export default materialrouter;