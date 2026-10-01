import './NavTab.css';

/** Stained-glass arch navigation tab. The art is decorative; the label and the
 *  button semantics are live HTML. `active` marks the current screen. */
export default function NavTab({ active = false, icon, children, className = '', ...props }) {
  return (
    <button {...props} type="button" aria-current={active ? 'page' : undefined}
      className={`ht-navtab ${active ? 'ht-navtab--on' : ''} ${className}`}>
      <span className="ht-navtab__label">
        {icon && <span aria-hidden="true" className="ht-navtab__icon">{icon}</span>}
        {children}
      </span>
    </button>
  );
}
