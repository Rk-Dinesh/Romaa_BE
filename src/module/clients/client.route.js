import { Router } from 'express';
import {
  createClient,
  getClientById,
  getAllClients,
  updateClientById,
  deleteClientById
} from './client.controller.js';

const clientRoute = Router();

clientRoute.post('/addclient', createClient); // Create
clientRoute.get('/getbyclientid', getClientById); // Read single
clientRoute.get('/getallclients', getAllClients); // Read all
clientRoute.put('/updatebyclientid', updateClientById); // Update
clientRoute.delete('/deletebyclientid', deleteClientById); // Delete

export default clientRoute;
