const {
  createFailedRestoreJob,
  createManualBackup,
  getAdminBackupStatus: loadAdminBackupStatus,
  getBackupDownload,
  getBackupHistory,
  getBackupStatus,
  restoreBackup,
} = require("../utils/backupService");
const { createAuditLogFromRequest } = require("../utils/auditLog");

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const optionalText = (value) =>
  value === undefined || value === null || String(value).trim() === ""
    ? null
    : String(value).trim();

const getRestoreTargetShopId = (req) => {
  if (req.user.role === "owner") return Number(req.user.shop_id);

  const requestedShopId = Number(req.body.shop_id);
  if (isPositiveInteger(requestedShopId)) return requestedShopId;

  return null;
};

exports.getStatus = async (req, res) => {
  try {
    const status = await getBackupStatus(req.user.shop_id);
    return res.json({
      message: "Backup status fetched successfully",
      status,
    });
  } catch (error) {
    console.error("Get backup status error:", error.message);
    return res.status(500).json({ message: "Server error while fetching backup status" });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const history = await getBackupHistory(req.user.shop_id);
    return res.json({
      message: "Backup history fetched successfully",
      ...history,
    });
  } catch (error) {
    console.error("Get backup history error:", error.message);
    return res.status(500).json({ message: "Server error while fetching backup history" });
  }
};

exports.createManualBackup = async (req, res) => {
  try {
    const result = await createManualBackup({
      shopId: req.user.shop_id,
      userId: req.user.id,
    });

    await createAuditLogFromRequest(req, {
      action: "backup_create",
      entity_type: "backup_job",
      entity_id: result.job.id,
      description: `Created manual backup ${result.job.file_name}`,
    });

    return res.status(201).json({
      message: "Backup created successfully",
      backup: result.job,
    });
  } catch (error) {
    console.error("Create manual backup error:", error.message);

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return res.status(500).json({ message: "Server error while creating backup" });
  }
};

exports.downloadBackup = async (req, res) => {
  const backupId = Number(req.params.id);

  if (!isPositiveInteger(backupId)) {
    return res.status(400).json({ message: "Valid backup id is required" });
  }

  try {
    const result = await getBackupDownload({
      shopId: req.user.shop_id,
      backupId,
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName.replace(/"/g, "")}"`
    );

    return res.send(result.payloadText);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Download backup error:", error.message);
    return res.status(500).json({ message: "Server error while downloading backup" });
  }
};

exports.restoreBackup = async (req, res) => {
  const targetShopId = getRestoreTargetShopId(req);
  const sourceFileName = optionalText(req.body.file_name);

  if (!isPositiveInteger(targetShopId)) {
    return res.status(400).json({ message: "Valid shop_id is required for restore" });
  }

  try {
    const result = await restoreBackup({
      backupInput: req.body.backup || req.body.backup_json,
      targetShopId,
      userId: req.user.id,
      backupJobId: isPositiveInteger(req.body.backup_job_id)
        ? Number(req.body.backup_job_id)
        : null,
      sourceFileName,
    });

    await createAuditLogFromRequest(req, {
      shop_id: targetShopId,
      action: "backup_restore",
      entity_type: "restore_job",
      entity_id: result.restore.id,
      description: `Restored backup for shop ${targetShopId}`,
    });

    return res.status(201).json({
      message: "Backup restored successfully",
      restore: result.restore,
    });
  } catch (error) {
    if (!error.restoreJobRecorded) {
      await createFailedRestoreJob({
        shopId: targetShopId,
        userId: req.user.id,
        sourceFileName,
        errorMessage: error.message,
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Restore backup error:", error.message);
    return res.status(500).json({ message: "Server error while restoring backup" });
  }
};

exports.getAdminBackupStatus = async (req, res) => {
  try {
    const shops = await loadAdminBackupStatus();
    return res.json({
      message: "Admin backup status fetched successfully",
      shops,
    });
  } catch (error) {
    console.error("Get admin backup status error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching admin backup status" });
  }
};
