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


app.get('/',(req,res)=>{
    res.send(`Welcome to Romaa Backend`)
})

app.listen(PORT,()=>{
    console.log(`Server is running in port ${PORT}`);
})

