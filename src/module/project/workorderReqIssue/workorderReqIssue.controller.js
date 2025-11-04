import WorkOrderRequestService from "./workorderReqIssue.service.js";


export const createWorkOrderRequest = async (req, res) => {
  try {
    const result = await WorkOrderRequestService.create(req.body);
    res.status(201).json({ message: 'WorkOrderRequest created successfully', data: result });
  } catch (error) {
    res.status(400).json({ message: 'Error creating WorkOrderRequest', error: error.message });
  }
};

export const getWorkOrderByProjectAndRequestId = async (req, res) => {
  try {
    const { projectId, requestId } = req.params;
    const workOrder = await WorkOrderRequestService.getByProjectAndRequestId(projectId, requestId);

    if (!workOrder) {
      return res.status(404).json({ message: 'WorkOrderRequest not found' });
    }
    res.status(200).json({ data: workOrder });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching WorkOrderRequest', error: error.message });
  }
};

export const getAllWorkOrdersByProjectId = async (req, res) => {
  try {
    const { projectId } = req.params;
    const workOrders = await WorkOrderRequestService.getAllByProjectIdWithFields(projectId);
    res.status(200).json({ data: workOrders });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching WorkOrderRequests', error: error.message });
  }
};

export const getAllWorkOrdersBySelectedVendor = async (req, res) => {
  try {
    const { projectId } = req.params;
    const workOrders = await WorkOrderRequestService.getAllByProjectIdSelectedVendor(projectId);
    res.status(200).json({ data: workOrders });
  } catch (error) {
    res.status(400).json({ message: 'Error fetching WorkOrderRequests', error: error.message });
  }
};