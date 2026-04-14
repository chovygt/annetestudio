import PampasDecor from './PampasDecor.jsx'

const LOGO_SRC = '/images/logo-anneth.png'
const INSTAGRAM_HREF = 'https://www.instagram.com/anneth.bs'

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-layout">
      <div className="auth-visual" aria-hidden>
        <div className="auth-visual-gradient" />
        <PampasDecor />
        <p className="auth-visual-quote">
          Natural · elegancia · cuidado
        </p>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <header className="auth-brand">
            <img
              src={LOGO_SRC}
              width={220}
              height={120}
              className="auth-logo"
              alt="Anneth Beauty Studio"
            />
            {subtitle ? <p className="auth-eyebrow">{subtitle}</p> : null}
            <h1 className="auth-title">{title}</h1>
          </header>

          <div className="auth-body">{children}</div>

          <footer className="auth-footer">
            <a
              className="auth-instagram"
              href={INSTAGRAM_HREF}
              target="_blank"
              rel="noopener noreferrer"
            >
              @anneth.bs en Instagram
            </a>
          </footer>
        </div>
      </div>
    </div>
  )
}
