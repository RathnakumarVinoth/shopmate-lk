const isEnabled = () =>
  String(process.env.ENABLE_WHATSAPP_NOTIFICATIONS || "").toLowerCase() ===
  "true";

const send = async ({ destination }) => {
  if (!isEnabled()) {
    return {
      status: "skipped",
      provider: "whatsapp_placeholder",
      error: "WhatsApp notifications are disabled",
    };
  }

  if (!destination) {
    return {
      status: "skipped",
      provider: "whatsapp_placeholder",
      error: "WhatsApp destination is not configured",
    };
  }

  return {
    status: "skipped",
    provider: "whatsapp_placeholder",
    error: "WhatsApp provider adapter is not connected",
  };
};

module.exports = { send };
