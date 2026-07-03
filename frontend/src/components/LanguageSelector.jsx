import { useEffect, useState } from 'react'
import {
  getLanguage,
  languageOptions,
  setLanguage,
  t,
} from '../i18n/translations'

const languageKey = {
  en: 'English',
  si: 'Sinhala',
  ta: 'Tamil',
}

function LanguageSelector({ compact = false, onLanguageChange }) {
  const [currentLanguage, setCurrentLanguage] = useState(getLanguage())

  useEffect(() => {
    const handleLanguageChange = () => setCurrentLanguage(getLanguage())
    window.addEventListener('shopmate:language-changed', handleLanguageChange)
    return () => window.removeEventListener('shopmate:language-changed', handleLanguageChange)
  }, [])

  const changeLanguage = (event) => {
    const language = setLanguage(event.target.value)
    setCurrentLanguage(language)
    onLanguageChange?.(language)
  }

  return (
    <label className={`language-selector ${compact ? 'compact' : ''}`}>
      <span>{t('Language')}</span>
      <select
        value={currentLanguage}
        onChange={changeLanguage}
        aria-label={t('Language')}
      >
        {languageOptions.map((language) => (
          <option key={language.value} value={language.value}>
            {compact ? language.value.toUpperCase() : t(languageKey[language.value])}
          </option>
        ))}
      </select>
    </label>
  )
}

export default LanguageSelector
