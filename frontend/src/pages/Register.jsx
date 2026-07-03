import { Link } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo.jsx'
import { t } from '../i18n/translations'

function Register() {
  return (
    <main className="auth-page">
      <div className="auth-stack">
        <BrandLogo full className="auth-brand-logo" />
        <section className="auth-panel">
          <h1>{t('Registration Disabled')}</h1>
          <div className="info-banner">{t('Accounts are created by ShopMate LK admin.')}</div>
          <p className="auth-link">
            <Link to="/shop-login">{t('Go to shop login')}</Link>
          </p>
        </section>
      </div>
    </main>
  )
}

export default Register
