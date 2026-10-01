import './EnamelButton.css';

/** Artwork is decorative; labels and button semantics remain live HTML. */
export default function EnamelButton({ variant = 'primary', loading = false,
  loadingLabel = 'Saving…', disabled = false, children, className = '', type = 'button', ...props }) {
  return <button {...props} type={type} disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={`ht-enamel ht-enamel--${variant} ${className}`}>
    <span className="ht-enamel__label">{loading ? loadingLabel : children}</span>
  </button>;
}
