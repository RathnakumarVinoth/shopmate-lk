export const formatMoney = (value) =>
  new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

export const getApiMessage = (error, fallback) => {
  const data = error.response?.data

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return data.errors.join(', ')
  }

  return data?.message || fallback
}

export const notifyDashboardChanged = () => {
  window.dispatchEvent(new Event('shopmate:data-changed'))
}
