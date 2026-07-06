const isEnabled = () =>
  String(process.env.ENABLE_SMS_NOTIFICATIONS || "").toLowerCase() === "true";

const send = async ({ destination }) => {
  if (!isEnabled()) {
    return {
      status: "skipped",
      provider: "sms_placeholder",
      error: "SMS notifications are disabled",
    };
  }

  if (!destination) {
    return {
      status: "skipped",
      provider: "sms_placeholder",
      error: "SMS destination is not configured",
    };
  }

  return {
    status: "skipped",
    provider: "sms_placeholder",
    error: "SMS provider adapter is not connected",
  };
};

module.exports = { send };
