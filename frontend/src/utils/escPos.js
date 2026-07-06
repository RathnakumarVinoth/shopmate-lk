export const ESC_POS_INITIALIZE = Uint8Array.from([0x1b, 0x40])
export const ESC_POS_FULL_CUT = Uint8Array.from([0x1d, 0x56, 0x00])

const byteValue = (value, fallback) => {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 && number <= 255
    ? number
    : fallback
}

export const buildCashDrawerKickCommand = ({
  pin = 0,
  onTime = 25,
  offTime = 250,
} = {}) =>
  Uint8Array.from([
    0x1b,
    0x70,
    pin === 1 ? 1 : 0,
    byteValue(onTime, 25),
    byteValue(offTime, 250),
  ])

const joinBytes = (parts) => {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(length)
  let offset = 0

  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }

  return output
}

export const buildEscPosReceiptCommands = (
  receiptText,
  { openDrawer = false, cutPaper = true, drawer = {} } = {},
) => {
  const encoder = new TextEncoder()
  const parts = [
    ESC_POS_INITIALIZE,
    encoder.encode(`${String(receiptText || '')}\n\n`),
  ]

  if (openDrawer) parts.push(buildCashDrawerKickCommand(drawer))
  if (cutPaper) parts.push(ESC_POS_FULL_CUT)

  return joinBytes(parts)
}
