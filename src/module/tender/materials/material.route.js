import { Router } from "express";
import multer from "multer";
import { createMaterial, getMaterialsByTender, uploadMaterialCSV } from "./material.controller.js";


const materialrouter = Router();
const upload = multer({ dest: "uploads/" });


materialrouter.post("/create", createMaterial);
materialrouter.get("/getall/:tender_id", getMaterialsByTender);
materialrouter.post("/uploadcsv", upload.single("file"), uploadMaterialCSV);



export default materialrouter;
