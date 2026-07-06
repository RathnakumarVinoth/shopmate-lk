const crypto = require("crypto");

const {
  recordErrorLog,
  recordFailedApiRequest,
} = require("../utils/monitoringService");
const { redactText } = require("../utils/logSanitizer");

const createRequestId = (req) => {
  const supplied = req.headers?.["x-request-id"];
  if (supplied) {
    const sanitized = redactText(supplied)
      .replace(/[^A-Za-z0-9_.:-]/g, "")
      .slice(0, 64);
    if (sanitized) return sanitized;
  }

  return crypto.randomUUID();
};

const requestMonitoring = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const requestId = createRequestId(req);

  req.monitoringRequestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    setImmediate(() => {
      recordFailedApiRequest({ req, res, startedAt, requestId });
    });
  });

  next();
};

const notFoundHandler = (req, res) =>
  res.status(404).json({ message: "API endpoint not found" });

const errorHandler = async (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const candidateStatus = Number(error.statusCode || error.status || 500);
  const statusCode =
    Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
      ? candidateStatus
      : 500;

  if (statusCode >= 500) {
    await recordErrorLog({
      error,
      req,
      statusCode,
      requestId: req.monitoringRequestId,
    });
    res.locals.monitoringErrorLogged = true;
  }

  const response = {
    message:
      statusCode >= 500
        ? "Unexpected server error"
        : redactText(error.message || "Request failed"),
    request_id: req.monitoringRequestId,
  };

  if (process.env.NODE_ENV !== "production" && statusCode >= 500) {
    response.error = redactText(error.message || "Unexpected server error");
  }

  return res.status(statusCode).json(response);
};

module.exports = {
  errorHandler,
  notFoundHandler,
  requestMonitoring,
};
