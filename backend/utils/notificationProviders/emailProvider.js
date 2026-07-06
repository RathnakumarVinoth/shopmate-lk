const isEnabled = () =>
  String(process.env.ENABLE_EMAIL_NOTIFICATIONS || "").toLowerCase() === "true";

const send = async ({ destination }) => {
  if (!isEnabled()) {
    return {
      status: "skipped",
      provider: "email_placeholder",
      error: "Email notifications are disabled",
    };
  }

  if (!process.env.NOTIFICATION_FROM_EMAIL || !destination) {
    return {
      status: "skipped",
      provider: "email_placeholder",
      error: "Email provider configuration is incomplete",
    };
  }

  return {
    status: "skipped",
    provider: "email_placeholder",
    error: "Email provider adapter is not connected",
  };
};

module.exports = { send };
