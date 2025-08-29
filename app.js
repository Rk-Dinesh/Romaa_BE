import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from "cookie-parser";
import bodyParser from 'body-parser';
import connectDB from './src/config/db.js';
import roleRoute from './src/module/role/role.route.js';
import morgan from 'morgan';
import logger from './src/config/logger.js';
import userRoute from './src/module/user/user.route.js';
import authRoute from './src/module/auth/auth.route.js';
import clientRoute from './src/module/clients/client.route.js';
import employeeRoute from './src/module/employee/employee.route.js';
import vendorRoute from './src/module/purchase/vendor/vendor.route.js';
import tenderrouter from './src/module/tender/tender/tender.route.js';
import boqrouter from './src/module/tender/boq/boq.route.js';
import permittedrouter from './src/module/tender/vendorpermitted/permittedvendor.route.js';
import emdrouter from './src/module/tender/emd/emd.route.js';
import contractorRoute from './src/module/hr/contractors/contractor.route.js';
import contractworkerrouter from './src/module/hr/contractemployee/contractemployee.route.js';
import permittedcontractworkerrouter from './src/module/tender/contractworker/contractworker.route.js';
import tenderDocRouter from './src/module/documents/tenderdocuments/tenderdocument.route.js';
import workOrderDocRouter from './src/module/documents/workorderdocuments/workorderdoc.route.js';
import penaltyRouter from './src/module/tender/penalties/penalities.route.js';



dotenv.config();

const PORT = process.env.PORT;

const app = express();
connectDB();

//middleware
app.use(cookieParser());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

 //Add Morgan Middleware for Logging
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()), 
    },
  }),
);

logger.info('Server started successfully');

app.use('/role',roleRoute);
app.use('/user',userRoute)
app.use('/auth', authRoute);
app.use('/client',clientRoute);
app.use('/employee', employeeRoute);
app.use('/vendor',vendorRoute);
app.use('/tender', tenderrouter);
app.use('/boq',boqrouter);
app.use('/permittedvendor',permittedrouter);
app.use ('/permittedcontractor',permittedcontractworkerrouter)
app.use('/emd',emdrouter);
app.use('/contractor',contractorRoute);
app.use('/contractworker',contractworkerrouter);
app.use ("/document",tenderDocRouter);
app.use ("/workorderdocument",workOrderDocRouter);
app.use("/penalty",penaltyRouter);


app.get('/',(req,res)=>{
    res.send(`Welcome to Romaa Backend`)
})

app.listen(PORT,()=>{
    console.log(`Server is running in port ${PORT}`);
})

