// src/components/common/LanguageSwitcher.jsx
import React from 'react';
import { useTranslation, LANGUAGES } from '../../i18n';

/**
 * Compact language picker. Drop it anywhere (header, login page, etc.).
 * Pass `compact` for the icon-only variant.
 */
export default function LanguageSwitcher({ compact = false, className = '' }) {
  const { lang, setLanguage, t } = useTranslation();

  return (
    <div className={`flex items-center ${className}`}>
      {!compact && (
        <span className="text-xs text-gray-500 mr-2 rtl:mr-0 rtl:ml-2">
          {t('common.language')}:
        </span>
      )}
      <select
        aria-label={t('common.language')}
        value={lang}
        onChange={(e) => setLanguage(e.target.value)}
        className="text-sm bg-transparent border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
      >
        {Object.values(LANGUAGES).map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
