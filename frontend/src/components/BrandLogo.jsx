function BrandLogo({ className = '', full = false, decorative = false }) {
  const source = full
    ? '/shopmate-lk-logo-transparent.png'
    : '/shopmate-icon-192.png'

  return (
    <img
      className={`brand-logo ${full ? 'brand-logo-full' : 'brand-logo-icon'} ${className}`.trim()}
      src={source}
      alt={decorative ? '' : 'ShopMate LK'}
    />
  )
}

export default BrandLogo
