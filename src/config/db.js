import mongoose from'mongoose';
import dotenv from 'dotenv';
import { seedDatabase } from '../../utils/seed.js';
dotenv.config();

const connectDB = async () => {
  try {
    const db = await mongoose.connect(process.env.MONGO_URI);
    console.log(`Database Connected to Host : ${db.connection.host}`);
    await seedDatabase();
  } catch (error) {
    console.log("DataBase Failed to Connect");
    process.exit(1);
  }
};

export default connectDB;
