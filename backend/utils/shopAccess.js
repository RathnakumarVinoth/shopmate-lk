const isExpired = (dateValue) =>
  Boolean(dateValue) && new Date(dateValue) < new Date(new Date().toDateString());

const getShopAccessError = (shop) => {
  if (!shop) return { status: 404, message: "Shop not found" };

  if (Number(shop.is_enabled ?? 1) === 0) {
    return { status: 403, message: "Shop disabled" };
  }

  if (shop.subscription_status === "suspended") {
    return { status: 403, message: "Subscription suspended. Contact support." };
  }

  if (shop.subscription_status === "expired" || isExpired(shop.subscription_expiry_date)) {
    return { status: 403, message: "Subscription expired" };
  }

  return null;
};

module.exports = { getShopAccessError };
