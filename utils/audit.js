import { AuditLog } from "../models/restaurantModel.js";

export const recordAudit = async (req, action, entity, entityId = null, details = null, transaction = undefined) => {
  try {
    await AuditLog.create({
      userId: req.session?.userId || null,
      action,
      entity,
      entityId: entityId === null ? null : String(entityId),
      details,
      ipAddress: req.ip
    }, transaction ? { transaction } : undefined);
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
};
