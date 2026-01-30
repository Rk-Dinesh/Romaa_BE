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
import employeeRoute from './src/module/hr/employee/employee.route.js';
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
import rateanalysisrouter from './src/module/tender/rateAnalysis/rateanalysis.route.js';
import detailedestrouter from './src/module/tender/detailedestimate/detailedestimate.route.js';
import bidRouter from './src/module/tender/bid/bid.route.js';
import schedulerouter from './src/module/project/schedule/schedule.route.js';
import workOrderRequestrouter from './src/module/project/workorderReqIssue/workorderReqIssue.route.js';
import materialrouter from './src/module/tender/materials/material.route.js';
import purhcaseRequestrouter from './src/module/purchase/purchaseorderReqIssue/purchaseReqIssue.route.js';
import machineryrouter from './src/module/assets/machinery/machineryasset.route.js';
import siteoverheadrouter from './src/module/tender/siteoverheads/siteoverhead.route.js';
import rateanalysisquantitesrouter from './src/module/tender/rateanalyisquantites/rateanalysisquantites.route.js';
import scheduleLiteRouter from './src/module/project/scheduleNew/schedulelite/schedulelite.route.js';
import workDoneRouter from './src/module/site/workdone/workdone.route.js';
import billingEstimateRouter from './src/module/project/clientbilling/estimate/billingestimate.route.js';
import billingRouter from './src/module/project/clientbilling/billing/billing.router.js';
import steelestimaterouter from './src/module/project/clientbilling/steelestimate/steelestimate.route.js';




dotenv.config();
const PORT = process.env.PORT;

const app = express();
connectDB();


//middleware

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000","https://relaxed-starburst-6352fa.netlify.app/"], // 👈 ALLOW ONLY YOUR FRONTEND URL
    credentials: true, // 👈 ALLOW COOKIES
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(cookieParser(process.env.ACCESS_TOKEN_SECRET)); //Secure Cookie Parser
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));





//Add Morgan Middleware for Logging
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }),
);

logger.info('Server started successfully');

app.use('/role', roleRoute);
app.use('/user', userRoute)
app.use('/auth', authRoute);
app.use('/client', clientRoute);
app.use('/employee', employeeRoute);
app.use('/vendor', vendorRoute);
app.use('/tender', tenderrouter);
app.use('/boq', boqrouter);
app.use('/bid', bidRouter);
app.use('/permittedvendor', permittedrouter);
app.use('/permittedcontractor', permittedcontractworkerrouter)
app.use('/emd', emdrouter);
app.use('/contractor', contractorRoute);
app.use('/contractworker', contractworkerrouter);
app.use("/document", tenderDocRouter);
app.use("/workorderdocument", workOrderDocRouter);
app.use("/penalty", penaltyRouter);
app.use("/rateanalysis", rateanalysisrouter);
app.use('/detailedestimate', detailedestrouter);
app.use('/schedule', schedulerouter);
app.use('/workorderrequest', workOrderRequestrouter);
app.use('/purchaseorderrequest', purhcaseRequestrouter);
app.use('/material', materialrouter);
app.use('/machineryasset', machineryrouter);
app.use('/siteoverhead', siteoverheadrouter);
app.use('/raquantities', rateanalysisquantitesrouter);
app.use('/schedulelite', scheduleLiteRouter);
app.use('/workdone', workDoneRouter);
app.use('/billing', billingEstimateRouter);
app.use('/clientbilling', billingRouter)
app.use('/steelestimate', steelestimaterouter)

app.get('/', (req, res) => {
  res.send(`Welcome to Romaa Backend`)
})

app.listen(PORT, () => {
  console.log(`Server is running in port ${PORT}`);
})

